# Claude Handoff — paste everything below this line into your Claude session

You are helping me (senior tech lead at Varistor) take over and migrate a
working production system. Read this context fully before suggesting anything.

## The system

**Varsap** — WhatsApp feedback engine for Varistor's Amazon customers.
Employees upload an Amazon order CSV, the app sends each customer a
templated WhatsApp message ("Hi {{name}}, we'd love your feedback…") and
tracks sent → delivered → read live on a dashboard.

- **Stack:** Next.js (App Router) on Vercel · MongoDB Atlas (free M0) ·
  Upstash QStash queue (paces sends at 1 msg/sec, handles retries and
  scheduling) · Meta WhatsApp Cloud API · Google OAuth login (NextAuth),
  restricted to `@varistor.in` plus a whitelist.
- **Repo:** github.com/rithviksathvik5-prog/varsap — read `KT.md` in the
  repo root first (full architecture, env vars, troubleshooting, operating
  guide) and `MIGRATION.md` (the migration plan I'm executing).
- **Deployed at:** https://varsaptrial.vercel.app (auto-deploys on push to
  `main`; env vars live in Vercel → Settings → Environment Variables, and
  changing one requires a manual Redeploy).
- **Hard constraint:** ₹0/month infrastructure. Only real cost is Meta's
  per-message fee (~₹0.12 utility, ~₹0.88 marketing, India rates).

## Current Meta setup (all working, verified end-to-end on 18 Jul 2026)

Currently owned by the developer's personal "Varsap Varistor" Business
Manager — the thing we are migrating away from.

- Meta app: **"Varistor Feedback Engine"**, App ID `2518547911991152`,
  Published/Live. Webhook: `https://varsaptrial.vercel.app/api/meta-webhook`,
  subscribed to the `messages` field, signature-verified via the app secret
  (the webhook fails closed — wrong/missing `META_APP_SECRET` silently kills
  all delivery/read status updates; this outage happened once already).
- Production WABA: **"Varistor"**, ID `2277399479758454`.
- Phone: **+91 77608 42211**, Phone Number ID `1268747869636661`, display
  name "Varistor", quality GREEN, has a two-step PIN (the developer holds it).
- Auth: a **system-user token that never expires** (system user
  `varsap-internet` in the old portfolio). Secrets travel separately —
  ask the developer for the `.env.local` file; never paste secrets into chat.
- Templates on the WABA (all APPROVED): `feedback_request` (UTILITY/en —
  the default), `varistor_review_invite` (MARKETING/en), `hello_world`.
- Billing: developer's personal card — being replaced by a company card as
  part of this migration.

## Hard-won facts — do not rediscover these the painful way

1. **Template creation via API must send `parameter_format: "NAMED"`.**
   Without it Meta defaults to positional params, reads `{{name}}` as
   malformed, silently drops the example values, and auto-rejects with
   `INVALID_FORMAT`. The app's code handles this correctly now
   (`src/lib/metaTemplates.ts`) — submit templates through the app's
   Templates page, not by hand.
2. **Near-duplicate template wording is auto-rejected.** New templates need
   genuinely different text from existing ones, same-language.
3. **Rejected/deleted template names are locked ~4 weeks.** Never reuse names.
4. **`rejected_reason` field**: the Graph API explains rejections —
   `GET /{template-id}?fields=name,status,rejected_reason,components`.
5. **Tokens are inspectable**: `GET /debug_token?input_token=X&access_token=X`
   shows validity, expiry, and which WABAs it can reach (`granular_scopes`).
   Verify every new token this way BEFORE putting it in Vercel.
6. **Meta env vars only apply after a Vercel Redeploy.**
7. The app has a per-campaign **template picker** (New Campaign, step 3) —
   `META_TEMPLATE_NAME` is merely the preselected default.

## My task: receive the migration (see MIGRATION.md for the full plan)

My side of the work, in order:

1. Confirm our company Business Manager is **business-verified** (required
   to receive an app transfer) and get its Business ID.
2. **Accept the app transfer** of "Varistor Feedback Engine" (App ID and
   secret survive the transfer; webhook config carries over).
3. **Create a WABA** in our portfolio and **migrate the phone number**
   +91 77608 42211 into it (destination initiates; the developer disables
   the number's two-step PIN during the move; verified name + quality carry
   over; the Phone Number ID will be NEW — note it).
4. Add the **company card** to the new WABA's billing (Billing Hub). Indian
   cards need e-mandate/tokenization support; a credit card is more reliable
   than debit for Meta's recurring billing.
5. Create a **system user** (Admin) in our portfolio, assign it the app +
   new WABA with full control, generate a token: expiry **Never**,
   permissions `whatsapp_business_messaging` + `whatsapp_business_management`.
   Verify it with debug_token (fact #5) — its scopes must include the new
   WABA ID.
6. Update Vercel env vars: `META_ACCESS_TOKEN` (new), `META_WABA_ID` (new),
   `META_PHONE_NUMBER_ID` (new). `META_APP_SECRET` should NOT change (same
   app). Redeploy. Re-check the webhook subscription under
   the app's WhatsApp → Configuration (callback URL + verify token are in
   Vercel env; subscribe `messages`).
7. Resubmit the templates through the app's Templates page (they don't
   migrate with the number). Set `META_TEMPLATE_NAME` to an approved one.
8. **End-to-end test:** create a campaign to a test number with a fresh
   order ID (the DB dedupes on phone+orderId pairs — reused pairs are
   silently skipped), dispatch, and confirm the dashboard walks
   sent → delivered → read. Read receipts prove the webhook + app secret.
9. Tell the developer the test passed so they can remove their card and
   delete their old Business Manager.

## Never do these

- Never reset the app secret (kills webhooks + tokens).
- Never delete or revoke the system user once created (kills the token).
- Never transfer assets OUT of the business portfolio once they're in
  (severs all grants). Add/remove PEOPLE instead.
- Don't send template submissions straight to the Graph API by hand — use
  the app's Templates page, which encodes the format rules correctly.

## How I like to work

Walk me through one step at a time. When I share a screenshot, tell me
exactly what to click. Verify every stage with a Graph API call where
possible instead of assuming. Flag anything that costs money or is
irreversible BEFORE I do it.
