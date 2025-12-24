import { ENHANCE_PROMPT_SYSTEM } from "@/lib/ai/prompts";
import { getAIModel, getAIProviderOptions, getResolvedAIConfig } from "@/lib/ai/providers";
import { handleError } from "@/lib/error-response";
import {
  getAISDKMethods,
  createLangSmithOptions,
  mergeProviderOptions,
  type LangSmithContext,
} from "@/lib/observability/langsmith";
import { requireSubscriptionOrFreeUsage } from "@/lib/subscription";
import { AIPromptData } from "@/types/ai";
import { buildUserContentPartsFromPromptData } from "@/utils/ai/message-converter";
import { smoothStream } from "ai";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await requireSubscriptionOrFreeUsage(req);

    const body = await req.json();
    const {
      prompt: _prompt,
      promptData,
      requestId,
      conversationId,
    }: {
      prompt: string;
      promptData: AIPromptData;
      requestId?: string;
      conversationId?: string;
    } = body;
    const userContentParts = buildUserContentPartsFromPromptData(promptData);

    const { streamText } = getAISDKMethods();
    const { provider, modelId } = getResolvedAIConfig();

    const lsContext: LangSmithContext = {
      requestId,
      conversationId,
      route: "/api/enhance-prompt",
      provider,
      modelId,
    };

    const langsmithOptions = createLangSmithOptions(
      lsContext,
      "enhance-prompt",
      {
        promptLengthChars: promptData.content?.length ?? 0,
        mentionCount: promptData.mentions?.length ?? 0,
        imageCount: promptData.images?.length ?? 0,
      }
    );

    const baseProviderOptions = getAIProviderOptions();
    const providerOptions = mergeProviderOptions(baseProviderOptions, langsmithOptions);

    const result = streamText({
      system: ENHANCE_PROMPT_SYSTEM,
      messages: [
        {
          role: "user",
          content: userContentParts,
        },
      ],
      model: getAIModel(),
      providerOptions,
      experimental_transform: smoothStream({
        delayInMs: 10,
        chunking: "word",
      }),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return handleError(error, { route: "/api/enhance-prompt" });
  }
}
