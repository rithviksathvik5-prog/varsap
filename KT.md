# Varsap — Varistor WhatsApp Feedback Engine

**Knowledge Transfer document.** Everything you need to understand, operate,
and maintain this system from scratch. Written 15 July 2026, the day the
system went live in production.

---

## 1. What this is

Varsap sends WhatsApp feedback-request messages to Varistor's Amazon
customers. An employee uploads a CSV of orders (name, phone, order ID),
clicks dispatch, and every customer receives one WhatsApp message —
*"Hi {name}, thanks for your recent order with us! We'd love your feedback…"*
— sent from Varistor's business number **+91 77608 42211**. The dashboard
tracks each message through sent → delivered → read, shows real cost, and
handles retries, scheduling, duplicates, and opt-outs automatically.

The daily operator needs no technical knowledge: log in with Google, upload
a CSV, click a button.

## 2. How a campaign flows (the 60-second architecture)

```
Employee browser                    Cloud services
────────────────                    ──────────────
1. Upload CSV        ──────────►    App (Vercel) parses rows, drops
                                    duplicates & blocklisted numbers,
                                    stores campaign in MongoDB Atlas
2. Click Dispatch    ──────────►    App hands every message to
   (or Schedule)                    Upstash QStash with a timestamp
                                    (1 message per second)
3. (nothing — can    QStash ──────► App's /api/qstash-worker, one call
   close laptop)                    per message, which calls Meta's
                                    WhatsApp Cloud API to send
4. Dashboard         Meta ────────► App's /api/meta-webhook receives
   auto-refreshes                   sent/delivered/read/failed statuses
                                    and customer replies, updates MongoDB
```

Key point: **nothing runs in the browser after dispatch.** QStash drives the
sending in the background; the webhook keeps statuses current forever.

## 3. Platforms and accounts

| Platform | Role | What breaks if access is lost |
|---|---|---|
| **GitHub** (`rithviksathvik5-prog/varsap`) | Source code; pushing to `main` auto-deploys | Can't change the code |
| **Vercel** (project `varsap_trial`, varsaptrial.vercel.app) | Hosts the app; holds ALL secrets as environment variables | App runs but can't be configured or redeployed |
| **MongoDB Atlas** (free M0 cluster) | Database: campaigns, messages, blocklist | All history and dedupe protection lost |
| **Upstash QStash** | Message queue: pacing, scheduling, retry | Dispatch stops working |
| **Google Cloud Console** | OAuth client for the Google login | Nobody can log in |
| **Meta for Developers** (app "Varistor Feedback Engine", ID 2518547911991152) | Webhook config, app secret, publish status | Status updates stop |
| **WhatsApp Manager** (WABA "Varistor", ID 2277399479758454) | Phone number, templates, quality rating, limits | Can't manage number/templates |
| **Meta Billing Hub** | Payment method, invoices | Sends stop when billing fails |

> **Handover note:** as of writing, all of these are registered under the
> intern's personal logins. Each needs a company owner/admin added.

## 4. Environment variables (all live ONLY in Vercel → Settings → Environment Variables)

