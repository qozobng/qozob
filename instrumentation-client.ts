import type { User } from "@supabase/supabase-js"
import posthog from "posthog-js"
import { createClient } from "@/utils/supabase/client"

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

let identifiedUserId: string | null = null

function identifyUser(user: User) {
  const metadata = user.user_metadata
  const name = metadata.full_name ?? [metadata.first_name, metadata.middle_name, metadata.last_name]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
  const role = user.app_metadata.role ?? metadata.role

  posthog.identify(user.id, {
    ...(user.email ? { email: user.email } : {}),
    ...(name ? { name } : {}),
    ...(role ? { role } : {}),
  })
  identifiedUserId = user.id
}

function synchronizeIdentity(user: User | null) {
  if (!user) {
    if (identifiedUserId) {
      posthog.reset()
      identifiedUserId = null
    }
    return
  }

  if (identifiedUserId === user.id) return
  if (identifiedUserId) posthog.reset()
  identifyUser(user)
}

if (!posthogKey) {
  if (process.env.NODE_ENV === "development") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured"
    )
  }
} else if (!posthogHost) {
  if (process.env.NODE_ENV === "development") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured"
    )
  }
} else {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  })

  const supabase = createClient()
  void supabase.auth.getUser().then(({ data: { user } }) => synchronizeIdentity(user))
  supabase.auth.onAuthStateChange((_event, session) => synchronizeIdentity(session?.user ?? null))
}
