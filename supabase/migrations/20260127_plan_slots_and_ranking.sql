-- Plan tier slots + ranking (capacity-based seats per plan/category/city)
-- Crafted: 27-Jan-2026
-- Safe to rerun: uses IF NOT EXISTS / ON CONFLICT guards where possible

-- 1) Plan tier config: rank + capacity + max cities + exclusivity flag
CREATE TABLE IF NOT EXISTS public.plan_tiers (
  code          text PRIMARY KEY,                      -- DIAMOND, GOLD, ...
  rank_no       integer NOT NULL CHECK (rank_no > 0),  -- 1 is best
  seat_capacity integer NOT NULL CHECK (seat_capacity > 0),
  max_cities    integer NOT NULL CHECK (max_cities > 0),
  is_exclusive  boolean NOT NULL DEFAULT true,         -- trial can be false
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plan_tiers (code, rank_no, seat_capacity, max_cities, is_exclusive)
VALUES
  ('DIAMOND',   1,   1,   20, true),
  ('GOLD',      2,   2,   20, true),
  ('SILVER',    3,   3,   20, true),
  ('BOOSTER',   4,   4,   20, true),
  ('CERTIFIED', 5,   5,   20, true),
  ('STARTUP',   6,   6,   20, true),
  ('TRIAL',     7, 999, 9999, false)
ON CONFLICT (code) DO UPDATE
SET
  rank_no       = EXCLUDED.rank_no,
  seat_capacity = EXCLUDED.seat_capacity,
  max_cities    = EXCLUDED.max_cities,
  is_exclusive  = EXCLUDED.is_exclusive,
  updated_at    = now();

-- 2) Slot reservations per (plan, category, city, seat_no)
-- Keep only ACTIVE reservations here. Expire/cancel -> delete/refresh slots.
CREATE TABLE IF NOT EXISTS public.vendor_plan_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.vendor_plan_subscriptions(id) ON DELETE CASCADE,
  vendor_id       uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  plan_code       text NOT NULL REFERENCES public.plan_tiers(code),
  category_id     uuid NOT NULL REFERENCES public.head_categories(id),
  city_id         uuid NOT NULL REFERENCES public.cities(id),
  seat_no         integer NOT NULL CHECK (seat_no > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Capacity blocking: per-plan seats are limited
  CONSTRAINT vendor_plan_slots_uq_slot UNIQUE (plan_code, category_id, city_id, seat_no),

  -- A vendor should not occupy multiple seats in same category+city
  CONSTRAINT vendor_plan_slots_uq_vendor_cc UNIQUE (vendor_id, category_id, city_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_plan_slots_cc
  ON public.vendor_plan_slots (category_id, city_id);

CREATE INDEX IF NOT EXISTS idx_vendor_plan_slots_vendor
  ON public.vendor_plan_slots (vendor_id);

CREATE INDEX IF NOT EXISTS idx_vendor_plan_slots_subscription
  ON public.vendor_plan_slots (subscription_id);

-- 3) Helper: normalize plan name -> plan code
CREATE OR REPLACE FUNCTION public.plan_code_from_name(p_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  n text := lower(trim(coalesce(p_name, '')));
BEGIN
  IF n = '' THEN
    RETURN 'TRIAL';
  ELSIF n LIKE '%dimond%' THEN
    RETURN 'DIAMOND';
  ELSIF n LIKE '%diamond%' THEN
    RETURN 'DIAMOND';
  ELSIF n LIKE '%gold%' THEN
    RETURN 'GOLD';
  ELSIF n LIKE '%silver%' THEN
    RETURN 'SILVER';
  ELSIF n LIKE '%booster%' OR n LIKE '%boost%' THEN
    RETURN 'BOOSTER';
  ELSIF n LIKE '%certified%' OR n LIKE '%certificate%' THEN
    RETURN 'CERTIFIED';
  ELSIF n LIKE '%startup%' OR n LIKE '%starter%' THEN
    RETURN 'STARTUP';
  ELSIF n LIKE '%trial%' OR n LIKE '%free%' THEN
    RETURN 'TRIAL';
  ELSE
    RETURN 'TRIAL';
  END IF;
END;
$$;

-- Tighten execution for sensitive helper functions
REVOKE ALL ON FUNCTION public.plan_code_from_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_code_from_name(text) TO service_role;

-- 4) Core: recompute slots for a vendor based on ACTIVE plan + preferences
-- Note: uses head categories for slotting. If preferences store micro IDs,
-- they are mapped to head categories via micro -> sub -> head.
CREATE OR REPLACE FUNCTION public.recalculate_vendor_slots(p_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id uuid;
  v_plan_id uuid;
  v_plan_name text;
  v_plan_code text;
  v_plan_features jsonb;

  v_seat_capacity integer;
  v_max_cities integer;
  v_is_exclusive boolean;

  v_city_limit integer;
  v_category_limit integer := 100;

  v_city_ids uuid[];
  v_category_ids uuid[];

  v_city_id uuid;
  v_category_id uuid;
  v_seat_no integer;
  v_reserved boolean;
BEGIN
  -- Latest ACTIVE (and not expired) subscription for the vendor
  SELECT s.id, s.plan_id, vp.name, vp.features
  INTO v_subscription_id, v_plan_id, v_plan_name, v_plan_features
  FROM public.vendor_plan_subscriptions s
  JOIN public.vendor_plans vp ON vp.id = s.plan_id
  WHERE s.vendor_id = p_vendor_id
    AND s.status = 'ACTIVE'
    AND (s.end_date IS NULL OR s.end_date > now())
  ORDER BY s.start_date DESC NULLS LAST, s.created_at DESC NULLS LAST
  LIMIT 1;

  -- No active subscription -> clear slots and exit
  IF v_subscription_id IS NULL THEN
    DELETE FROM public.vendor_plan_slots WHERE vendor_id = p_vendor_id;
    RETURN;
  END IF;

  v_plan_code := upper(public.plan_code_from_name(v_plan_name));

  SELECT seat_capacity, max_cities, is_exclusive
  INTO v_seat_capacity, v_max_cities, v_is_exclusive
  FROM public.plan_tiers
  WHERE code = v_plan_code;

  -- Fallback safety if plan tier missing
  IF v_seat_capacity IS NULL THEN
    v_seat_capacity := 999;
    v_max_cities := 9999;
    v_is_exclusive := false;
  END IF;

  -- Trial / non-exclusive plans should not block seats
  IF NOT v_is_exclusive THEN
    DELETE FROM public.vendor_plan_slots WHERE vendor_id = p_vendor_id;
    RETURN;
  END IF;

  -- Derive limits from plan features when available, but never exceed tier defaults
  v_city_limit := v_max_cities;
  IF v_plan_features ? 'cities_limit' THEN
    BEGIN
      v_city_limit := GREATEST(1, (v_plan_features ->> 'cities_limit')::integer);
    EXCEPTION WHEN OTHERS THEN
      v_city_limit := v_max_cities;
    END;
  END IF;
  v_city_limit := LEAST(v_city_limit, v_max_cities);

  IF v_plan_features ? 'categories_limit' THEN
    BEGIN
      v_category_limit := GREATEST(1, (v_plan_features ->> 'categories_limit')::integer);
    EXCEPTION WHEN OTHERS THEN
      v_category_limit := 100;
    END;
  END IF;

  -- Preferred cities (deduped, order-preserving, limited)
  SELECT array_agg(city_id ORDER BY ord)
  INTO v_city_ids
  FROM (
    SELECT city_id, MIN(ord) AS ord
    FROM (
      SELECT t.value::uuid AS city_id, t.ord
      FROM public.vendor_preferences vp,
           jsonb_array_elements_text(COALESCE(vp.preferred_cities, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
      WHERE vp.vendor_id = p_vendor_id
        AND t.value ~* '^[0-9a-f-]{36}$'
    ) raw
    GROUP BY city_id
    ORDER BY MIN(ord)
    LIMIT v_city_limit
  ) dedup;

  -- Fallback: vendor primary city
  IF v_city_ids IS NULL OR COALESCE(array_length(v_city_ids, 1), 0) = 0 THEN
    SELECT ARRAY[v.city_id]
    INTO v_city_ids
    FROM public.vendors v
    WHERE v.id = p_vendor_id
      AND v.city_id IS NOT NULL
    LIMIT 1;
  END IF;

  -- Preferred categories mapped to head categories
  WITH raw AS (
    SELECT t.value::uuid AS raw_id, t.ord
    FROM public.vendor_preferences vp,
         jsonb_array_elements_text(COALESCE(vp.preferred_micro_categories, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
    WHERE vp.vendor_id = p_vendor_id
      AND t.value ~* '^[0-9a-f-]{36}$'
    ORDER BY t.ord
    LIMIT v_category_limit
  ),
  head_from_head AS (
    SELECT h.id AS head_id, MIN(raw.ord) AS ord
    FROM raw
    JOIN public.head_categories h ON h.id = raw.raw_id
    GROUP BY h.id
  ),
  head_from_micro AS (
    SELECT sc.head_category_id AS head_id, MIN(raw.ord) AS ord
    FROM raw
    JOIN public.micro_categories m ON m.id = raw.raw_id
    JOIN public.sub_categories sc ON sc.id = m.sub_category_id
    GROUP BY sc.head_category_id
  ),
  combined AS (
    SELECT head_id, MIN(ord) AS ord
    FROM (
      SELECT * FROM head_from_head
      UNION ALL
      SELECT * FROM head_from_micro
    ) x
    GROUP BY head_id
  )
  SELECT array_agg(head_id ORDER BY ord)
  INTO v_category_ids
  FROM combined;

  -- Fallback: derive head categories from active products
  IF v_category_ids IS NULL OR COALESCE(array_length(v_category_ids, 1), 0) = 0 THEN
    SELECT array_agg(head_id ORDER BY first_seen)
    INTO v_category_ids
    FROM (
      SELECT head_id, MIN(created_at) AS first_seen
      FROM (
        SELECT p.head_category_id AS head_id, p.created_at
        FROM public.products p
        WHERE p.vendor_id = p_vendor_id
          AND p.status = 'ACTIVE'
          AND p.head_category_id IS NOT NULL

        UNION ALL

        SELECT sc.head_category_id AS head_id, p.created_at
        FROM public.products p
        JOIN public.micro_categories m ON m.id = p.micro_category_id
        JOIN public.sub_categories sc ON sc.id = m.sub_category_id
        WHERE p.vendor_id = p_vendor_id
          AND p.status = 'ACTIVE'
          AND sc.head_category_id IS NOT NULL
      ) t
      GROUP BY head_id
      ORDER BY MIN(created_at)
      LIMIT v_category_limit
    ) derived;
  END IF;

  -- If nothing to reserve against, just clear slots and exit
  IF v_city_ids IS NULL OR COALESCE(array_length(v_city_ids, 1), 0) = 0
     OR v_category_ids IS NULL OR COALESCE(array_length(v_category_ids, 1), 0) = 0 THEN
    DELETE FROM public.vendor_plan_slots WHERE vendor_id = p_vendor_id;
    RETURN;
  END IF;

  -- Rebuild vendor slots atomically within this transaction
  DELETE FROM public.vendor_plan_slots WHERE vendor_id = p_vendor_id;

  FOREACH v_category_id IN ARRAY v_category_ids LOOP
    FOREACH v_city_id IN ARRAY v_city_ids LOOP
      v_reserved := false;

      FOR v_seat_no IN 1..v_seat_capacity LOOP
        BEGIN
          INSERT INTO public.vendor_plan_slots (
            subscription_id,
            vendor_id,
            plan_code,
            category_id,
            city_id,
            seat_no
          ) VALUES (
            v_subscription_id,
            p_vendor_id,
            v_plan_code,
            v_category_id,
            v_city_id,
            v_seat_no
          );

          v_reserved := true;
          EXIT;
        EXCEPTION WHEN unique_violation THEN
          -- Seat taken (or duplicate vendor/category/city). Try next seat.
          NULL;
        END;
      END LOOP;

      IF NOT v_reserved THEN
        RAISE EXCEPTION USING
          MESSAGE = format(
            'No seats available for plan %s in category %s and city %s',
            v_plan_code, v_category_id, v_city_id
          );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_vendor_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_vendor_slots(uuid) TO service_role;

-- 5) Triggers: strict on preferences (block when full), safe on subscriptions (never block payment)
CREATE OR REPLACE FUNCTION public.trg_recalculate_vendor_slots_strict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_vendor_slots(NEW.vendor_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalculate_vendor_slots_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.recalculate_vendor_slots(COALESCE(NEW.vendor_id, OLD.vendor_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[vendor_slots] recalculate failed for vendor %: %', COALESCE(NEW.vendor_id, OLD.vendor_id), SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_preferences_slots ON public.vendor_preferences;
CREATE TRIGGER trg_vendor_preferences_slots
AFTER INSERT OR UPDATE OF preferred_cities, preferred_micro_categories
ON public.vendor_preferences
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalculate_vendor_slots_strict();

DROP TRIGGER IF EXISTS trg_vendor_subscription_slots ON public.vendor_plan_subscriptions;
CREATE TRIGGER trg_vendor_subscription_slots
AFTER INSERT OR UPDATE OF status, plan_id, end_date, start_date
ON public.vendor_plan_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalculate_vendor_slots_safe();

-- 6) Slot-aware directory ranking RPC
-- When micro_id + city_id are provided, slots win. Otherwise fallback to plan rank.
CREATE OR REPLACE FUNCTION public.dir_ranked_products(
  p_micro_id uuid DEFAULT NULL,
  p_city_id uuid DEFAULT NULL,
  p_state_id uuid DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_sort text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  vendor_id uuid,
  name text,
  description text,
  price numeric,
  moq integer,
  stock integer,
  category text,
  category_path text,
  images jsonb,
  status text,
  views integer,
  created_at timestamptz,
  metadata jsonb,
  is_service boolean,
  video_url text,
  target_locations jsonb,
  micro_category_id uuid,
  head_category_id uuid,
  sub_category_id uuid,
  extra_micro_categories jsonb,
  slug text,
  pdf_url text,
  price_unit text,
  min_order_qty integer,
  qty_unit text,
  category_other text,
  specifications jsonb,
  vendors jsonb,
  vendor_plan_name text,
  vendor_plan_tier text,
  vendor_plan_priority integer,
  vendor_plan_rank_no integer,
  vendor_seat_no integer,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH params AS (
  SELECT
    p_micro_id AS micro_id,
    p_city_id AS city_id,
    p_state_id AS state_id,
    COALESCE(NULLIF(trim(p_q), ''), '') AS search_q,
    lower(COALESCE(p_sort, '')) AS sort_key,
    GREATEST(1, LEAST(COALESCE(p_limit, 20), 50)) AS lim,
    GREATEST(0, COALESCE(p_offset, 0)) AS off,
    (p_micro_id IS NOT NULL AND p_city_id IS NOT NULL) AS slot_applicable
),
trial_tier AS (
  SELECT rank_no
  FROM public.plan_tiers
  WHERE code = 'TRIAL'
),
micro_head AS (
  SELECT m.id AS micro_id, sc.head_category_id
  FROM public.micro_categories m
  JOIN public.sub_categories sc ON sc.id = m.sub_category_id
  WHERE m.id = (SELECT micro_id FROM params)
),
active_subs AS (
  SELECT DISTINCT ON (s.vendor_id)
    s.vendor_id,
    s.id AS subscription_id,
    vp.name AS plan_name,
    upper(public.plan_code_from_name(vp.name)) AS plan_code,
    s.start_date,
    s.created_at
  FROM public.vendor_plan_subscriptions s
  JOIN public.vendor_plans vp ON vp.id = s.plan_id
  WHERE s.status = 'ACTIVE'
    AND (s.end_date IS NULL OR s.end_date > now())
  ORDER BY s.vendor_id, s.start_date DESC NULLS LAST, s.created_at DESC NULLS LAST
),
active_tiers AS (
  SELECT a.vendor_id, a.plan_name, a.plan_code, pt.rank_no AS active_rank_no
  FROM active_subs a
  LEFT JOIN public.plan_tiers pt ON pt.code = a.plan_code
),
slot_candidates AS (
  SELECT s.vendor_id, s.plan_code, s.seat_no, pt.rank_no AS slot_rank_no
  FROM public.vendor_plan_slots s
  JOIN public.plan_tiers pt ON pt.code = s.plan_code
  JOIN micro_head mh ON mh.head_category_id = s.category_id
  WHERE (SELECT slot_applicable FROM params)
    AND s.city_id = (SELECT city_id FROM params)
),
base AS (
  SELECT
    p.*,
    v.id AS vendor_pk,
    v.company_name,
    v.city,
    v.state,
    v.state_id,
    v.city_id,
    v.seller_rating,
    v.kyc_status,
    v.verification_badge,
    v.trust_score,
    v.is_active,

    at.plan_name,
    at.plan_code,
    at.active_rank_no,

    sc.plan_code AS slot_plan_code,
    sc.seat_no,
    sc.slot_rank_no,

    (sc.vendor_id IS NOT NULL) AS has_slot,
    (SELECT slot_applicable FROM params) AS slot_applicable,
    (SELECT rank_no FROM trial_tier) AS trial_rank_no
  FROM public.products p
  JOIN public.vendors v ON v.id = p.vendor_id AND v.is_active = true
  LEFT JOIN active_tiers at ON at.vendor_id = p.vendor_id
  LEFT JOIN slot_candidates sc ON sc.vendor_id = p.vendor_id
  WHERE p.status = 'ACTIVE'
    AND ((SELECT micro_id FROM params) IS NULL OR p.micro_category_id = (SELECT micro_id FROM params))
    AND ((SELECT search_q FROM params) = '' OR p.name ILIKE '%' || (SELECT search_q FROM params) || '%')
    AND ((SELECT state_id FROM params) IS NULL OR v.state_id = (SELECT state_id FROM params))
    AND ((SELECT city_id FROM params) IS NULL OR v.city_id = (SELECT city_id FROM params))
),
ranked AS (
  SELECT
    base.*,
    COALESCE(base.slot_rank_no, base.active_rank_no, base.trial_rank_no, 7) AS plan_rank_no,
    (800 - (COALESCE(base.slot_rank_no, base.active_rank_no, base.trial_rank_no, 7) * 100)) AS plan_priority,
    CASE
      WHEN base.slot_applicable AND base.has_slot THEN 0
      WHEN base.slot_applicable AND base.active_rank_no IS NOT NULL THEN 1
      WHEN base.slot_applicable THEN 2
      ELSE 0
    END AS slot_sort,
    CASE
      WHEN base.slot_applicable AND base.has_slot THEN base.seat_no
      ELSE 9999
    END AS seat_sort,
    COUNT(*) OVER () AS total_count
  FROM base
)
SELECT
  id,
  vendor_id,
  name,
  description,
  price,
  moq,
  stock,
  category,
  category_path,
  images,
  status,
  views,
  created_at,
  metadata,
  is_service,
  video_url,
  target_locations,
  micro_category_id,
  head_category_id,
  sub_category_id,
  extra_micro_categories,
  slug,
  pdf_url,
  price_unit,
  min_order_qty,
  qty_unit,
  category_other,
  specifications,

  jsonb_build_object(
    'id', vendor_pk,
    'company_name', company_name,
    'city', city,
    'state', state,
    'state_id', state_id,
    'city_id', city_id,
    'seller_rating', seller_rating,
    'kyc_status', kyc_status,
    'verification_badge', verification_badge,
    'trust_score', trust_score,
    'is_active', is_active,
    'plan_name', COALESCE(plan_name, 'TRIAL'),
    'plan_tier', COALESCE(slot_plan_code, plan_code, 'TRIAL'),
    'plan_priority', plan_priority,
    'plan_rank_no', plan_rank_no,
    'seat_no', seat_no
  ) AS vendors,

  COALESCE(plan_name, 'TRIAL') AS vendor_plan_name,
  COALESCE(slot_plan_code, plan_code, 'TRIAL') AS vendor_plan_tier,
  plan_priority AS vendor_plan_priority,
  plan_rank_no AS vendor_plan_rank_no,
  seat_no AS vendor_seat_no,
  total_count
FROM ranked
ORDER BY
  slot_sort ASC,
  plan_rank_no ASC,
  seat_sort ASC,
  CASE WHEN (SELECT sort_key FROM params) = 'price_asc' THEN price END ASC,
  CASE WHEN (SELECT sort_key FROM params) = 'price_desc' THEN price END DESC,
  created_at DESC
LIMIT (SELECT lim FROM params)
OFFSET (SELECT off FROM params);
$$;

-- Directory search must be callable by public clients
REVOKE ALL ON FUNCTION public.dir_ranked_products(uuid, uuid, uuid, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dir_ranked_products(uuid, uuid, uuid, text, text, integer, integer) TO anon, authenticated, service_role;

-- 7) Maintenance helpers
CREATE OR REPLACE FUNCTION public.release_vendor_slots_by_subscription(p_subscription_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  DELETE FROM public.vendor_plan_slots WHERE subscription_id = p_subscription_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_vendor_slots_by_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_vendor_slots_by_subscription(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.swap_vendor_plan_slots(p_slot_a uuid, p_slot_b uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.vendor_plan_slots%ROWTYPE;
  b public.vendor_plan_slots%ROWTYPE;
  temp_seat integer := 9999;
BEGIN
  SELECT * INTO a FROM public.vendor_plan_slots WHERE id = p_slot_a FOR UPDATE;
  SELECT * INTO b FROM public.vendor_plan_slots WHERE id = p_slot_b FOR UPDATE;

  IF a.id IS NULL OR b.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Both slots must exist to swap';
  END IF;

  IF a.plan_code <> b.plan_code OR a.category_id <> b.category_id OR a.city_id <> b.city_id THEN
    RAISE EXCEPTION USING MESSAGE = 'Slots must share the same plan_code, category_id, and city_id';
  END IF;

  UPDATE public.vendor_plan_slots SET seat_no = temp_seat WHERE id = a.id;
  UPDATE public.vendor_plan_slots SET seat_no = a.seat_no WHERE id = b.id;
  UPDATE public.vendor_plan_slots SET seat_no = b.seat_no WHERE id = a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_vendor_plan_slots(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swap_vendor_plan_slots(uuid, uuid) TO service_role;

-- 8) Best-effort backfill (never block migration)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT s.vendor_id
    FROM public.vendor_plan_subscriptions s
    WHERE s.status = 'ACTIVE'
      AND (s.end_date IS NULL OR s.end_date > now())
      AND s.vendor_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.recalculate_vendor_slots(r.vendor_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[vendor_slots] Backfill skipped for vendor %: %', r.vendor_id, SQLERRM;
    END;
  END LOOP;
END;
$$;
