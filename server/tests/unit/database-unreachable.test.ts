import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { isDatabaseUnreachable, unreachableHost, unreachableReason } from "../../src/common/errors/database-unreachable";
import { AppDataSource } from "../../src/config/data-source";
import { errorHandler } from "../../src/middleware/error-handler.middleware";

// A request that can't reach its database for a moment is not a bug in the code, and answering it with a
// 500 meant the web app never tried again. These are the failures seen in the logs, and the ones like them.

const networkError = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(`getaddrinfo ${code} pg-host.example.com`), { code, ...extra });

describe("isDatabaseUnreachable", () => {
  it("recognises the host not resolving, the network dropping and a timed-out connect", () => {
    for (const code of ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"]) {
      expect(isDatabaseUnreachable(networkError(code))).toBe(true);
    }
    expect(unreachableReason(networkError("ENOTFOUND"))).toBe("ENOTFOUND");
  });

  it("sees through the wrappers TypeORM and Node put round the real error", () => {
    expect(isDatabaseUnreachable({ message: "Query failed", driverError: networkError("ENOTFOUND") })).toBe(true);
    expect(isDatabaseUnreachable(new Error("wrapped", { cause: networkError("ECONNRESET") }))).toBe(true);
    expect(isDatabaseUnreachable(Object.assign(new Error("connect failed"), { errors: [networkError("ECONNREFUSED")] }))).toBe(true);
  });

  it("recognises node-postgres failing to connect, in words, and Postgres saying it is shutting down or full", () => {
    expect(isDatabaseUnreachable(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isDatabaseUnreachable(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isDatabaseUnreachable(Object.assign(new Error("terminating connection"), { code: "57P01" }))).toBe(true);
    expect(isDatabaseUnreachable(Object.assign(new Error("too many clients"), { code: "53300" }))).toBe(true);
    expect(isDatabaseUnreachable(Object.assign(new Error("connection failure"), { code: "08006" }))).toBe(true);
  });

  it("does not mistake a bug or a bad query for an outage", () => {
    expect(isDatabaseUnreachable(new TypeError("Cannot read properties of undefined (reading 'toISOString')"))).toBe(false);
    expect(isDatabaseUnreachable(Object.assign(new Error("duplicate key value"), { code: "23505" }))).toBe(false);
    expect(isDatabaseUnreachable(Object.assign(new Error("syntax error"), { code: "42601" }))).toBe(false);
    expect(isDatabaseUnreachable(null)).toBe(false);
    expect(isDatabaseUnreachable("ENOTFOUND")).toBe(false);
  });

  it("says which host it was, for the log", () => {
    expect(unreachableHost(networkError("ENOTFOUND", { hostname: "pg-host.example.com" }))).toBe("pg-host.example.com");
    expect(unreachableHost(new Error("nothing"))).toBeUndefined();
  });
});

describe("errorHandler for a service that can't be reached", () => {
  function respond(err: unknown) {
    const headers: Record<string, string> = {};
    const result = { status: 0, body: undefined as unknown };
    const res = {
      setHeader: (name: string, value: string) => void (headers[name] = value),
      status(code: number) {
        result.status = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      },
    };
    errorHandler(err, { method: "GET", originalUrl: "/api/v1/roads/geojson", user: undefined } as unknown as Request, res as unknown as Response, vi.fn());
    return { ...result, headers };
  }

  it("answers 503 with a plain message and a Retry-After, which the web app retries, instead of a 500", () => {
    const { status, body, headers } = respond(networkError("ENOTFOUND", { hostname: "pg-host.example.com" }));
    expect(status).toBe(503);
    expect(headers["Retry-After"]).toBe("5");
    expect(body).toMatchObject({ success: false, message: expect.stringMatching(/can't reach a service it depends on/) });
    expect(JSON.stringify(body)).not.toMatch(/pg-host|getaddrinfo/);
  });

  it("still answers a real bug with a generic 500 that leaks nothing", () => {
    const { status, body } = respond(new TypeError("Cannot read properties of undefined"));
    expect(status).toBe(500);
    expect(body).toMatchObject({ message: "Something went wrong" });
  });
});

describe("the database pool", () => {
  it("keeps connections for minutes, notices a dropped one, and doesn't wait for ever to connect", () => {
    expect(AppDataSource.options).toMatchObject({ extra: { idleTimeoutMillis: 300_000, connectionTimeoutMillis: 15_000, keepAlive: true } });
  });
});
