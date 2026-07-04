# Varistor WhatsApp Feedback Engine

Internal tool for sending WhatsApp feedback-request campaigns to Varistor's
Amazon customers via the Meta WhatsApp Business Cloud API.

**Architecture (all free tiers):** Next.js on Vercel · MongoDB Atlas M0 ·
Upstash QStash background queue · NextAuth (Google SSO).

## How it works

1. An employee signs in with their company Google account (whitelist-enforced).
2. They upload an Amazon order export (Excel/CSV), map the phone / order-ID /
   name columns, and the app sanitizes numbers to E.164 with
   `libphonenumber-js` (default country: India).
3. A **pre-flight cost estimate in INR** is shown before anything can be sent.
4. On "Create campaign" the server removes duplicates (**order-ID centric**: a
   phone is only skipped if the *same order* was already messaged) and anyone
   on the opt-out blocklist.
5. On "Dispatch" the whole batch is handed to **QStash**, which calls
   `/api/qstash-worker` once per message with incremental 1-second delays.
   The employee can close their laptop — sending is fully server-side, with
   automatic retries on transient failures.
6. Meta's webhook (`/api/meta-webhook`) records the full lifecycle — `sent`,
   `delivered`, `read`, `failed` — and turns inbound "STOP" replies into
   permanent blocklist entries.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in every value
npm run dev
```

### 1. MongoDB Atlas (free)
Create an M0 cluster at [cloud.mongodb.com](https://cloud.mongodb.com), add a
database user, allow access from anywhere (Vercel IPs rotate), and paste the
connection string into `MONGODB_URI`.

### 2. Google OAuth (SSO)
In [Google Cloud Console](https://console.cloud.google.com) create an OAuth
client (Web application). Redirect URI:
`https://YOUR-DOMAIN/api/auth/callback/google` (and the localhost variant for
dev). Put the client ID/secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`,
generate `AUTH_SECRET` with `npx auth secret`. Only `@varistor.in` accounts
(plus `ALLOWED_EMAILS`) can sign in.

### 3. Upstash QStash (free)
Sign up at [console.upstash.com](https://console.upstash.com), open the QStash
tab, and copy the token + both signing keys. Note: the free tier allows ~500
messages/day — larger campaigns should be split across days or the QStash plan
upgraded (still cheap).

### 4. Meta WhatsApp Cloud API
1. Create an app at [developers.facebook.com](https://developers.facebook.com)
   → type **Business** → add the **WhatsApp** product.
2. From *WhatsApp → API Setup* copy the **Phone Number ID** and a permanent
   **access token** (create a System User in Business Settings for a token
   that doesn't expire).
3. Create a **message template** (e.g. `feedback_request`, category
   *Marketing*) with `{{1}}` as the customer's name, and wait for approval.
   Put its exact name/language in `META_TEMPLATE_NAME` / `META_TEMPLATE_LANG`.
4. Under *WhatsApp → Configuration* subscribe the webhook:
   - Callback URL: `https://YOUR-DOMAIN/api/meta-webhook`
   - Verify token: the value you chose for `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the `messages` field.

### 5. Deploy
Push to GitHub and import into [Vercel](https://vercel.com). Add every
variable from `.env.local` in Project Settings → Environment Variables.
`APP_URL` can be left unset on Vercel.

## Endpoints

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/campaigns` | Create campaign + dedupe + blocklist check | Session |
| `POST /api/campaigns/:id/dispatch` | Enqueue everything to QStash | Session |
| `GET /api/campaigns/:id` | Live counts + message log (polled by UI) | Session |
| `POST /api/qstash-worker` | Sends one message via Meta | QStash signature |
| `GET/POST /api/meta-webhook` | Status lifecycle + STOP opt-outs | Meta verify token / HMAC |

## Notes

- The `xlsx` npm package has known advisories (prototype pollution in
  crafted files); it only ever parses files uploaded by signed-in employees
  here. Prefer CSV exports if that's a concern.
- Cost estimates use `NEXT_PUBLIC_COST_PER_MESSAGE_INR` — update it when Meta
  revises India pricing.
