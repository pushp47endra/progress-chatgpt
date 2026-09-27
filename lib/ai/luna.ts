import "server-only";
import { LUNA_SYSTEM_PROMPT } from "./systemPrompt";

export class LunaError extends Error {}

export interface LunaChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface LunaResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  model: string;
}

/**
 * Calls GPT-6 Luna through Amazon Bedrock's runtime API.
 *
 * All credentials (LUNA_API_KEY / AWS_REGION / LUNA_MODEL_ID / LUNA_API_URL)
 * are server-only environment variables. This function must only ever be
 * invoked from server-side code (API route handlers), never from the client.
 */
export async function askLuna(
  optimizedPrompt: string,
  recentContext: LunaChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<LunaResult> {
  const apiKey = process.env.LUNA_API_KEY;
  const apiUrl = process.env.LUNA_API_URL;
  const modelId = process.env.LUNA_MODEL_ID;
  const region = process.env.AWS_REGION;

  if (!apiKey || !apiUrl || !modelId || !region) {
    throw new LunaError("Luna AI is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Amz-Region": region,
      },
      body: JSON.stringify({
        modelId,
        max_tokens: options?.maxTokens ?? 1200,
        temperature: options?.temperature ?? 0.4,
        system: LUNA_SYSTEM_PROMPT,
        messages: [...recentContext, { role: "user", content: optimizedPrompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new LunaError(`Luna request failed (${response.status})`);
    }

    const data = await response.json();

    const text: string | undefined =
      data?.content?.map((c: { text?: string }) => c.text).filter(Boolean).join("\n") ??
      data?.choices?.[0]?.message?.content;

    if (!text || !text.trim()) {
      throw new LunaError("Luna returned an empty response.");
    }

    return {
      text: text.trim(),
      promptTokens: data?.usage?.input_tokens ?? data?.usage?.prompt_tokens,
      completionTokens: data?.usage?.output_tokens ?? data?.usage?.completion_tokens,
      model: modelId,
    };
  } catch (err) {
    if (err instanceof LunaError) throw err;
    throw new LunaError("Luna is unavailable right now.");
  } finally {
    clearTimeout(timeout);
  }
}

export function isLunaConfigured(): boolean {
  return Boolean(
    process.env.LUNA_API_KEY &&
      process.env.LUNA_API_URL &&
      process.env.LUNA_MODEL_ID &&
      process.env.AWS_REGION
  );
}