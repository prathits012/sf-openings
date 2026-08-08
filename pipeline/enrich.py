"""Layer 2b — liveness + enrichment in ONE grounded call.

A single cheap grounded model (Gemini Flash-Lite with Google Search grounding)
does both jobs at once: judge "is it open yet?" from fresh web results AND write
the editorial card. Behind a thin wrapper so the model can be swapped.

If no GEMINI_API_KEY is set (or the SDK isn't installed), enrichment degrades to
a stub so the rest of the pipeline still runs end-to-end offline.
"""
from __future__ import annotations

import json
import re
import time
from typing import Optional

from config import ENRICH_MODEL, GEMINI_API_KEY
from models import Place, Enrichment, COMING_SOON, JUST_OPENED, OPEN
from store import now_iso

_PROMPT = """You are researching whether a newly-registered San Francisco business \
has actually opened to the public yet, and writing a short, ACCURATE listing for it.

Permit-registered name: {name}
Address: {address}, San Francisco
Business permit filed: {permit_start}

Search the web (Eater SF / Hoodline / SF Chronicle / WhatNowSF, the business's own \
site, Instagram, Google Maps) and decide its CURRENT status. The permit date is NOT \
the opening date — places open months later, and some never open.

Return ONLY a JSON object, no prose:
{{
  "status": "coming_soon" | "just_opened" | "open",
  "confidence": 0.0-1.0,
  "facts_confidence": 0.0-1.0,
  "display_name": "the name the place actually trades under, or null",
  "opening_date": "YYYY-MM-DD or null",
  "hook": "one short line on what makes it notable, or null",
  "description": "1-2 sentence editorial description, or null",
  "tags": ["lowercase", "vibe", "tags"],
  "website": "url or null",
  "instagram": "@handle or url or null",
  "sources": ["urls you actually used"]
}}

ACCURACY RULES — do not guess. A blank field is better than a wrong one:
- "confidence" = how sure you are it is OPEN. "facts_confidence" = how sure you are \
that the specifics (date, name, concept) below come from a real source, not inference.
- "opening_date": include ONLY if a source explicitly states the opening date. If no \
source states an exact date, use null. NEVER approximate, infer, or guess a date.
- "display_name": the permit name is often wrong or a placeholder. If sources \
consistently call the place something else, put that real name here; else null. Do \
not invent a name.
- "hook"/"description": state only what sources support. No invented chefs, owners, \
menus, or backstory. If you found little, keep it factual and short (or null).
- Every specific claim should be traceable to one of your "sources".

STATUS RULES:
- "coming_soon": permitted / under build-out / announced but not yet serving customers.
- "just_opened": opened within roughly the last 3 weeks (fresh press or first reviews).
- "open": operating for a while.
- No evidence it is open -> "coming_soon" with low confidence.
"""


def _stub(place: Place) -> Enrichment:
    """Offline fallback: no verdict flip, just record that we couldn't check."""
    return Enrichment(
        status=COMING_SOON,
        confidence=0.0,
        description=None,
        hook=None,
        model="stub-no-key",
        generated_at=now_iso(),
    )


def _extract_json(text: str) -> Optional[dict]:
    # Grounding responses sometimes wrap JSON in markdown/backticks or prose.
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    raw = fence.group(1) if fence else None
    if raw is None:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        raw = brace.group(0) if brace else None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


def _gemini(place: Place) -> Optional[Enrichment]:
    """Real grounded call. Returns None on any failure so caller can fall back.

    NOTE: verify the exact model id and grounding config against the current
    google-genai SDK before relying on this in production.
    """
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return None

    prompt = _PROMPT.format(
        name=place.dba_name,
        address=place.address,
        permit_start=place.permit_start or "unknown",
    )
    client = genai.Client(api_key=GEMINI_API_KEY)
    cfg = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        temperature=0.2,
    )
    # Retry transient rate-limit / overload errors with backoff; return None on
    # any failure so the caller leaves the place RETRYABLE (does not mark it
    # checked). That's what keeps a rate-limited burst from permanently stubbing
    # places for a week.
    for attempt in range(3):
        try:
            resp = client.models.generate_content(
                model=ENRICH_MODEL, contents=prompt, config=cfg
            )
            data = _extract_json(getattr(resp, "text", "") or "")
            if not data:
                return None
            status = data.get("status")
            if status not in (COMING_SOON, JUST_OPENED, OPEN):
                status = COMING_SOON
            return Enrichment(
                status=status,
                confidence=float(data.get("confidence") or 0.0),
                facts_confidence=float(data.get("facts_confidence") or 0.0),
                display_name=data.get("display_name") or None,
                opening_date=data.get("opening_date"),
                hook=data.get("hook"),
                description=data.get("description"),
                tags=list(data.get("tags") or []),
                website=data.get("website"),
                instagram=data.get("instagram"),
                sources=list(data.get("sources") or []),
                model=ENRICH_MODEL,
                generated_at=now_iso(),
            )
        except Exception as exc:  # noqa: BLE001 — never let one bad call kill the run
            msg = str(exc).lower()
            transient = any(t in msg for t in ("429", "resource_exhausted", "rate", "503", "overloaded", "unavailable"))
            if transient and attempt < 2:
                time.sleep(2 ** attempt * 3)  # 3s, 6s
                continue
            print("  enrich error for %s: %s" % (place.dba_name, str(exc)[:120]))
            return None
    return None


def enrich(place: Place) -> Optional[Enrichment]:
    """Enrich a place.

    - No API key  -> deterministic offline stub (caller marks it checked; there
      is nothing more to do without a key).
    - Key present, call succeeds -> real Enrichment.
    - Key present, call FAILS -> None, so the caller leaves it retryable and does
      NOT advance last_checked (protects against rate-limited bursts).
    """
    if not GEMINI_API_KEY:
        return _stub(place)
    return _gemini(place)
