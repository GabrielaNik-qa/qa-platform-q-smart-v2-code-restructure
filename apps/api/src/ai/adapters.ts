// The doors to the real AI companies, through the open-source AI SDK (V2_PLAN §17: the common layer for every AI
// company). Each door only sends the request and says how it went; the engine does the choosing, checking, retrying
// and counting. The SDK's own retries are off, so a failure moves straight to the engine's next model.
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { APICallError, generateText, jsonSchema, type LanguageModel, NoObjectGeneratedError, Output } from 'ai';
import type { CompletionRequest, ProviderAdapter } from './provider.js';
import { ProviderError } from './provider.js';

/** Where each AI company answers (the tests point them at a pretend server on this PC). */
export interface AdapterUrls {
  groq?: string;
  /** with {accountId} in it */
  cloudflare?: string;
}
const CLOUDFLARE = 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1';

/** What went wrong, in the engine's words, with a short code for the log (never the AI company's message). */
export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (APICallError.isInstance(e)) {
    const status = e.statusCode ?? 0;
    if (status === 429) return new ProviderError('rateLimit', 'http429');
    if (status === 408 || status === 504) return new ProviderError('timeout', `http${status}`);
    if (status === 401 || status === 403) return new ProviderError('error', `auth${status}`);
    return new ProviderError('error', status ? `http${status}` : 'network');
  }
  if (e instanceof Error && e.name === 'AbortError') return new ProviderError('timeout', 'aborted');
  return new ProviderError('error', 'failed');
}

function sdkDoor(
  model: (r: CompletionRequest) => LanguageModel,
  options: (r: CompletionRequest) => Record<string, Record<string, string | boolean>> = () => ({}),
): ProviderAdapter {
  return {
    async complete(r) {
      try {
        const result = await generateText({
          model: model(r),
          system: r.system,
          prompt: r.prompt,
          temperature: r.temperature,
          maxOutputTokens: r.maxOutputTokens,
          maxRetries: 0,
          abortSignal: r.signal,
          providerOptions: options(r),
          ...(r.json
            ? { output: r.jsonSchema ? Output.object({ schema: jsonSchema(r.jsonSchema) }) : Output.json() }
            : {}),
        });
        return {
          text: result.text,
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        };
      } catch (e) {
        // an answer that isn't the JSON asked for: the engine decides (it asks once more, then moves on)
        if (NoObjectGeneratedError.isInstance(e))
          return {
            text: e.text ?? '',
            inputTokens: e.usage?.inputTokens ?? 0,
            outputTokens: e.usage?.outputTokens ?? 0,
          };
        throw toProviderError(e);
      }
    },
  };
}

/** Groq: its gpt-oss models think before answering; "low" keeps that short (and the free allowance longer). */
export const groqAdapter = (urls: AdapterUrls = {}) =>
  sdkDoor(
    (r) => createGroq({ apiKey: r.account.apiKey, ...(urls.groq ? { baseURL: urls.groq } : {}) })(r.model),
    (r) => ({
      groq: {
        ...(r.jsonSchema ? { structuredOutputs: true } : {}),
        ...(r.model.startsWith('openai/gpt-oss') ? { reasoningEffort: r.effort ?? 'low' } : {}),
      },
    }),
  );

/** Cloudflare Workers AI, through its OpenAI-compatible address (it needs the account id). */
export const cloudflareAdapter = (urls: AdapterUrls = {}) =>
  sdkDoor((r) => {
    if (!r.account.accountId) throw new ProviderError('error', 'noAccountId');
    return createOpenAICompatible({
      name: 'cloudflare',
      baseURL: (urls.cloudflare ?? CLOUDFLARE).replace('{accountId}', encodeURIComponent(r.account.accountId)),
      apiKey: r.account.apiKey,
      includeUsage: true,
      supportsStructuredOutputs: true,
    }).chatModel(r.model);
  });

export const realAdapters = (urls: AdapterUrls = {}): Record<string, ProviderAdapter> => ({
  groq: groqAdapter(urls),
  cloudflare: cloudflareAdapter(urls),
});
