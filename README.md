# RFx Intelligence

**From messy vendor responses to defensible sourcing decisions.**

An AI-native procurement decision workspace that turns unstructured supplier
responses into normalized, evidence-backed commercial intelligence.

Built against [`master_spec.md`](./master_spec.md), which is the source of truth
for this codebase.

---

## The thesis

Procurement does not primarily have a spreadsheet problem. It has a
**commercial-truth and decision-confidence problem**.

Re-typing five vendor quotes into Excel is three days of tedium. The expensive
part is what comes after: deciding whether the consolidated number is *safe to
award on*. This product therefore treats extraction, normalization, uncertainty,
provenance and decision simulation as first-class concepts rather than plumbing.

Four rules follow from that, and they shape every file here:

| Rule | Where it lives |
|---|---|
| **Evidence over trust.** Every material value traces to a document, a location in it, and the source text. | `types/evidence.ts`, the `evidence` table, `EvidenceRefSchema` |
| **Uncertainty is a state, not a score.** Five explicit states, no confidence percentages. | `ConfidenceState` in `types/common.ts` |
| **LLMs reason; code calculates.** The model picks tools and interprets language. TypeScript does all arithmetic. | `lib/tools/definitions.ts`, `lib/ai/prompts/decision-agent.ts` |
| **Nothing is silently resolved.** A missing pack size blocks a comparison; it does not produce a plausible number. | `quantityBasis: null` handling throughout the extraction schema |

---

## Current status — Slices 1, 3 and 4 complete

**Slice 1 (foundation):** application shell, routing, domain model, database
schema, AI provider abstraction, tool contracts, configuration, design system.

**Slice 3 (seed dataset and fixtures):** a 30-line corrugated RFx, five
suppliers, and twelve real documents in five formats — built before Slice 2
because everything from Slice 4 onward is blocked on having a corpus to read.

**Slice 4 (ingestion and extraction):** documents are parsed or handed to the
model natively, read once, matched to RFx lines, validated deterministically,
and persisted with their evidence. The Responses screen shows real pipeline
state.

Screens for later slices render an explicit "behaviour lands in Slice N" state.
They deliberately do **not** render mock vendors, mock prices or mock KPIs — a
screen showing fabricated numbers would contradict the one claim this product
makes, and would misrepresent progress.

What is real today: the BYOK connection flow makes a live Anthropic API call, the
fixture corpus is a genuinely difficult set of documents, and the extraction
pipeline reads them through the provider abstraction — parsing, matching,
validating and recording evidence for every value.

> **Not yet verified against the live API.** No Anthropic credential was
> available while building Slice 4, so the two model calls (`extract_document`,
> `match_lines`) have been exercised only through a fake provider that validates
> against the real schemas. Everything around them — ingestion, the job state
> machine, validation, persistence, evidence — is tested end to end against the
> real database and the real fixture files. Connect a key and run the pipeline
> before trusting extraction quality.

### The fixture corpus

Five suppliers responded to the same RFx in the way real suppliers do — each in
its own format, its own wording, and its own degree of compliance with what was
asked for.

| Vendor | Format | Lines | What makes it hard |
|---|---|---|---|
| **A** PackRight Industries | `.xlsx` + 2 `.pdf` | 30/30 | The clean baseline. Freight stated plainly as included. |
| **B** BoxWorks India | `.pdf` + `.docx` | 27/30 | Seven lines priced per bundle — four state the bundle size, **three state it nowhere**. Ex-works, freight extra at actuals. |
| **C** CorrugateCo | `.xlsx` + `.txt` email + `.pdf` | 30/30 | Cheapest. Eight lines priced **per 100 pieces**. A follow-up email **revises four rates the spreadsheet already stated** and introduces a freight charge the spreadsheet never mentioned. Fails a mandatory quality question — conditionally, not flatly. |
| **D** PrimePack | scanned `.pdf` + `.pdf` | 29/30 | A genuine scan: skewed, greyscale, noisy, **no text layer at all**. Three rates printed with faded toner. Freight buried in the footer and conditional on distance. |
| **E** GlobalPack | photographed `.jpg` + `.pdf` | 28/30 | A desk photograph with perspective, shadow and grain. Four lines **quoted in USD**. A printed rate **struck through and replaced in pen**. Freight reads "As applicable" — with a handwritten margin note asking the buyer's own question. |

All fifteen intentional edge cases from spec §59 are present **in the source
documents themselves**, not in metadata describing them, and
[`tests/fixtures-edge-cases.test.ts`](./tests/fixtures-edge-cases.test.ts)
proves it by opening each file and reading it back.

