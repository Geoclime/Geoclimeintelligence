# AI Assistant (web client)

## What was built

- **An "Ask the AI assistant" button** (a speech bubble) in the top bar, between the notification bell and Help, on every signed-in screen. It shows only to people whose role holds **Use AI assistance** (`ai.use`): responders, officials, researchers and administrators as seeded, and any role an administrator ticks it for on the Roles screen.
- **A chat panel** that slides in from the right (full width on a phone). It offers a few starter questions ("Are any flood alerts in force right now?", "What does the flood outlook for this place mean?"), takes your own, and shows the answers. **New chat** clears it. Enter sends; Shift+Enter starts a new line; Escape closes it. A line under the box says the AI can be wrong, that official warnings are on Alerts, and to call 112 in danger.
- **It knows where you are.** On an LGA or ward page, the assistant is told about that place and its flood outlook. Anywhere else it is told about your home area, if you set one on your Profile.
- **If AI isn't set up**, the panel says so instead of failing. An administrator is pointed to **Configuration → AI providers**.
- **AI buttons follow the permission now.** "Generate AI analysis" on the flood forecast card and "Draft with AI" in the alert form used a role list (the forecast card's named two roles that don't exist). Both now check `ai.use`; drafting an alert also needs Issue flood alerts, as before. The unused role-based `canRecordSurvey` helper was removed, so no screen decides anything from a role name other than Administrator.

## How it works

Paths are relative to `client/src/`.

1. **Permission.** [`types/auth.types.ts`](../../client/src/types/auth.types.ts) lists `ai.use` and `ai.own_keys`; [`utils/permissions.ts`](../../client/src/utils/permissions.ts) gives the built-in roles the same defaults as the server, for an older backend that sends no permissions.
2. **The button.** [`components/layout/AppShell.tsx`](../../client/src/components/layout/AppShell.tsx) renders [`components/assistant/AssistantLauncher.tsx`](../../client/src/components/assistant/AssistantLauncher.tsx) only when `can(user, "ai.use")`. The launcher reads the route's `:wardId` or `:id` (when it is an area id) for the place on screen, and falls back to `user.homeAdminUnitId`.
3. **The panel.** [`components/assistant/AssistantPanel.tsx`](../../client/src/components/assistant/AssistantPanel.tsx), styled by [`assistant.css`](../../client/src/components/assistant/assistant.css) with the app's colour tokens, so it follows light and dark mode. It mounts only while open. The conversation is kept in `sessionStorage` for this tab, so closing the panel or changing page keeps it, and a new tab starts fresh.
4. **Asking.** `useAssistantChat()` in [`hooks/useAi.ts`](../../client/src/hooks/useAi.ts) calls `sendAssistantMessage` in [`endpoints/ai.endpoints.ts`](../../client/src/endpoints/ai.endpoints.ts) (`POST /api/v1/ai/chat`). Each question sends the most recent turns (at most 19, so it starts and ends with a question, as the server requires), the area id and the page path. Answers are never cached.
5. **When it fails**, your question goes back in the box with the server's message under it, so nothing you typed is lost and you can try again.
6. **Showing answers.** Answers are plain text with their line breaks kept. Markdown bold and heading marks that some models add are dropped. Nothing is rendered as HTML.

The server side, including what the assistant is told and its rules, is in [../ai-assistant.md](../ai-assistant.md).

## Resources to read

- WAI-ARIA dialog pattern (focus, Escape, labelling): https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- MDN `aria-live` (how new answers are announced to screen readers): https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-live
- MDN `sessionStorage`: https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage
- [ui-foundations.md](ui-foundations.md): the design tokens the panel uses.

## Explain it like I'm new to this

The speech bubble in the top bar is a help desk window. Only people with the right key on their key ring see the window at all. When you open it, it already knows which place you're looking at, so "is it going to flood here?" makes sense to it. The conversation is written on a notepad that stays on your desk while this tab is open, and goes in the bin when you close the tab.
