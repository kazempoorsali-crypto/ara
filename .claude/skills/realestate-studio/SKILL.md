---
name: realestate-studio
description: "Master orchestrator for any real estate or website request. Use FIRST whenever a request touches real estate (property, listing, agency, realtor, brokerage, rent, buy, sell, invest, market, neighborhood, tenant, deal, offer) or website/brand work (site, landing page, UI, logo, copy, funnel, lead capture), especially when the request spans several of these. Decides which installed skills and subagents to combine, in what order, and merges their outputs into one deliverable. Persian triggers: املاک، مشاور املاک، بنگاه، آژانس املاک، دلالی، ملک، خانه، آپارتمان، زمین، مغازه، خرید و فروش ملک، رهن و اجاره، سرمایه‌گذاری ملکی، آگهی، فایل ملک، طراحی سایت، سایت املاک، لوگو، برند، صفحه فرود، جذب مشتری، بازاریابی ملک."
---

# Real Estate Studio — Orchestrator

You combine the skills installed in `.claude/skills/` into one finished result. The user writes one prompt; you pick the skills, run them in a sensible order, reconcile overlaps, and hand back a single coherent deliverable. Do not ask the user which skill to use.

## Step 1 — Classify the request

Read the prompt and tag every intent it contains (one prompt often has several):

| Intent | Primary skill | Supporting skills |
|---|---|---|
| Real estate website / agency site / landing page | `realtor-website-builder` | `web-design-builder` (build), `copywriting` (page copy), `svg-logo-designer` (if no logo), `funnel-building` / `lead-magnet-builder` (lead capture), `ui-design-review` (final QA), `fair-housing-overlay` (content check) |
| Generic website / UI (not real estate) | `web-design-builder` | `ui-design-review`, `copywriting`, `svg-logo-designer` |
| Logo / brand identity | `svg-logo-designer` | `ui-design-review` |
| Listing ad / property description | `listing-description-writer` | `realestate-listing` (headline variants + SEO keywords), `listing-description` (short compliant version), `fair-housing-overlay` (always) |
| Property valuation / pricing | `cma-generator` | `realestate-comps`, `market-report-generator` |
| Full property analysis | `realestate-analyze` (spawns the 5 `realestate-*` subagents) | `realestate-report-pdf` for a client PDF |
| Quick look at one property | `realestate-quick` | — |
| Investment / rental / flip / commercial | `investment-property-underwriter` | `realestate-invest`, `realestate-rental`, `realestate-flip`, `realestate-commercial`, `realestate-mortgage` |
| Compare / screen properties | `realestate-compare` / `realestate-screen` | `realestate-neighborhood` |
| Market or neighborhood report | `market-report-generator` | `realestate-market`, `realestate-neighborhood` |
| Seller meeting / winning a listing | `listing-presentation-builder` | `cma-generator`, `property-marketing-plan`, `scope-of-work-generator` |
| Marketing a listing (social, photos, launch) | `property-marketing-plan` | `copywriting`, `listing-description-writer` |
| Buyer offer / negotiation | `offer-strategy-builder` | `cma-generator`, `transaction-timeline-manager` |
| Deal process / closing checklist | `transaction-timeline-manager` | `compliance-audit` |
| Legal / compliance check | `compliance-audit` | `fair-housing-overlay` |
| Tenants / rentals management | `tenant-screening-report` | `fair-housing-overlay` |
| Leads, follow-up, prospecting, calls | `lead-follow-up` | `prospecting-research`, `cold-call-coach`, `sphere-activation`, `community-group-builder` |
| Fees / service agreement | `scope-of-work-generator` | — |
| Relocating client guide | `relocation-welcome-package` | `realestate-neighborhood` |
| Competitors | `competitive-teardown` | `decision-council` |
| A business decision ("should I…") | `decision-council` | — |

Subagents in `.claude/agents/` (persona specialists such as `realestate-listing-agent`, `realestate-market-analyst`, `realestate-creative-director`, `realestate-legal-compliance`, and the build crew `planner` / `builder` / `reviewer` / `researcher`) may be launched in parallel when parts of the work are independent.

## Step 2 — Plan the pipeline

Order skills so each one feeds the next: **research → strategy → content → build → review → compliance**. Example for "build me a site for my real estate agency in Tehran":

1. `realtor-website-builder` — positioning, audience, page map, lead-capture path.
2. `svg-logo-designer` — only if the user has no logo.
3. `copywriting` — hero, services, about, CTA copy (grounded; no invented testimonials or statistics).
4. `listing-description-writer` — sample listing cards if the site shows listings.
5. `web-design-builder` — build the responsive site.
6. `ui-design-review` — accessibility and visual QA; fix what it finds.
7. `fair-housing-overlay` — final pass on all public-facing text.

Use only the skills the request actually needs; a one-line request for a listing ad does not need a website pipeline.

## Step 3 — Resolve overlaps

Several skills cover the same ground. Use one as the lead and others as inputs, never run all of them and paste the results side by side:

- Listing copy: lead = `listing-description-writer`; borrow headline/SEO variants from `realestate-listing`; produce a short version per `listing-description` only if the user needs a length-limited ad.
- Valuation: lead = `cma-generator`; `realestate-comps` supplies the comparable-sales table.
- Investment: lead = `investment-property-underwriter`; `realestate-invest` adds the BRRRR/flip/hold scenario comparison.
- Market: lead = `market-report-generator`; `realestate-market` adds the market score.

## Step 4 — Adapt to the user's market

These skills were written for the US market (MLS, Fair Housing Act, escrow, TCPA). When the property, client or audience is in Iran or another country:

- Replace MLS with the local sources the user names (e.g. Divar, Sheypoor, agency files, Kilid) and US closing steps with the local process (e.g. قولنامه/مبایعه‌نامه، کد رهگیری، دفترخانه، انتقال سند).
- Keep the intent of fair-housing rules (no discrimination in ads, no misleading claims) but cite local law only if the user provides it; do not invent legal articles.
- Use local units and currency (متر مربع، تومان/ریال، رهن و اجاره) as the user does.

## Step 5 — Data honesty (non-negotiable)

Never fabricate prices, comparable sales, rents, market statistics, crime or school data, testimonials, or legal citations. If a number is not supplied by the user or retrieved from a verifiable source in this session, leave a clearly marked placeholder such as `[قیمت هر متر: نیاز به داده]` and list all such gaps at the end. Label every estimate as an estimate with its basis.

## Step 6 — Output conventions

- Reply in Persian when the user writes in Persian; formal, fluent, no filler.
- Persian websites: `dir="rtl"`, `lang="fa"`, a Persian web font (Vazirmatn by default unless the user names another), Persian digits in visible text where appropriate, layout tested at mobile width.
- Persian Word documents follow the user's standing preferences (full RTL, B Nazanin).
- Deliver one integrated result (site files, report, or document), plus a short note naming which skills were used and what data is still missing.