Regenerate with `npm run fixtures:generate`. Output is byte-identical across
runs, so a regeneration shows up as no diff at all.

### Ground truth

[`fixtures/ground-truth/`](./fixtures/ground-truth/) holds the intended reading
of every value: source document and location, RFx line mapping, quoted value,
currency, unit, pack size, freight position, questionnaire verdict, the known
ambiguity, and the normalization status the engine should reach.

It is the answer key for Slices 4-6, and it is **structurally unreachable from
the product**. [`tests/ground-truth-isolation.test.ts`](./tests/ground-truth-isolation.test.ts)
fails if anything under `app/`, `lib/`, `components/` or `types/` so much as
mentions it. If the product could read this, every extraction result and every
award figure would be unfalsifiable.

---

## Architecture

```
app/                      Next.js App Router — the 9 screens in the spec
  login/                  BYOK setup + demo login
  workspace/              Active RFx list, KPIs
  rfx/new/                Conversational RFx creation
  rfx/[id]/draft/         Review + edit the generated RFx
  rfx/[id]/responses/     Vendor intake + extraction state
  rfx/[id]/truth/         Side-by-side comparison, evidence, exceptions
  rfx/[id]/decision/      Decision Copilot + scenarios
  rfx/[id]/brief/         Award brief + export
  settings/               Configuration and stated prototype limits
  api/                    Server routes (AI connect/status, health)

components/
  shell/                  Top bar, RFx stage navigation
  system/                 Honest empty / not-configured / pending states
  truth/                  Confidence badge — the uncertainty vocabulary
  ui/                     Primitives

lib/
  documents/
    classify.ts           Format → ingestion strategy
    parse.ts              xlsx / docx / txt → coordinate-preserving text
    ingest.ts             Document → model attachment, parsed once
  extraction/
    context.ts            RFx catalogue for prompts
    extract.ts            The extraction model call
    match.ts              The line-matching model call
    validate.ts           Deterministic checks — no model involved
    persist.ts            Transactional write of quotes + evidence + issues
    summary.ts            What the Responses screen reads
  ai/
    provider.ts           AIProvider interface + error taxonomy   ← product code depends on this
    anthropic.ts          The only file that imports the Anthropic SDK
    client.ts             Per-session provider construction
    key-store.ts          Session-scoped BYOK key storage
    schemas.ts            Zod schemas constraining every model output
    prompts/              Versioned prompts, one file per loop
    observability.ts      AI operation logging (no keys, no document contents)
  tools/
    definitions.ts        The 10 Decision Copilot tool contracts
    registry.ts           Binds contracts to deterministic implementations
  db/
    sql.ts                Direct Postgres access — all reads and writes
    client.ts             Supabase client, for Storage only
  jobs/
    types.ts              Extraction job state machine + legal transitions
    queue.ts              Database-backed queue (SKIP LOCKED claim)
  config/env.ts           Validated environment configuration
  session/session.ts      Signed httpOnly session cookie

fixtures/                 SEED DATA ONLY — never imported by product code
  rfx/                    The 30-line RFx, questionnaire, terms, criteria
  vendors/                Vendor profiles, quote data, questionnaire answers
  generate/               Document generators (xlsx, pdf, docx, scan, photo)
  vendors/vendor-*/       The generated documents themselves
  ground-truth/           DEVELOPER-ONLY answer key
  seed.ts                 Loads the dataset into Postgres

scripts/                  generate-fixtures, migrate, seed

types/                    Domain model — rfx, vendor, quote, evidence, decision
supabase/migrations/      Postgres schema
tests/                    Vitest
```

### The three AI loops

1. **RFx Creation Copilot** — natural language → clarification → structured RFx.
2. **Vendor Response Intelligence** — document → extraction → line matching →
   normalization → validation → evidence → commercial truth.
3. **Decision Copilot** — question → tool selection → deterministic calculation →
   evidence retrieval → explanation.

### The boundary that matters

```
                model                          code
   ┌──────────────────────────┐   ┌──────────────────────────────┐
   │ read a value from a page │   │ arithmetic                   │
   │ identify a unit          │   │ currency + unit conversion    │
   │ map a description to a   │   │ totals and comparisons        │
   │   line item              │   │ eligibility filtering         │
   │ detect ambiguity         │   │ award optimization            │
   │ choose a tool            │   │ scenario calculation          │
   │ explain a result         │   │ validation                    │
   └──────────────────────────┘   └──────────────────────────────┘
```

