import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const TAG_BYTES = 16;

const keyFrom = (secret: string) => createHash("sha256").update(secret).digest();

/**
 * Encrypts a secret (an AI provider API key) with AES-256-GCM. `context` is bound as additional
 * authenticated data, so a ciphertext copied onto another owner or provider will not decrypt.
 * Output: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 */
export function seal(plaintext: string, secret: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** The plaintext, or null (never throws) on tampering, a wrong context, a wrong secret or a bad format. */
export function open(sealed: string, secret: string, context: string): string | null {
  const [version, iv, tag, ciphertext, ...rest] = sealed.split(".");
  if (version !== VERSION || iv === undefined || tag === undefined || ciphertext === undefined || rest.length > 0) return null;
  try {
    const authTag = Buffer.from(tag, "base64url");
    if (authTag.length !== TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"), { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
