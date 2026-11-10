import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useAiStatus, useAssistantChat } from "../../hooks/useAi";
import { errorMessage } from "../../transport/api-error";
import { MAX_CHAT_MESSAGES, type AssistantMessage } from "../../types/ai.types";
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
}

const STORAGE_KEY = "geoclime.assistant.conversation";
const MAX_INPUT = 4000;

/** The conversation lives in this tab only, so closing the panel or changing page keeps it. */
function loadConversation(): AssistantMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is AssistantMessage =>
        typeof m === "object" && m !== null && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    );
  } catch {
    return [];
  }
}

function saveConversation(messages: AssistantMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Private windows and full storage: the conversation just won't survive a reload.
  }
}

/**
 * The most recent turns that the server accepts: they take turns, start with a question and end with
 * the new one, so the count is odd and at most MAX_CHAT_MESSAGES.
 */
function recentTurns(messages: AssistantMessage[]): AssistantMessage[] {
  const limit = MAX_CHAT_MESSAGES % 2 === 0 ? MAX_CHAT_MESSAGES - 1 : MAX_CHAT_MESSAGES;
  return messages.length <= limit ? messages : messages.slice(messages.length - limit);
}

/** Models like to write **bold**; the panel shows plain text, so the markers are dropped. */
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");

/**
 * The AI assistant (docs/features/ai-assistant.md): a chat panel that slides in from the right. It answers
 * from the platform's own data (alerts in force, the flood outlook of the place on screen), never acts in
 * the app, and says so. Only shown to people whose role holds "Use AI assistance".
 */
export function AssistantPanel({ onClose, areaId, areaOnScreen, page, isAdmin }: AssistantPanelProps) {
  const titleId = useId();
  const { status, loading: statusLoading } = useAiStatus();
  const { ask: askAssistant } = useAssistantChat();
  const [messages, setMessages] = useState<AssistantMessage[]>(loadConversation);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    saveConversation(messages);
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || sending) return;
    const asked = [...messages, { role: "user" as const, content: text }];
    setMessages(asked);
    setDraft("");
    setFailure(null);
    setSending(true);
    try {
      const answer = await askAssistant({
        messages: recentTurns(asked),
        ...(areaId ? { areaId } : {}),
        page,
      });
      setMessages([...asked, { role: "assistant", content: answer.reply }]);
    } catch (err) {
      // The question goes back in the box, so the conversation still takes turns and nothing typed is lost.
      setMessages(messages);
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

  const clear = () => {
    setMessages([]);
    setFailure(null);
    inputRef.current?.focus();
  };

  const suggestions = [
    "Are any flood alerts in force right now?",
    areaId ? (areaOnScreen ? "What does the flood outlook for this place mean?" : "What is the flood outlook for my home area?") : null,
    "How should my household prepare for a flood?",
    "How do I report flooding I can see?",
  ].filter((s): s is string => s !== null);

  const unavailable = !statusLoading && status && !status.available;

  return (
    <aside className="assistant" role="dialog" aria-modal="false" aria-labelledby={titleId} data-cy="assistant-panel">
      <header className="assistant__header">
        <div>
          <h2 id={titleId} className="assistant__title">
            AI assistant
          </h2>
          <p className="assistant__subtitle">Ask about alerts, forecasts, preparing for floods, or using the platform.</p>
        </div>
        <div className="assistant__header-actions">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear} disabled={sending} data-cy="assistant-clear">
              New chat
            </Button>
          )}
          <button type="button" className="assistant__close" onClick={onClose} aria-label="Close the AI assistant" data-cy="assistant-close">
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      <div className="assistant__body" aria-live="polite" aria-busy={sending}>
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

        {!unavailable && messages.length === 0 && (
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

        {messages.map((m, i) => (
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
          disabled={Boolean(unavailable)}
          data-cy="assistant-input"
        />
        <button
          type="submit"
          className="assistant__send"
          disabled={sending || !draft.trim() || Boolean(unavailable)}
          aria-label="Send"
          data-cy="assistant-send"
        >
          <Icon name="send" size={18} />
        </button>
      </form>
      <p className="assistant__disclaimer">
        AI can be wrong. Official warnings are on the <Link to="/alerts" onClick={onClose}>Alerts</Link> page. In danger now? Call 112.
      </p>
    </aside>
  );
}
