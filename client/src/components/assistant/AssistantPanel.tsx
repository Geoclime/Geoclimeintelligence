import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useAiStatus, useAssistantChat } from "../../hooks/useAi";
import { useToast } from "../../hooks/useToast";
import { errorMessage, toApiError } from "../../transport/api-error";
import type { AiConversationSummary, AssistantMessage } from "../../types/ai.types";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import "./assistant.css";

interface AssistantPanelProps {
  onClose: () => void;
  /** The place on screen, or the person's home area: the assistant is told its flood outlook. */
  areaId: string | null;
  /** True when areaId is the place on screen rather than their home area. */
  areaOnScreen: boolean;
  /** The page they have open. */
  page: string;
  /** Administrators are told where to set AI up when it isn't. */
  isAdmin: boolean;
  /** Wide and full height on a computer, with the chat list beside the chat. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Where the card sits next to the button (CSS variables from panelPlacement). */
  placement: CSSProperties;
}

/** The chat open in this tab, so closing the panel or changing page comes back to it. */
const ACTIVE_KEY = "geoclime.assistant.active";
const MAX_INPUT = 4000;

function loadActiveId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function saveActiveId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(ACTIVE_KEY, id);
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    // The open chat just won't be remembered in this tab.
  }
}

/** Models like to write **bold**; the panel shows plain text, so the markers are dropped. */
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");

const DAY = 86_400_000;

