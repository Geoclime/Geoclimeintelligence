# UI Foundations: Theme, Shared Components, Dialogs and Toasts

## What was built

The look and the building blocks every screen reuses: brand colours and spacing as design tokens, a light and dark theme, and a set of shared components. Those are buttons, text fields, badges, callouts, a spinner, the standard loading, empty and error screens, pagination, a Modal, toast notifications, an offline banner, and the logo. Together, the Modal and toasts replace the browser's own `alert`/`confirm`/`prompt` pop-ups, which the standard bans (section 20).

## How it works

All paths are relative to `client/src/`.

**Design tokens.** [`styles/globals.css`](../../client/src/styles/globals.css) defines every colour, space, radius and shadow as a CSS variable (e.g. `--color-primary`). Components use only these variables, never raw colours. The brand teal `#0E6B6F` and deep teal `#063C3E` come from the standard. [`styles/theme.ts`](../../client/src/styles/theme.ts) repeats the brand colours for code that can't read CSS, such as future Mapbox layers.

**Light and dark.** [`contexts/ThemeContext.tsx`](../../client/src/contexts/ThemeContext.tsx) stores the choice (*Match device*, *Light* or *Dark*) and sets `data-theme` on the `<html>` element; `globals.css` swaps every token under `:root[data-theme="dark"]`. The dark theme uses a brighter teal so text stays readable. A tiny script in [`index.html`](../../client/index.html) applies the saved theme *before* the page first draws, so dark-mode users never see a white flash. The choice lives in `localStorage` because it's a per-device preference, not API data (section 14 keeps API data out of browser storage). The toggle is in the account menu and on the sign-in pages.

**Shared components** live in [`components/shared/`](../../client/src/components/shared/), one folder each:

| Component | Use it for |
|---|---|
| `Button` (+ `buttonClassName` for links styled as buttons) | Actions. `loading` shows a spinner and disables it |
| `TextField` | Labelled inputs with hint and error text wired for screen readers. `revealable` adds a show/hide toggle for passwords. Works directly with react-hook-form's `register()` |
| `Badge`, `Callout` | Small labels; inline messages such as a form error or "check your inbox" |
| `LoadingSpinner`, `EmptyState`, `ErrorState` | The **only** loading, empty and error screens (sections 9 and 17.8), all built on `StatePanel` so they look alike |
| `Pagination` | "Showing 1–25 of 60" plus previous/next |
| `Modal` | Any decision or form in a dialog |
| `Icon`, `BrandMark` | A small built-in icon set, and the logo |

Feature components live beside them, e.g. [`components/users/`](../../client/src/components/users/) and [`components/layout/`](../../client/src/components/layout/) (the app header, the sign-in layout with its contour-line artwork, the account menu, the theme toggle and the offline banner).

**Modal, not `confirm()`.** [`components/shared/Modal/Modal.tsx`](../../client/src/components/shared/Modal/Modal.tsx) is built on the HTML `<dialog>` element. That's an ordinary, styleable part of the page, not a browser pop-up. It gives keyboard focus trapping, Esc to close, and a background you can't click through, all without extra code. Whether it's open is ordinary React state owned by the parent. `dismissible={false}` stops Esc or a backdrop click from abandoning a save that's still in flight.

**Toasts, not `alert()`.** [`contexts/ToastContext.tsx`](../../client/src/contexts/ToastContext.tsx) plus `useToast()`: `showToast({ type: "success", message: "Saved" })`. Toasts stack in the corner, disappear after 5 seconds (8 for errors), pause while hovered or focused, and are announced to screen readers.

**Offline.** [`hooks/useOnlineStatus.ts`](../../client/src/hooks/useOnlineStatus.ts) follows the browser's online/offline events, and [`OfflineBanner`](../../client/src/components/layout/OfflineBanner.tsx) says so plainly. Connectivity is least reliable during an actual flood, which is exactly when this platform is needed (standard section 1). The HTTP client also reports "You're offline" instead of a vague failure.

**Accessibility built in:** a "Skip to content" link, visible focus rings, labelled icon-only buttons, the tab title changing with each page ([`useDocumentTitle`](../../client/src/hooks/useDocumentTitle.ts)), reduced motion honoured, and a Cypress check that no screen scrolls sideways on a 360px phone.

**Honest data.** `EmptyState` is the correct rendering of "nothing yet". The standard forbids filling screens with sample records (rule 19.4) and showing a missing value as `0` (section 8). `formatDate` in [`utils/formatDate.ts`](../../client/src/utils/formatDate.ts) returns "Not available" instead of inventing a date. Dates are shown in West Africa Time (`Africa/Lagos`) on every device. The `DataQualityBadge` from section 8 will be added with the first screen that shows a measured or estimated figure; Phase 1 has none.

## Resources to read

- MDN, using CSS custom properties: https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties
- MDN, `prefers-color-scheme`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
- MDN, the `<dialog>` element: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
- WAI-ARIA dialog (modal) pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- MDN, the Popover API (the account menu): https://developer.mozilla.org/en-US/docs/Web/API/Popover_API
- MDN, `navigator.onLine`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
- React, `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- MDN, accessibility basics: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility

## Explain it like I'm new to this

Design tokens are like a paint catalogue. Instead of every painter mixing their own "sort of teal", everyone uses catalogue colour number 12, so when we want a darker room at night (dark mode) we swap the catalogue, not every wall. The shared components are prefabricated parts: every door handle in the building is the same model, so they all work the same way and a fix to one fixes them all. And a browser `alert()` is like a fire alarm going off to say "your coffee is ready": it stops everything and can't be styled or tested. The Modal and toasts are a polite tap on the shoulder instead.