| Variable | What it is | Where to find it again |
|---|---|---|
| `MONGODB_URI` | Atlas connection string | Atlas → Connect → Drivers |
| `AUTH_SECRET` | Session encryption key | Any random 32+ chars (`npx auth secret`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client | Google Cloud Console → Credentials |
| `ALLOWED_EMAIL_DOMAIN` | Auto-allowed login domain (`varistor.in`) | — |
| `ALLOWED_EMAILS` | Comma-separated extra allowed logins | — |
| `META_ACCESS_TOKEN` | Permanent System User token for the WhatsApp API | Meta Business Settings → System Users (regenerate if lost) |
| `META_PHONE_NUMBER_ID` | ID of the business phone number (`1268747869636661`) | App dashboard → WhatsApp → API Setup |
| `META_WABA_ID` | WhatsApp Business Account ID (`2277399479758454`) | Same page, under the account name |
| `META_TEMPLATE_NAME` | Default template preselected in the New Campaign picker (`feedback_request`) | WhatsApp Manager → Message templates |
| `META_TEMPLATE_LANG` | Its language code (`en`) | Same |
| `META_WEBHOOK_VERIFY_TOKEN` | Shared secret for Meta's webhook handshake | Must match the value in the app dashboard webhook config |
| `META_APP_SECRET` | Verifies webhook signatures. **If missing, all status updates 500** (learned the hard way) | App dashboard → App settings → Basic → App secret |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | QStash publish + verify | Upstash console |
| `APP_URL` | The app's public URL — QStash calls back to it | Set to wherever the app is hosted |
| `NEXT_PUBLIC_COST_PER_MESSAGE_INR` | Per-message cost shown in the UI (`0.12`) | Meta pricing page if rates change |

**Editing env vars does NOT apply them automatically** — always do
Deployments → ⋯ → Redeploy afterwards.

## 5. Operating guide (for the daily employee)

1. **Log in:** open the site, Sign in with Google. Only whitelisted emails
   get in (see §4). To add a person: append their email to `ALLOWED_EMAILS`
   in Vercel + redeploy; if Google blocks them with "app not verified",
   add them as a test user in Google Cloud Console → OAuth consent screen.
2. **CSV format:** any columns work — you map them after upload. Needs a
   phone column (with country code, e.g. `+919876543210`), an order-ID
   column, and optionally a name column.
3. **New Campaign:** upload CSV → map the three columns → check the 3-row
   preview → Create. The pre-flight shows estimated cost.
4. **Dispatch:** *Send now*, or *Schedule for later* (up to 7 days ahead).
   You can close the tab immediately — sending runs in the cloud.
5. **Track:** campaign page auto-refreshes; counts move through
   Queued → Sent → Delivered → Read. "Spent so far" = actual accepted sends.
6. **Failures:** toggle "Show only failed" to inspect reasons; the
   **Retry failed** button re-queues only the failed ones. Retrying is
   always safe — already-delivered messages are never re-sent.
7. **Templates page:** create new WhatsApp message templates and watch
   their approval status without touching Meta's console. Type `{{name}}`
   where the customer's name should go. Keep category **Utility**
   (~₹0.12/msg); Marketing costs ~7× more.

### Built-in protections (things you do NOT need to worry about)

- **No double-sends:** the same phone + order ID combination can only ever
  be messaged once, enforced by a database unique index. Re-uploading the
  same CSV skips every row.
- **Opt-outs:** a customer replying STOP / UNSUBSCRIBE / OPT OUT is added
  to a permanent blocklist and never messaged again.
- **Failed messages cost nothing** — Meta only bills accepted sends.
- **24h duplicate-upload warning:** uploading a similar-sized file twice in
  a day shows an amber notice (informational; the index above is the real guard).

## 6. Costs

- Infrastructure: **₹0/month** (all free tiers).
- Meta: **~₹0.12 per utility message** + 18% GST, billed to the card in
  Billing Hub. Customer replies are free (1,000 service conversations/month).
- Ceilings: QStash free tier ≈ 500 messages/day; Meta messaging tier starts
  at ~250 unique customers/24h and rises automatically with good quality.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Statuses stuck at "Sent" forever | Webhook failing — check Vercel Logs for `POST /api/meta-webhook` 500s | Verify `META_APP_SECRET` is set correctly + redeploy (this exact incident happened 15 Jul 2026) |
| Everything fails instantly with an auth error | `META_ACCESS_TOKEN` expired/revoked, or lacks access to the WABA | Regenerate System User token in Meta Business Settings, update Vercel, redeploy |
| Fails with billing/payment error | Payment method missing or card declined | Meta Billing Hub → fix payment → **Retry failed** button |
| Fails with "template not found" | Template renamed/rejected, or `META_TEMPLATE_NAME`/`_LANG` mismatch | Check Templates page status; names & language must match exactly |
| Employee can't log in | Not whitelisted, or Google OAuth app in Testing mode | §5 step 1 |
| "Phone Number In Use" when re-registering the number | The number is registered elsewhere (WhatsApp app or another provider) | Delete/release it there first, wait 3 min, retry |
| Vercel says deployed but behavior unchanged | Env var edited without redeploy | Deployments → ⋯ → Redeploy |
| Nobody sees customer replies | Replies live in MongoDB (webhook stores them for opt-out detection) but there is **no inbox UI yet** | Known gap — assign an owner / build an inbox |

## 8. Moving the app to a different host or URL

The app itself runs anywhere Node 20+ runs (`npm run build && npm start`),
but three external services call INTO it and must learn the new address:

1. **Meta webhook** — app dashboard → WhatsApp → Configuration → update
   Callback URL to `https://NEW_URL/api/meta-webhook`, re-verify with the
   same `META_WEBHOOK_VERIFY_TOKEN`.
2. **QStash** — set `APP_URL=https://NEW_URL` in the new host's env.
3. **Google OAuth** — Google Cloud Console → Credentials → add
   `https://NEW_URL/api/auth/callback/google` to authorized redirect URIs.

The host must be publicly reachable over HTTPS (webhooks won't reach a
machine behind an office router). MongoDB, QStash, and Meta accounts are
untouched by a hosting move.

**Recommended path for "put it on our domain":** keep Vercel, add the
company domain in Vercel → Domains, and point a CNAME
(`feedback` → `cname.vercel-dns.com`) from the domain's DNS (cPanel Zone
Editor or wherever DNS lives). cPanel's Node.js hosting is possible but
loses auto-deploy and observability; prefer transferring the Vercel project
to a company Vercel account instead.

## 9. Security model

- **Secrets exist only in Vercel's env vars** — never in the repo, never in
  chat logs, never in `.env.example` (which holds placeholders only).
- Every page and API route requires a whitelisted Google login, except:
  `/login`, `/privacy` (public by design), and the two machine endpoints —
  the QStash worker (verifies QStash signatures) and the Meta webhook
  (verifies Meta's HMAC signature, failing closed if unconfigured).
- The WhatsApp number has a two-step PIN (set at registration — keep it
  written down; Meta demands it for any future re-registration).

## 10. Handover checklist (before the intern leaves)

- [ ] Add company owner/admin on: GitHub repo, Vercel, MongoDB Atlas,
      Google Cloud project, Meta app + Business Manager
- [ ] Decide who reads customer replies (no inbox exists — see §7)
- [ ] Replace placeholder Terms-of-Service / data-deletion URLs in Meta
      app settings (currently facebook.com)
- [ ] Add company GSTIN in Meta Billing Hub (enables input tax credit)
- [ ] Confirm the two-step PIN for +91 77608 42211 is stored somewhere safe
- [ ] Optionally: company domain + company Vercel account (§8)
- [ ] Confirm customer-consent position and a data-retention/deletion
      process (the /privacy page promises deletion on request)
