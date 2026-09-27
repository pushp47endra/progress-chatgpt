/**
 * One-off, locally-run CLI to mint/list/revoke MCP API tokens.
 *
 * This is intentionally NOT a web route: minting a bearer token is a
 * sensitive, one-time action, and the app has no public sign-up / admin UI
 * to gate it behind. Run it directly against the same DATABASE_URL the app
 * uses (locally, or via `vercel env pull` + this script, or a one-off
 * `vercel exec`/Neon SQL console session against production).
 *
 * The raw token is printed to stdout exactly once, at creation time. Only
 * its SHA-256 hash is ever persisted (McpApiToken.tokenHash) - see
 * lib/mcp/auth.ts. If you lose it, revoke it and create a new one; there is
 * no way to recover a lost raw token.
 *
 * Usage:
 *   npm run mcp:token -- create [username] [--name "ChatGPT"]
 *   npm run mcp:token -- list [username]
 *   npm run mcp:token -- revoke <tokenId>
 *
 * `username` defaults to INITIAL_ADMIN_USERNAME (or "pushpendra", matching
 * prisma/seed.ts) since this is a single-user app in practice.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
// Relative import (not the "@/" alias) so this script runs standalone under
// `tsx` without depending on tsconfig path-alias resolution.
import { createMcpToken, revokeMcpToken, listMcpTokens } from "../lib/mcp/auth";

const prisma = new PrismaClient();

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx === args.length - 1) return undefined;
  return args[idx + 1];
}

function usageAndExit(): never {
  console.error(
    "\nUsage:\n" +
      '  npm run mcp:token -- create [username] [--name "ChatGPT"]\n' +
      "  npm run mcp:token -- list [username]\n" +
      "  npm run mcp:token -- revoke <tokenId>\n"
  );
  process.exit(1);
}

async function resolveUser(usernameArg: string | undefined) {
  const username = usernameArg || process.env.INITIAL_ADMIN_USERNAME || "pushpendra";
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`\nERROR: no user found with username "${username}".`);
    process.exit(1);
  }
  return user;
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (command === "create") {
    const positional = rest.filter((a) => !a.startsWith("--"));
    const name = parseFlag(rest, "--name") || "ChatGPT MCP connector";
    const user = await resolveUser(positional[0]);

    const { id, rawToken } = await createMcpToken(user.id, name);

    console.log(`\nCreated MCP token "${name}" (id: ${id}) for user "${user.username}".`);
    console.log("\nRaw token (shown ONLY this once - store it now, e.g. in a password manager):\n");
    console.log(`  ${rawToken}\n`);
    console.log("Use it as: Authorization: Bearer <token above>");
    console.log("Never commit this value or paste it into a chat log, issue, or documentation.\n");
    return;
  }

  if (command === "list") {
    const positional = rest.filter((a) => !a.startsWith("--"));
    const user = await resolveUser(positional[0]);
    const tokens = await listMcpTokens(user.id);

    if (tokens.length === 0) {
      console.log(`\nNo MCP tokens for user "${user.username}".\n`);
      return;
    }

    console.log(`\nMCP tokens for user "${user.username}":\n`);
    for (const t of tokens) {
      const status = t.revokedAt ? `revoked at ${t.revokedAt.toISOString()}` : "active";
      const lastUsed = t.lastUsedAt ? t.lastUsedAt.toISOString() : "never";
      console.log(`  - ${t.id}  "${t.name}"  [${status}]  created ${t.createdAt.toISOString()}  last used ${lastUsed}`);
    }
    console.log("");
    return;
  }

  if (command === "revoke") {
    const tokenId = rest[0];
    if (!tokenId) usageAndExit();
    await revokeMcpToken(tokenId);
    console.log(`\nRevoked MCP token ${tokenId}.\n`);
    return;
  }

  usageAndExit();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
