# IndianTradeMart - Frontend + Backend

B2B marketplace platform with multi-app routing (Vendor/Buyer/Admin/Directory) backed by Supabase.

## Tech Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database/Auth/Storage: Supabase (Postgres + Auth + Realtime + Storage)
- Payments: Razorpay
- Email: SMTP/Gmail (server) + SendGrid (Supabase Edge function)
- AI: OpenAI / Groq (chatbot)

## High-Level Architecture (HLD)
```mermaid
graph TD
  U[User Browser] --> FE[React/Vite SPA]

  FE -->|anon key| SB[Supabase Client]
  FE -->|REST| API[Express API]

  SB -->|DB/Auth/Realtime/Storage| SUPABASE[(Supabase)]

  API -->|service role| SUPABASE
  API --> RP[Razorpay]
  API --> SMTP[SMTP/Gmail]
  API --> AI[OpenAI/Groq]

  subgraph Supabase
    DB[(Postgres)]
    AUTH[(Auth)]
    RT[(Realtime)]
    ST[(Storage)]
  end

  SUPABASE --> DB
  SUPABASE --> AUTH
  SUPABASE --> RT
  SUPABASE --> ST
```

## DB ER Diagram (Simplified)
```mermaid
erDiagram
  buyers ||--o{ favorites : saves
  vendors ||--o{ favorites : saved_by

  vendors ||--o{ products : owns
  products ||--o{ product_images : has

  vendors ||--o{ vendor_documents : uploads
  vendors ||--o{ vendor_preferences : sets

  vendor_plans ||--o{ vendor_plan_subscriptions : has
  vendors ||--o{ vendor_plan_subscriptions : subscribes
  vendor_plan_subscriptions ||--o{ vendor_plan_slots : reserves
  plan_tiers ||--o{ vendor_plan_slots : ranks

  vendors ||--o{ vendor_payments : pays
  vendor_plans ||--o{ vendor_payments : for
  vendor_plan_coupons ||--o{ vendor_coupon_usages : used_in
  vendor_payments ||--o{ vendor_coupon_usages : applies

  vendors ||--o{ leads : receives
  buyers ||--o{ leads : creates

  buyers ||--o{ proposals : sends
  vendors ||--o{ proposals : receives

  vendors ||--o{ support_tickets : raises
  buyers ||--o{ support_tickets : raises
  support_tickets ||--o{ ticket_messages : contains

  states ||--o{ cities : contains
  states ||--o{ vendors : has
  cities ||--o{ vendors : has
  states ||--o{ buyers : has
  cities ||--o{ buyers : has

  head_categories ||--o{ sub_categories : has
  sub_categories ||--o{ micro_categories : has
  head_categories ||--o{ products : classified
  sub_categories ||--o{ products : classified
  micro_categories ||--o{ products : classified
```

## Key Sequence Flows

### 1) OTP Flow
```mermaid
sequenceDiagram
  participant UI as Frontend
  participant API as Express API
  participant DB as Supabase DB
  participant Mail as SMTP/Gmail

  UI->>API: POST /api/otp/request (email)
  API->>DB: insert auth_otps
  API->>Mail: send OTP email
  API-->>UI: success + expiresIn

  UI->>API: POST /api/otp/verify (email, otp)
  API->>DB: validate + mark used
  API-->>UI: verified
```

### 2) Subscription Purchase (Razorpay)
```mermaid
sequenceDiagram
  participant UI as Vendor UI
  participant API as Express API
  participant RP as Razorpay
  participant DB as Supabase DB

  UI->>API: POST /api/payment/initiate
  API->>DB: load vendor + plan
  API->>RP: create order
  API-->>UI: order details

  UI->>API: POST /api/payment/verify
  API->>RP: verify signature
  API->>DB: create subscription + payment + invoice
  API-->>UI: success
```

### 3) Directory Search Ranking
```mermaid
sequenceDiagram
  participant UI as Directory UI
  participant API as Express API
  participant DB as Supabase DB

  UI->>API: GET /api/dir/search?q=...&microSlug=...
  API->>DB: RPC dir_ranked_products
  DB-->>API: ranked rows
  API-->>UI: products + count
```

## OpenAPI Spec
- File: `docs/openapi.yaml`
- Use any OpenAPI viewer (Swagger UI / Redoc) to render.

## Missing/Extra DB Objects (from code references)
Details: `docs/missing-migrations.md`

## Scripts (from package.json)
- `npm run dev` - run frontend + backend together
- `npm run dev:client` - Vite frontend only
- `npm run dev:server` - Express API only
- `npm run dev:all` - run both
- `npm run build` - generate sitemaps + build

## Netlify Deployment
- Production checklist: `docs/netlify-production.md`
- Env template for Netlify variables: `.env.netlify.example`

## Notes
- Subdomain-aware routing is supported (vendor., buyer., dir., admin.).
- Maintenance mode + public notice gates are driven by `system_config`.
- Page-level blanking uses `page_status` with realtime updates.
