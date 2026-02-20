-- Migrate auth.users -> public.users and repoint FKs
-- Crafted: 10-Feb-2026
-- Safe to rerun: uses IF NOT EXISTS / ON CONFLICT guards

-- 0) Drop FKs that point to auth.users (if they exist)
ALTER TABLE public.buyers DROP CONSTRAINT IF EXISTS buyers_user_id_fkey;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_user_id_fkey;
ALTER TABLE public.head_categories DROP CONSTRAINT IF EXISTS head_categories_created_by_fkey;
ALTER TABLE public.micro_categories DROP CONSTRAINT IF EXISTS micro_categories_created_by_fkey;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.proposal_messages DROP CONSTRAINT IF EXISTS proposal_messages_sender_id_fkey;
ALTER TABLE public.ticket_messages DROP CONSTRAINT IF EXISTS ticket_messages_sender_id_fkey;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_buyer_user_id_fkey;
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_user_id_fkey;
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_assigned_to_fkey;
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_created_by_user_id_fkey;

-- 1) Backfill public.users from auth.users (keep same UUIDs)
INSERT INTO public.users (
  id,
  email,
  password_hash,
  full_name,
  role,
  phone,
  created_at,
  updated_at
)
SELECT
  au.id,
  au.email,
  au.encrypted_password,
  COALESCE(NULLIF(au.raw_user_meta_data ->> 'full_name', ''), au.email),
  COALESCE(NULLIF(au.raw_user_meta_data ->> 'role', ''), 'USER'),
  NULLIF(au.raw_user_meta_data ->> 'phone', ''),
  COALESCE(au.created_at, now()),
  now()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE lower(pu.email) = lower(au.email)
)
ON CONFLICT DO NOTHING;

-- 2) If public.users exists but password_hash is empty, hydrate from auth.users
UPDATE public.users pu
SET password_hash = au.encrypted_password,
    updated_at = now()
FROM auth.users au
WHERE lower(pu.email) = lower(au.email)
  AND (pu.password_hash IS NULL OR pu.password_hash = '')
  AND au.encrypted_password IS NOT NULL;

-- 2b) If same email exists in auth.users & public.users with different IDs,
-- remap FK columns to the existing public.users.id so constraints won't fail.
WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.buyers b
SET user_id = m.public_id
FROM id_map m
WHERE b.user_id = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.employees e
SET user_id = m.public_id
FROM id_map m
WHERE e.user_id = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.head_categories h
SET created_by = m.public_id
FROM id_map m
WHERE h.created_by = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.micro_categories mc
SET created_by = m.public_id
FROM id_map m
WHERE mc.created_by = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.notifications n
SET user_id = m.public_id
FROM id_map m
WHERE n.user_id = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.proposal_messages pm
SET sender_id = m.public_id
FROM id_map m
WHERE pm.sender_id = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.ticket_messages tm
SET sender_id = m.public_id
FROM id_map m
WHERE tm.sender_id = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.leads l
SET buyer_user_id = m.public_id
FROM id_map m
WHERE l.buyer_user_id = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.vendors v
SET user_id = m.public_id
FROM id_map m
WHERE v.user_id = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.vendors v
SET assigned_to = m.public_id
FROM id_map m
WHERE v.assigned_to = m.auth_id;

WITH id_map AS (
  SELECT au.id AS auth_id, pu.id AS public_id
  FROM auth.users au
  JOIN public.users pu ON lower(pu.email) = lower(au.email)
  WHERE au.id <> pu.id
)
UPDATE public.vendors v
SET created_by_user_id = m.public_id
FROM id_map m
WHERE v.created_by_user_id = m.auth_id;

-- 2c) Direct email-based remap for profiles (in case user_id was missing/incorrect)
UPDATE public.employees e
SET user_id = u.id
FROM public.users u
WHERE lower(e.email) = lower(u.email)
  AND (e.user_id IS NULL OR e.user_id <> u.id);

