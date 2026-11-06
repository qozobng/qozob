import { SeverityNumber } from "@opentelemetry/api-logs"
import { posthogLoggerProvider } from "@/instrumentation"

// Keep this logger separate from the app's existing logging so only lines added
// for PostHog observability are sent to the OTLP exporter.
const posthogLogger = posthogLoggerProvider?.getLogger("qozob-posthog-logs")

export function logStationSearchCacheHit(stationCount: number) {
  posthogLogger?.emit({
    body: "station_search_cache_hit",
    severityNumber: SeverityNumber.INFO,
    attributes: {
      "operation.name": "station_search",
      "cache.status": "hit",
      "station.count": stationCount,
    },
  })
}

export function logStationSearchUpstreamFetched(stationCount: number) {
  posthogLogger?.emit({
    body: "station_search_upstream_fetched",
    severityNumber: SeverityNumber.INFO,
    attributes: {
      "operation.name": "station_search",
      "cache.status": "miss",
      "station.count": stationCount,
    },
  })
}

export function flushPostHogLogs() {
  return posthogLoggerProvider?.forceFlush() ?? Promise.resolve()
}
