import { io, type Socket } from "socket.io-client";
import { env, IS_E2E } from "../config/env";
import { identity } from "./identity";

/**
 * The live connection to the API (Socket.IO): new notifications and "alerts changed" arrive here
 * the moment they happen, instead of on the next page load. The only file that imports
 * socket.io-client.
 *
 * It signs in with the same Firebase ID token as every HTTP request, asked for afresh on each
 * (re)connection, so an expired token never keeps it out. Off in Cypress runs (the API is stubbed).
 */

type Listener = (payload: unknown) => void;

let socket: Socket | null = null;
let users = 0;
/** Every subscription, kept here so a socket created later gets them all. */
const listeners = new Map<string, Set<Listener>>();

/** Opens the connection. Shared: each caller pairs it with disconnectRealtime(). */
export function connectRealtime(): void {
  if (IS_E2E) return;
  users += 1;
  if (socket) return;
  socket = io(env.VITE_API_URL, {
    transports: ["websocket", "polling"],
    auth: (send) => {
      void identity.getIdToken().then((token) => send({ token }), () => send({}));
    },
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
  });
  for (const [event, set] of listeners) for (const listener of set) socket.on(event, listener);
}

export function disconnectRealtime(): void {
  users = Math.max(0, users - 1);
  if (users > 0 || !socket) return;
  socket.disconnect();
  socket = null;
}

/** Listens for one event, now or once connected; returns the function that stops listening. */
export function onRealtime<T>(event: string, handler: (payload: T) => void): () => void {
  const listener = handler as Listener;
  const set = listeners.get(event) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(event, set);
  socket?.on(event, listener);
  return () => {
    set.delete(listener);
    socket?.off(event, listener);
  };
}
