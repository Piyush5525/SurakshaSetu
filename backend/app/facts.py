"""Verified public information about L'Oréal, with sources. Everything here comes from a cited public page.

Integrity rules:
- Only figures that a public source states are listed; each row carries its source, date retrieved and a
  `verified` note saying HOW it was checked.
- Nothing here is internal data. No accident, camera or incident at a real L'Oréal site is claimed anywhere in
  this project: incident records in the demo are synthetic and flagged as such.
- Figures that could not be corroborated are NOT listed (for example "37 factories" and "94 % ISO 45001").
"""

RETRIEVED = "2026-11-01"

URD = "https://www.loreal-finance.com/eng/2025-universal-registration-document/en/"
FACTS = [
    {
        "key": "etir", "group": "Health & safety", "label": "Enlarged Total Incident Rate (Group)",
        "value": "1.37", "unit": "per 1M hours (as defined by L'Oréal)", "year": "2025",
        "context": "Down from 1.46 in 2024. Group-wide, not factory-specific.",
        "source_title": "L'Oréal 2025 Universal Registration Document, health and safety metrics (ESRS S1-14)",
        "source_url": URD + "article/270/",
        "verified": "Figure read from two independent search excerpts of the URD; the page text itself was not rendered by our fetch tool. Verify before quoting.",
    },
    {
        "key": "ltir", "group": "Health & safety", "label": "Lost Time Injury Rate (Group)",
        "value": "0.67", "unit": "L'Oréal definition", "year": "2025",
        "context": "Down from 0.79 in 2024. Group-wide.",
        "source_title": "L'Oréal 2025 Universal Registration Document, health and safety metrics (ESRS S1-14)",
        "source_url": URD + "article/270/",
        "verified": "Same as above (search excerpts of the URD).",
    },
    {
        "key": "co2", "group": "Environment", "label": "CO2 reduction, Scopes 1 and 2 vs 2019",
        "value": "-58%", "unit": "absolute, GHG Protocol", "year": "2025",
        "context": "At 31 December 2025. 2024 result: -51%. 2030 target: -57%.",
        "source_title": "L'Oréal 2025 Universal Registration Document, climate section",
        "source_url": URD + "article/51/",
        "verified": "Figure read from two independent search excerpts of the URD; page text not rendered by our fetch tool.",
    },
    {
        "key": "renewable", "group": "Environment", "label": "Renewable energy on operated sites and stores",
        "value": "100%", "unit": "of energy use", "year": "2025",
        "context": "Reported alongside the CO2 result.",
        "source_title": "L'Oréal 2025 Universal Registration Document, climate section",
        "source_url": URD + "article/51/",
        "verified": "Search excerpt of the URD.",
    },
    {
        "key": "water", "group": "Environment", "label": "Industrial water from reused / recycled sources",
        "value": "56%", "unit": "of industrial water", "year": "2025",
        "context": "2024 result: 53%. Target: 100% by 2030 in factories.",
        "source_title": "L'Oréal 2025 Universal Registration Document, water section",
        "source_url": URD + "article/51/",
        "verified": "Search excerpt of the URD.",
    },
    {
        "key": "india_plants", "group": "Operations", "label": "L'Oréal India manufacturing plants",
        "value": "2", "unit": "plants: Chakan (Maharashtra) and Baddi (Himachal Pradesh)", "year": "n/a",
        "context": "L'Oréal India has said these plants run on 100% renewable energy (data from the 2023 URD).",
        "source_title": "L'Oréal India press release: 100% renewable energy in India",
        "source_url": "https://www.loreal.com/en/india/press-releases/science-technology/loreal-has-reached-100-percent-renewable-energy-in-india/",
        "verified": "Official L'Oréal India page returned by search; page text not independently opened.",
    },
]

NOT_VERIFIED = [
    "Total number of L'Oréal factories and the share certified ISO 45001: one search excerpt said 37 and 94%, a second search could not confirm it. Not shown.",
    "Factory-level accident rates for 2025, waste totals and distribution-centre data: not found in the pages we could read.",
    "Any individual workplace accident or environmental incident at a named L'Oréal site: none is used, and none is invented.",
]