Nothing in the product imports the Anthropic SDK directly. Every call goes
through `AIProvider`, so a second provider can be added without touching
extraction, matching or the decision agent.

### One extraction, many cheap queries

```
Document → ONE extraction → structured data → Postgres → N deterministic queries
```

Documents are read once. The Decision Copilot queries persisted structured truth
rather than re-sending source documents on every question.

---

## Getting started

Requires **Node 20.9+** (`.nvmrc` pins 22). Next 16 will not run on Node 18.

```bash
nvm use                 # or: nvm use 22
npm install
cp .env.example .env.local
```

Set `SESSION_SECRET` in `.env.local`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then:

```bash
npm run dev             # http://localhost:3000
npm run verify          # typecheck + lint + tests
```

The app boots with **no** Supabase or Anthropic credentials configured and
renders a configuration state naming the exact variables it needs. `GET
/api/health` reports what is wired.

### Database

Set `DATABASE_URL` to a Postgres connection string — a Supabase project supplies
one under Project Settings → Database, and a local container works identically:

```bash
docker run -d --name rfx-postgres \
  -e POSTGRES_USER=rfx -e POSTGRES_PASSWORD=rfx_dev -e POSTGRES_DB=rfx_intelligence \
  -p 54329:5432 postgres:17-alpine
```

Then:

```bash
npm run db:migrate          # apply migrations
npm run db:reset            # drop and rebuild the schema
npm run db:seed             # load the demo RFx, vendors and documents
npm run fixtures:generate   # rebuild the vendor documents
```

`db:seed` is idempotent: it deletes and rebuilds the demo RFx, and the foreign
keys cascade through every dependent row. It never calls a model, and it writes
no price, match, verdict or scenario — those are extraction outputs, and seeding
them would mean the demo's numbers came from a fixture file rather than from
reading a document.

All database access is server-side. There is no row-level security and no
browser-side database access in this prototype.

### The extraction pipeline

```
document → parse or attach → EXTRACT (model) → MATCH (model) → VALIDATE (code) → persist
```

**Ingestion** ([`lib/documents/`](./lib/documents/)) routes by format. PDFs and
images go to the model as-is — Claude reads scanned pages natively, so
rasterising them ourselves would lose the text layer where one exists and add
nothing where it does not. Spreadsheets and Word documents are parsed to text
that keeps their coordinates, because `Quotation!F11` is what an evidence
reference points at and a screenshot cannot carry it.

**Extraction and matching are separate model calls.** Reading a document and
deciding what an item is are different judgements; folding them together lets a
shaky match ride on a confident read. The RFx catalogue sits in the cached
system block, identical across all twelve documents.

**Validation is deterministic** ([`lib/extraction/validate.ts`](./lib/extraction/validate.ts)).
The model is never asked to judge its own output. These rules run in code:

| Check | Outcome |
|---|---|
| Value with no evidence | BLOCKER |
| Per-bundle price, no stated pack size | BLOCKER — normalization is impossible without inventing it |
| Two vendor lines mapped to one RFx line | BLOCKER — neither is accepted |
| Match points at a non-existent RFx line | BLOCKER |
| Currency ≠ RFx currency | WARNING |
| `REVIEW_REQUIRED` / `CONFLICT` confidence | WARNING / BLOCKER |
| RFx line the supplier never quoted | MISSING_LINE — absent, not zero |

**Nothing normalized is written.** `vendor_quotes` holds what the document said;
`commercial_truth` stays empty until the pricing engine runs in Slice 6.
Questionnaire answers are stored with `passes = null`, because deciding whether
a conditional answer satisfies a mandatory requirement is an eligibility
judgement, not an extraction outcome.

### Extraction jobs

Document processing is asynchronous by contract from the start. A job is
enqueued per document, its state lives in
[`extraction_jobs`](./supabase/migrations/0002_extraction_jobs.sql), and the UI
reads that state rather than waiting on a request:

```
QUEUED → PROCESSING → EXTRACTING → MATCHING → VALIDATING → COMPLETE
                                                         ↘ NEEDS_REVIEW
   ↑                          ↓ (any stage)
   └──────── requeue ──────  FAILED
```

Transitions are enforced, not documented. A job cannot jump to `COMPLETE`
without passing through the work — otherwise a faked run would be
indistinguishable from a real one afterwards. `NEEDS_REVIEW` is deliberately
distinct from `COMPLETE`, so "4 of 5 processed, one needs review" stays sayable.

The prototype runs jobs in-process. `claim()` still uses `SELECT … FOR UPDATE
SKIP LOCKED`, which is what makes the queue correct under more than one runner
and costs nothing to write now.

