"""Configuration for the SF openings pipeline.

Everything tunable lives here so the pipeline body stays declarative.
"""
from __future__ import annotations

import os


def _load_dotenv() -> None:
    """Load KEY=VALUE lines from a sibling .env into os.environ (if present).

    Tiny stdlib parser so there's no dependency and real env vars always win
    (we never overwrite an already-set variable).
    """
    here = os.path.dirname(os.path.abspath(__file__))
    for path in (
        os.path.join(here, ".env"),
        os.path.join(here, os.pardir, ".env"),
    ):
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key, val = key.strip(), val.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = val
        break


_load_dotenv()

# ---------------------------------------------------------------------------
# DataSF discovery
# ---------------------------------------------------------------------------
DATASF_RESOURCE = "https://data.sfgov.org/resource/g8m3-pdis.json"

# Only pull registrations on/after this date on each run. The pipeline also
# keeps everything it has already seen (openings.json is the durable state),
# so this window only bounds the *discovery* query, not the watchlist.
DISCOVERY_SINCE = os.environ.get("DISCOVERY_SINCE", "2026-01-01")

# NAICS is the discovery signal, NOT lic_code_description (which is sparse and
# silently drops real cafes like Le Mil's). The dataset mixes the 2017 and 2022
# NAICS vintages because businesses self-report, so we allowlist BOTH schemes.
#
# INCLUDE — consumer-facing storefronts a person would want to "try":
#   722  food service (cafes / restaurants / bars)          [both vintages]
#   445  food & beverage retailers                          [both vintages]
#   448 / 458  clothing, shoes, jewelry                     [2017 / 2022]
#   451 / 459  sporting, hobby, book, music, gift, florist  [2017 / 2022]
#   452 / 455  general merchandise                          [2017 / 2022]
#   446 / 456  health & personal care                       [2017 / 2022]
#   442 / 449  furniture, home, electronics                 [2017 / 2022]
#   453        miscellaneous retail (2017 gift/pet/art)     [2017]
NAICS_INCLUDE_PREFIXES = (
    "722",
    "445",
    "448", "458",
    "451", "459",
    "452", "455",
    "446", "456",
    "442", "449",
    "453",
)

# EXCLUDE — not the "new interesting place" vibe, even though they're in 44/45:
#   441  motor vehicle & parts dealers
#   444  building materials & garden
#   447 / 457  gasoline stations
#   454  nonstore retail (online / vending / direct sales) — no storefront
# (Handled implicitly by the allowlist above; listed here as intent doc.)
NAICS_EXCLUDE_PREFIXES = ("441", "444", "447", "457", "454")

# Stadium / arena concession + event permits masquerade as storefronts. They
# register with same-day start==end at these venue addresses. Drop them.
VENUE_ARTIFACT_ADDRESS_TOKENS = ("willie mays", "warriors way")

# ---------------------------------------------------------------------------
# Ghost pruning
# ---------------------------------------------------------------------------
# A candidate whose location_end_date appears before we ever confirmed it open
# is a "ghost" that never opened (~9% of registrations). Drop from the deck.
# A record whose start==end (same day) is an event/venue artifact, not a real
# opening.

# ---------------------------------------------------------------------------
# Enrichment (single grounded model — see enrich.py)
# ---------------------------------------------------------------------------
# One cheap grounded model does BOTH jobs in one call: judge "open yet?" and
# write the card. Behind a config name so it can be swapped without touching
# the pipeline. Verify the exact model id + grounding pricing before relying
# on it in production.
ENRICH_MODEL = os.environ.get("ENRICH_MODEL", "gemini-flash-lite-latest")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Re-check cadence for candidates that are still "coming soon". We ramp:
# fresh registrations are cheap to leave alone; we only re-ground on a cadence
# so we don't pay for every record every run.
RECHECK_COMING_SOON_DAYS = int(os.environ.get("RECHECK_COMING_SOON_DAYS", "7"))
# Once a place is confirmed open, stop re-grounding it entirely.

# Confidence at/above which a "just opened" verdict is trusted enough to flip
# status (and fire a notification, in later phases).
OPEN_CONFIDENCE_THRESHOLD = float(os.environ.get("OPEN_CONFIDENCE_THRESHOLD", "0.7"))

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get(
    "DATA_DIR", os.path.abspath(os.path.join(_HERE, os.pardir, "data"))
)
OPENINGS_JSON = os.path.join(DATA_DIR, "openings.json")
