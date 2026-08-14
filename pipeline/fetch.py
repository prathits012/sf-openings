"""Layer 1 — discovery. Pull new storefront candidates from DataSF.

Filters on self_reported_naics_code (NOT lic_code_description), covering both
NAICS vintages, and drops venue/event artifacts. No auth needed; a free Socrata
app token (SOCRATA_APP_TOKEN) just raises rate limits.
"""
from __future__ import annotations

import os
from typing import Dict, List
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import re

from config import (
    DATASF_RESOURCE,
    DISCOVERY_SINCE,
    NAICS_INCLUDE_PREFIXES,
    VENUE_ARTIFACT_ADDRESS_TOKENS,
    RESIDENTIAL_NAME_PATTERN,
)

_RESIDENTIAL_RE = re.compile(RESIDENTIAL_NAME_PATTERN, re.IGNORECASE)
from models import Place
from store import now_iso

_SELECT = ",".join([
    "uniqueid", "dba_name", "full_business_address", "self_reported_naics_code",
    "location_start_date", "location_end_date",
    "neighborhoods_analysis_boundaries", "location",
])


def _where() -> str:
    naics = " OR ".join(
        "starts_with(self_reported_naics_code,'%s')" % p
        for p in NAICS_INCLUDE_PREFIXES
    )
    return (
        "city='San Francisco' "
        "AND location_start_date > '%s' "
        "AND (%s)" % (DISCOVERY_SINCE, naics)
    )


def _get(params: Dict[str, str]) -> List[dict]:
    query = urlencode(params)
    url = "%s?%s" % (DATASF_RESOURCE, query)
    req = Request(url, headers={"Accept": "application/json"})
    token = os.environ.get("SOCRATA_APP_TOKEN")
    if token:
        req.add_header("X-App-Token", token)
    with urlopen(req, timeout=60) as resp:  # noqa: S310 (trusted gov endpoint)
        import json
        return json.load(resp)


def _is_venue_artifact(row: dict) -> bool:
    addr = (row.get("full_business_address") or "").lower()
    if any(tok in addr for tok in VENUE_ARTIFACT_ADDRESS_TOKENS):
        # Only treat as artifact when it also looks like an event permit
        # (same-day start==end); a real storefront near a stadium is fine.
        if row.get("location_start_date") and (
            row.get("location_start_date") == row.get("location_end_date")
        ):
            return True
    return False


def _to_place(row: dict) -> Place:
    lat = lng = None
    loc = row.get("location") or {}
    coords = loc.get("coordinates") if isinstance(loc, dict) else None
    if coords and len(coords) == 2:
        lng, lat = coords[0], coords[1]  # GeoJSON is [lng, lat]
    return Place(
        uniqueid=row["uniqueid"],
        dba_name=row.get("dba_name") or "(unnamed)",
        address=row.get("full_business_address") or "",
        naics=row.get("self_reported_naics_code") or "",
        neighborhood=row.get("neighborhoods_analysis_boundaries"),
        lat=lat,
        lng=lng,
        permit_start=(row.get("location_start_date") or "")[:10] or None,
        permit_end=(row.get("location_end_date") or "")[:10] or None,
        first_seen=now_iso(),
    )


def discover(page_size: int = 1000, max_pages: int = 20) -> List[Place]:
    """Return storefront candidates from DataSF, deduped by uniqueid then by
    (dba_name, address) to collapse re-registrations."""
    rows: List[dict] = []
    offset = 0
    for _ in range(max_pages):
        batch = _get({
            "$select": _SELECT,
            "$where": _where(),
            "$order": "location_start_date DESC",
            "$limit": str(page_size),
            "$offset": str(offset),
        })
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    places: Dict[str, Place] = {}
    seen_natural = set()
    for row in rows:
        if _is_venue_artifact(row):
            continue
        if _RESIDENTIAL_RE.search(row.get("dba_name") or ""):
            continue
        p = _to_place(row)
        if p.uniqueid in places:
            continue
        natural = (p.dba_name.lower().strip(), p.address.lower().strip())
        if natural in seen_natural:
            continue
        seen_natural.add(natural)
        places[p.uniqueid] = p
    return list(places.values())


if __name__ == "__main__":
    found = discover()
    print("discovered %d candidates" % len(found))
    for p in found[:10]:
        print("  %-28s %-26s %s" % (p.dba_name[:28], (p.neighborhood or "")[:26], p.naics))
