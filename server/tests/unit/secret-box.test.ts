import { describe, expect, it } from "vitest";
import { open, seal } from "../../src/common/crypto/secret-box";

const SECRET = "a-test-secret-that-is-at-least-32-characters";
const CONTEXT = "user-1:anthropic";

describe("secret box", () => {
  it("round-trips a secret", () => {
    const sealed = seal("sk-test-123", SECRET, CONTEXT);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("sk-test-123");
    expect(open(sealed, SECRET, CONTEXT)).toBe("sk-test-123");
  });

  it("returns null with the wrong secret", () => {
    expect(open(seal("sk-test-123", SECRET, CONTEXT), `${SECRET}-other`, CONTEXT)).toBeNull();
  });

  it("returns null when moved to another owner or provider", () => {
    const sealed = seal("sk-test-123", SECRET, CONTEXT);
    expect(open(sealed, SECRET, "user-2:anthropic")).toBeNull();
    expect(open(sealed, SECRET, "user-1:openai")).toBeNull();
  });

  it("returns null for tampered or malformed input", () => {
    const [version, iv, tag, ciphertext] = seal("sk-test-123", SECRET, CONTEXT).split(".");
    const flipped = `${ciphertext!.startsWith("A") ? "B" : "A"}${ciphertext!.slice(1)}`;
    expect(open([version, iv, tag, flipped].join("."), SECRET, CONTEXT)).toBeNull();
    expect(open([version, iv, tag!.slice(0, 8), ciphertext].join("."), SECRET, CONTEXT)).toBeNull();
    expect(open("not-sealed", SECRET, CONTEXT)).toBeNull();
    expect(open(`v2.${iv}.${tag}.${ciphertext}`, SECRET, CONTEXT)).toBeNull();
  });
});
