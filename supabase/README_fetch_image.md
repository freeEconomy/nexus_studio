# Deploying `fetch-image` function and image_cache table

This document explains how to deploy the `fetch-image` Supabase Edge Function, apply the `image_cache` SQL, and configure environment variables.

Prerequisites
- `supabase` CLI installed and logged in, or access to the Supabase Dashboard
- Project ref or access to the Supabase project
- Service Role key (DO NOT COMMIT this key)
- Unsplash API key (optional)
- Pexels API key (optional)

1) Apply SQL (create `image_cache` table)

Using Supabase CLI:
```bash
supabase db query < supabase/image_cache_schema.sql
```

Or via Dashboard SQL editor: open `supabase/image_cache_schema.sql` and run the SQL.

2) Deploy function (CLI)

From repo root:
```bash
supabase functions deploy fetch-image --project-ref YOUR_PROJECT_REF
```

Set environment variables for the function in the Dashboard (recommended):
- `SUPABASE_URL` = your project url (e.g. https://xyz.supabase.co)
- `SUPABASE_SERVICE_ROLE` = Service Role key (from Project → Settings → API)
- `UNSPLASH_KEY` = (optional) Unsplash Client ID (Access Key)
- `PEXELS_KEY` = (optional) Pexels API key

You can also set those via CLI or the `supabase` dashboard under Functions → (function) → Settings → Environment Variables.

3) Test the function

You can test with curl (use your `ANON` key for header `apikey`):

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/fetch-image" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Seoul"}'
```

Expected response:
```json
{ "url": "https://...", "provider": "unsplash|pexels|picsum|cache" }
```

4) Frontend integration

We updated `frontend/src/pages/TravelPlanner.jsx` to call the function via `supabase.functions.invoke('fetch-image', { body: { query } })` and fallback to Picsum.

Notes & security
- Do NOT expose `SUPABASE_SERVICE_ROLE` to the browser. Keep it only in function envs.
- Consider caching TTL and cleanup via scheduled job if needed.
- Check Unsplash/Pexels usage policies for attribution and rate limits.

If you want, I can also add a tiny deployment script or GitHub Actions workflow to deploy the function and run the SQL automatically.
