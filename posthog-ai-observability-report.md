# PostHog AI Observability setup

> ⚠️ **Needs your attention**
> - This project currently has no LLM vendor SDK, model-call route, conversation turn, or tool-dispatch loop. Add the provided helper to a future server-side model call and then trigger one or more real turns to verify the resulting trace tree in PostHog.

## Result

Selected the **manual-capture Node** workflow because `package.json` contains no LLM provider or agent-framework SDK, and source scanning found no LLM call path. The integration is therefore **wired as a reusable baseline, but unverified against a live model call**. Existing PostHog initialization, identification, capture calls, and dashboards were not changed.

## Changes made

- Declared `posthog-node` in `package.json` for server-side AI Observability capture.
- Added `lib/server/posthog-ai.ts`, a server-only helper that:
  - creates one UUID trace ID per application turn with `createAiTraceId()`;
  - captures completed calls as `$ai_generation` with model, provider, input/output, token totals, latency, and streaming metadata;
  - accepts a caller-supplied conversation ID as `$ai_session_id`, so multiple turns in one conversation are grouped as one AI Observability session;
  - accepts an optional stable authenticated user ID as `distinctId`; calls without one remain anonymous;
  - reads the existing `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` variables and is a production no-op when they are absent, while development fails loudly.
- Configured `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in `.env.local` using the supplied PostHog project settings.
- Wrote `.posthog-wizard-cache/.posthog-ai.json` for the setup-report integration.

## Add the helper when a model call exists

At the beginning of each user-facing application turn, create a single trace ID. Reuse that trace ID for every model call made during the turn. Pass the same conversation identifier to `sessionId` on subsequent turns in that conversation. Supply the authenticated application user ID only when it is available.

```ts
const traceId = createAiTraceId()

// Run the model call, then capture its completed result.
captureAiGeneration({
  traceId,
  sessionId: conversationId,
  distinctId: authenticatedUserId,
  model,
  provider,
  input: messages,
  output: [{ role: "assistant", content: completion }],
  inputTokens,
  outputTokens,
  latency,
})
```

There are no registered tools in the current project, so no `$ai_span` events were added. If a future LLM workflow dispatches tools, capture each tool execution as `$ai_span` with the same `$ai_trace_id` and `$ai_session_id` as its turn.

## Verification

Installed `posthog-node` and ran `npm run build` successfully. The build completed compilation, TypeScript validation, page generation, and optimization without errors.

There is no current route or action that makes a model call, so live capture remains unverified. After adding a model call, trigger the smallest route or action that performs one turn. In **AI Observability → Traces**, confirm:

1. one session contains multiple turns from one conversation;
2. one trace contains every generation from one turn;
3. the optional person attribution matches the authenticated application user ID;
4. a tool span appears for each tool execution, if tools are added later.

## Privacy mode

`lib/server/posthog-ai.ts` creates the PostHog Node client with `privacyMode: false`. Prompt and completion content are therefore captured in `$ai_input` and `$ai_output_choices` when the helper is used.

Enable privacy mode **before** sending prompts or outputs that must not be stored in PostHog by changing that option to `privacyMode: true` in `lib/server/posthog-ai.ts`. Privacy mode excludes SDK-captured inputs and output choices; it does not remove arbitrary custom properties, manually supplied content outside those fields, or already-stored events. See [AI Observability privacy mode](https://posthog.com/docs/ai-observability/privacy-mode).
