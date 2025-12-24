import { themeStylesOutputSchema } from "@/lib/ai/generate-theme";
import { getAIModel, getAIProviderOptions, getResolvedAIConfig } from "@/lib/ai/providers";
import {
  getAISDKMethods,
  createLangSmithOptions,
  mergeProviderOptions,
} from "@/lib/observability/langsmith";
import { AdditionalAIContext } from "@/types/ai";
import { tool } from "ai";
import z from "zod";

export const THEME_GENERATION_TOOLS = {
  generateTheme: tool({
    description: `Generates a complete shadcn/ui theme (light and dark) based on the current conversation context. Use this tool once you have a clear understanding of the user's request, which may include a text prompt, images, an SVG, or a base theme reference (@[theme_name]).`,
    inputSchema: z.object({}),
    outputSchema: themeStylesOutputSchema,
    execute: async (_input, { messages, abortSignal, toolCallId, experimental_context }) => {
      const { writer, langsmith } = experimental_context as AdditionalAIContext;

      const { streamObject } = getAISDKMethods();
      const { provider, modelId } = getResolvedAIConfig();

      // Build LangSmith options for the tool's streamObject call
      const langsmithOptions = langsmith?.enabled && langsmith.context
        ? createLangSmithOptions(
            { ...langsmith.context, route: "/api/generate-theme/tool" },
            "generate-theme-tool",
            { provider, modelId }
          )
        : undefined;

      const baseProviderOptions = getAIProviderOptions();
      const providerOptions = mergeProviderOptions(baseProviderOptions, langsmithOptions);

      const { partialObjectStream, object } = streamObject({
        abortSignal,
        model: getAIModel(),
        providerOptions,
        schema: themeStylesOutputSchema,
        messages,
      });

      for await (const chunk of partialObjectStream) {
        writer.write({
          id: toolCallId,
          type: "data-generated-theme-styles",
          data: { status: "streaming", themeStyles: chunk },
          transient: true,
        });
      }

      const themeStyles = await object;

      writer.write({
        id: toolCallId,
        type: "data-generated-theme-styles",
        data: { status: "ready", themeStyles },
        transient: true,
      });

      return themeStyles;
    },
  }),
};
