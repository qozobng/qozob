# PostHog Warehouse Source Setup

Created 1 of 1 detected sources in PostHog.

## Changes made

- Connected the `Supabase` public schema to the PostHog data warehouse with the `supabase` prefix.
- Used warehouse import mode and the user-selected setting to disable server certificate verification after validation failed with verification enabled.
- Enabled 29 tables with `full_refresh` synchronization every six hours. All enabled schemas reached `Completed` with no reported sync errors.
- Left `whatsapp_otps` disabled because it was not included in the explicit sync plan.
- No application source code or environment files were changed.

## Files modified

- `posthog-warehouse-report.md` — updated this setup report.

## Manual steps

1. Review whether `full_refresh` every six hours is appropriate for table size and warehouse row-sync costs; switch suitable tables to incremental sync later if needed.
2. Review whether server certificate verification should be restored by supplying the correct certificate authority.
3. Enable `whatsapp_otps` separately only if that table is needed for analysis.
4. Monitor future runs on the [PostHog data warehouse sources page](https://us.posthog.com/project/714057/data-management/sources).
