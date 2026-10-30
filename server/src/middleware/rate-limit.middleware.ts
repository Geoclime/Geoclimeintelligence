import type { NextFunction, Request, Response } from "express";
import { AppError } from "../common/errors/app-error";

export interface RateLimitOptions {
  /** Length of one window, in milliseconds. */
  windowMs: number;
  /** Requests one client may make per window. */
  max: number;
  /** Injectable clock, so tests can move time without waiting. */
  now?: () => number;
}

interface Window {
  startedAt: number;
  count: number;
}

/**
 * A fixed-window limit per client IP, for the routes that need no sign-in (the public landing
 * page's reads). It lives in memory, which is right for the single API instance this platform
 * runs; a second instance would need a shared store instead. The client IP is only correct
 * behind a proxy when TRUST_PROXY_HOPS is set (config/env.ts).
 */
export function rateLimit({ windowMs, max, now = Date.now }: RateLimitOptions) {
  const windows = new Map<string, Window>();
  let lastSweep = now();

  return (req: Request, res: Response, next: NextFunction) => {
    const time = now();
    // Drop finished windows now and then, so the map holds only clients seen recently.
    if (time - lastSweep > windowMs) {
      for (const [key, window] of windows) if (time - window.startedAt >= windowMs) windows.delete(key);
      lastSweep = time;
    }

    const key = req.ip ?? "unknown";
    let window = windows.get(key);
    if (!window || time - window.startedAt >= windowMs) {
      window = { startedAt: time, count: 0 };
      windows.set(key, window);
    }
    window.count += 1;

    const resetSeconds = Math.max(1, Math.ceil((window.startedAt + windowMs - time) / 1000));
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - window.count)));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (window.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      throw new AppError(429, "Too many requests. Please wait a minute and try again.");
    }
    next();
  };
}
