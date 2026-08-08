"""Layer 2a — prune ghosts.

~9% of registrations get a location_end_date shortly after registering and
never actually open. If an end date appears BEFORE we ever confirmed the place
open, mark it cancelled so it never pollutes the deck.
"""
from __future__ import annotations

from typing import Dict

from models import Place, OPEN, JUST_OPENED, CANCELLED


def prune_ghosts(places: Dict[str, Place]) -> int:
    """Mutate places in place; return how many were newly marked cancelled."""
    cancelled = 0
    for p in places.values():
        if p.status in (OPEN, JUST_OPENED, CANCELLED):
            # Already confirmed open (or already cancelled) — an end date now
            # just means it later closed, which is a separate signal we don't
            # act on in the MVP.
            continue
        if p.permit_end:
            # Same-day start==end is an event/venue artifact; a later end date
            # on a not-yet-open candidate is a genuine never-opened ghost.
            p.status = CANCELLED
            cancelled += 1
    return cancelled
