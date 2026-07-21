# Transferring the WhatsApp Feedback System to the Company's Meta Account

**From:** Sathvik
**What this is:** The WhatsApp feedback system (varsaptrial.vercel.app) currently
runs under a Meta Business account I set up during development. This document
explains how we move it to the company's own Meta Business account so the
company owns all keys, billing, and the WhatsApp number — and what I need
from you to do it.

---

## What I need from you (the only blockers)

1. **Is the company's Meta Business Manager business-verified?**
   (Business Settings → Business info → verification status.)
   Meta will not transfer an app into an unverified business. If it isn't
   verified yet, that has to happen first — it needs GST / incorporation
   documents and takes 1–5 business days.

2. **The company's Business Manager ID** (shown on the same Business info page).

3. **30 minutes with whoever administers it**, to accept the transfer and
   click through the WhatsApp setup on the receiving side.

---

## What moves, and how

| Item | How it moves | Changes? |
|---|---|---|
| Meta app "Varistor Feedback Engine" | Official Meta app-transfer (I initiate, your admin accepts) | App ID and app secret stay the same |
| WhatsApp number +91 77608 42211 | Official number migration into a new WhatsApp Business Account (WABA) created in your portfolio | Number, verified "Varistor" name and quality rating carry over; the number's internal ID changes |
| Message templates (3, all approved) | Recreated on your new WABA through our own app's Templates page | Re-approved by Meta, usually within minutes |
| API access token | Your admin creates a "system user" in your portfolio and generates a permanent token (I'll provide the exact 5-step procedure) | New token, never expires |
| Billing | You add a company card to the new WABA's billing | All message costs bill to the company from that moment |
| The app itself, database, campaign history | Nothing moves — hosting (Vercel), database (MongoDB), and queue (QStash) are separate accounts, unaffected | No downtime, history intact |

## The plan, in order

1. You confirm verification + Business ID (item 1–2 above).
2. I initiate the app transfer → your admin accepts it.
3. Your admin creates a WABA in your portfolio and starts the migration of
   +91 77608 42211 into it (I'll disable the number's two-step PIN for the
   move — takes minutes, no real downtime).
4. Your admin adds the company card to the new WABA's billing.
5. Your admin creates the system user + permanent token (procedure provided).
6. I update the app's configuration to the new IDs/token, resubmit the
   templates, and run a full end-to-end test (send → delivered → read).
7. Only after that test passes: I remove my personal card from the old
   billing account and delete my development Business account entirely.

Steps 2–7 are a single sitting (roughly an hour). Step 1 is the only thing
with lead time.

## What the company ends up with

- Full ownership of the app, the WhatsApp number, all keys, and billing —
  nothing tied to any personal account.
- A permanent access token that never expires (no monthly key maintenance).
- Message costs: ~₹0.12 per feedback message (utility rate) billed to the
  company card; the hosting/database/queue stack remains ₹0/month.
- If the company's Business Manager is verified, the current limit of
  250 new customer conversations/day also lifts to a much higher tier.

## One request

Until step 6's test passes, please don't change anything on the current
setup — it keeps running (and billing my card a few paise per test) exactly
as-is during the transition.
