
import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * MCP (ChatGPT connector) authentication.
 *
 * Mirrors lib/auth/session.ts in spirit: a request presents an opaque,
 * cryptographically random bearer token instead of a browser cookie. Only a
 * SHA-256 hash of the token is ever persisted (McpApiToken.tokenHash) - same
 * principle as User.passwordHash / Session.token - so a leaked database
 * cannot be used to recover a usable token.
 *
 * This module intentionally does NOT touch getCurrentUser()/session.ts. It
 * resolves identity independently and returns the same `User` shape so every
 * downstream Prisma call in lib/mcp/tools/* is written exactly like the
 * existing REST routes (scoped by `userId`).
 */

// Fixed-window rate limit: a single MCP token may make at most
// RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW_MS. State is persisted in
// Postgres (McpApiToken.rateLimitWindowStart/rateLimitCount) because Vercel
// serverless functions do not share in-memory state across invocations.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests / minute / token

export class McpAuthError extends Error {}
export class McpRateLimitError extends Error {}

function generateRawToken(): string {
  // 32 random bytes -> 64 hex chars. Shown to the user exactly once.
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Mints a new MCP API token for `userId`. Returns the raw token, which is
 * NOT recoverable afterwards - only its hash is stored. Intended to be
 * called from a one-off, locally-run script (scripts/mcp-token.ts), never
 * from a client-facing route.
 */
export async function createMcpToken(userId: string, name: string) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const record = await prisma.mcpApiToken.create({
    data: { userId, name, tokenHash },
  });

  return { id: record.id, rawToken };
}

export async function revokeMcpToken(tokenId: string) {
  await prisma.mcpApiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

export async function listMcpTokens(userId: string) {
  return prisma.mcpApiToken.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Applies (and persists) the fixed-window rate limit for a token. Throws
 * McpRateLimitError if the token has exceeded its budget for the current
 * window. Never throws for a brand-new/rotated window.
 */
async function enforceRateLimit(tokenId: string, windowStart: Date | null, count: number) {
  const now = new Date();
  const windowExpired = !windowStart || now.getTime() - windowStart.getTime() >= RATE_LIMIT_WINDOW_MS;

  if (windowExpired) {
    await prisma.mcpApiToken.update({
      where: { id: tokenId },
      data: { rateLimitWindowStart: now, rateLimitCount: 1 },
    });
    return;
  }

  if (count >= RATE_LIMIT_MAX) {
    throw new McpRateLimitError("Too many MCP requests. Please slow down and try again shortly.");
  }

  await prisma.mcpApiToken.update({
    where: { id: tokenId },
    data: { rateLimitCount: { increment: 1 } },
  });
}

/**
 * Resolves the tracker User associated with a raw bearer token presented by
 * an MCP client. Returns null for any invalid/missing/revoked token (the
 * caller should treat this as 401, not a Prisma error). Throws
 * McpRateLimitError if the token is valid but over its rate limit (the
 * caller should treat this as 429).
 *
 * Never logs the raw token or the Authorization header.
 */
export async function getUserFromMcpToken(rawToken: string | undefined | null) {
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const record = await prisma.mcpApiToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.revokedAt) return null;

  await enforceRateLimit(record.id, record.rateLimitWindowStart, record.rateLimitCount);

  // Fire-and-forget bookkeeping; never blocks the response and never throws.
  prisma.mcpApiToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { user: record.user, tokenId: record.id };
}
