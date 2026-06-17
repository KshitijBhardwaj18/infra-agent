import { createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { env } from "../common/env";

export type GithubStatePayload =
  | {
      kind: "project";
      projectId: string;
      returnEnv: "staging" | "production";
      userId: string;
    }
  | {
      kind: "admin-connection";
      userId: string;
    };

function getSecret(): string {
  const s = env("GITHUB_STATE_SECRET");
  if (!s) throw new Error("GITHUB_STATE_SECRET env var is required");
  return s;
}

function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Encodes payload into a URL-safe signed state token.
 * Format: base64url(JSON) . expiry(unix seconds) . hmac
 * Default 24h — accommodates org-scoped installs that need admin approval.
 */
export function signState(
  payload: GithubStatePayload,
  ttlSeconds = 86400,
): string {
  const secret = getSecret();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmac(secret, `${data}.${exp}`);
  return `${data}.${exp}.${sig}`;
}

/**
 * Verifies and decodes a signed state token.
 * Throws BadRequestException for invalid / expired tokens.
 */
export function verifyState(token: string): GithubStatePayload {
  const secret = getSecret();
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new BadRequestException("Invalid GitHub state token");
  }

  const [data, expStr, sig] = parts as [string, string, string];
  const expected = hmac(secret, `${data}.${expStr}`);

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new BadRequestException("Invalid GitHub state signature");
  }

  const exp = parseInt(expStr, 10);
  if (Number.isNaN(exp) || Math.floor(Date.now() / 1000) > exp) {
    throw new BadRequestException(
      "GitHub state token expired. Please try connecting again.",
    );
  }

  try {
    return JSON.parse(Buffer.from(data, "base64url").toString()) as GithubStatePayload;
  } catch {
    throw new BadRequestException("Malformed GitHub state payload");
  }
}