/** "Today", "Yesterday", "Previous 7 days", "Previous 30 days", or the month: how chat lists are usually grouped. */
function groupLabel(iso: string, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const at = new Date(iso).getTime();
  if (at >= startOfToday) return "Today";
  if (at >= startOfToday - DAY) return "Yesterday";
  if (at >= startOfToday - 7 * DAY) return "Previous 7 days";
  if (at >= startOfToday - 30 * DAY) return "Previous 30 days";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function groupChats(chats: AiConversationSummary[]): { label: string; items: AiConversationSummary[] }[] {
  const now = new Date();
  const groups: { label: string; items: AiConversationSummary[] }[] = [];
  for (const chat of chats) {
    const label = groupLabel(chat.updatedAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(chat);
    else groups.push({ label, items: [chat] });
  }
  return groups;
}

/**
 * The AI assistant (docs/features/ai-assistant.md): a chat card beside its round button. It answers from
 * the platform's own data (alerts in force, the flood outlook of the place on screen), never acts in the
 * app, and says so. Past chats are kept with the person's account: the history view (a column beside the
 * chat when expanded) reopens or deletes them. Only shown to people whose role holds "Use AI assistance".
 */
export function AssistantPanel({ onClose, areaId, areaOnScreen, page, isAdmin, expanded, onToggleExpanded, placement }: AssistantPanelProps) {
  const titleId = useId();
  const { showToast } = useToast();
  const { status, loading: statusLoading } = useAiStatus();
  const [view, setView] = useState<"chat" | "history">("chat");
  const chat = useAssistantChat(view === "history" || expanded);
  const [activeId, setActiveId] = useState<string | null>(loadActiveId);
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [opening, setOpening] = useState(activeId !== null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** A chat's id, or "all", while its delete is being confirmed. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveActiveId(activeId), [activeId]);

  const startNewChat = useCallback(() => {
    setActiveId(null);
    setTitle(null);
    setMessages([]);
    setFailure(null);
    setDraft("");
    setView("chat");
    inputRef.current?.focus();
  }, []);

  const openChat = useCallback(
    async (id: string) => {
      setView("chat");
      setFailure(null);
      setConfirming(null);
      setOpening(true);
      try {
        const conversation = await chat.open(id);
        setActiveId(conversation.id);
        setTitle(conversation.title);
        setMessages(conversation.messages.map(({ role, content }) => ({ role, content })));
      } catch (err) {
        // Deleted on another device, most likely: start afresh rather than show a broken chat.
        if (toApiError(err).status === 404) startNewChat();
        else setFailure(errorMessage(err));
      } finally {
        setOpening(false);
        inputRef.current?.focus();
      }
    },
    [chat, startNewChat],
  );

  // Reopening the panel comes back to the chat that was open in this tab (`opening` starts true for it).
  const { open: fetchChat } = chat;
  const [initialId] = useState(activeId);
  useEffect(() => {
    if (!initialId) {
      inputRef.current?.focus();
      return;
    }
    let current = true;
    fetchChat(initialId)
      .then((conversation) => {
        if (!current) return;
        setTitle(conversation.title);
        setMessages(conversation.messages.map(({ role, content }) => ({ role, content })));
      })
      .catch(() => {
        // Gone (deleted on another device) or unreachable: start a fresh chat instead.
        if (current) setActiveId(null);
      })
      .finally(() => {
        if (!current) return;
        setOpening(false);
        inputRef.current?.focus();
      });
    return () => {
      current = false;
    };
  }, [fetchChat, initialId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirming) setConfirming(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirming]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || sending) return;
    const before = messages;
    setMessages([...before, { role: "user", content: text }]);
    setDraft("");
    setFailure(null);
    setSending(true);
    const send = (conversationId: string | null) =>
      chat.ask({ ...(conversationId ? { conversationId } : {}), message: text, ...(areaId ? { areaId } : {}), page });
    try {
      let answer;
      try {
        answer = await send(activeId);
      } catch (err) {
        // The chat was deleted elsewhere: carry the question into a new one instead of failing.
        if (activeId && toApiError(err).status === 404) {
          setMessages([{ role: "user", content: text }]);
          answer = await send(null);
        } else {
          throw err;
        }
      }
      setActiveId(answer.conversationId);
      setTitle(answer.title);
      setMessages((current) => [...current, { role: "assistant", content: answer.reply }]);
    } catch (err) {
      // Nothing was saved, so the question goes back in the box and the chat still takes turns.
      setMessages(before);
      setDraft(text);
      setFailure(errorMessage(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  const onInputKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(draft);
    }
  };

  const confirmDelete = async () => {
    if (!confirming) return;
    setDeleting(true);
    try {
      // In the small card, stay on the list after deleting; expanded, the list is already beside the chat.
      if (confirming === "all") {
        await chat.removeAll();
        startNewChat();
        if (!expanded) setView("history");
      } else {
        await chat.remove(confirming);
        if (confirming === activeId) {
          startNewChat();
          if (!expanded) setView("history");
        }
      }
      setConfirming(null);
    } catch (err) {
      showToast({ type: "error", message: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  const suggestions = [
    "Are any flood alerts in force right now?",
    areaId ? (areaOnScreen ? "What does the flood outlook for this place mean?" : "What is the flood outlook for my home area?") : null,
    "How should my household prepare for a flood?",
    "How do I report flooding I can see?",
  ].filter((s): s is string => s !== null);

  const unavailable = !statusLoading && status && !status.available;
  const busy = sending || opening;

  const history = (
    <nav className="assistant__history" aria-label="Your chats" data-cy="assistant-history">
      <div className="assistant__history-top">
        <Button variant="secondary" size="sm" fullWidth icon={<Icon name="plus" size={16} />} onClick={startNewChat} disabled={busy} data-cy="assistant-new-chat-list">
          New chat
        </Button>
      </div>

      <div className="assistant__history-list">
        {chat.historyLoading && chat.conversations.length === 0 && <LoadingSpinner message="Loading your chats…" />}
        {chat.historyError && (
          <p className="assistant__error">
            {chat.historyError}{" "}
            <button type="button" className="assistant__link-button" onClick={() => void chat.refetchHistory()}>
              Try again
            </button>
          </p>
        )}
        {!chat.historyLoading && !chat.historyError && chat.conversations.length === 0 && (
          <p className="assistant__history-empty">No chats yet. Your chats are kept here so you can come back to them.</p>
        )}

        {groupChats(chat.conversations).map((group) => (
          <section key={group.label} className="assistant__history-group" aria-label={group.label}>
            <h3 className="assistant__history-label">{group.label}</h3>
            <ul>
              {group.items.map((item) =>
                confirming === item.id ? (
                  <li key={item.id} className="assistant__history-item is-confirming">
                    <span className="assistant__history-confirm">Delete “{item.title}”?</span>
                    <span className="assistant__history-confirm-actions">
                      <Button variant="danger" size="sm" loading={deleting} loadingLabel="Deleting…" onClick={() => void confirmDelete()} data-cy="assistant-confirm-delete">
                        Delete
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={deleting}>
                        Cancel
                      </Button>
                    </span>
                  </li>
                ) : (
                  <li key={item.id} className={`assistant__history-item${item.id === activeId ? " is-active" : ""}`}>
                    <button
                      type="button"
                      className="assistant__history-open"
                      onClick={() => void openChat(item.id)}
                      aria-current={item.id === activeId ? "true" : undefined}
                      title={item.title}
                      data-cy="assistant-history-item"
                    >
                      {item.title}
                    </button>
                    <button
                      type="button"
                      className="assistant__icon-button assistant__history-delete"
                      onClick={() => setConfirming(item.id)}
                      aria-label={`Delete the chat “${item.title}”`}
                      title="Delete chat"
                      data-cy="assistant-delete-chat"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                ),
              )}
            </ul>
          </section>
        ))}
      </div>

      <div className="assistant__history-bottom">
        {confirming === "all" ? (
          <div className="assistant__history-confirm-all">
            <span>Delete all {chat.conversations.length} chats? This can't be undone.</span>
            <span className="assistant__history-confirm-actions">
              <Button variant="danger" size="sm" loading={deleting} loadingLabel="Deleting…" onClick={() => void confirmDelete()} data-cy="assistant-confirm-delete-all">
                Delete all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={deleting}>
                Cancel
              </Button>
            </span>
          </div>
        ) : (
          chat.conversations.length > 0 && (
            <button type="button" className="assistant__link-button assistant__link-button--danger" onClick={() => setConfirming("all")} data-cy="assistant-delete-all">
              Delete all chats
            </button>
          )
        )}
        <p className="assistant__history-note">Kept with your account. Only you can see them.</p>
      </div>
    </nav>
  );

  return (
    <aside
      className={`assistant${expanded ? " is-expanded" : ""}${view === "history" ? " is-history" : ""}`}
      style={placement}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-cy="assistant-panel"
    >
      <header className="assistant__header">
        <button
          type="button"
          className="assistant__icon-button assistant__history-toggle"
          onClick={() => setView(view === "history" ? "chat" : "history")}
          aria-label={view === "history" ? "Back to the chat" : "Your chats"}
          aria-pressed={view === "history"}
          title={view === "history" ? "Back to the chat" : "Your chats"}
          data-cy="assistant-history-toggle"
        >
          <Icon name={view === "history" ? "chevronLeft" : "history"} size={18} />
        </button>
        <div className="assistant__heading">
          <h2 id={titleId} className="assistant__title">
            {view === "history" ? "Your chats" : (title ?? "AI assistant")}
          </h2>
          {view === "chat" && !title && <p className="assistant__subtitle">Alerts, forecasts, preparing for floods, using the platform.</p>}
        </div>
        <div className="assistant__header-actions">
          {(messages.length > 0 || activeId) && view === "chat" && (
            <button type="button" className="assistant__icon-button" onClick={startNewChat} disabled={busy} aria-label="New chat" title="New chat" data-cy="assistant-clear">
              <Icon name="plus" size={18} />
            </button>
          )}
          <button
            type="button"
            className="assistant__icon-button assistant__expand"
            onClick={() => {
              setView("chat");
              onToggleExpanded();
            }}
            aria-label={expanded ? "Make the chat smaller" : "Expand the chat"}
            aria-pressed={expanded}
            title={expanded ? "Make smaller" : "Expand"}
            data-cy="assistant-expand"
          >
            <Icon name={expanded ? "minimize" : "maximize"} size={18} />
          </button>
          <button type="button" className="assistant__icon-button" onClick={onClose} aria-label="Close the AI assistant" title="Close" data-cy="assistant-close">
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      <div className="assistant__main">
        {history}

        <section className="assistant__chat" aria-label="Chat">
          <div className="assistant__body" aria-live="polite" aria-busy={busy}>
            {statusLoading && !status && <LoadingSpinner message="Checking AI…" />}

            {unavailable && (
              <div className="assistant__notice" data-cy="assistant-unavailable">
                <p>AI isn't set up on this platform yet.</p>
                {isAdmin ? (
                  <p>
                    Add an AI provider key under <Link to="/admin/configuration" onClick={onClose}>Configuration → AI providers</Link>.
                  </p>
                ) : (
                  <p>An administrator can switch it on. Until then, the Help page has guides for every part of the platform.</p>
                )}
              </div>
            )}

            {opening && <LoadingSpinner message="Opening the chat…" />}

            {!unavailable && !opening && messages.length === 0 && (
              <div className="assistant__welcome">
                <p className="muted">Try one of these, or ask your own question.</p>
                <ul className="assistant__suggestions">
                  {suggestions.map((s) => (
                    <li key={s}>
                      <button type="button" className="assistant__suggestion" onClick={() => void ask(s)} disabled={sending || !status}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!opening &&
              messages.map((m, i) => (
                <div key={i} className={`assistant__message assistant__message--${m.role}`} data-cy={`assistant-message-${m.role}`}>
                  <span className="visually-hidden">{m.role === "user" ? "You said:" : "Assistant said:"}</span>
                  {m.role === "assistant" ? plain(m.content) : m.content}
                </div>
              ))}

            {sending && (
              <div className="assistant__message assistant__message--assistant assistant__message--thinking">
                <LoadingSpinner message="Thinking…" />
              </div>
            )}

            {failure && (
              <p className="assistant__error" role="alert" data-cy="assistant-error">
                {failure}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form className="assistant__composer" onSubmit={onSubmit}>
            <label htmlFor={`${titleId}-input`} className="visually-hidden">
              Your question
            </label>
            <textarea
              id={`${titleId}-input`}
              ref={inputRef}
              className="assistant__input"
              rows={2}
              maxLength={MAX_INPUT}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onInputKey}
              placeholder={unavailable ? "AI isn't set up yet" : "Ask a question…"}
              disabled={Boolean(unavailable) || opening}
              data-cy="assistant-input"
            />
            <button
              type="submit"
              className="assistant__send"
              disabled={busy || !draft.trim() || Boolean(unavailable)}
              aria-label="Send"
              data-cy="assistant-send"
            >
              <Icon name="send" size={18} />
            </button>
          </form>
          <p className="assistant__disclaimer">
            AI can be wrong. Official warnings are on the <Link to="/alerts" onClick={onClose}>Alerts</Link> page. In danger now? Call 112.
          </p>
        </section>
      </div>
    </aside>
  );
}
