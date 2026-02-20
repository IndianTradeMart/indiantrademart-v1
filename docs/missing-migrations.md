# Missing/Extra DB Objects (from code references)

These objects are referenced in code but are not present in the provided schema dump. If they are missing in the actual DB, create migrations for them.

## Tables
- quotation_emails
  - Referenced in: `server/routes/quotation.js`
  - Purpose: store email send status for quotations
- quotation_unregistered
  - Referenced in: `server/routes/quotation.js`
  - Purpose: track quotations sent to unregistered buyers
- buyer_notifications
  - Referenced in: `server/routes/quotation.js`
  - Purpose: store buyer notification records
- kyc_documents (optional)
  - Referenced in: `server/routes/kyc.js`
  - Purpose: alternate storage for KYC docs (code falls back to storage if missing)

## Functions / RPC
- login_admin (RPC)
  - Referenced in: `src/modules/admin/context/InternalAuthContext.jsx`
  - Purpose: validates internal login + role

## DB Migrations to Ensure Applied
- `supabase/migrations/20260127_plan_slots_and_ranking.sql`
  - Creates: plan_tiers, vendor_plan_slots, dir_ranked_products RPC
  - Required for directory ranking + plan seat capacity

## Notes
- If you already created these tables/functions separately, ignore this list.
- If RLS is enabled, ensure policies allow the required server/service role access.
