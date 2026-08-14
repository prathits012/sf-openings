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

### Automating it — Railway daily cron (already built: `pipeline/daily_sync.py`)
Railway's filesystem is ephemeral between runs, so GitHub is the durable store:
each run clones fresh, runs the pipeline (which merges the day's delta into what
it just cloned), and pushes only if `data/openings.json` actually changed. Vercel
auto-deploys on that push. See `railway.toml` (cron at 13:00 UTC / 6am PT).

**Auth — two options, set as Railway env vars (dashboard, never in code/chat):**

**Option A — SSH deploy key (recommended; skip if PAT creation works fine for you).**
Doesn't touch GitHub's PAT-creation flow at all (handy if that flow is blocked by
an email-verification step you can't complete):
```bash
# Generate once, locally (already done if you followed along — key lives at
# ~/.ssh/sf_openings_deploy, never printed to chat/logs):
ssh-keygen -t ed25519 -f ~/.ssh/sf_openings_deploy -N "" -C "sf-openings-railway-deploy"
```
1. GitHub → your repo → **Settings → Deploy keys → Add deploy key**
   - Title: `railway-daily-sync`
   - Key: paste the **public** key — `cat ~/.ssh/sf_openings_deploy.pub`
   - ✅ Check **"Allow write access"** (required — this key needs to push)
2. Railway → your service → **Variables** → add `GITHUB_SSH_PRIVATE_KEY`. Get the
   value onto your clipboard *without* it ever appearing in a terminal transcript
   or chat: `pbcopy < ~/.ssh/sf_openings_deploy` — then paste into Railway's value
   field. (Multi-line values are fine in Railway's env var editor.)
3. Also set `GITHUB_REPO=<owner>/<repo>` and `GEMINI_API_KEY=<your key>`.

**Option B — fine-grained PAT** (if GitHub's token-creation flow works for you):
[github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
→ scope to just this repo → permission **Contents: Read and write**. Set
`GITHUB_TOKEN` + `GITHUB_REPO` + `GEMINI_API_KEY` in Railway instead.

`daily_sync.py` uses the SSH key if `GITHUB_SSH_PRIVATE_KEY` is set, otherwise
falls back to `GITHUB_TOKEN` — only one is required.

### Manual alternative
Skip the cron entirely and just run + push locally whenever you want a refresh —
simplest, zero infra, fine while it's SF-only:
```bash
cd ~/Downloads/sf_openings_tracker
.venv/bin/python pipeline/pipeline.py
git add data/openings.json && git commit -m "refresh openings" && git push
```

## Notes
- **Node/build:** the app builds with `npm install && npm run build` (Next 15, React 19).
- **Map tiles:** MapLibre + free CARTO/OSM raster tiles, loaded client-side — works on
  Vercel with no key. Swap to MapTiler/Mapbox later if you want a custom style.
- **Two hosts, one repo:** Vercel builds the site; Railway (optional) runs the Python
  pipeline. `railway.toml` pins the Python start command so Railway ignores `package.json`.