UPDATE public.buyers b
SET user_id = u.id
FROM public.users u
WHERE lower(b.email) = lower(u.email)
  AND (b.user_id IS NULL OR b.user_id <> u.id);

UPDATE public.vendors v
SET user_id = u.id
FROM public.users u
WHERE lower(v.email) = lower(u.email)
  AND (v.user_id IS NULL OR v.user_id <> u.id);

-- 2d) Ensure any notification user_ids exist in public.users
INSERT INTO public.users (
  id,
  email,
  password_hash,
  full_name,
  role,
  phone,
  created_at,
  updated_at
)
SELECT
  au.id,
  au.email,
  au.encrypted_password,
  COALESCE(NULLIF(au.raw_user_meta_data ->> 'full_name', ''), au.email),
  COALESCE(NULLIF(au.raw_user_meta_data ->> 'role', ''), 'USER'),
  NULLIF(au.raw_user_meta_data ->> 'phone', ''),
  COALESCE(au.created_at, now()),
  now()
FROM auth.users au
JOIN public.notifications n ON n.user_id = au.id
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT DO NOTHING;

-- 2e) Null out orphan references (nullable columns only)
UPDATE public.employees e
SET user_id = NULL
WHERE e.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = e.user_id);

UPDATE public.buyers b
SET user_id = NULL
WHERE b.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = b.user_id);

UPDATE public.vendors v
SET user_id = NULL
WHERE v.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.user_id);

UPDATE public.vendors v
SET assigned_to = NULL
WHERE v.assigned_to IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.assigned_to);

UPDATE public.vendors v
SET created_by_user_id = NULL
WHERE v.created_by_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.created_by_user_id);

UPDATE public.head_categories h
SET created_by = NULL
WHERE h.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = h.created_by);

UPDATE public.micro_categories mc
SET created_by = NULL
WHERE mc.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = mc.created_by);

UPDATE public.proposal_messages pm
SET sender_id = NULL

WHERE pm.sender_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = pm.sender_id);

UPDATE public.ticket_messages tm
SET sender_id = NULL
WHERE tm.sender_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = tm.sender_id);

UPDATE public.leads l
SET buyer_user_id = NULL
WHERE l.buyer_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = l.buyer_user_id);

-- 3b) Final orphan cleanup before recreating FKs (safety net)
UPDATE public.employees e
SET user_id = NULL
WHERE e.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = e.user_id);

UPDATE public.buyers b
SET user_id = NULL
WHERE b.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = b.user_id);

UPDATE public.vendors v
SET user_id = NULL
WHERE v.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.user_id);

UPDATE public.vendors v
SET assigned_to = NULL
WHERE v.assigned_to IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.assigned_to);

UPDATE public.vendors v
SET created_by_user_id = NULL
WHERE v.created_by_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.created_by_user_id);

UPDATE public.head_categories h
SET created_by = NULL
WHERE h.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = h.created_by);

UPDATE public.micro_categories mc
SET created_by = NULL
WHERE mc.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = mc.created_by);

UPDATE public.proposal_messages pm
SET sender_id = NULL
WHERE pm.sender_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = pm.sender_id);

UPDATE public.ticket_messages tm
SET sender_id = NULL
WHERE tm.sender_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = tm.sender_id);

UPDATE public.leads l
SET buyer_user_id = NULL
WHERE l.buyer_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = l.buyer_user_id);

-- 4) Recreate FKs to public.users
ALTER TABLE public.buyers
  ADD CONSTRAINT buyers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.employees
  ADD CONSTRAINT employees_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.head_categories
  ADD CONSTRAINT head_categories_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE public.micro_categories
  ADD CONSTRAINT micro_categories_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.proposal_messages
  ADD CONSTRAINT proposal_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.users(id);

ALTER TABLE public.ticket_messages
  ADD CONSTRAINT ticket_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.users(id);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_buyer_user_id_fkey
  FOREIGN KEY (buyer_user_id) REFERENCES public.users(id);

ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.users(id);

ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);
