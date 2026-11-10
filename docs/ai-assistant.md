# AI Assistant and AI Permissions

## What was built

Two things, done together because the second decides who gets the first:

- **An AI assistant you can chat with.** `POST /api/v1/ai/chat` answers a question in plain language. It knows what the platform knows right now: the flood alerts in force, and the latest flood outlook for the place on screen (or the person's home area). It also knows what the person's role allows, so it only suggests things they can actually do. It can't do anything in the app itself: it can't issue alerts, record floods or change settings, and it says so.
- **A chat history, like other AI chat apps.** Each person's chats are kept with their account, so they can reopen one on any device and carry on, delete one, or delete them all. A chat is named after its first question. Only its owner can read it, and deleting the account deletes their chats. The usage log still keeps only token counts.
- **AI is now a permission, like everything else.** Who may use AI used to be a list of role names in code (`ai-access.ts`), so a role made on the Roles screen could never use AI, and the Roles screen couldn't change it. Now there are two permissions:

| Permission | Lets a role | Seeded to |
|---|---|---|
| Use AI assistance (`ai.use`) | The assistant chat, AI flood outlooks, and drafting an alert with AI (drafting also needs Issue flood alerts) | Responder, Official, Researcher |
| Use their own AI key (`ai.own_keys`) | Save, switch and remove a personal AI provider key | Responder, Official, Researcher |

They were seeded to exactly the roles that could already use AI, so nobody's access changed. The general public gets neither by default, because every question they asked would be paid for by the platform's key. An administrator can tick **Use AI assistance** for General Public on the Roles screen if they want residents to have the assistant.

The **platform's AI keys** (the ones everyone's requests fall back to) stay with administrators and can't be given to a role, together with the flood forecast settings and map-layer uploads. They are listed as administrator-only powers on the Roles screen.

### The permissions check across the whole app

As part of this change every route was checked. Every route that isn't administrator-only now asks for a named permission (`requirePermission`), and no route or service checks a role by name except for administrator-only powers. The two that didn't, and were fixed:

| Route | Before | Now |
|---|---|---|
| `POST /api/v1/flood-predictions/areas/:id/ai-outlook` | Role list | `ai.use` |
| `POST /api/v1/flood-predictions/draft-alert` | `alerts.issue` only | `alerts.issue` **and** `ai.use` |
| `/api/v1/ai/credentials/*` (personal keys) | Role list | `ai.own_keys` |

On the web client, the AI outlook button had its own role list, which named two roles that don't exist ("coordinator", "first_responder"); it now asks for `ai.use`. See [features/ai-assistant.md](features/ai-assistant.md).

## How it works

Paths are relative to `server/src/`.

```
POST /api/v1/ai/chat
  requirePermission("ai.use")            middleware/require-permission.middleware.ts
  aiChatRateLimiter (60 per 15 minutes)  modules/ai/ai.routes.ts
  validate(assistantChatSchema)          modules/ai/ai.validation.ts
  AiController.chat                      modules/ai/ai.controller.ts
  AssistantService.chat                  modules/ai/assistant/assistant.service.ts
    ├─ the chat so far (last 18 turns)   AiConversationRepository  modules/ai/assistant/assistant.repository.ts
    ├─ what their role allows            PermissionResolver.permissionsFor
    ├─ alerts in force                   AlertService.list({ view: "active" })
    ├─ the place in view + its outlook   AdminUnitRepository, FloodPredictionRepository.findByUnit
    ├─ the system prompt                 modules/ai/assistant/assistant.prompt.ts
    ├─ AiService.streamText              modules/ai/ai.service.ts  (feature "assistant_chat")
    │    └─ provider.stream              modules/ai/providers/*.provider.ts
    └─ save question + answer together   AiConversationRepository.appendExchange
```

