/**
 * The installable-app side of the client: registers the service worker (public/sw.js), notices
 * when a new version is waiting, and keeps the browser's "install this app" prompt for the
 * Install button. A tiny store outside React, because the browser's events can fire before React
 * mounts; hooks/usePwa.ts reads it.
 */

/** Chrome and Edge's install prompt event (not yet in TypeScript's DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  /** A new version has been downloaded and is waiting for the user to accept it. */
  updateReady: boolean;
  /** The browser offers to install the app (Chrome, Edge, Android). Not offered on iOS Safari. */
  canInstall: boolean;
  /** Running as an installed app, not in a browser tab. */
  standalone: boolean;
}

let state: PwaState = {
  updateReady: false,
  canInstall: false,
  standalone: typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches,
};
let installPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): PwaState {
  return state;
}

/** Shows the browser's install dialog. Resolves true if the user installed the app. */
export async function install(): Promise<boolean> {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  set({ canInstall: false });
  await prompt.prompt();
  return (await prompt.userChoice).outcome === "accepted";
}

/** Switches to the waiting version; the page reloads once it has taken over. */
export function applyUpdate(): void {
  waitingWorker?.postMessage({ type: "SKIP_WAITING" });
}

export function dismissUpdate(): void {
  set({ updateReady: false });
}

/**
 * Starts listening for the install prompt, and registers the service worker in production builds.
 * Called once, from main.tsx, before React renders.
 */
export function startPwa({ register }: { register: boolean }): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's mini-infobar from appearing; our own Install button offers it instead.
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    set({ canInstall: false, standalone: true });
  });

  if (!register || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        const offer = (worker: ServiceWorker | null) => {
          // Only an UPDATE is offered: the very first install has no controller and needs no reload.
          if (worker && navigator.serviceWorker.controller) {
            waitingWorker = worker;
            set({ updateReady: true });
          }
        };
        offer(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => worker.state === "installed" && offer(worker));
        });
        // Check for a new version every hour while the app stays open.
        window.setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
      })
      .catch(() => undefined);

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || !waitingWorker) return;
      reloading = true;
      window.location.reload();
    });
  });
}
