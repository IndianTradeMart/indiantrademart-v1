-- Lead marketplace alignment patch
-- Safe to rerun (IF NOT EXISTS guards). Crafted: 26-Jan-2026
-- Goals:
-- 1) Ensure leads table carries buyer + category + location FKs so filters work.
-- 2) Add indexes for marketplace queries.
-- 3) Provide a ready-made view for "available marketplace leads".

-- 1) Missing FK columns on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.buyers(id),
  ADD COLUMN IF NOT EXISTS buyer_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS micro_category_id uuid REFERENCES public.micro_categories(id),
  ADD COLUMN IF NOT EXISTS sub_category_id uuid REFERENCES public.sub_categories(id),
  ADD COLUMN IF NOT EXISTS head_category_id uuid REFERENCES public.head_categories(id),
  ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id),
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'MARKETPLACE';

-- Status guard (keep existing values) - add only if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_status_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_status_check
      CHECK (status IN ('AVAILABLE','PENDING','PURCHASED','CLOSED','CONVERTED'));
  END IF;
END
$$;

-- 2) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_vendor_id ON public.leads(vendor_id);
CREATE INDEX IF NOT EXISTS idx_leads_micro_category_id ON public.leads(micro_category_id);
CREATE INDEX IF NOT EXISTS idx_leads_state_id ON public.leads(state_id);
CREATE INDEX IF NOT EXISTS idx_leads_city_id ON public.leads(city_id);

-- JSONB preference filters need GIN for speed
CREATE INDEX IF NOT EXISTS idx_vendor_prefs_micro_gin
  ON public.vendor_preferences
  USING gin (preferred_micro_categories jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_vendor_prefs_state_gin
  ON public.vendor_preferences
  USING gin (preferred_states jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_vendor_prefs_city_gin
  ON public.vendor_preferences
  USING gin (preferred_cities jsonb_path_ops);

-- 3) Convenience view for marketplace (available + unassigned leads)
CREATE OR REPLACE VIEW public.marketplace_available_leads AS
SELECT *
FROM public.leads
WHERE status = 'AVAILABLE' AND vendor_id IS NULL;

COMMENT ON VIEW public.marketplace_available_leads IS
  'Quick access to currently available marketplace leads (unassigned, status AVAILABLE).';
