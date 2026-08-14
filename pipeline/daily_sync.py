"""Daily cron entrypoint (Railway) — clone, run, commit-if-changed, push.

Railway's filesystem is EPHEMERAL between runs, so we can't rely on it to hold
openings.json between days. Instead GitHub is the durable store:

  1. Shallow-clone the repo fresh (this IS the "before" state for the delta).
  2. Run pipeline.py inside that clone — it already merges deltas correctly:
     new candidates get added, existing places KEEP their status/enrichment/
     first_seen, ghosts get pruned, only due candidates get re-enriched. See
     pipeline.py: _merge_discovered() + _due_for_check().
  3. If data/openings.json actually changed, commit + push. Vercel is wired to
     auto-deploy on push, so this alone keeps the live site current.
  4. If nothing changed (e.g. no new candidates and nothing was due), skip the
     commit entirely — no noise commits.

Required env vars (set in Railway's dashboard, never hardcoded/committed):
  GITHUB_TOKEN   fine-grained PAT, scoped to this repo only, Contents: read+write
  GITHUB_REPO    "owner/repo", e.g. "prathits012/sf-openings"
  GEMINI_API_KEY (same as local — enables real enrichment; pipeline degrades to
                  a stub without it, so set it or every run is a no-op enrichment)
Optional:
  GITHUB_BRANCH  default "main"
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile


def _run(cmd, cwd=None, env=None, check=True):
    return subprocess.run(
        cmd, cwd=cwd, env=env, check=check,
        capture_output=True, text=True,
    )


def _fail(msg: str) -> "None":
    print("daily_sync: FATAL: %s" % msg, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPO")
    branch = os.environ.get("GITHUB_BRANCH", "main")
    if not token or not repo:
        _fail("GITHUB_TOKEN and GITHUB_REPO must be set (Railway env vars).")
    if not os.environ.get("GEMINI_API_KEY"):
        print("daily_sync: WARNING: GEMINI_API_KEY not set — this run will only "
              "discover/prune; enrichment will degrade to stubs.")

    tmp = tempfile.mkdtemp(prefix="sfopenings-")
    # Token lives only in this ephemeral clone URL, never printed.
    clone_url = "https://x-access-token:%s@github.com/%s.git" % (token, repo)
    try:
        print("daily_sync: cloning %s (branch %s)..." % (repo, branch))
        r = _run(["git", "clone", "--depth", "1", "--branch", branch, clone_url, tmp],
                  check=False)
        if r.returncode != 0:
            # Never echo r.args (it contains the token URL).
            _fail("git clone failed: %s" % (r.stderr or "").replace(token, "***"))

        print("daily_sync: running pipeline (discover -> prune -> enrich -> flip)...")
        pipeline_env = dict(os.environ)
        r = _run([sys.executable, "pipeline/pipeline.py"], cwd=tmp, env=pipeline_env,
                  check=False)
        print(r.stdout)
        if r.returncode != 0:
            print(r.stderr, file=sys.stderr)
            _fail("pipeline run failed (exit %d)" % r.returncode)

        diff = _run(["git", "diff", "--quiet", "--", "data/openings.json"],
                     cwd=tmp, check=False)
        if diff.returncode == 0:
            print("daily_sync: no changes to data/openings.json — skipping commit.")
            return

        _run(["git", "-c", "user.name=sf-openings-bot",
              "-c", "user.email=bot@users.noreply.github.com",
              "add", "data/openings.json"], cwd=tmp)
        _run(["git", "-c", "user.name=sf-openings-bot",
              "-c", "user.email=bot@users.noreply.github.com",
              "commit", "-q", "-m", "Daily refresh: discover, prune, enrich openings.json"],
             cwd=tmp)

        push = _run(["git", "push", "origin", "HEAD:%s" % branch], cwd=tmp, check=False)
        if push.returncode != 0:
            # Someone else may have pushed data/openings.json in the meantime —
            # rebase once and retry, rather than clobbering their change.
            print("daily_sync: push rejected, retrying with rebase...")
            _run(["git", "pull", "--rebase", "origin", branch], cwd=tmp)
            push = _run(["git", "push", "origin", "HEAD:%s" % branch], cwd=tmp, check=False)
            if push.returncode != 0:
                _fail("push failed after rebase: %s" % (push.stderr or ""))

        print("daily_sync: pushed updated openings.json — Vercel will redeploy.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