**How BYOK and asynchronous jobs are reconciled.** The buyer's key is
session-scoped and lives only in this process's memory, so a detached background
worker would have no credential to run with. `POST /api/rfx/[id]/process`
therefore processes **one document per call**, inside a request that carries the
session; the client calls it until the queue drains. Job state still lives in the
database, so the UI, the domain model and the schema remain decoupled from the
fact that a request happens to be doing the work — and the buyer gets genuine
per-document progress rather than one long opaque wait.

### API keys

BYOK. The buyer supplies an Anthropic key on `/login`; it is validated with a
real API call, then held **in server memory for that session only** — never
persisted, never returned to the browser, never logged. A restart clears it.

`DEMO_MODE_ENABLED=true` plus `ANTHROPIC_API_KEY` enables a demo button that
uses an environment-supplied key through the identical pipeline. No secret is
ever hardcoded in source.

---

## Deploying

Three things are needed: a Postgres database, a storage bucket, and a session
secret. Supabase supplies the first two.

**1. Create a Supabase project**, then from Project Settings collect:

| Setting | Where | Goes in |
|---|---|---|
| Connection string (URI) | Database → Connection string | `DATABASE_URL` |
| Project URL | API | `SUPABASE_URL` |
| `service_role` key | API → Project API keys | `SUPABASE_SERVICE_ROLE_KEY` |

Use the **pooled** connection string for a serverless deployment; a direct
connection exhausts Postgres under lambda concurrency.

**2. Generate a session secret:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**3. Provision everything with one command:**

```bash
npm run provision
```

That applies the migrations, creates a **private** storage bucket, uploads the
twelve fixture documents, and seeds the demo RFx. Every step is idempotent, and
it refuses to reseed over extracted data — re-running on a live instance will
not destroy a run that took fifteen minutes of model calls to produce. Pass
`--force` when you do want it rebuilt.

**4. Set the same variables in your host**, then deploy:

```
DATABASE_URL, SESSION_SECRET, SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET
```

No Anthropic key is set on the server. The product is BYOK: each user supplies
their own on `/login`, and it is held in that process's memory for the session
only.

### Storage

Documents are read through one interface with two backends. Supabase Storage
when it is configured — which a deployed instance needs, since a serverless
filesystem holds nothing a user uploaded. The repository's own `fixtures/`
directory otherwise, so a fresh clone runs with no cloud account at all.

The bucket is private. Supplier pricing is commercially sensitive, and documents
are served through the app rather than by public URL.

## Build plan

| Slice | Scope | Status |
|---|---|---|
| **1** | Foundation: shell, routing, domain types, schema, AI abstraction, tool contracts, config, design system | **Complete** |
| **3** | Seed dataset: 5 vendors, 30 line items, questionnaire, 12 real fixture documents, ground truth, job model | **Complete** |
| **4** | Document ingestion + extraction: xlsx/pdf/docx/image/text, evidence capture, line matching, job runner | **Complete** |
| 2 | RFx Copilot: chat, context state machine, structured generation, draft review + editing | |
| 5 | Commercial Truth: comparison table, evidence drawer, exception centre | Next |
| 6 | Pricing + award engine: normalization, FX, freight, eligibility, split award, scenarios | |
| 7 | Decision Copilot: tool-calling agent over the persisted truth layer | |
| 8 | Decision brief + CSV / XLSX / PDF export | |
| 9 | Polish, demo reliability, reset-demo | |

Each slice ends with `npm run verify` green before the next begins.

---

## Deliberately out of scope

Real vendor authentication · production email delivery · ERP integration ·
enterprise SSO · billing · production RBAC · vendor portal · live FX · live
market data · production-scale document storage · procurement approval
workflows.

The prototype spends its budget on the AI loops and the decision-confidence
experience rather than on infrastructure plumbing. Where infrastructure is
stubbed, the product behaviour on top of it is still real.

### Stubs, stated plainly

| Stubbed | Real |
|---|---|
| Vendor dispatch — no SMTP | Every model call, on real documents |
| Auth — signed cookie, no passwords | Extraction, matching, normalization |
| FX — fixed rate, labelled as such | All arithmetic, in TypeScript |
| Key storage — process memory | Evidence capture and provenance |

---

## Verification

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run test          # vitest
npm run verify        # all three
npm run build         # production build of all 9 routes
```

Database-backed tests skip visibly when `DATABASE_URL` is unset, so the suite
runs on a fresh clone without one.
