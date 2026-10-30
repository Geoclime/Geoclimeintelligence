import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error";
import { rateLimit } from "../../src/middleware/rate-limit.middleware";

function fakeResponse() {
  const headers = new Map<string, string>();
  return { headers, res: { setHeader: (name: string, value: string) => headers.set(name, value) } as unknown as Response };
}

function setup(max = 2) {
  let time = 0;
  const limiter = rateLimit({ windowMs: 60_000, max, now: () => time });
  const call = (ip: string) => {
    const { res, headers } = fakeResponse();
    let passed = false;
    const next: NextFunction = () => {
      passed = true;
    };
    try {
      limiter({ ip } as Request, res, next);
    } catch (error) {
      return { passed, headers, error };
    }
    return { passed, headers, error: null };
  };
  return { call, advance: (ms: number) => (time += ms) };
}

describe("rateLimit", () => {
  it("lets a client through up to the limit and says how many requests are left", () => {
    const { call } = setup();
    const first = call("1.1.1.1");
    expect(first.passed).toBe(true);
    expect(first.headers.get("RateLimit-Limit")).toBe("2");
    expect(first.headers.get("RateLimit-Remaining")).toBe("1");
    expect(call("1.1.1.1").passed).toBe(true);
  });

  it("refuses the next request with a 429 and a Retry-After", () => {
    const { call, advance } = setup();
    call("1.1.1.1");
    call("1.1.1.1");
    advance(15_000);
    const refused = call("1.1.1.1");
    expect(refused.passed).toBe(false);
    expect(refused.error).toBeInstanceOf(AppError);
    expect((refused.error as AppError).statusCode).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("45");
  });

  it("counts each client separately", () => {
    const { call } = setup(1);
    expect(call("1.1.1.1").passed).toBe(true);
    expect(call("2.2.2.2").passed).toBe(true);
    expect(call("1.1.1.1").passed).toBe(false);
  });

  it("starts a fresh window once the minute is up", () => {
    const { call, advance } = setup(1);
    call("1.1.1.1");
    expect(call("1.1.1.1").passed).toBe(false);
    advance(60_000);
    expect(call("1.1.1.1").passed).toBe(true);
  });
});
