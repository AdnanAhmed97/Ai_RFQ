# RFx Intelligence — Design System

Documented from the shipped build. The world is a **procurement instrument**:
a buyer keeps it open for hours while deciding a ₹4 crore award, so the data is
the interface and chrome earns its pixels or goes.

## The thesis

This refuses the SaaS-dashboard arrangement the category always ships — a grid
of same-size rounded cards, each with an icon, a heading and a stat. Cards
fragment a comparison the buyer needs to read as one continuous surface. There
are no cards in this product, and no shadows anywhere.

## Ground and structure

Dark, chosen from the use scene: a buyer at a desk, in a long working session,
reading dense numeric tables. Not a category default.

| Token | Value | Role |
|---|---|---|
| `--color-gr-960` | `oklch(.155 .006 250)` | Ground. Everything sits on this |
| `--color-gr-940` | `oklch(.178 .007 250)` | Rail and panels |
| `--color-gr-920` | `oklch(.198 .008 250)` | Table headers, row hover, active nav |
| `--rule` | `oklch(.262 .009 250)` | The 1px hairline. **All structure comes from this** |
| `--rule-strong` | `oklch(.330 .011 250)` | Under a sticky table header |

Structure is hairlines, never borders-on-cards and never elevation. A region is
separated by a rule, not by being lifted off the page.

## Colour strategy — Restrained, and unusually strict

One accent, and a semantic palette that owns everything else.

| Token | Role |
|---|---|
| `--color-signal` `oklch(.745 .135 218)` | **Position and primary action only.** Active nav edge, the one primary button, a status marker |
| `--color-verified` `oklch(.760 .145 156)` | Stated directly in the source |
| `--color-inferred` `oklch(.800 .130 88)` | A plausible reading the source does not state |
| `--color-review` `oklch(.775 .150 58)` | Confirm before using in an award |
| `--color-blocked` `oklch(.560 .012 250)` | Not enough information to compare |
| `--color-conflict` `oklch(.680 .185 24)` | Sources disagree |

**Colour is reserved for the confidence vocabulary.** This is the load-bearing
decision: with 150 comparison cells on screen, an exception has to be findable
before it is read. Spending colour on decoration would destroy that, so nothing
else is tinted.

## Type

System sans for UI; **true monospace for every number, identifier, filename and
source reference**. Monospace here is measurement, not costume — prices must
align on the decimal down a column, and `font-variant-numeric: tabular-nums` is
set globally on `html` for the same reason. `.num` also sets `white-space:
nowrap`, because a wrapped SKU reads as two values.

| Step | Size | Use |
|---|---|---|
| `--text-micro` | 10px | Column labels, evidence references, section kickers |
| `--text-2xs` | 11px | Dense metadata |
| `--text-xs` | 12px | **Table body — the product's default reading size** |
| `--text-sm` | 13px | UI chrome, prose |
| `--text-lg` | 16px | Metric figures |

Labels are 10px, uppercase, `0.1em` tracking, `--ink-3`. That is the only
uppercase in the system.

## Geometry

```
--rail-w: 13rem    fixed left rail, never collapses
--bar-h: 2.75rem   context bar
--row-h: 1.75rem   rail row rhythm
```

Radii top out at 4px. Tables run edge to edge with no outer container — a page
gutter would waste the width the comparison needs.

## Components

**`.grid-table`** — the primary component. Sticky header at `--color-gr-920`,
6px vertical padding, 1px row rules, 90ms background transition on hover. Around
13 rows visible above the fold at 1080p, 18 on the draft screen.

**`.state`** — the status marker. A 5px square in `currentColor` plus a tracked
10px label. Not a pill, not a fill. One component carries confidence states, job
states and statuses, so the vocabulary reads as one language.

**`MetricStrip`** — a single row of figures separated by vertical hairlines.
Deliberately not a row of cards: the hero-metric template fragments numbers that
belong to one reading.

**`Rail`** — fixed 208px. Stages, then a live supplier roster with coverage
counts and a 4px conflict dot. Active position is a 2px signal edge plus a
`--color-gr-920` ground.

## Browser surfaces

Themed, not left to the browser: selection uses `--color-signal-deep`; focus is
a 1px signal outline at 1px offset; scrollbars are 10px with a `--color-gr-840`
thumb inset 2px from the track, declared for both WebKit and `scrollbar-color`;
link underlines use `--color-gr-780` at 1px with `0.2em` offset; placeholders
are tinted from the graphite ramp rather than gray.

## Rules this system does not break

1. **No cards.** Regions are separated by hairlines.
2. **No shadows.** Depth is not part of this world.
3. **No colour outside the confidence palette and the single accent.**
4. **Every number is monospace and tabular.**
5. **Never render a figure the work has not produced.** Coverage reads `— / 30`
   until a document is read; quoted value reads `—` until normalization exists.
   A zero would assert something false.
6. **No gradients, no glass, no gradient text, no kickers above headings.**

## Motion

One authored moment: a 90ms linear row-hover background. Everything else is
static. In an instrument, motion is noise — the only thing that should draw the
eye is a confidence state.
