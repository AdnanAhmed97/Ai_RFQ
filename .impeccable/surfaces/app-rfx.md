---
version: 1
slug: "app-rfx"
primary_target: "app/rfx"
related_targets: ["app/workspace","app/settings","components"]
---

## Scope

Every Operate surface in the RFx Intelligence workspace: workspace list, RFx
draft, vendor responses, vendor submission detail, settings. Visitor mode:
Operate. The buyer is completing an accountable task, not browsing.

## Audience and task

A category buyer holding a ₹4 crore award. Compares 30 line items across 5
suppliers, checks where each number came from, and has to defend the result to a
VP who was not in the analysis. They live in Excel; density is familiar.

## Direction contract

**THESIS.** This is an instrument, not a dashboard. It reads like a trading
terminal a buyer keeps open for hours: the data is the interface, and chrome
earns its pixels or goes. It refuses the SaaS-dashboard arrangement this
category always ships — a grid of same-size rounded cards, each with an icon, a
heading and a stat — because cards fragment a comparison the buyer needs to read
as one continuous surface.

**OWN-WORLD.** Near-black graphite ground (oklch .17) under a persistent left
rail. Structure comes from hairline rules at 1px, never from card borders or
shadows; there are no shadows anywhere. A single cyan accent marks position and
primary action only. Colour is otherwise reserved entirely for the five
confidence states — green verified, amber inferred, orange review, grey blocked,
red conflict — so a warning in a field of 150 cells is findable without reading.
Type is a system sans at 12–13px for UI and a true monospace for every number,
identifier and source reference, with tabular figures on throughout. Dense row
rhythm at 28px. Uppercase 10px tracked labels for column heads and section
kickers.

**STORY.** The buyer sees the whole comparison at once, spots the exceptions by
colour before reading a word, clicks any number, and gets the document, page and
cell it was read from. They leave knowing what the system could not determine.

**FIRST VIEWPORT.** Left rail 208px: product mark, the five stages, then a live
vendor roster with coverage counts. Right of it a 44px context bar carrying the
RFx name and status. Under that a single-row metric strip — hairline-separated
cells, monospace figures, no boxes. Then the data itself, edge to edge, no outer
card, first row visible without scrolling. Primary action sits top-right of the
context bar.

**FORM.** Terminal density. Pinned by the user against Linear-refinement and
split-pane alternates; master_spec.md independently names Palantir and financial
terminals. No seed key: direction pinned, roll not run.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints

150 comparison cells on one screen. Values from ₹4.60 to ₹1,240.00 plus USD —
columns must align on the decimal. Vendor descriptions to ~60 characters in five
house styles. Coverage reads "— / 30" until a document has actually been read.

## Unresolved

Commercial Truth and Decision surfaces are Slices 5–7; this contract covers them
when they land.
