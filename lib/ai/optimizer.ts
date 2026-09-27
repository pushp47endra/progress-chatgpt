import "server-only";
import { buildOptimizerSystemPrompt } from "./systemPrompt";

export class OptimizerError extends Error {}

interface OptimizerResult {
  optimizedPrompt: string;
}

/**
 * Calls the configured Optimizer AI to rewrite the user's raw message into a
 * shorter, clearer, complete prompt for Luna. This function NEVER answers the
 * user's question itself - it only produces an optimized prompt.
 *
 * The optimizer's API key/URL are read from server-only environment variables
 * and are never sent to the browser.
 */
export async function optimizePrompt(userMessage: string): Promise<OptimizerResult> {
  const apiKey = process.env.OPTIMIZER_API_KEY;
  const apiUrl = process.env.OPTIMIZER_API_URL;
  const model = process.env.OPTIMIZER_MODEL;

  if (!apiKey || !apiUrl || !model) {
    throw new OptimizerError("Optimizer AI is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        temperature: 0.2,
        messages: [
          { role: "system", content: buildOptimizerSystemPrompt() },
          { role: "user", content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OptimizerError(`Optimizer AI request failed (${response.status})`);
    }

    const data = await response.json();

    // Supports either an OpenAI-style `choices[0].message.content` shape or an
    // Anthropic-style `content[].text` shape. Adjust this parsing to match
    // whatever provider is configured as OPTIMIZER_API_URL.
    const text: string | undefined =
      data?.choices?.[0]?.message?.content ??
      data?.content?.map((c: { text?: string }) => c.text).filter(Boolean).join("\n");

    if (!text || !text.trim()) {
      throw new OptimizerError("Optimizer AI returned an empty response.");
    }

    return { optimizedPrompt: text.trim() };
  } catch (err) {
    if (err instanceof OptimizerError) throw err;
    throw new OptimizerError("Optimizer AI is unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}

export function isOptimizerConfigured(): boolean {
  return Boolean(
    process.env.OPTIMIZER_API_KEY && process.env.OPTIMIZER_API_URL && process.env.OPTIMIZER_MODEL
  );
}
