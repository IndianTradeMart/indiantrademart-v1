# Netlify Production Checklist

Use this checklist to keep Netlify behavior aligned with local `npm run dev`.

## 1) Build + Functions
- `netlify.toml` already defines:
  - build command: `npm run build`
  - publish dir: `dist`
  - functions dir: `netlify/functions`
  - function bundler: `esbuild`

## 2) API Routing
- `public/_redirects` routes `/api/*` to Netlify functions.
- Important parity rule added:
  - `/api/chat` -> `/.netlify/functions/chatbot`
  - This keeps production chatbot behavior aligned with local Express route `/api/chat`.

## 3) Environment Variables (Netlify UI)
- Create variables using `.env.netlify.example` as the template.
- Do not set `VITE_API_URL` to localhost in production.
- Set all secrets only in Netlify Environment Variables, not in git-tracked files.

## 4) Required Secrets
- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Auth: `JWT_SECRET` (plus optional `SUPABASE_JWT_SECRET`)
- Payment: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- Email/OTP: `GMAIL_EMAIL`, `GMAIL_APP_PASSWORD` (or SMTP variables)
- Chatbot (at least one provider): `OPENAI_API_KEY` or `GROQ_API_KEY`

## 5) Deploy Verification
- After deploy, verify:
  - `GET /api/support/tickets` from support dashboard works.
  - Ticket status updates work from support tickets page.
  - Chat widget `/api/chat` returns AI reply (chatbot function).
  - Payment initialize/verify routes respond without 500.
  - Auth login + profile endpoints set/read cookies correctly.
