import "server-only";

import { createGoogleGenerativeAI, type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type AIProviderKind = "google" | "openai" | "openai-compatible" | "groq";

type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
type ProviderOptions = Record<string, Record<string, JSONValue>>;

const googleProviderOptions = {
  google: {
    thinkingConfig: {
      includeThoughts: false,
      thinkingBudget: 128,
    },
  } satisfies GoogleGenerativeAIProviderOptions,
};

function resolveProviderOptions(provider: AIProviderKind): ProviderOptions {
  return provider === "google" ? googleProviderOptions : {};
}

function createModel(provider: AIProviderKind, modelId: string) {
  if (provider === "google") {
    if (!process.env.GOOGLE_API_KEY) throw new Error("Missing GOOGLE_API_KEY");
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
    return google(modelId);
  }

  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
    return openai(modelId);
  }

  if (provider === "groq") {
    if (!process.env.GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");
    return groq(modelId);
  }

  if (!process.env.AI_BASE_URL) throw new Error("Missing AI_BASE_URL");
  if (!process.env.AI_API_KEY) throw new Error("Missing AI_API_KEY");

  const compatible = createOpenAICompatible({
    name: process.env.AI_PROVIDER_NAME || "openai-compatible",
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL,
    includeUsage: true,
    supportsStructuredOutputs: true,
  });

  return compatible(modelId);
}

export function getResolvedAIConfig(): { provider: AIProviderKind; modelId: string } {
  const providerEnv = (process.env.AI_PROVIDER ?? "google").toLowerCase();
  const provider =
    providerEnv === "google" ||
    providerEnv === "openai" ||
    providerEnv === "openai-compatible" ||
    providerEnv === "groq"
      ? (providerEnv as AIProviderKind)
      : (() => {
          throw new Error(`Unsupported AI_PROVIDER: ${process.env.AI_PROVIDER}`);
        })();

  const modelId =
    (provider === "google"
      ? process.env.GOOGLE_AI_MODEL
      : provider === "openai"
        ? process.env.OPENAI_AI_MODEL
        : provider === "groq"
          ? process.env.GROQ_AI_MODEL
          : process.env.OPENAI_COMPATIBLE_AI_MODEL);

  if (!modelId) {
    const envVarName =
      provider === "google"
        ? "GOOGLE_AI_MODEL"
        : provider === "openai"
          ? "OPENAI_AI_MODEL"
          : provider === "groq"
            ? "GROQ_AI_MODEL"
            : "OPENAI_COMPATIBLE_AI_MODEL";

    throw new Error(`Missing ${envVarName}`);
  }

  return { provider, modelId };
}

export function getAIModel() {
  const { provider, modelId } = getResolvedAIConfig();
  return createModel(provider, modelId);
}

export function getAIProviderOptions(): ProviderOptions {
  const { provider } = getResolvedAIConfig();
  return resolveProviderOptions(provider);
}
