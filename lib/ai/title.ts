const MAX_TITLE_LENGTH = 60;

/**
 * Derives a short conversation title from the user's first message, purely
 * locally (no AI call) - this keeps the very first message of a chat from
 * costing extra tokens just to name the conversation.
 */
export function generateTitleFromMessage(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New Chat";
  if (cleaned.length <= MAX_TITLE_LENGTH) return cleaned;

  const truncated = cleaned.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  const base = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  return `${base}...`;
}
