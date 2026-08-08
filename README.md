# SF Openings Tracker

A consumer feed of newly-opened San Francisco cafes & retail — caught from city
permit data *before* they open, confirmed live with a grounded AI search, and
served as a swipe/map browse app.

See [DECISIONS.md](DECISIONS.md) for the full rationale (data source, NAICS
filter, model choice, storage, phases).

## Status
**Phase 0 complete** — the pipeline discovers candidates, prunes ghosts, enriches
via a grounded model (or a stub offline), detects the coming-soon→open flip, and
writes `data/openings.json`. Next up: Phase 1 (Next.js site reading the JSON).

## Quickstart
```bash
# No install needed for discovery/prune (stdlib only). For real enrichment:
pip install -r requirements.txt
cp .env.example .env        # add GEMINI_API_KEY for grounded enrichment

# Run the pipeline (works offline; enrichment degrades to a stub with no key)
cd pipeline && python3 pipeline.py

# Cap enrichment calls while testing
ENRICH_LIMIT=5 python3 pipeline.py
```

Output lands in `data/openings.json` — both the website's data feed and the
pipeline's durable state.

## Layout
```
pipeline/
  config.py    # NAICS allowlist (both vintages), model, thresholds
  models.py    # Place / Enrichment dataclasses + status lifecycle
  fetch.py     # Layer 1: DataSF discovery (NAICS filter, dedup, venue filter)
  prune.py     # Layer 2a: ghost pruning via location_end_date
  enrich.py    # Layer 2b: ONE grounded call = liveness + card (Gemini Flash-Lite)
  pipeline.py  # orchestrator: discover -> prune -> enrich -> flip -> write
  store.py     # load/save openings.json (output + state), atomic write
data/
  openings.json  # generated
```

## Deploy (Railway, weekly cron)
`railway.toml` runs `python pipeline/pipeline.py` on a weekly schedule. Set
`GEMINI_API_KEY` (and optionally `SOCRATA_APP_TOKEN`) in Railway's variables.
