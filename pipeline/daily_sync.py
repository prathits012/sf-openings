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

Two auth options — pick ONE, set in Railway's dashboard (never in code/chat):

  Option A: repo-scoped SSH deploy key (recommended — doesn't require GitHub's
  email verification flow, which a PAT creation can trigger)
    GITHUB_SSH_PRIVATE_KEY   full contents of the deploy key's PRIVATE half
    GITHUB_REPO              "owner/repo"

  Option B: fine-grained PAT (Contents: read+write, scoped to this repo only)
    GITHUB_TOKEN             the token
    GITHUB_REPO              "owner/repo"

Also required either way:
  GEMINI_API_KEY  (same as local — enables real enrichment; without it every
                   run just discovers/prunes, enrichment degrades to a stub)
Optional:
  GITHUB_BRANCH  default "main"
"""
from __future__ import annotations

import os
import shutil
import stat
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


def _setup_auth(repo: str, tmp_keydir: str):
    """Return (clone_url, extra_env) for whichever auth method is configured.

    Prefers the SSH deploy key (Option A) if present, falls back to the PAT
    (Option B). extra_env is merged into the environment for every git command
    so GIT_SSH_COMMAND (if used) is respected.
    """
    ssh_key = os.environ.get("GITHUB_SSH_PRIVATE_KEY")
    token = os.environ.get("GITHUB_TOKEN")

    if ssh_key:
        key_path = os.path.join(tmp_keydir, "deploy_key")
        with open(key_path, "w") as f:
            f.write(ssh_key if ssh_key.endswith("\n") else ssh_key + "\n")
        os.chmod(key_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600 — ssh refuses otherwise
        ssh_cmd = "ssh -i %s -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes" % key_path
        return "git@github.com:%s.git" % repo, {"GIT_SSH_COMMAND": ssh_cmd}

    if token:
        # Token lives only in this process's env / the ephemeral clone URL,
        # never printed.
        return "https://x-access-token:%s@github.com/%s.git" % (token, repo), {}

    _fail("Set either GITHUB_SSH_PRIVATE_KEY (recommended) or GITHUB_TOKEN, "
          "plus GITHUB_REPO, as Railway environment variables.")
    return "", {}  # unreachable, keeps type checkers happy


def main() -> None:
    repo = os.environ.get("GITHUB_REPO")
    branch = os.environ.get("GITHUB_BRANCH", "main")
    if not repo:
        _fail("GITHUB_REPO must be set (Railway env vars), e.g. 'prathits012/sf-openings'.")
    if not os.environ.get("GEMINI_API_KEY"):
        print("daily_sync: WARNING: GEMINI_API_KEY not set — this run will only "
              "discover/prune; enrichment will degrade to stubs.")

    tmp = tempfile.mkdtemp(prefix="sfopenings-")
    keydir = tempfile.mkdtemp(prefix="sfopenings-key-")
    try:
        clone_url, extra_env = _setup_auth(repo, keydir)
        git_env = dict(os.environ)
        git_env.update(extra_env)

        print("daily_sync: cloning %s (branch %s)..." % (repo, branch))
        r = _run(["git", "clone", "--depth", "1", "--branch", branch, clone_url, tmp],
                  env=git_env, check=False)
        if r.returncode != 0:
            token = os.environ.get("GITHUB_TOKEN", "")
            redacted = (r.stderr or "").replace(token, "***") if token else (r.stderr or "")
            _fail("git clone failed: %s" % redacted)

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

        push = _run(["git", "push", "origin", "HEAD:%s" % branch], cwd=tmp, env=git_env, check=False)
        if push.returncode != 0:
            # Someone else may have pushed data/openings.json in the meantime —
            # rebase once and retry, rather than clobbering their change.
            print("daily_sync: push rejected, retrying with rebase...")
            _run(["git", "pull", "--rebase", "origin", branch], cwd=tmp, env=git_env)
            push = _run(["git", "push", "origin", "HEAD:%s" % branch], cwd=tmp, env=git_env, check=False)
            if push.returncode != 0:
                _fail("push failed after rebase: %s" % (push.stderr or ""))

        print("daily_sync: pushed updated openings.json — Vercel will redeploy.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.rmtree(keydir, ignore_errors=True)


if __name__ == "__main__":
    main()
