# LangSmith Observability Integration Memo

## Overview

This document describes the implementation of LangSmith tracing for LLM call observability in the Asmara project. The integration enables tracking of all AI SDK calls (`streamText`, `streamObject`) with structured metadata, tags, and request correlation IDs.

## Goals

1. **Trace all LLM calls** to LangSmith for debugging prompt issues
2. **Correlate requests** using `requestId` and `conversationId` across frontend, backend, and PostHog
3. **Structured metadata** for filtering traces by route, provider, model, etc.
4. **Minimal code changes** with centralized observability module

## Architecture

### Request Flow

```
Frontend (useChat/useCompletion)
    │
    ├── Generates requestId (per request)
    ├── Generates conversationId (per session)
    │
    ▼
Backend API Routes
    │
    ├── /api/enhance-prompt (streamText)
    └── /api/generate-theme (streamText → tool → streamObject)
            │
            ▼
        LangSmith (traces with metadata)
```

### Trace Structure in LangSmith

```
Root Run: generate-theme
├── Child Run (LLM): streamText
├── Child Run (Tool): generateTheme
│   └── Child Run (LLM): streamObject
└── ...
```

## Implementation Details

### Phase 0: Infrastructure

#### Dependencies

Added `langsmith` package:
```bash
pnpm add langsmith
```

#### Environment Variables (`.env.example`)

```bash
# Enable LangSmith tracing
LANGSMITH_TRACING="false"  # Set to "true" to enable

# LangSmith API Key
LANGSMITH_API_KEY="YOUR_LANGSMITH_API_KEY"

# Project name for grouping traces
LANGSMITH_PROJECT="asmara"
```

#### Observability Module (`lib/observability/langsmith.ts`)

Centralized module that exports:

| Function | Purpose |
|----------|---------|
| `isLangSmithEnabled()` | Check if tracing is enabled via env |
| `getAISDKMethods()` | Get wrapped AI SDK methods (streamText, streamObject, etc.) |
| `createLangSmithOptions()` | Build providerOptions.langsmith config |
| `mergeProviderOptions()` | Merge base options with LangSmith options |
| `createLangSmithToolContext()` | Create context for passing to tools |

Key types:

```typescript
type LangSmithContext = {
  requestId?: string;
  conversationId?: string;
  userId?: string;
  route: string;
  provider: AIProviderKind;
  modelId: string;
};

type LangSmithToolContext = {
  enabled: boolean;
  context?: LangSmithContext;
};
```

### Phase 1: Backend Integration

#### `/api/enhance-prompt/route.ts`

Changes:
- Import wrapped `streamText` from `getAISDKMethods()`
- Extract `requestId`/`conversationId` from request body
- Build LangSmith context with route, provider, model info
- Merge LangSmith options into providerOptions

```typescript
const { streamText } = getAISDKMethods();
const lsContext: LangSmithContext = {
  requestId,
  conversationId,
  route: "/api/enhance-prompt",
  provider,
  modelId,
};
const langsmithOptions = createLangSmithOptions(lsContext, "enhance-prompt", {
  promptLengthChars: promptData.content?.length ?? 0,
});
const providerOptions = mergeProviderOptions(baseProviderOptions, langsmithOptions);
```

#### `/api/generate-theme/route.ts`

Changes:
- Import wrapped `streamText` from `getAISDKMethods()`
- Extract `requestId`/`conversationId` from last user message metadata
- Pass LangSmith context to tool via `experimental_context`

```typescript
const context: AdditionalAIContext = {
  writer,
  langsmith: createLangSmithToolContext(lsContext),
};
```

#### `lib/ai/generate-theme/tools.ts`

Changes:
- Import wrapped `streamObject` from `getAISDKMethods()`
- Read LangSmith context from `experimental_context`
- Build LangSmith options for the tool's streamObject call

```typescript
const { writer, langsmith } = experimental_context as AdditionalAIContext;
const { streamObject } = getAISDKMethods();

const langsmithOptions = langsmith?.enabled && langsmith.context
  ? createLangSmithOptions(
      { ...langsmith.context, route: "/api/generate-theme/tool" },
      "generate-theme-tool"
    )
  : undefined;
```

