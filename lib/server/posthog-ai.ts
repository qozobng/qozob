import "server-only"
import { randomUUID } from "node:crypto"
import { PostHog } from "posthog-node"

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

if (process.env.NODE_ENV === "development" && !posthogKey) {
  throw new Error(
    "NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured"
  )
}

if (process.env.NODE_ENV === "development" && !posthogHost) {
  throw new Error(
    "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured"
  )
}

const posthog = posthogKey && posthogHost
  ? new PostHog(posthogKey, { host: posthogHost, privacyMode: false })
  : null

export type AiMessage = {
  role: "system" | "user" | "assistant"
  content: unknown
}

type AiGeneration = {
  traceId: string
  sessionId?: string | null
  distinctId?: string
  model: string
  provider: string
  input: AiMessage[]
  output: AiMessage[]
  inputTokens?: number
  outputTokens?: number
  latency?: number
  stream?: boolean
  timeToFirstToken?: number
}

/** Create one trace identifier at the start of each application turn. */
export function createAiTraceId() {
  return randomUUID()
}

/** Capture a completed LLM generation using the trace created for its turn. */
export function captureAiGeneration(generation: AiGeneration) {
  posthog?.capture({
    distinctId: generation.distinctId ?? "anonymous",
    event: "$ai_generation",
    properties: {
      $ai_trace_id: generation.traceId,
      $ai_session_id: generation.sessionId ?? null,
      $ai_model: generation.model,
      $ai_provider: generation.provider,
      $ai_input: generation.input,
      $ai_output_choices: generation.output,
      ...(generation.inputTokens === undefined ? {} : { $ai_input_tokens: generation.inputTokens }),
      ...(generation.outputTokens === undefined ? {} : { $ai_output_tokens: generation.outputTokens }),
      ...(generation.latency === undefined ? {} : { $ai_latency: generation.latency }),
      ...(generation.stream === undefined ? {} : { $ai_stream: generation.stream }),
      ...(generation.timeToFirstToken === undefined
        ? {}
        : { $ai_time_to_first_token: generation.timeToFirstToken }),
    },
  })
}
