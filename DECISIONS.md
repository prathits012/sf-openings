# SF Openings Tracker — decisions & rationale

Self-contained project context so it doesn't depend on any other project's notes.
Validated against live DataSF data on 2026-08-08.

## What this is
A consumer feed of newly-opened SF cafes & retail. Two layers:
1. **Discovery** (free public data) finds candidates early, at permit time.
2. **Liveness + enrichment** (one grounded AI call) confirms when they *actually*
   open and writes an editorial card.

Product loop (later phases): swipe "want to try" → banked as coming-soon →
pipeline detects the open → notify (email → SMS/push). The permit-to-open lag
isn't a bug; it's the content engine — every registration is a future
notification banked months ahead of the food press.

> Unrelated to any sibling project it happens to share a parent directory with.
> Shares only a *pattern* (scheduled Python pipeline on Railway), no code/data.

## Data source
- **DataSF `g8m3-pdis`** ("Registered Business Locations – San Francisco"),
  free Socrata/SODA API, no auth (an app token only raises rate limits).
- Every record ships lat/lng, neighborhood, and a NAICS code.

## Key data decisions (learned the hard way)
- **Filter on `self_reported_naics_code`, NOT `lic_code_description`.** The
  license field is sparse and silently drops real cafes — Le Mil's Coffee has
  NAICS `722513` but no license description. NAICS caught it.
- **There is no `naics_code_description` column** (queries on it error).
- **The dataset mixes two NAICS vintages** (2017 + 2022) because businesses
  self-report. Retail appears under BOTH schemes, so the allowlist covers both
  (e.g. clothing = `448` *and* `458`; hobby/gift = `451`/`453` *and* `459`).
- **Plain `44`/`45` is too broad** — it pulls auto dealers (`441`), gas
  (`447`/`457`), building materials (`444`), and online-only sellers (`454`).
  The curated allowlist in `config.py` excludes those.
- **Volume: ~55 storefront food+retail openings/month** (food service ~32 +
  curated retail ~23). YTD 2026 the curated filter yields ~430 candidates.
  (An earlier "12–15/mo" figure was food-with-health-permit only — too narrow.)
- **Venue artifacts:** same-day `start==end` records at Oracle Park (Willie
  Mays Plaza) / Chase Center (Warriors Way) are event permits — filtered out.

## Opening detection: permit date ≠ opening date
- `location_start_date` is the PERMIT date and leads real opening by weeks to
  months (Le Mil's: permit 2026-02-18, opened 2026-08-15 — ~6mo).
- **No SF dataset gives real opening dates.** The DPH inspection dataset
  (`pyih-qa8i`) is frozen at 2019. The open web (Eater SF, Hoodline, Chronicle,
  Instagram, Google Maps review recency) is the only liveness signal — which is
  why the grounded AI layer is load-bearing, not decorative.

## Ghost pruning
- ~9% of registrations get a `location_end_date` shortly after and never open.
- Detect via `location_end_date` appearing before we confirm open → `cancelled`.
- **`administratively_closed` is useless** (1 record in the whole dataset).

## Model: one cheap grounded model, no Claude
- **Gemini Flash-Lite with Google Search grounding** does BOTH jobs (open-yet?
  + write the card) in ONE grounded call against fresh web results. This kills
  the separate search API and any two-tier setup.
- Neither job needs a frontier model — card quality comes from the prompt +
  search inputs. Cost is cents/month at this volume.
- Kept behind a wrapper (`enrich.py`) so the model is a one-line swap. Runs
  offline with a stub when no key is set.
- ⚠️ Verify the exact model id and grounding pricing before production.

## Storage: NO database for MVP
- ~100 rows/year → a JSON file, not a DB problem.
- `data/openings.json` is BOTH the site's data feed AND the pipeline's durable
  state (read back in to detect the coming-soon→open flip and skip re-enriching).
- **PostGIS dropped** — ~100 pins render + filter client-side; neighborhood is
  already a field.
- A hosted DB earns its place only at the saved-list phase, and only as one
  `email → [saved place_ids]` table with magic-link capture (not passwords).

## Build phases
- **0 (this repo):** Python pipeline → `openings.json`. ✅ Runs end-to-end.
- **1:** Next.js on Vercel reads the JSON → per-opening SEO pages + map.
  Shippable alone (no db/auth) — a browse site + newsletter engine.
- **2:** swipe + saved list (+ the one email→saves table).
- **3:** status-flip detection wired to email + a `/today` daily brief.
- **4:** SMS (Twilio, gated behind engaged users) + web push.

## Growth (near-zero cost)
The pipeline IS the marketing: programmatic SEO (one page per opening — the #1
channel) + a weekly "what opened in SF" newsletter, both auto-fed. No paid ads
early.
