"""Orchestrator: discover -> prune -> enrich (with flip detection) -> write.

Run weekly (Railway cron). openings.json is both the output the website reads
and the durable state this reads back in, which is what makes flip detection
work: we compare each place's NEW status against the one we stored last run.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

from config import (
    RECHECK_COMING_SOON_DAYS,
    OPEN_CONFIDENCE_THRESHOLD,
    REQUEST_DELAY_SEC,
    CHECKPOINT_EVERY,
    FORCE_REENRICH,
)
from enrich import enrich
from fetch import discover
from models import Place, COMING_SOON, JUST_OPENED, OPEN, CANCELLED
from prune import prune_ghosts
from store import load_places, save_places, now_iso


def _merge_discovered(existing: Dict[str, Place], found: List[Place]) -> int:
    """Add newly-discovered candidates; preserve state on ones we already track.
    Returns count of brand-new candidates."""
    new = 0
    for p in found:
        prior = existing.get(p.uniqueid)
        if prior is None:
            existing[p.uniqueid] = p
            new += 1
        else:
            # Refresh the permit fields (an end date may have appeared) but keep
            # our lifecycle state: status, first_seen, enrichment, last_checked.
            prior.permit_end = p.permit_end or prior.permit_end
            prior.neighborhood = prior.neighborhood or p.neighborhood
            if prior.lat is None:
                prior.lat, prior.lng = p.lat, p.lng
    return new


def _due_for_check(p: Place) -> bool:
    """Enrich brand-new coming_soon places, and re-check coming_soon ones on a
    cadence. Never re-ground places already open or cancelled — unless
    FORCE_REENRICH is set (used to correct all cards after a prompt change)."""
    if FORCE_REENRICH:
        return p.status != CANCELLED
    if p.status != COMING_SOON:
        return False
    if not p.last_checked:
        return True
    try:
        last = datetime.fromisoformat(p.last_checked)
    except ValueError:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - last >= timedelta(days=RECHECK_COMING_SOON_DAYS)


def run(enrich_limit: int = None) -> dict:
    places = load_places()
    before = len(places)

    found = discover()
    new_count = _merge_discovered(places, found)

    ghosts = prune_ghosts(places)

    # Enrich the due candidates. Cap per-run cost with enrich_limit if given.
    due = [p for p in places.values() if _due_for_check(p)]
    if enrich_limit is not None:
        due = due[:enrich_limit]

    flips: List[Tuple[str, str, str]] = []  # (uniqueid, from_status, to_status)
    enriched = 0
    failed = 0
    for i, p in enumerate(due):
        result = enrich(p)
        if result is None:
            # Transient failure (rate limit / overload). Leave the place
            # retryable — do NOT advance last_checked — and move on.
            failed += 1
            continue

        p.last_checked = now_iso()
        prior_status = p.status

        verdict = result.status
        confident = result.confidence >= OPEN_CONFIDENCE_THRESHOLD
        # Derive status from the latest confident verdict — not forward-only. A
        # place is "open" only while the newest assessment confidently says so;
        # a low-confidence "open" (e.g. the brand exists elsewhere but THIS
        # address isn't serving yet) reverts to coming_soon. Normal cadence never
        # re-checks open places, so this only demotes during a forced re-pass —
        # exactly when we want to correct a wrong status.
        if verdict in (JUST_OPENED, OPEN) and confident:
            p.status = verdict
            if prior_status not in (JUST_OPENED, OPEN):
                p.flipped_at = now_iso()  # the moment it became open — feeds the Updates page
        else:
            p.status = COMING_SOON
        # Always keep the latest card content (even while still coming_soon we
        # may now have a teaser/description).
        p.enrichment = result.to_dict()
        enriched += 1

        if p.status != prior_status:
            flips.append((p.uniqueid, prior_status, p.status))

        # Checkpoint so a long backlog run never loses progress, and pace calls
        # to stay under free-tier rate limits.
        if CHECKPOINT_EVERY and enriched % CHECKPOINT_EVERY == 0:
            save_places(places)
        if REQUEST_DELAY_SEC and i < len(due) - 1:
            time.sleep(REQUEST_DELAY_SEC)

    just_opened_flips = [
        f for f in flips if f[1] == COMING_SOON and f[2] in (JUST_OPENED, OPEN)
    ]

    save_places(places, meta_extra={
        "new_candidates": new_count,
        "ghosts_pruned": ghosts,
        "enriched": enriched,
        "flips": len(flips),
    })

    summary = {
        "before": before,
        "discovered": len(found),
        "new_candidates": new_count,
        "ghosts_pruned": ghosts,
        "enriched": enriched,
        "flips": len(flips),
        "just_opened_flips": len(just_opened_flips),
        "total": len(places),
    }
    return summary


if __name__ == "__main__":
    import os
    # Keep first local runs cheap while validating; override with ENRICH_LIMIT.
    lim = os.environ.get("ENRICH_LIMIT")
    result = run(enrich_limit=int(lim) if lim else None)
    print("pipeline run:")
    for k, v in result.items():
        print("  %-18s %s" % (k, v))
