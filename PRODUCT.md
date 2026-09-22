# RFx Intelligence — Product Context

## What it is

An AI-native procurement decision workspace. It takes the heterogeneous documents
five suppliers send back against one RFx — spreadsheets, letterhead PDFs, Word
questionnaires, scanned pages, a photograph of a printed rate card, a follow-up
email — and turns them into normalized, evidence-backed commercial intelligence a
buyer can defend to their leadership.

## The thesis

Procurement does not primarily have a spreadsheet problem. It has a
**commercial-truth and decision-confidence problem**.

Re-typing five quotes into Excel is three days of tedium. The expensive part is
what follows: deciding whether the consolidated number is *safe to award on*. The
product therefore treats extraction, normalization, uncertainty, provenance and
decision simulation as first-class, not as plumbing.

## Who uses it

A **category buyer** at a mid-size Indian manufacturer, sourcing for 12 plants.
Numerate, time-poor, and personally accountable for a ₹4 crore award they will
have to justify to a VP who was not in the analysis. They are deciding, not
browsing. They will be in this screen for hours, comparing 30 line items across 5
suppliers, and they already live in Excel — so density is familiar, not hostile.

## What success looks like

The buyer can answer one question with confidence:

> **"Can I trust this system enough to make and defend a sourcing decision?"**

Concretely: they can click any number on screen and see the document, page and
cell it came from; they can see what the system could *not* determine, stated
plainly; and they can run an award scenario knowing which lines it had to leave
out and why.

## Non-negotiable product truths

1. **Evidence over trust.** Every material value traces to a document, a location
   in it, and the source text. A number without provenance is an assertion.
2. **Uncertainty is a state, not a score.** Five explicit states — VERIFIED,
   INFERRED, REVIEW_REQUIRED, BLOCKED, CONFLICT. No confidence percentages: they
   imply a precision the system cannot defend.
3. **LLMs reason; code calculates.** The model interprets language and picks
   tools. All arithmetic, conversion, eligibility and optimization is TypeScript.
4. **Nothing is silently resolved.** A per-box price with no stated pack size
   blocks; it never becomes a plausible per-piece number.
5. **Never show a figure the work has not produced.** Coverage reads "— / 30"
   until a document has actually been read, not "0 / 30".

## Surfaces

| Route | Mode | What the buyer does here |
|---|---|---|
| `/login` | Operate | Connect a model provider (BYOK) |
| `/workspace` | Operate | See active sourcing events and their stage |
| `/rfx/[id]/draft` | Read | Read the RFx: scope, 30 lines, questionnaire, terms |
| `/rfx/[id]/responses` | Operate | Track ingestion of 12 documents across 5 suppliers |
| `/rfx/[id]/vendor/[id]` | Operate | Inspect one supplier's extracted submission + evidence |
| `/rfx/[id]/truth` | Operate | Compare 30 lines × 5 vendors side by side |
| `/rfx/[id]/decision` | Operate | Interrogate the data, run award scenarios |
| `/rfx/[id]/brief` | Read | The award recommendation, for a VP |
| `/settings` | Operate | Configuration and stated prototype limits |

Primary surface is **Operate**. The buyer is completing a task under
accountability; scanability and density outrank expression. Brand lives in
precision, not decoration.

## Scale the design must survive

- 30 line items × 5 vendors = **150 comparison cells** on one screen
- 148 extracted quotes, 116 evidence records, 117 open issues
- Prices from ₹4.60 to ₹1,240.00, plus USD values — columns must align
- Vendor descriptions up to ~60 characters, in five different house styles

## Deliberately out of scope

Real vendor auth · production email · ERP integration · SSO · billing · RBAC ·
vendor portal · live FX · live market data · approval workflows.

## Stated prototype boundaries

Vendor dispatch is simulated. The provider key is session-scoped and held in
server memory only. The USD rate is fixed so award arithmetic is reproducible,
and is labelled wherever it affects a number.
