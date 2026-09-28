import type { ActionCodeSettings } from "firebase/auth";
import { describe, expect, it, vi } from "vitest";
import { continueSettings, sendWithContinueUrl } from "./email-actions";

const settings = continueSettings("/sign-in", "https://app.example.com");

describe("continueSettings", () => {
  it("builds an absolute URL on the given origin and leaves the link on Firebase's page", () => {
    expect(settings).toEqual({ url: "https://app.example.com/sign-in", handleCodeInApp: false });
  });
});

describe("sendWithContinueUrl", () => {
  it("sends once, with the continue URL, when Firebase accepts it", async () => {
    const send = vi.fn<(s?: ActionCodeSettings) => Promise<void>>().mockResolvedValue(undefined);
    await sendWithContinueUrl(send, settings);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(settings);
  });

  it("falls back to a plain email when the continue URL's domain isn't authorised", async () => {
    const send = vi
      .fn<(s?: ActionCodeSettings) => Promise<void>>()
      .mockRejectedValueOnce({ code: "auth/unauthorized-continue-uri" })
      .mockResolvedValueOnce(undefined);
    await sendWithContinueUrl(send, settings);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith();
  });

  it("does not retry other failures", async () => {
    const failure = { code: "auth/too-many-requests" };
    const send = vi.fn<(s?: ActionCodeSettings) => Promise<void>>().mockRejectedValue(failure);
    await expect(sendWithContinueUrl(send, settings)).rejects.toBe(failure);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