### Phase 2: Frontend Correlation

#### Type Extensions (`types/ai.ts`)

```typescript
export type MyMetadata = {
  promptData?: AIPromptData;
  themeStyles?: ThemeStyles;
  requestId?: string;      // Added
  conversationId?: string; // Added
};

export type AdditionalAIContext = {
  writer: UIMessageStreamWriter<ChatMessage>;
  langsmith?: LangSmithToolContext; // Added
};
```

#### `hooks/use-ai-theme-generation-core.ts`

- Generate stable `conversationId` per hook instance using `useRef`
- Generate new `requestId` for each request
- Pass both IDs in message metadata

```typescript
const conversationIdRef = useRef<string>(cuid());

const generateThemeCore = async (promptData?: AIPromptData) => {
  const requestId = cuid();
  sendMessage({
    text: promptData.content,
    metadata: {
      promptData,
      requestId,
      conversationId: conversationIdRef.current,
    },
  });
};
```

#### `hooks/use-ai-enhance-prompt.ts`

- Generate stable `conversationId` per hook instance
- Generate new `requestId` for each request
- Pass both IDs in request body
- Include IDs in PostHog events for cross-system correlation

```typescript
await complete(prompt, {
  body: {
    promptData,
    requestId,
    conversationId: conversationIdRef.current,
  },
});

posthog.capture("ENHANCE_PROMPT_START", {
  requestId,
  conversationId: conversationIdRef.current,
  // ... other properties
});
```

## Metadata & Tags

### Tags (for quick filtering)

- `env:development|staging|production`
- `route:/api/generate-theme`
- `provider:google|openai|groq|openai-compatible`
- `model:<modelId>`

### Metadata (for detailed filtering)

- `requestId` - Unique per request
- `conversationId` - Stable per session
- `userId` - User identifier
- `route` - API route
- `provider` - AI provider
- `modelId` - Model identifier
- `promptLengthChars` - Prompt character count
- `messageCount` - Number of messages
- `imageCount` - Number of images
- `mentionCount` - Number of @mentions

## Files Modified

| File | Changes |
|------|---------|
| `package.json` | Added `langsmith` dependency |
| `.env.example` | Added LangSmith config variables |
| `lib/observability/langsmith.ts` | New file - centralized LangSmith module |
| `app/api/enhance-prompt/route.ts` | Integrated LangSmith tracing |
| `app/api/generate-theme/route.ts` | Integrated LangSmith tracing + context passing |
| `lib/ai/generate-theme/tools.ts` | Tool-level LangSmith tracing |
| `types/ai.ts` | Extended types for IDs and LangSmith context |
| `hooks/use-ai-theme-generation-core.ts` | Added requestId/conversationId |
| `hooks/use-ai-enhance-prompt.ts` | Added requestId/conversationId + PostHog correlation |

## Usage

### Enable Tracing

Set in `.env.local`:
```bash
LANGSMITH_TRACING="true"
LANGSMITH_API_KEY="lsv2_pt_..."
LANGSMITH_PROJECT="asmara"
```

### View Traces

1. Go to [LangSmith Console](https://smith.langchain.com)
2. Select the "asmara" project
3. Filter by:
   - `requestId` - Find specific request
   - `conversationId` - Find all requests in a session
   - Tags - Filter by route, provider, model, etc.

### Debugging Workflow

1. User reports issue → Get `requestId` from PostHog event
2. Search LangSmith with `metadata.requestId = <id>`
3. View full trace including:
   - System prompt
   - User messages
   - Model responses
   - Token usage
   - Timing

## Future Improvements

1. **Sampling** - Enable sampling for production to reduce costs
2. **Privacy** - Add `processInputs`/`processOutputs` for image redaction
3. **Feedback** - Link user feedback to traces via `requestId`
4. **Alerts** - Set up LangSmith alerts for error traces
