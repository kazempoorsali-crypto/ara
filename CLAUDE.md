# ara — Real estate & website skill workspace

This repository holds a curated set of Claude Code skills (`.claude/skills/`) and subagents (`.claude/agents/`) for website design and the real estate business. Sources and licenses are listed in `SKILLS.md`.

## Automatic skill routing

- For any request about real estate (property, listing, agency, buying, selling, renting, investing, market, neighborhood, deals, leads) or about building a website, landing page, logo, brand or marketing funnel, load the `realestate-studio` skill first. It decides which other skills and subagents to combine and in what order, then merges their output into one deliverable.
- The user never has to name a skill. Pick them from the request.
- When only one narrow skill clearly fits (e.g. "write a listing ad for this apartment"), call it directly, but still apply `fair-housing-overlay` to any public-facing copy.
- Skills written for the US market must be adapted to the user's local market (see `realestate-studio`, Step 4).

## Data honesty

Never fabricate prices, comparables, rents, statistics, testimonials or legal references. Mark missing data with an explicit placeholder and report the gaps.

## Language

The user writes in Persian. Respond in formal, fluent Persian unless the deliverable itself is in English. Persian web pages are RTL with a Persian web font.

## PDF reports

`realestate-report-pdf` runs `python3 .claude/skills/realestate/scripts/generate_realestate_pdf.py` (needs `reportlab`; see `.claude/skills/realestate/requirements.txt`).
