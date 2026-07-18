# Word Ladder — daily reminder push backend

A tiny Cloudflare Worker that stores browser push subscriptions and sends one
reminder notification per day (see the cron schedule in `wrangler.toml`). No
user accounts — just a subscription tied to whichever browser clicked
"Get a daily reminder".

## One-time setup

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up (if you don't have one).
2. Install dependencies:
   ```
   cd push-worker
   npm install
   ```
3. Log in to Cloudflare from the CLI:
   ```
   npx wrangler login
   ```
4. Create the KV namespace that stores subscriptions:
   ```
   npx wrangler kv namespace create SUBSCRIPTIONS
   ```
   This prints an `id`. Paste it into `wrangler.toml` in place of
   `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.
5. Set the VAPID private key as a secret (never commit this value):
   ```
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```
   When prompted, paste: `P3Iiv1SK-uPiWzxHfUHniNvSG2HpwBEkoeeeVcWOHXA`

   (The matching public key is already in `wrangler.toml` and in the
   game's `index.html` — it's not secret, only the private key is.)
6. Deploy:
   ```
   npx wrangler deploy
   ```
   This prints your Worker's URL, something like
   `https://word-ladder-push.<your-subdomain>.workers.dev`.

7. Send that URL back — it needs to replace the placeholder
   `PUSH_API_BASE` in `../index.html` before the button will actually work.

## Adjusting the send time

Edit the cron schedule in `wrangler.toml` (currently `0 15 * * *`, i.e.
15:00 UTC daily) and redeploy with `npx wrangler deploy`.
