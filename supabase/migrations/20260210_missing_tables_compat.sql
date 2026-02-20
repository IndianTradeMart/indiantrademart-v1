-- Compatibility tables/views for app features missing in baseline schema
-- Crafted: 10-Feb-2026
-- Safe to rerun: uses IF NOT EXISTS and CREATE OR REPLACE VIEW

-- 1) Admin users (view over public.users)
CREATE OR REPLACE VIEW public.admin_users AS
SELECT *
FROM public.users
WHERE UPPER(COALESCE(role, '')) IN (
  'ADMIN',
  'HR',
  'DATA_ENTRY',
  'DATAENTRY',
  'SUPPORT',
  'SALES', 
  'FINANCE',
  'SUPERADMIN'
);

COMMENT ON VIEW public.admin_users IS
  'Compatibility view for admin portal auth (filters public.users by admin/employee roles).';

-- 2) Buyer support tickets (view over support_tickets)
CREATE OR REPLACE VIEW public.buyer_support_tickets AS
SELECT *
FROM public.support_tickets
WHERE buyer_id IS NOT NULL;

COMMENT ON VIEW public.buyer_support_tickets IS
  'Compatibility view for buyer dashboard counts (support tickets with buyer_id).';

-- 3) Categories (legacy flat table)
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  level integer DEFAULT 1 CHECK (level >= 1),
  parent_id uuid,
  description text,
  image_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'categories_parent_id_fkey'
      AND conrelid = 'public.categories'::regclass
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);

-- 4) Chatbot history
CREATE TABLE IF NOT EXISTS public.chatbot_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  sender text NOT NULL CHECK (sender IN ('user', 'bot')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_history_user_id ON public.chatbot_history(user_id);

-- 5) Platform feedback
CREATE TABLE IF NOT EXISTS public.platform_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  subject text,
  message text NOT NULL,
  status text DEFAULT 'NEW',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6) Product videos
CREATE TABLE IF NOT EXISTS public.product_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  title text,
  thumbnail_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_videos_product_id ON public.product_videos(product_id);

-- 7) Requirements (public requirement submissions)
CREATE TABLE IF NOT EXISTS public.requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  phone text,
  company_name text,
  requirement_description text,
  budget numeric,
  timeline text,
  state_id uuid REFERENCES public.states(id),
  city_id uuid REFERENCES public.cities(id),
  status text DEFAULT 'Pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requirements_status ON public.requirements(status);

-- 8) Suggestions (buyer feedback)
CREATE TABLE IF NOT EXISTS public.suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES public.buyers(id) ON DELETE CASCADE,
  subject text,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_buyer_id ON public.suggestions(buyer_id);

-- 9) Quotes (lightweight table for legacy UI)
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES public.buyers(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  quote_amount numeric,
  message text,
  status text DEFAULT 'SENT',
  created_at timestamptz DEFAULT now()
);

-- 10) KYC documents (optional legacy table)
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  document_type text,
  document_url text,
  file_path text,
  status text DEFAULT 'PENDING',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_vendor_id ON public.kyc_documents(vendor_id);

-- 11) Buyer notifications
CREATE TABLE IF NOT EXISTS public.buyer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES public.buyers(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  reference_id uuid,
  reference_type text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buyer_notifications_buyer_id ON public.buyer_notifications(buyer_id);

-- 12) Quotation emails tracking
CREATE TABLE IF NOT EXISTS public.quotation_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text,
  status text DEFAULT 'SENT',
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_emails_quotation_id ON public.quotation_emails(quotation_id);

-- 13) Unregistered buyer quotation tracking
CREATE TABLE IF NOT EXISTS public.quotation_unregistered (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  quotation_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 14) Vendor services
CREATE TABLE IF NOT EXISTS public.vendor_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  name text,
  service_name text,
  title text,
  category text,
  service_type text,
  description text,
  details text,
  short_description text,
  price numeric,
  rate numeric,
  price_unit text,
  image text,
  cover_image text,
  images jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_services_vendor_id ON public.vendor_services(vendor_id);

-- 15) Vendor service subscriptions
CREATE TABLE IF NOT EXISTS public.vendor_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.vendor_services(id) ON DELETE CASCADE,
  status text DEFAULT 'ACTIVE',
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_subscriptions_vendor_id ON public.vendor_subscriptions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_subscriptions_service_id ON public.vendor_subscriptions(service_id);
