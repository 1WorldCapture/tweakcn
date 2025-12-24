# AI Provider / Model: Server-only Global `.env` Configuration (Implementation Memo)

## Goals (Recap)

- The provider and model are controlled **only via server environment variables** (no UI, no per-user settings, no BYOK).
- Keep the current UX: the frontend still only calls
  - `useChat` → `/api/generate-theme`
  - `useCompletion` → `/api/enhance-prompt`
- Do not change the subscription/quota/usage recording flow: `recordAIUsage` is still recorded in `/api/generate-theme` `onFinish`.
- **Single shared model**: chat generation (`streamText`), theme schema generation (`streamObject`), and prompt enhancement (`streamText`) all use the same model id (derived from the selected provider’s `*_AI_MODEL` env var).

## Code Changes

- `lib/ai/providers.ts`
  - Added `.env`-driven provider/model resolution + construction, exporting:
    - `getAIModel()`
    - `getAIProviderOptions()`
    - `getResolvedAIConfig()`
  - `providerOptions`: returns Google `thinkingConfig` only when `AI_PROVIDER=google`; returns `{}` for other providers (to avoid passing Google-specific options to non-Google providers).
- Updated the 3 call sites to use the same model:
  - `app/api/generate-theme/route.ts`
  - `app/api/enhance-prompt/route.ts`
  - `lib/ai/generate-theme/tools.ts`

## Environment Variables (`.env`)

`.env.example` now includes the following configuration (all **server-only**; do not use `NEXT_PUBLIC_`):

- `AI_PROVIDER`: `google | openai | openai-compatible | groq` (default: `google`)
- Model id per provider:
  - `GOOGLE_AI_MODEL` (default: `gemini-2.5-flash`)
  - `OPENAI_AI_MODEL` (default: `gpt-4o-mini`)
  - `OPENAI_COMPATIBLE_AI_MODEL` (required when `AI_PROVIDER=openai-compatible`)
  - `GROQ_AI_MODEL` (default: `llama3-70b-8192`)

Per-provider keys/config:

- Google: `GOOGLE_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- OpenAI-compatible:
  - `AI_BASE_URL` (e.g. `https://your-provider.example.com/v1`)
  - `AI_API_KEY`
  - `AI_PROVIDER_NAME` (for identification/telemetry)
  - Note: the selected model is expected to support structured outputs (required for our `streamObject` schema flow).
- Groq: `GROQ_API_KEY`

## Provider Packages

This implementation uses Vercel AI SDK provider packages:

- `@ai-sdk/google`
- `@ai-sdk/openai`
- `@ai-sdk/openai-compatible`
- `@ai-sdk/groq`

## Behavior Notes (Compatibility with Existing Flow)

- Subscription/quota checks are unchanged:
  - `/api/generate-theme`: `validateSubscriptionAndUsage`
  - `/api/enhance-prompt`: `requireSubscriptionOrFreeUsage`
- Usage recording is unchanged: `recordAIUsage` still runs only in `/api/generate-theme` `onFinish`. The recorded `modelId` will automatically reflect the `.env` selection (useful for internal tracking).
