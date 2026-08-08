# Deploying to Vercel

The site is a Next.js app at the repo root. It reads `data/openings.json` (committed)
at build time and statically generates the home page + one SEO page per opening.
**No database, no env vars needed for the website.**

## One-time: push to GitHub, then import to Vercel

### 1. Create a GitHub repo and push
Either via the web (create an empty repo at github.com/new, then):
```bash
cd ~/Downloads/sf_openings_tracker
git branch -M main
git remote add origin https://github.com/<you>/sf-openings.git
git push -u origin main
```
Your `.env` (Gemini key) is gitignored and will **not** be pushed. `data/openings.json`
**will** be pushed — that's intentional; it's the site's data (public business info).

### 2. Import into Vercel
- Go to vercel.com → New Project → import the GitHub repo.
- Framework preset: **Next.js** (auto-detected). Root directory: **`.`** (repo root).
- No environment variables required. Deploy.
- You get a live URL. Every future `git push` auto-rebuilds the site.

## Ongoing: refreshing the data
The site rebuilds from `data/openings.json`, so refreshing the live site = updating
that file and pushing:
```bash
cd ~/Downloads/sf_openings_tracker
.venv/bin/python pipeline/pipeline.py    # discover + enrich + write openings.json
git add data/openings.json && git commit -m "refresh openings" && git push
# Vercel auto-rebuilds within ~1 min.
```

### Automating it (later)
Run the pipeline on Railway weekly (see `railway.toml`) and have it `git push` the
updated `data/openings.json`. Give Railway a GitHub token (a fine-grained PAT with
contents:write) as a secret so the cron can push. Vercel does the rest.

Alternatively, keep the pipeline fully local and just push when you want to refresh —
simplest, zero infra, and fine while it's SF-only.

## Notes
- **Node/build:** the app builds with `npm install && npm run build` (Next 15, React 19).
- **Map tiles:** MapLibre + free CARTO/OSM raster tiles, loaded client-side — works on
  Vercel with no key. Swap to MapTiler/Mapbox later if you want a custom style.
- **Two hosts, one repo:** Vercel builds the site; Railway (optional) runs the Python
  pipeline. `railway.toml` pins the Python start command so Railway ignores `package.json`.