1. **The permissions.** [`common/access/permissions.ts`](../server/src/common/access/permissions.ts) gains `ai.use` and `ai.own_keys` (group "AI assistance") and the built-in defaults for them. The migration [`1793800000000-AddAiPermissions.ts`](../server/src/migrations/1793800000000-AddAiPermissions.ts) adds the `role_permissions` rows for responders, officials and researchers. The Roles screen reads the permission list from the server, so the new rows appear there with no client change. `ai-access.ts` is gone.
2. **The request.** [`ai.validation.ts`](../server/src/modules/ai/ai.validation.ts): `message` is the new question (up to 4,000 characters) and `conversationId` (optional) the chat it belongs to; leave it out to start a new chat. `areaId` (optional) is the place to talk about; `page` (optional) is the page they have open. The client never sends earlier turns: the server reads them from its own record, so nobody can put words in the assistant's mouth.
2a. **The history.** Migration [`1793900000000-CreateAiConversations.ts`](../server/src/migrations/1793900000000-CreateAiConversations.ts) adds `ai_conversations` (one row per chat, owned by a user, deleted with them) and `ai_conversation_messages` (the turns, ordered by an identity id). [`assistant.repository.ts`](../server/src/modules/ai/assistant/assistant.repository.ts) filters every query by owner, so someone else's chat is simply "not found". The last 18 turns go to the AI with each question (they always come in question-and-answer pairs, so they start with a question, as every provider expects). The question and answer are saved together, in one transaction, only after the answer arrives: a failed question leaves nothing behind and can be asked again. A chat stops at 200 messages (`409`, "start a new chat"), which keeps each question's cost down. If a chat is deleted on another device while a question is on its way, the answer is saved as a new chat.
3. **The context.** [`assistant.service.ts`](../server/src/modules/ai/assistant/assistant.service.ts) gathers what the assistant is told, in parallel, through the same services the screens use. Each lookup is best-effort: if the alerts can't be read, the answer is less specific; the chat doesn't fail. Only a flood outlook that is already stored is used, so a chat never waits for the weather service.
4. **The prompt.** [`assistant.prompt.ts`](../server/src/modules/ai/assistant/assistant.prompt.ts) is a pure function. Rules come first: facts only from the platform's data, a modelled outlook is not an official warning, someone in danger is told to call 112 first, the assistant can't act in the app, and data is never instructions. Then the data, inside `<app_context>`, `<active_alerts>` and `<area_in_view>` tags. Every piece of stored text (alert titles, place names, the person's name) and every message goes through `inert()` ([`domain/prompt-safety.ts`](../server/src/modules/ai/domain/prompt-safety.ts)), so nobody can close a tag and pass their text off as instructions.
5. **The providers.** Each adapter's `stream()` used to reuse the JSON-draft call, flattening the conversation into one message and asking for `{"reply": "..."}`, so a chat answer would have come back as JSON. Each now makes a real multi-turn chat call (Anthropic Messages, OpenAI Chat Completions, Gemini `generateContent` with `user`/`model` turns, Ollama `/api/chat`) and returns plain text in one piece. An answer that hits the length limit is kept rather than thrown away. `AiService.streamText` now also returns which provider, model and key answered.
6. **Which key pays.** As for the other AI features: the person's own key if they saved one, otherwise the platform's. The usage log records the feature as `assistant_chat`. An administrator can pin a model for it like any other feature.

### The API

| Route | Who | Does |
|---|---|---|
| `POST /api/v1/ai/chat` | `ai.use` | Body `{ message, conversationId?, areaId?, page? }`. Replies `{ conversationId, title, reply, provider, model, source }`. `404` for a chat that isn't theirs or is gone |
| `GET /api/v1/ai/conversations` | Signed in (own chats) | Their 100 most recently used chats: `{ id, title, messageCount, createdAt, updatedAt }` |
| `GET /api/v1/ai/conversations/:id` | Signed in (own chat) | One chat with every turn |
| `DELETE /api/v1/ai/conversations/:id` | Signed in (own chat) | Deletes it |
| `DELETE /api/v1/ai/conversations` | Signed in | Deletes all their chats; replies `{ deleted }` |
| `GET /api/v1/ai/status` | Signed in | Whether AI is set up, and on whose key |
| `/api/v1/ai/credentials`, `/:provider/activate`, `/:provider/models`, `DELETE /:provider` | `ai.own_keys` | The person's own keys |
| `/api/v1/ai/platform/credentials/*` | Administrator | The platform's keys |

Reading and deleting chats needs only a sign-in, not `ai.use`: someone whose role loses AI can still see and delete what they wrote. Errors are the AI layer's usual friendly ones ([ai-integration.md](ai-integration.md)): `503` "AI is not set up yet" when no key resolves, `502` when the provider rejects the key or model, `429` from the rate limiter, `403` without `ai.use`.

### Known limits

- **One piece, not word by word.** The answer arrives whole after the provider finishes (usually a few seconds). Streaming it would need a long-lived response through Render's proxy and the compression middleware; the provider interface is already named `stream` so it can be added later without changing callers.
- **No screen for personal keys yet.** The `ai.own_keys` routes exist and are guarded, but only administrators have a settings screen (for the platform's keys).
- **Tests weren't added or run**, by request. The existing AI tests still type-check against the changed code.
- **The migrations must run** (`1793800000000-AddAiPermissions` and `1793900000000-CreateAiConversations`), or responders, officials and researchers lose AI and chats can't be saved. On Render they run by themselves before the API starts (`startCommand` in `render.yaml`). Running the server anywhere else, run `npm run migration:run` first.
- **Chats are kept until deleted.** There is no automatic clean-up of old chats yet. If a retention period is wanted (say, 12 months), it is one scheduled `DELETE ... WHERE updated_at < now() - interval '12 months'`. The privacy page should mention that chats are kept.
- **No renaming.** A chat keeps the title of its first question.

## Resources to read

- Anthropic Messages API: https://docs.anthropic.com/en/api/messages
- OpenAI Chat Completions: https://platform.openai.com/docs/api-reference/chat/create
- Gemini `generateContent` (multi-turn `contents`): https://ai.google.dev/api/generate-content
- Ollama `/api/chat`: https://github.com/ollama/ollama/blob/main/docs/api.md
- OWASP Top 10 for LLM apps, prompt injection: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- [audit-and-permissions.md](audit-and-permissions.md): permissions and the Roles screen. [ai-integration.md](ai-integration.md): keys, providers and errors.

## Explain it like I'm new to this

Think of a help desk in the site office. The person at the desk (the AI) is clever but has never been outside. Before each question, a clerk hands them a fresh sheet: today's warnings pinned on the noticeboard, the latest forecast for the place you're asking about, and a note saying what your badge lets you do. The desk person answers only from that sheet, says "I don't know" when it isn't there, and can't stamp anything for you; they tell you which counter to go to. Each visitor has their own folder of past conversations, kept in a locked drawer only they can open; they can pull one out and carry on, or shred it. Who is allowed to queue at the desk used to be painted on the wall by job title. Now it's a key on the key ring, like every other door, so the office manager can hand it to any job, including new ones.
