"""Durable state = a single openings.json file.

This file is BOTH the pipeline's output (what the website reads) AND its state
(what it saw last run, current status per place, what's already enriched). The
flip detection depends on reading prior status back in, so read-modify-write is
the whole game here.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from typing import Dict

from config import OPENINGS_JSON, DATA_DIR
from models import Place


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_places() -> Dict[str, Place]:
    """Return {uniqueid: Place} from the durable store (empty on first run)."""
    if not os.path.exists(OPENINGS_JSON):
        return {}
    with open(OPENINGS_JSON, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    places = {}
    for row in payload.get("places", []):
        p = Place.from_dict(row)
        places[p.uniqueid] = p
    return places


def save_places(places: Dict[str, Place], meta_extra: Dict = None) -> None:
    """Atomically write openings.json (output + state)."""
    os.makedirs(DATA_DIR, exist_ok=True)
    # Stable ordering: most recently permitted first, so the site's default feed
    # and the file diff are both deterministic.
    ordered = sorted(
        places.values(),
        key=lambda p: (p.permit_start or "", p.dba_name or ""),
        reverse=True,
    )
    meta = {"generated_at": now_iso(), "count": len(ordered)}
    if meta_extra:
        meta.update(meta_extra)
    payload = {"meta": meta, "places": [p.to_dict() for p in ordered]}

    # Atomic write so a crashed run never leaves a half-written file the site
    # would try to read.
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)
        os.replace(tmp, OPENINGS_JSON)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
