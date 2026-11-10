# AI Assistant (web client)

## What was built

- **A chat widget** on every signed-in screen: a round button with a speech bubble, starting in the bottom-right corner. It shows only to people whose role holds **Use AI assistance** (`ai.use`): responders, officials, researchers and administrators as seeded, and any role an administrator ticks it for on the Roles screen.
- **You can drag it.** Press and drag the button anywhere. When you let go it glides to the nearer side (left or right) at the height you dropped it, and it never goes over the top bar. The spot is remembered on that device. A press that barely moves is still a click. Keyboard users move it with **Alt + arrow keys** (up and down move it, left and right switch sides).
- **The chat opens beside the button**: above it when the button is in the lower half of the screen, below it otherwise, on the button's side. The button turns into a close button. On a phone the chat fills the screen.
- **Expand.** The expand button in the chat's header makes the card wide and as tall as the screen allows, with your chat list in a column beside the chat. Press it again to make it small. The choice is remembered on that device. Phones don't show it: the chat already fills the screen there.
- **Your chats.** Like other AI chat apps, every chat is kept with your account:
  - The history button (clock icon) at the top left shows your chats, grouped by **Today**, **Yesterday**, **Previous 7 days**, **Previous 30 days**, then by month. In the expanded card they're always in the column on the left.
  - Click a chat to reopen it and carry on. A chat is named after its first question, and its name shows as the card's title.
  - **New chat** (the plus button, or the button at the top of the list) starts a fresh one.
  - The bin icon next to a chat deletes it, after an inline "Delete this chat?" check. **Delete all chats** at the bottom of the list clears them all, after the same kind of check. Escape cancels a check.
  - Chats follow your account, so you see the same list on your phone and your computer. A note under the list says only you can see them.
- **Starter questions** ("Are any flood alerts in force right now?", "What does the flood outlook for this place mean?") on a new chat. Enter sends; Shift+Enter starts a new line; Escape closes the chat. A line under the box says the AI can be wrong, that official warnings are on Alerts, and to call 112 in danger.
- **It knows where you are.** On an LGA or ward page, the assistant is told about that place and its flood outlook. Anywhere else it is told about your home area, if you set one on your Profile.
- **If AI isn't set up**, the chat says so instead of failing. An administrator is pointed to **Configuration → AI providers**.
- **AI buttons follow the permission.** "Generate AI analysis" on the flood forecast card and "Draft with AI" in the alert form used a role list (the forecast card's named two roles that don't exist). Both now check `ai.use`; drafting an alert also needs Issue flood alerts, as before. The unused role-based `canRecordSurvey` helper was removed, so no screen decides anything from a role name other than Administrator.

## How it works

Paths are relative to `client/src/`.

1. **Permission.** [`types/auth.types.ts`](../../client/src/types/auth.types.ts) lists `ai.use` and `ai.own_keys`; [`utils/permissions.ts`](../../client/src/utils/permissions.ts) gives the built-in roles the same defaults as the server, for an older backend that sends no permissions.
2. **The widget.** [`components/layout/AppShell.tsx`](../../client/src/components/layout/AppShell.tsx) renders [`components/assistant/AssistantLauncher.tsx`](../../client/src/components/assistant/AssistantLauncher.tsx) only when `can(user, "ai.use")`. The launcher reads the route's `:wardId` or `:id` (when it is an area id) for the place on screen, and falls back to `user.homeAdminUnitId`. It keeps whether the chat is open and expanded (expanded is saved in `localStorage`).
3. **Dragging.** [`components/assistant/useDockPosition.ts`](../../client/src/components/assistant/useDockPosition.ts) uses pointer events, so mouse, pen and touch all work, with pointer capture so a fast drag doesn't lose the button, and `touch-action: none` so dragging on a phone doesn't scroll the page. Past a 6-pixel threshold a press becomes a drag, and the click that follows is ignored. On release it works out the nearer side and the distance from the bottom, animates there (skipped with reduced motion), and saves `{ side, offset }` in `localStorage`. A saved spot that no longer fits a smaller window is pulled back in. `panelPlacement()` turns the docked spot (and expanded or not) into CSS variables that place the chat card next to the button without ever covering it.
4. **Sharing the corner.** Toasts, the "new version" banner and the home map's layers and legend column (the phone's layers sheet too) also live in the bottom-right corner. While the button rests there, the launcher puts the class `has-assistant` on `<html>`, which sets `--assistant-clearance` (the button's height plus its margin). Those elements add it to their distance from the bottom, so they sit above the button, and ordinary pages get that much extra room at the end so their last line can scroll clear. Drag the button elsewhere, or have a role without `ai.use`, and the value is `0`, so nothing moves. All of it is in [`assistant.css`](../../client/src/components/assistant/assistant.css).
5. **The chat.** [`components/assistant/AssistantPanel.tsx`](../../client/src/components/assistant/AssistantPanel.tsx), styled with the app's colour tokens, so it follows light and dark mode. It mounts only while open, and sits above the page and map but under the update banner and the flood warning. The chat list is the same element in both sizes: a view you switch to in the small card, a column in the expanded one (CSS decides). The open chat's id is kept in `sessionStorage`, so closing the chat or changing page comes back to it.
6. **Talking to the server.** `useAssistantChat()` in [`hooks/useAi.ts`](../../client/src/hooks/useAi.ts), over [`endpoints/ai.endpoints.ts`](../../client/src/endpoints/ai.endpoints.ts): `POST /api/v1/ai/chat` with just the new question and the chat's id (the server holds the history), and the list, open, delete and delete-all calls. The chat list is cached and refreshed after every question and delete; answers are never cached. Signing out clears the cache, so the next person on the device never sees the list.
7. **When it fails**, your question goes back in the box with the server's message under it, so nothing you typed is lost and you can try again. If the chat was deleted on another device, the question carries on in a new chat instead of failing.
8. **Showing answers.** Answers are plain text with their line breaks kept. Markdown bold and heading marks that some models add are dropped. Nothing is rendered as HTML.

The server side, including what the assistant is told, its rules and how chats are stored, is in [../ai-assistant.md](../ai-assistant.md).

## Resources to read

- MDN Pointer events and `setPointerCapture` (how one drag handles mouse, pen and touch): https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
- MDN `touch-action`: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
- WCAG 2.2 "Dragging Movements" (why there is a keyboard way to move it): https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- WAI-ARIA dialog pattern (focus, Escape, labelling): https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- MDN `aria-live` (how new answers are announced to screen readers): https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-live
- [ui-foundations.md](ui-foundations.md): the design tokens the chat uses.

## Explain it like I'm new to this

The round button is a help desk window you can slide along the wall to wherever it's out of your way. Only people with the right key on their key ring see it at all. When you open it, it already knows which place you're looking at, so "is it going to flood here?" makes sense to it. Every conversation is filed in your own drawer, which follows you to any office you sign in at: pull an old one out to carry on, shred one, or empty the drawer. Need more room? The expand button turns the window into a desk with your folders laid out beside you.
