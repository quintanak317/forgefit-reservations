# ForgeFit Reservations

A lightweight web app for CrossFit class reservations with Supabase Auth + database and Vercel hosting.

## What you get
- Email/password login with profiles
- Schedule view with reservations + waitlist
- Auto-promote from waitlist on cancellations or capacity increases
- Admin console to create/edit classes
- Notifications stream

## Setup (Supabase)
1. Create a Supabase project.
2. Open the SQL Editor and run `schema.sql`.
3. If you already ran the old schema, also run `schema_update.sql`.
3. In Supabase Auth settings, disable email confirmation for faster testing (optional).
4. Grab your project URL + anon public key.
5. Update `config.js` with your values:

```js
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
```

## Run locally
Open `index.html` in a browser.

## Deploy to Vercel (free)
1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Framework preset: **Other** (static).
4. Deploy.

Supabase keys are public by design. If you want stricter access control later, move to a backend API layer.

## Admin access
When signing up, enter admin code `COACH` to create an admin profile.

## Notifications (Email/SMS)
1. In Vercel, set env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM`
   - `TWILIO_ACCOUNT_SID` (optional)
   - `TWILIO_AUTH_TOKEN` (optional)
   - `TWILIO_FROM` (optional)
   - `NOTIFY_WEBHOOK_SECRET` (optional)
2. In Supabase, create a Database Webhook on `public.notifications` (INSERT) to your Vercel endpoint:
   - `https://YOUR-VERCEL-DOMAIN/api/notify`
3. Add the header `x-webhook-secret` if you set `NOTIFY_WEBHOOK_SECRET`.

## Memberships
Default plans are `Unlimited Monthly` and `Drop-in`. Members can activate a plan from their profile.
