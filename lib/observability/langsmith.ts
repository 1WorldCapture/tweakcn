import "server-only";

import { AIProviderKind } from "@/lib/ai/providers";
import {
  wrapAISDK,
  createLangSmithProviderOptions,
  type WrapAISDKConfig,
} from "langsmith/experimental/vercel";
import * as ai from "ai";

export type LangSmithRunMetadata = {
  requestId?: string;
  conversationId?: string;
  userId?: string;
  route: string;
  provider: AIProviderKind;
  modelId: string;
  promptLengthChars?: number;
  messageCount?: number;
  imageCount?: number;
  mentionCount?: number;
  [key: string]: unknown;
};

export type LangSmithContext = {
  requestId?: string;
  conversationId?: string;
  userId?: string;
  route: string;
  provider: AIProviderKind;
  modelId: string;
};

/**
 * Check if LangSmith tracing is enabled via environment variable
 */
export function isLangSmithEnabled(): boolean {
  return process.env.LANGSMITH_TRACING === "true";
}

/**
 * Build tags array for LangSmith run
 */
export function buildLangSmithTags(ctx: LangSmithContext): string[] {
  const env = process.env.NODE_ENV ?? "development";
  return [
    `env:${env}`,
    `route:${ctx.route}`,
    `provider:${ctx.provider}`,
    `model:${ctx.modelId}`,
  ];
}

/**
 * Build metadata object for LangSmith run
 */
export function buildLangSmithMetadata(
  ctx: LangSmithContext,
  extra?: Partial<LangSmithRunMetadata>
): LangSmithRunMetadata {
  return {
    requestId: ctx.requestId,
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    route: ctx.route,
    provider: ctx.provider,
    modelId: ctx.modelId,
    ...extra,
  };
}

// Cached wrapped AI SDK methods (created once when tracing is enabled)
let _wrappedAISDK: ReturnType<typeof wrapAISDK> | null = null;

function getWrappedAISDK() {
  if (!_wrappedAISDK) {
    _wrappedAISDK = wrapAISDK(ai);
  }
  return _wrappedAISDK;
}

/**
 * Get AI SDK methods - wrapped with LangSmith if tracing is enabled,
 * otherwise returns the original AI SDK methods
 */
export function getAISDKMethods() {
  if (!isLangSmithEnabled()) {
    return {
      streamText: ai.streamText,
      streamObject: ai.streamObject,
      generateText: ai.generateText,
      generateObject: ai.generateObject,
    };
  }

  return getWrappedAISDK();
}

/**
 * Create LangSmith provider options for a specific request context
 * Returns undefined if tracing is disabled
 */
export function createLangSmithOptions<T extends (...args: unknown[]) => unknown>(
  ctx: LangSmithContext,
  runName: string,
  extra?: Partial<LangSmithRunMetadata>,
  config?: Omit<WrapAISDKConfig<T>, "name" | "metadata" | "tags">
): Record<string, unknown> | undefined {
  if (!isLangSmithEnabled()) {
    return undefined;
  }

  const metadata = buildLangSmithMetadata(ctx, extra);
  const tags = buildLangSmithTags(ctx);

  return createLangSmithProviderOptions<T>({
    ...config,
    name: runName,
    metadata,
    tags,
  } as WrapAISDKConfig<T>);
}

/**
 * Merge base provider options with LangSmith options
 * Handles the case where langsmith options might be undefined (when tracing is disabled)
 */
export function mergeProviderOptions<T extends Record<string, unknown>>(
  baseOptions: T,
  langsmithOptions: Record<string, unknown> | undefined
): T {
  if (!langsmithOptions) {
    return baseOptions;
  }

  return {
    ...baseOptions,
    langsmith: langsmithOptions,
  } as T;
}

/**
 * Type for the LangSmith context that can be passed through experimental_context
 */
export type LangSmithToolContext = {
  enabled: boolean;
  context?: LangSmithContext;
};

/**
 * Create a LangSmith tool context to pass through experimental_context
 */
export function createLangSmithToolContext(
  ctx?: LangSmithContext
): LangSmithToolContext {
  return {
    enabled: isLangSmithEnabled(),
    context: ctx,
  };
}
