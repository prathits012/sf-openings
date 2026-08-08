"""Data shapes for the pipeline. Plain dataclasses, JSON-serializable."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

# Status lifecycle for a place.
COMING_SOON = "coming_soon"
JUST_OPENED = "just_opened"
OPEN = "open"
CANCELLED = "cancelled"  # ghost — registered but never opened

STATUSES = (COMING_SOON, JUST_OPENED, OPEN, CANCELLED)


@dataclass
class Enrichment:
    """What the grounded model produced for a place. Written once at the flip."""
    status: str = COMING_SOON            # model's verdict on openness
    confidence: float = 0.0              # 0..1
    opening_date: Optional[str] = None   # real opening date if found (ISO)
    hook: Optional[str] = None           # one-line "what makes it special"
    description: Optional[str] = None     # 1-2 sentence editorial card
    tags: List[str] = field(default_factory=list)
    website: Optional[str] = None
    instagram: Optional[str] = None
    sources: List[str] = field(default_factory=list)
    model: Optional[str] = None          # which model produced this
    generated_at: Optional[str] = None   # ISO timestamp

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Place:
    """A candidate opening. Keyed by DataSF uniqueid."""
    uniqueid: str
    dba_name: str
    address: str
    naics: str
    neighborhood: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    permit_start: Optional[str] = None   # location_start_date (NOT opening date)
    permit_end: Optional[str] = None     # location_end_date (ghost signal)

    status: str = COMING_SOON
    first_seen: Optional[str] = None     # when the pipeline first saw it (ISO)
    last_checked: Optional[str] = None   # last enrichment/recheck (ISO)
    enrichment: Optional[Dict[str, Any]] = None  # Enrichment.to_dict()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Place":
        known = {f: d.get(f) for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**known)
