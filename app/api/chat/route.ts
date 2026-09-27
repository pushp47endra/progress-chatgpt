import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { chatMessageSchema } from "@/lib/validation/schemas";
import { optimizePrompt, OptimizerError } from "@/lib/ai/optimizer";
import { askLuna, LunaError, LunaChatMessage } from "@/lib/ai/luna";
import { generateTitleFromMessage } from "@/lib/ai/title";

// How many recent messages (user+assistant combined) to send as context.
// Kept small deliberately to control token/cost usage (see spec #29, #30).
const CONTEXT_MESSAGE_COUNT = 8;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
  console.error("CHAT VALIDATION ERROR:", parsed.error.flatten());

  return NextResponse.json(
    {
      error: "Invalid request.",
      details: parsed.error.flatten(),
    },
    { status: 400 }
  );
}
  const { debugMode, skipOptimizer, retryMessageId } = parsed.data;
  let { conversationId } = parsed.data;
  let message = parsed.data.message;

  let userMessage;

  if (retryMessageId) {
    // Retrying a previous message after an optimizer/Luna failure: reuse the
    // existing stored user message instead of creating a duplicate.
    const existingUserMessage = await prisma.message.findFirst({
      where: { id: retryMessageId, role: "user", conversation: { userId: user.id } },
      include: { conversation: true },
    });
    if (!existingUserMessage) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }
    userMessage = existingUserMessage;
    message = existingUserMessage.content;
    conversationId = existingUserMessage.conversationId;
  } else {
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

    // 1. Resolve / create the conversation (ownership-checked).
    let conversation = conversationId
      ? await prisma.conversation.findFirst({ where: { id: conversationId, userId: user.id } })
      : null;

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, title: "New Chat" },
      });
    }
    conversationId = conversation.id;

    // Auto-title from the first message in the conversation (local
    // heuristic, no AI call, to avoid wasting tokens on something this
    // cheap to do).
    const existingMessageCount = await prisma.message.count({ where: { conversationId } });
    if (existingMessageCount === 0 && conversation.title === "New Chat") {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: generateTitleFromMessage(message) },
      });
    }

    // 2. Save the original user message immediately - it must never be
    // lost, even if the optimizer or Luna subsequently fail.
    userMessage = await prisma.message.create({
      data: { conversationId, role: "user", content: message },
    });
  }

  if (!message) {
    // Should be unreachable given the validation above, but keeps TypeScript
    // (and runtime behavior) strictly correct.
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  // 3. Load only relevant recent context (not the entire chat history).
  const recentMessages = await prisma.message.findMany({
    where: { conversationId, id: { not: userMessage.id } },
    orderBy: { createdAt: "desc" },
    take: CONTEXT_MESSAGE_COUNT,
  });
  const context: LunaChatMessage[] = recentMessages
    .reverse()
    .map((m) => ({ role: m.role, content: m.content }));

  // 4. Optimizer stage.
  // Per spec: the optimizer only rewrites/shortens/clarifies the user's
  // request - it must NEVER answer it, and if it fails for any reason we
  // must safely fall back to sending the ORIGINAL message straight to Luna
  // rather than blocking the user's request.
  let optimizedPrompt = message;
  let optimizerFailed = false;
  if (!skipOptimizer) {
    try {
      const result = await optimizePrompt(message);
      optimizedPrompt = result.optimizedPrompt;
    } catch (err) {
      if (err instanceof OptimizerError) {
        optimizerFailed = true;
        optimizedPrompt = message; // safe fallback to the original request
      } else {
        throw err;
      }
    }
  }

  // 5. Luna stage.
  try {
    const lunaResult = await askLuna(optimizedPrompt, context);

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: lunaResult.text,
        model: lunaResult.model,
        promptTokens: lunaResult.promptTokens ?? null,
        completionTokens: lunaResult.completionTokens ?? null,
        optimizedPrompt: optimizedPrompt !== message ? optimizedPrompt : null,
      },
    });

    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    return NextResponse.json({
      conversationId,
      userMessage,
      assistantMessage,
      optimizerFailed: optimizerFailed || undefined,
      debug: debugMode
        ? {
            originalMessage: message,
            optimizerUsed: !skipOptimizer && !optimizerFailed,
            optimizerFailed,
            optimizedPrompt,
            lunaModel: lunaResult.model,
          }
        : undefined,
    });
  } catch (err) {
    if (err instanceof LunaError) {
      return NextResponse.json(
        {
          error: "luna_unavailable",
          message: "Luna is unavailable right now. You can retry.",
          conversationId,
          userMessageId: userMessage.id,
        },
        { status: 200 }
      );
    }
    console.error("Chat pipeline error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Something went wrong. Please try again.", conversationId },
      { status: 500 }
    );
  }
}