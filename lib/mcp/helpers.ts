import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";

/** Wraps arbitrary JSON-serializable data as a successful MCP tool result. */
export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/** Wraps a human-readable error as a failed MCP tool result (isError: true). */
export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Every tool handler receives `extra.authInfo`, populated by withMcpAuth's
 * verifyToken (lib/mcp/auth.ts) from the request's bearer token. This pulls
 * out the userId every tool must scope its Prisma queries by - never trust a
 * client-supplied userId, always derive it from the resolved token.
 */
export function getAuthedUserId(extra: ToolExtra): string | null {
  const authInfo = extra.authInfo as { extra?: Record<string, unknown> } | undefined;
  const userId = authInfo?.extra?.userId;
  return typeof userId === "string" ? userId : null;
}
