import { recordAIUsage } from "@/actions/ai-usage";
import { THEME_GENERATION_TOOLS } from "@/lib/ai/generate-theme/tools";
import { GENERATE_THEME_SYSTEM } from "@/lib/ai/prompts";
import { getAIModel, getAIProviderOptions, getResolvedAIConfig } from "@/lib/ai/providers";
import { handleError } from "@/lib/error-response";
import {
  getAISDKMethods,
  createLangSmithOptions,
  mergeProviderOptions,
  createLangSmithToolContext,
  type LangSmithContext,
} from "@/lib/observability/langsmith";
import { getCurrentUserId, logError } from "@/lib/shared";
import { validateSubscriptionAndUsage } from "@/lib/subscription";
import { AdditionalAIContext, ChatMessage, MyMetadata } from "@/types/ai";
import { SubscriptionRequiredError } from "@/types/errors";
import { convertMessagesToModelMessages } from "@/utils/ai/message-converter";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";
import { createUIMessageStream, createUIMessageStreamResponse, stepCountIs } from "ai";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.fixedWindow(5, "60s"),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const headersList = await headers();

    if (process.env.NODE_ENV !== "development") {
      const ip = headersList.get("x-forwarded-for") ?? "anonymous";
      const { success, limit, reset, remaining } = await ratelimit.limit(ip);

      if (!success) {
        return new Response("Rate limit exceeded. Please try again later.", {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        });
      }
    }

    const subscriptionCheck = await validateSubscriptionAndUsage(userId);

    if (!subscriptionCheck.canProceed) {
      throw new SubscriptionRequiredError(subscriptionCheck.error, {
        requestsRemaining: subscriptionCheck.requestsRemaining,
      });
    }

    const { messages }: { messages: ChatMessage[] } = await req.json();
    const modelMessages = await convertMessagesToModelMessages(messages);

    // Extract requestId and conversationId from the last user message metadata
    const lastUserMessage = messages.findLast((m) => m.role === "user");
    const { requestId, conversationId } = (lastUserMessage?.metadata as MyMetadata & {
      requestId?: string;
      conversationId?: string;
    }) ?? {};

    const { streamText } = getAISDKMethods();
    const { provider, modelId } = getResolvedAIConfig();
    const model = getAIModel();

    // Build LangSmith context for this request
    const lsContext: LangSmithContext = {
      requestId,
      conversationId,
      userId: userId ?? undefined,
      route: "/api/generate-theme",
      provider,
      modelId,
    };

    const langsmithOptions = createLangSmithOptions(lsContext, "generate-theme", {
      messageCount: messages.length,
    });

    const baseProviderOptions = getAIProviderOptions();
    const providerOptions = mergeProviderOptions(baseProviderOptions, langsmithOptions);

    const stream = createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        const context: AdditionalAIContext = {
          writer,
          langsmith: createLangSmithToolContext(lsContext),
        };

        const result = streamText({
          abortSignal: req.signal,
          model: model,
          providerOptions,
          system: GENERATE_THEME_SYSTEM,
          messages: modelMessages,
          tools: THEME_GENERATION_TOOLS,
          stopWhen: stepCountIs(5),
          onError: (error: { error: unknown }) => {
            if (error.error instanceof Error) console.error(error.error);
          },
          onFinish: async (result: { totalUsage: { inputTokens: number; outputTokens: number } }) => {
            const { totalUsage } = result;
            try {
              await recordAIUsage({
                modelId: model.modelId,
                promptTokens: totalUsage.inputTokens,
                completionTokens: totalUsage.outputTokens,
              });
            } catch (error) {
              logError(error as Error, { action: "recordAIUsage", totalUsage });
            }
          },
          experimental_context: context,
        });

        writer.merge(
          result.toUIMessageStream({
            messageMetadata: ({ part }: { part: { type: string; toolName?: string; output?: unknown } }) => {
              // `toolName` is not typed for some reason, must be kept in sync with the actual tool names
              if (part.type === "tool-result" && part.toolName === "generateTheme") {
                return { themeStyles: part.output };
              }
            },
          })
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "ResponseAborted")
    ) {
      return new Response("Request aborted by user", { status: 499 });
    }

    return handleError(error, { route: "/api/generate-theme" });
  }
}
