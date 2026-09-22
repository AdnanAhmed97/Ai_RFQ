# RFx Intelligence --- Master Build Specification

**Version:** 1.0\
**Purpose:** Claude Code implementation specification for the Aerchain
Product / Take-Home Assignment\
**Prototype posture:** Production-quality demo in UX and AI behavior;
intentionally stubbed infrastructure where the assignment permits it.

------------------------------------------------------------------------

## 0. Executive Summary

Build a polished, end-to-end AI-native procurement prototype called
**RFx Intelligence**.

The product should let a procurement buyer:

1.  Describe a sourcing requirement conversationally.
2.  Work with an AI copilot to clarify the requirement.
3.  Generate an RFx containing scope, line items, questionnaire,
    commercial terms, and evaluation rules.
4.  Simulate sending the RFx to vendors.
5.  Ingest vendor responses in deliberately messy formats:
    -   Excel
    -   PDF
    -   DOCX
    -   image / photographed rate card
    -   email-style text
6.  Extract vendor responses using real LLM calls.
7.  Map vendor responses to RFx line items.
8.  Normalize units, currencies, and pricing bases where safely
    possible.
9.  Detect ambiguity instead of guessing.
10. Store source evidence for every extracted commercial value.
11. Present a side-by-side "Commercial Truth" workspace.
12. Let the buyer ask natural-language questions over the normalized
    dataset.
13. Execute deterministic calculations and scenarios through tools.
14. Explain results with citations/evidence.
15. Produce a defensible award decision brief.

The core product thesis:

> **Procurement does not primarily have a spreadsheet problem. It has a
> commercial-truth and decision-confidence problem.**

The product therefore treats extraction, normalization, uncertainty,
provenance, and decision simulation as first-class concepts.

------------------------------------------------------------------------

# 1. Assignment Requirements --- Non-Negotiable

The assignment brief requires an end-to-end flow in which:

-   a buyer creates an RFx with an AI copilot;
-   vendors can respond in whatever format they choose;
-   the system reads and normalizes vendor responses;
-   responses are compared side by side;
-   questionnaire answers and attached documents are available alongside
    pricing;
-   the buyer interrogates the result in natural language;
-   the system produces analysis and supports a defensible award
    decision.

The prototype must demonstrate:

-   5 vendors
-   30 line items
-   questionnaire
-   attached documents
-   messy vendor response formats
-   real AI extraction
-   real AI reasoning
-   visible handling of uncertainty

Do **not** fake extraction, reasoning, or hardcode answers to demo
questions.

Infrastructure plumbing may be stubbed where appropriate.

The demo must specifically handle ugly cases such as:

-   vendor quotes only 27 of 30 lines;
-   USD versus INR;
-   "per box" versus "per 100 pieces";
-   information buried in a footnote;
-   scanned/photo-based rate cards;
-   contradictory or incomplete commercial information.

The product should make the buyer understand **what the system knows,
what it inferred, what it cannot determine, and where each number came
from.**

------------------------------------------------------------------------

# 2. Product Positioning

## Product name

**RFx Intelligence**

Temporary working name. Keep naming isolated so it can be changed
easily.

## Tagline

**From messy vendor responses to defensible sourcing decisions.**

## One-line product description

An AI-native procurement decision workspace that turns unstructured
supplier responses into normalized, evidence-backed commercial
intelligence.

## Product principles

### 2.1 Evidence over trust

Never ask the buyer to blindly trust an AI-generated number.

Every material commercial value should be traceable to:

-   vendor
-   document
-   page/sheet/message
-   source text or source region
-   extraction
-   normalization logic

### 2.2 Uncertainty is a product state

Do not silently resolve ambiguity.

Use explicit states:

-   `VERIFIED`
-   `INFERRED`
-   `REVIEW_REQUIRED`
-   `BLOCKED`
-   `CONFLICT`

### 2.3 LLMs reason; code calculates

The LLM should interpret language and decide which tools to invoke.

Deterministic application code must perform:

-   arithmetic
-   currency calculations
-   unit conversions
-   totals
-   comparisons
-   eligibility filters
-   award optimization
-   scenario calculations

Never rely on an LLM to calculate financial totals.

### 2.4 Progressive disclosure

The default UI should be simple.

Advanced evidence, source text, normalization logic, and calculation
details appear when the buyer drills in.

### 2.5 AI should ask when it genuinely needs information

The RFx copilot should ask focused clarification questions rather than
generating a huge questionnaire before understanding the buyer's intent.

### 2.6 The buyer remains in control

AI can draft, interpret, surface, calculate, and explain.

The buyer approves:

-   RFx
-   unresolved assumptions
-   final award

------------------------------------------------------------------------

# 3. Primary Persona

## Category / Procurement Buyer

Typical workflow:

1.  Need arises.
2.  Buyer defines requirements.
3.  RFx is drafted.
4.  RFx is sent to vendors.
5.  Vendors return heterogeneous responses.
6.  Buyer manually consolidates responses.
7.  Buyer validates commercial terms.
8.  Buyer compares eligible vendors.
9.  Buyer models scenarios.
10. Buyer prepares award recommendation.
11. Procurement leadership reviews the recommendation.

The prototype should eliminate the manual consolidation and analysis
burden.

------------------------------------------------------------------------

# 4. End-to-End User Journey

``` text
LOGIN
  ↓
AI RFx COPILOT
  ↓
Clarify sourcing requirement
  ↓
Generate RFx draft
  ↓
Buyer reviews / edits
  ↓
Send RFx
  ↓
Vendor response simulation
  ↓
Upload / ingest vendor responses
  ↓
AI extraction
  ↓
Line-item matching
  ↓
Normalization
  ↓
Validation
  ↓
Evidence creation
  ↓
Commercial Truth
  ↓
Exception resolution
  ↓
Decision Copilot
  ↓
Scenario analysis
  ↓
Award Decision
  ↓
Decision Brief
  ↓
Export
```

The experience should feel like one coherent product, not separate
mini-apps.

------------------------------------------------------------------------

# 5. Application Architecture

Use a simple monorepo-style application.

## Recommended stack

### Frontend

-   Next.js
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   TanStack Table
-   Recharts or equivalent lightweight charting library
-   Lucide icons

### Backend

Prefer Next.js server routes / server actions for prototype simplicity.

Do not introduce a separate backend service unless genuinely required.

### Database

Supabase Postgres.

### File storage

Supabase Storage.

### AI

Anthropic API using the current Messages API, structured outputs, tool use, and document/vision capabilities.

Implement a provider abstraction so Anthropic is the primary provider and another provider can be added later without changing product logic. Keep model IDs configurable via environment variables; do not hardcode a model name that can become stale.

### Authentication

Minimal prototype auth.

A simple demo login is acceptable.

### API key architecture

Use **BYOK --- Bring Your Own Key**.

The buyer supplies an Anthropic API key in the prototype.

The raw key should be session-scoped and should not be persisted in
plaintext.

Do not expose the key in browser-side JavaScript after submission.

For the prototype, it is acceptable to maintain the key only for the
current session.

Clearly label this as prototype behavior.

------------------------------------------------------------------------

# 6. AI Architecture

There are three real AI loops.

## Loop 1 --- RFx Creation Copilot

``` text
Natural language requirement
        ↓
Intent extraction
        ↓
Clarification
        ↓
Draft RFx schema
        ↓
Buyer review
        ↓
Final RFx
```

## Loop 2 --- Vendor Response Intelligence

``` text
Vendor document
        ↓
Document understanding
        ↓
Structured extraction
        ↓
RFx line matching
        ↓
Normalization
        ↓
Validation
        ↓
Evidence
        ↓
Commercial Truth
```

## Loop 3 --- Decision Copilot

``` text
Natural language question
        ↓
Intent interpretation
        ↓
Tool selection
        ↓
Deterministic calculation / retrieval
        ↓
Evidence retrieval
        ↓
LLM explanation
        ↓
Answer
```

------------------------------------------------------------------------

# 7. AI Provider Abstraction

Create:

``` text
/lib/ai/
  provider.ts
  anthropic.ts
  prompts.ts
  schemas.ts
  tools.ts
  client.ts
```

Interface concept:

``` typescript
interface AIProvider {
  generateStructured<T>(params: StructuredGenerationParams): Promise<T>;
  generateText(params: TextGenerationParams): Promise<string>;
  runToolAgent(params: AgentParams): Promise<AgentResult>;
}
```

Do not couple application logic directly to the Anthropic SDK. All model calls must go through the AI provider interface.

### Anthropic implementation requirements

Use the official Anthropic TypeScript SDK on the server side. The implementation should support:

- Messages API for normal model interactions.
- Structured outputs for extraction and other schema-constrained results.
- Tool use for the Decision Copilot and any agentic workflows.
- PDF/document and image inputs for messy vendor responses.
- Adaptive reasoning/thinking only where it materially improves a difficult task; keep simple extraction calls efficient.
- Prompt caching as an optional optimization for repeated document-heavy analysis, not as a prerequisite for correctness.
- Streaming where it improves UX, but never stream partial commercial facts into the UI as if they were final.

Model selection:

- Keep the model ID in `ANTHROPIC_MODEL` (or equivalent configuration).
- Use one capable general-purpose Claude model for the first working prototype unless evaluation demonstrates a meaningful benefit from routing different tasks to different models.
- Do not build a multi-model router in Slice 1.
- Do not hardcode model names throughout the codebase.

Prompt design:

- Keep prompts versioned in `/lib/ai/prompts/`.
- Separate system instructions, RFx context, document evidence, tool definitions, and the buyer's question.
- Use structured delimiters/XML-style sections for large multi-document context.
- Include representative edge-case examples for extraction and normalization.
- Require the model to return explicit uncertainty/status fields rather than inventing missing values.

Important boundary:

> Claude interprets evidence. Deterministic application code calculates commercial truth.

Claude may extract a quoted value, identify a unit, map a vendor description to an RFx line, detect ambiguity, choose a tool, and explain a result. TypeScript code must perform arithmetic, currency/unit normalization, eligibility checks, award optimization, scenario calculations, and validation.

For document processing, preserve provenance at extraction time: document ID, filename, page/sheet, row/cell or region where available, source text, and extraction status. A model answer without evidence is not sufficient for a material commercial value.

------------------------------------------------------------------------

# 8. BYOK UX

On first login, show:

## Connect AI

Copy:

> **Connect your AI provider**
>
> RFx Intelligence uses your model provider for AI-powered extraction
> and analysis.
>
> Provider: Anthropic
>
> API key: `••••••••••••••••`
>
> Model: `[configured Anthropic model]`
>
> \[Test connection\]

After success:

> ✓ AI provider connected

Include a small note:

> Prototype mode: credentials are session-scoped and are not persisted.

Never show the raw key again.

Do not log the API key.

------------------------------------------------------------------------

# 9. Screen Architecture

Build exactly these primary screens:

1.  `/login`
2.  `/workspace`
3.  `/rfx/new`
4.  `/rfx/[id]/draft`
5.  `/rfx/[id]/responses`
6.  `/rfx/[id]/truth`
7.  `/rfx/[id]/decision`
8.  `/rfx/[id]/brief`
9.  `/settings`

The prototype should not have unnecessary screens.

------------------------------------------------------------------------

# 10. Design Direction

The interface should feel like a serious enterprise decision system.

Visual references:

-   Linear
-   Palantir
-   modern financial terminals
-   premium enterprise analytics products

Do NOT make it look like:

-   a generic ChatGPT wrapper
-   a dashboard template
-   a student hackathon project
-   a form-heavy procurement ERP

## Design language

-   dark graphite / off-white foundation
-   restrained accent color
-   compact typography
-   dense but readable tables
-   clear hierarchy
-   subtle borders
-   minimal shadows
-   high-quality empty states
-   strong hover states
-   keyboard-friendly interactions

Do not overuse gradients.

Do not put giant AI sparkles everywhere.

------------------------------------------------------------------------

# 11. Screen 1 --- Login / AI Setup

Route:

`/login`

UI:

``` text
RFx Intelligence

Turn messy vendor responses
into defensible sourcing decisions.

[ Continue as Procurement Buyer ]

────────────────────────

AI Provider

Anthropic

API Key
[••••••••••••••••••••]

Model
[Configured model ▾]

[ Test Connection ]

✓ Connected
```

For demo convenience, allow a "Demo Mode" only if it still uses the same
real AI pipeline with a preconfigured demo key supplied by the
environment.

Never hardcode a secret into source code.

------------------------------------------------------------------------

# 12. Screen 2 --- Workspace

Route:

`/workspace`

Show:

### Header

RFx Intelligence

### Active RFx

Corrugated Packaging --- FY27

Status:

`Draft / Responses / Analysis / Decision`

### KPI cards

-   5 Vendors
-   30 Line Items
-   ₹4.18 Cr Quoted
-   7 Issues
-   93% Evidence Coverage

### Recent activity

-   Vendor C response processed
-   3 commercial ambiguities detected
-   RFx draft updated
-   Decision scenario created

Primary CTA:

**Create RFx with AI**

------------------------------------------------------------------------

# 13. Screen 3 --- AI RFx Creation

Route:

`/rfx/new`

This is a conversational experience, not a conventional form.

## Initial state

Title:

**What are you buying?**

Prompt:

> Tell me what you need in your own words. I'll turn it into an RFx.

Example:

> We need corrugated packaging for 12 plants across India. Around 30
> SKUs. We want quotes from five vendors.

The AI should respond conversationally.

Example:

> Got it. I can draft this RFx.
>
> Before I generate it, I need to clarify three things:
>
> **1. Pricing basis** Should vendors quote per piece?
>
> **2. Delivery** Should pricing include freight to your plants?
>
> **3. Payment terms** Should we use 60-day payment terms?

Render suggested answer chips:

-   Per piece
-   Per 100 pieces
-   Freight included
-   Freight extra
-   30 days
-   45 days
-   60 days

The buyer can type freely.

------------------------------------------------------------------------

# 14. RFx Copilot State Machine

Maintain:

``` typescript
type RFxCreationState =
  | "DISCOVERY"
  | "CLARIFYING"
  | "DRAFTING"
  | "REVIEW"
  | "APPROVED";
```

The copilot should not ask redundant questions.

Track known information:

``` typescript
interface RFxContext {
  category?: string;
  geography?: string;
  lineItems?: LineItem[];
  expectedVendorCount?: number;
  pricingBasis?: string;
  currency?: string;
  deliveryTerms?: string;
  paymentTerms?: string;
  quoteValidity?: string;
  questionnaire?: QuestionnaireQuestion[];
  attachments?: string[];
}
```

------------------------------------------------------------------------

# 15. RFx Draft Generation

The AI should produce structured output, not arbitrary markdown.

Schema:

``` typescript
interface RFxDraft {
  title: string;
  category: string;
  objective: string;
  scope: string;
  geography?: string;
  lineItems: LineItem[];
  questionnaire: QuestionnaireQuestion[];
  commercialTerms: CommercialTerms;
  evaluationCriteria: EvaluationCriteria[];
  assumptions: Assumption[];
  unresolvedQuestions: Clarification[];
}
```

## Line item

``` typescript
interface LineItem {
  id: string;
  skuCode: string;
  description: string;
  specifications: Record<string, string>;
  quantity: number;
  unit: string;
  currency?: string;
  requiredBy?: string;
  notes?: string;
}
```

## Questionnaire

``` typescript
interface QuestionnaireQuestion {
  id: string;
  question: string;
  type: "yes_no" | "text" | "number" | "single_select" | "multi_select";
  required: boolean;
  mandatoryForEligibility: boolean;
  options?: string[];
}
```

------------------------------------------------------------------------

# 16. RFx Review Screen

Once generated, show a draft.

Header:

**Corrugated Packaging --- FY27**

Tabs:

-   Scope
-   Line Items
-   Questionnaire
-   Commercial Terms
-   Evaluation

The AI-generated content is editable.

Every section should have:

**Edit**

and optionally:

**Ask AI**

Example:

> "Add a question about monthly production capacity."

The AI updates the questionnaire and explains the change.

------------------------------------------------------------------------

# 17. RFx Sending

Do not build real SMTP.

Use a simulated vendor dispatch screen.

``` text
Send RFx

Vendor A     ✓ Ready
Vendor B     ✓ Ready
Vendor C     ✓ Ready
Vendor D     ✓ Ready
Vendor E     ✓ Ready

[ Send RFx ]
```

On click:

``` text
RFx sent to 5 vendors

Responses expected over the next 9 days.

[ View Responses ]
```

The UI should feel real.

------------------------------------------------------------------------

# 18. Vendor Response Intake

Route:

`/rfx/[id]/responses`

Show five vendor cards.

Example:

``` text
Vendor A
Response received
Excel
30/30 lines
✓ Processed

Vendor B
Response received
PDF
27/30 lines
⚠ 3 missing

Vendor C
Response received
Excel + Email
30/30 lines
⚠ Quality exception

Vendor D
Response received
Scanned PDF
29/30 lines
⚠ OCR review

Vendor E
Response received
Image
28/30 lines
⚠ Currency ambiguity
```

Each vendor can be opened.

------------------------------------------------------------------------

# 19. Seed Dataset

Use **corrugated packaging** as the demo category.

Create exactly:

-   5 vendors
-   30 line items
-   questionnaire
-   commercial terms
-   supporting documents

The dataset should be believable.

## Vendor profiles

### Vendor A --- PackRight Industries

-   clean Excel
-   30/30 lines
-   INR
-   all questionnaire requirements passed
-   medium pricing
-   clean commercial terms

### Vendor B --- BoxWorks India

-   PDF
-   27/30 lines
-   some prices per box
-   missing pack sizes
-   quality passed

### Vendor C --- CorrugateCo

-   Excel + email
-   30/30 lines
-   lowest prices
-   mandatory quality exception
-   email contains a commercial correction

### Vendor D --- PrimePack

-   scanned PDF
-   29/30 lines
-   freight terms buried in footer
-   some OCR challenges

### Vendor E --- GlobalPack

-   photographed rate card
-   28/30 lines
-   some USD pricing
-   handwritten correction
-   unclear freight treatment

------------------------------------------------------------------------

# 20. Vendor Response File Fixtures

Create realistic fixture files.

Directory:

``` text
/fixtures/vendors/

vendor-a/
  quotation.xlsx
  questionnaire.pdf
  terms.pdf

vendor-b/
  quotation.pdf
  questionnaire.docx

vendor-c/
  quotation.xlsx
  commercial-email.txt
  questionnaire.pdf

vendor-d/
  scanned-quotation.pdf
  questionnaire.pdf

vendor-e/
  photographed-rate-card.jpg
  questionnaire.pdf
```

Do not simply create five perfect JSON files and pretend they are
documents.

The extraction pipeline must consume the actual fixture formats.

------------------------------------------------------------------------

# 21. Document Ingestion

Create:

``` text
/lib/documents/
  classify.ts
  extract-text.ts
  extract-tables.ts
  extract-images.ts
  chunk.ts
```

Supported:

-   `.xlsx`
-   `.pdf`
-   `.docx`
-   `.jpg`
-   `.jpeg`
-   `.png`
-   `.txt`

For spreadsheets:

-   preserve sheet name
-   preserve row/column context

For PDFs:

-   preserve page number

For images:

-   preserve image metadata
-   send image to multimodal model

For DOCX:

-   preserve paragraph/table structure

------------------------------------------------------------------------

# 22. Extraction Schema

Every extracted commercial quote should follow:

``` typescript
interface ExtractedQuote {
  vendorId: string;
  rfqLineId?: string;
  sourceDocumentId: string;

  rawDescription?: string;

  quotedPrice?: number;
  currency?: string;
  quotedUnit?: string;

  quantityBasis?: number;
  quantityBasisUnit?: string;

  freight?: {
    included: boolean | null;
    amount?: number;
    currency?: string;
    basis?: string;
  };

  taxes?: {
    included: boolean | null;
    rate?: number;
  };

  leadTimeDays?: number;
  moq?: number;

  confidence: ConfidenceState;

  evidence: EvidenceReference[];

  issues: ExtractionIssue[];
}
```

------------------------------------------------------------------------

# 23. Evidence Model

Every important extracted value must have evidence.

``` typescript
interface EvidenceReference {
  documentId: string;
  documentName: string;
  page?: number;
  sheet?: string;
  row?: number;
  column?: string;
  sourceText?: string;
  sourceRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

The UI should be able to show:

> ₹4,200 / 100 pieces

Source:

> Vendor A --- quotation.xlsx --- Pricing --- Row 12

------------------------------------------------------------------------

# 24. RFx Line Matching

Vendor descriptions will not exactly match RFx descriptions.

The AI should map them.

Example:

RFx:

> 5-ply corrugated box --- 600 × 400 × 300 mm

Vendor:

> 5 layer carton 600x400x300

AI:

``` text
MATCH
Confidence: 97%

Reason:
- 5-ply ≈ 5-layer
- dimensions identical
- packaging category compatible
```

If the match is uncertain:

``` text
REVIEW REQUIRED

Potential matches:
Line 014 — 63%
Line 019 — 58%
```

Do not silently assign.

------------------------------------------------------------------------

# 25. Normalization Engine

Create:

``` text
/lib/pricing/
  normalize.ts
  currency.ts
  units.ts
  totals.ts
  eligibility.ts
  scenarios.ts
  optimization.ts
```

Examples:

### Per 100 pieces

``` text
₹4,200 / 100 pieces
→ ₹42 / piece
```

### Per box

If pack size is known:

``` text
₹1,200 / box
12 pieces / box
→ ₹100 / piece
```

If pack size is unknown:

``` text
₹1,200 / box
Pack size: unknown

→ BLOCKED
```

Never invent pack size.

------------------------------------------------------------------------

# 26. Currency Normalization

For the prototype, define a fixed FX table so calculations are
deterministic.

Example:

``` typescript
const FX = {
  INR: 1,
  USD: 84.5
};
```

Label clearly:

> Prototype FX rate --- not live market data.

If vendor quotes USD:

``` text
$1.20 / piece
× ₹84.50
= ₹101.40 / piece
```

Evidence must retain the original USD quote.

------------------------------------------------------------------------

# 27. Freight Normalization

Represent freight separately.

``` typescript
interface Freight {
  status: "INCLUDED" | "EXTRA" | "UNKNOWN";
  amount?: number;
  currency?: string;
  basis?: string;
}
```

Do not assume "freight extra" means a particular amount.

If unknown:

``` text
LANDED COST: UNRESOLVED
```

------------------------------------------------------------------------

# 28. Commercial Truth Data Model

Canonical record:

``` typescript
interface CommercialTruthRecord {
  rfqLineId: string;
  vendorId: string;

  quotedValue: {
    amount: number;
    currency: string;
    unit: string;
  };

  normalizedValue?: {
    amount: number;
    currency: string;
    unit: string;
  };

  freight: Freight;

  eligibility: {
    eligible: boolean;
    reasons: string[];
  };

  confidence: ConfidenceState;

  issues: CommercialIssue[];

  evidence: EvidenceReference[];
}
```

------------------------------------------------------------------------

# 29. Confidence Model

Do not use only numerical confidence.

Use:

``` typescript
type ConfidenceState =
  | "VERIFIED"
  | "INFERRED"
  | "REVIEW_REQUIRED"
  | "BLOCKED"
  | "CONFLICT";
```

## VERIFIED

Directly supported by source and safely normalized.

## INFERRED

LLM made a semantic interpretation that is plausible but not explicit.

## REVIEW_REQUIRED

A human should confirm before the value is used in an award.

## BLOCKED

Insufficient information to normalize.

## CONFLICT

Multiple sources contradict each other.

------------------------------------------------------------------------

# 30. Commercial Truth UI

Route:

`/rfx/[id]/truth`

Header:

``` text
Commercial Truth

5 vendors · 30 lines · 143 extracted quotes

₹4.18 Cr total quoted value

7 issues require attention
```

KPI strip:

-   Vendors
-   Lines
-   Quoted values
-   Evidence coverage
-   Review issues

------------------------------------------------------------------------

# 31. Comparison Table

Columns:

-   Line
-   Requirement
-   Qty
-   Vendor A
-   Vendor B
-   Vendor C
-   Vendor D
-   Vendor E

Cells should show:

-   normalized price
-   confidence indicator
-   issue indicator

Example:

``` text
₹42.00
✓
```

or:

``` text
₹1,250 / box
⚠
```

Hover should show a concise explanation.

Click opens the evidence drawer.

------------------------------------------------------------------------

# 32. Evidence Drawer

Drawer sections:

### Value

₹42 / piece

### Original

₹4,200 / 100 pieces

### Normalization

₹4,200 ÷ 100 = ₹42

### Source

Vendor A\
quotation.xlsx\
Pricing\
Row 12

### Confidence

VERIFIED

### Source evidence

Show the original extracted text.

Button:

**Open source**

For PDFs/images, show the relevant page/image where possible.

------------------------------------------------------------------------

# 33. Exception Center

Create an exceptions panel.

Categories:

-   Missing lines
-   Unit mismatch
-   Currency mismatch
-   Missing pack size
-   Conflicting prices
-   Freight ambiguity
-   Questionnaire failure
-   Low extraction confidence

Example:

``` text
7 issues

3 normalization
2 questionnaire
1 missing line
1 commercial conflict
```

Clicking an issue should take the buyer directly to the relevant
evidence.

------------------------------------------------------------------------

# 34. Questionnaire Intelligence

Questionnaire responses must sit alongside commercial data.

Example:

``` text
Vendor C

Quality questionnaire

✓ ISO certification
✓ Plant capacity
✕ Required quality certification
✓ Customer references
```

Eligibility rules should be explicit.

Example:

``` text
IF mandatory questionnaire answer fails
THEN vendor is ineligible for award
```

The AI can explain this but code enforces it.

------------------------------------------------------------------------

# 35. Decision Copilot

Route:

`/rfx/[id]/decision`

Layout:

### Left

Decision summary.

### Center

Charts / award scenarios.

### Right

AI conversation.

Suggested prompts:

-   Cheapest eligible vendor?
-   Cheapest split award?
-   Compare top 3 vendors.
-   What assumptions are unresolved?
-   Show evidence behind the award.
-   What changes if freight rises 5%?
-   What if Vendor C passes quality?
-   Generate award brief.

------------------------------------------------------------------------

# 36. Decision Agent Tools

Implement these tools.

## `get_rfx_context`

Returns:

-   RFx
-   requirements
-   terms
-   questionnaire rules

## `get_vendor_summary`

Returns vendor-level status.

## `get_commercial_truth`

Returns normalized quotes.

## `get_exceptions`

Returns unresolved issues.

## `get_evidence`

Retrieves source evidence.

## `calculate_single_vendor_award`

Input:

``` typescript
{
  eligibleOnly: boolean;
  vendorId?: string;
}
```

## `calculate_split_award`

Input:

``` typescript
{
  eligibilityRule: string;
  includeFreight: boolean;
}
```

## `calculate_scenario`

Input:

``` typescript
{
  freightAdjustmentPercent?: number;
  fxAdjustmentPercent?: number;
  excludedVendors?: string[];
  requiredQuestionnaireRules?: string[];
}
```

## `compare_scenarios`

Input:

``` typescript
{
  scenarioIds: string[];
}
```

## `generate_award_brief`

Input:

``` typescript
{
  scenarioId: string;
}
```

------------------------------------------------------------------------

# 37. Award Calculation

## Single vendor

For each eligible vendor:

``` text
sum(normalized_price × RFx_quantity)
+
known freight
```

Only lines with valid comparable pricing count toward the fully
comparable total.

If a vendor misses a mandatory line:

``` text
Vendor cannot be considered for complete single-vendor award
```

Do not silently substitute zero.

------------------------------------------------------------------------

# 38. Split Award

For each RFx line:

1.  Filter eligible vendors.
2.  Filter comparable/valid quotes.
3.  Select lowest valid normalized landed price.
4.  Record vendor.
5.  Sum selected values.

If a line cannot be safely compared:

``` text
Award optimization blocked for this line.
```

The system should report incomplete optimization rather than pretending
it solved the entire award.

------------------------------------------------------------------------

# 39. Scenario Engine

Support:

### Scenario A

Baseline.

### Scenario B

Exclude a vendor.

### Scenario C

Freight +5%.

### Scenario D

USD/INR +3%.

### Scenario E

Require all mandatory questionnaire criteria.

### Scenario F

Single-vendor award.

### Scenario G

Split award.

Each scenario should produce:

``` typescript
interface AwardScenario {
  id: string;
  name: string;
  assumptions: Assumption[];
  totalCost?: number;
  savingsVsBaseline?: number;
  allocation: AwardAllocation[];
  unresolvedIssues: CommercialIssue[];
}
```

------------------------------------------------------------------------

# 40. Natural Language Answer Format

Answers should be concise but evidence-rich.

Example:

> **Cheapest eligible split award: ₹3.71 Cr**
>
> This is ₹34.2L below the Vendor A baseline.
>
> **Allocation** - Vendor C --- 11 lines - Vendor A --- 8 lines - Vendor
> D --- 7 lines - Vendor E --- 4 lines
>
> **Before acting** - 2 lines have unresolved commercial terms. - Vendor
> C's quality exception must be resolved. - 3 values rely on inferred
> normalization.
>
> \[View calculation\] \[View evidence\]

Never invent certainty.

------------------------------------------------------------------------

# 41. "What could make this wrong?" Prompt

This should be one of the best demo interactions.

The agent should inspect:

-   unresolved values
-   inferred mappings
-   missing lines
-   questionnaire exceptions
-   FX assumptions
-   freight assumptions
-   conflicting documents

Then return:

``` text
3 things could materially change this award:

1. Vendor C's quality exception
   Impact: 11 lines

2. Vendor B's pack-size ambiguity
   Impact: 2 lines

3. Vendor E's freight treatment
   Impact: ₹4.8L estimated exposure
```

If the exact financial impact cannot be computed safely, say so.

------------------------------------------------------------------------

# 42. Decision Brief

Route:

`/rfx/[id]/brief`

Generate:

# Award Decision Brief

## Executive summary

Recommended scenario:

**Split award**

Total:

**₹3.71 Cr**

Savings vs baseline:

**₹34.2L**

## Allocation

  Vendor       Lines      Value
  ---------- ------- ----------
  Vendor C        11   ₹1.24 Cr
  Vendor A         8   ₹0.98 Cr
  Vendor D         7   ₹0.91 Cr
  Vendor E         4   ₹0.58 Cr

## Eligibility

5 evaluated\
4 eligible\
1 excluded

## Open issues

-   2 commercial ambiguities
-   1 questionnaire exception
-   3 inferred values

## Evidence coverage

93% of award value directly supported by source evidence.

## Approval

\[Approve Scenario\]

\[Review Exceptions\]

------------------------------------------------------------------------

# 43. Export

Support:

### CSV

Normalized comparison.

### XLSX

Comparison matrix + exceptions + questionnaire.

### PDF

Decision brief.

For prototype, export can be generated server-side.

------------------------------------------------------------------------

# 44. Prompt Architecture

Store prompts separately.

``` text
/lib/ai/prompts/
  rfx-system.ts
  rfx-clarification.ts
  rfx-draft.ts
  extraction.ts
  line-matching.ts
  normalization-review.ts
  decision-agent.ts
  award-brief.ts
```

Never bury large prompts inside UI components.

------------------------------------------------------------------------

# 45. RFx Copilot System Prompt --- Behavioral Requirements

The RFx copilot must:

-   understand the buyer's objective;
-   identify missing information;
-   ask only materially useful questions;
-   avoid asking questions already answered;
-   generate structured RFx data;
-   explain important assumptions;
-   flag ambiguity;
-   never invent vendor requirements as facts;
-   distinguish buyer-provided facts from AI suggestions;
-   produce a draft that can be edited by the buyer.

The copilot should prefer:

> "Should freight be included?"

over:

> "Please provide freight inclusion/exclusion terms, delivery
> destination, Incoterms, freight carrier, freight basis..."

Do not overwhelm the buyer.

------------------------------------------------------------------------

# 46. Extraction Prompt --- Behavioral Requirements

The extraction model must:

-   extract only information supported by the document;
-   preserve original wording;
-   identify units;
-   identify currencies;
-   identify price bases;
-   identify freight;
-   identify taxes;
-   identify MOQ;
-   identify lead times;
-   identify questionnaire answers;
-   attach source evidence;
-   flag uncertainty;
-   never fabricate missing values.

If a value is not found:

``` json
{
  "value": null,
  "status": "NOT_FOUND"
}
```

Do not return zero.

------------------------------------------------------------------------

# 47. Decision Agent Prompt --- Behavioral Requirements

The decision agent must:

-   use tools for calculations;
-   never perform financial arithmetic mentally;
-   distinguish quoted from normalized values;
-   disclose assumptions;
-   surface unresolved issues;
-   cite evidence;
-   never claim an award is safe when material uncertainty remains;
-   answer directly before explaining;
-   keep responses concise.

------------------------------------------------------------------------

# 48. Structured Output Requirement

Every AI extraction call should request strict structured output.

Do not parse fragile natural-language output.

Use schemas equivalent to:

``` typescript
z.object({
  vendor: z.string(),
  quotes: z.array(...),
  questionnaire: z.array(...),
  issues: z.array(...)
})
```

Validate every response.

If schema validation fails:

1.  retry once with corrective context;
2.  if still invalid, mark extraction as failed;
3.  surface the failure.

Do not silently accept malformed data.

------------------------------------------------------------------------

# 49. AI Failure Handling

Every AI operation needs a visible state.

States:

``` text
QUEUED
PROCESSING
COMPLETED
PARTIAL
REVIEW_REQUIRED
FAILED
```

Example:

> Vendor D extraction completed with 2 review items.

Not:

> Success ✓

when the extraction is incomplete.

------------------------------------------------------------------------

# 50. Demo Mode

Provide a preloaded RFx:

**Corrugated Packaging --- FY27**

with all 5 vendors.

The demo should open directly to the workspace after setup.

A "Reset Demo" button should restore the original fixture dataset.

This is critical for interview reliability.

------------------------------------------------------------------------

# 51. Demo Script

The live demo should follow this sequence.

## Scene 1 --- Create

Start from:

> "We need corrugated packaging for 12 plants across India..."

Use the RFx copilot.

Generate the RFx.

Show:

-   scope
-   30 lines
-   questionnaire
-   terms

## Scene 2 --- Vendor chaos

Open Responses.

Show five formats.

Highlight:

-   Excel
-   PDF
-   image
-   email
-   missing lines

## Scene 3 --- Commercial Truth

Open comparison.

Click a verified quote.

Show evidence.

Then click an ambiguous quote.

Show:

> Cannot compare yet.

## Scene 4 --- Decision

Ask:

> What's the cheapest eligible single-vendor award?

Then:

> What's the cheapest split award?

Then:

> What could make this recommendation wrong?

## Scene 5 --- Scenario

Ask:

> What happens if freight increases 5%?

Show changed allocation/cost.

## Scene 6 --- Brief

Generate:

> "Create a decision brief for my VP."

Export PDF.

------------------------------------------------------------------------

# 52. Acceptance Tests

The prototype is not complete until these work.

## RFx creation

-   [ ] Buyer can start with natural language.
-   [ ] AI asks relevant clarification questions.
-   [ ] AI avoids redundant questions.
-   [ ] AI generates structured RFx.
-   [ ] RFx contains 30 line items.
-   [ ] RFx contains questionnaire.
-   [ ] RFx contains commercial terms.
-   [ ] Buyer can edit generated content.
-   [ ] Buyer can ask AI to modify the draft.

## Vendor ingestion

-   [ ] Excel ingests.
-   [ ] PDF ingests.
-   [ ] DOCX ingests.
-   [ ] Image ingests.
-   [ ] Email text ingests.
-   [ ] Vendor identity is retained.
-   [ ] Source metadata is retained.

## Extraction

-   [ ] Quotes extracted.
-   [ ] Units extracted.
-   [ ] Currency extracted.
-   [ ] Freight extracted.
-   [ ] Questionnaire extracted.
-   [ ] Missing values remain missing.
-   [ ] Evidence is attached.

## Normalization

-   [ ] per-100 conversion works.
-   [ ] per-box conversion works when pack size exists.
-   [ ] per-box remains blocked when pack size is missing.
-   [ ] USD conversion works.
-   [ ] Freight is not silently assumed.
-   [ ] Conflicts are visible.

## Decision

-   [ ] Single-vendor calculation works.
-   [ ] Split award works.
-   [ ] Eligibility filtering works.
-   [ ] Scenario calculation works.
-   [ ] Natural-language tool selection works.
-   [ ] Answers contain evidence.
-   [ ] Unsupported conclusions are not generated.

## Export

-   [ ] CSV works.
-   [ ] XLSX works.
-   [ ] PDF brief works.

------------------------------------------------------------------------

# 53. Explicit Anti-Patterns

Do NOT build:

### Fake AI

``` typescript
if (question.includes("cheapest")) {
  return vendorC;
}
```

Absolutely prohibited.

### Fake extraction

Do not seed the database with final normalized values and merely animate
"AI processing."

The AI must actually process the fixture documents.

### LLM arithmetic

Do not ask the LLM to calculate award totals.

### Silent normalization

Never transform:

> ₹1,250 / box

into:

> ₹104 / piece

unless pack size is actually known.

### Fake confidence

Do not display arbitrary:

> 98% confidence

unless confidence has a defensible basis.

### Overbuilt infrastructure

Do not spend the assignment building:

-   production email delivery
-   ERP connectors
-   enterprise auth
-   billing
-   vendor portals
-   microservices

------------------------------------------------------------------------

# 54. Observability

For the prototype, log:

-   AI operation
-   model
-   timestamp
-   duration
-   success/failure
-   token usage if available
-   tool called
-   tool result status

Never log:

-   API keys
-   sensitive document contents unnecessarily
-   full prompts containing secrets

Add a developer-only debug panel if useful.

------------------------------------------------------------------------

# 55. Cost Control

Because the prototype uses BYOK and document processing can be token-intensive, the application should still avoid unnecessary calls.

Rules:

1.  Extract a document once.
2.  Persist extraction results.
3.  Do not re-extract on every page load.
4.  Do not send the full source document to the LLM for every chat
    question.
5.  Store normalized structured data.
6.  Use tool calls for analytical questions.
7.  Use cheaper models for extraction where appropriate.
8.  Use stronger reasoning only where needed.
9.  Cache reusable document context where supported and useful, but never depend on caching for correctness.
10. Prefer structured extraction once, then query the persisted structured truth rather than repeatedly sending the raw document.

Architecture:

``` text
Document
   ↓
ONE extraction
   ↓
Structured data
   ↓
Database
   ↓
Many cheap deterministic queries
```

------------------------------------------------------------------------

# 56. Folder Structure

Use approximately:

``` text
app/
  login/
  workspace/
  rfx/
    new/
    [id]/
      draft/
      responses/
      truth/
      decision/
      brief/
  settings/

components/
  ai/
    ai-chat.tsx
    ai-message.tsx
    ai-thinking.tsx
  rfx/
    rfx-draft.tsx
    line-item-table.tsx
    questionnaire.tsx
  vendors/
    vendor-card.tsx
    response-status.tsx
  truth/
    truth-table.tsx
    evidence-drawer.tsx
    issue-panel.tsx
    confidence-badge.tsx
  decision/
    decision-chat.tsx
    scenario-builder.tsx
    award-table.tsx
    savings-chart.tsx
  brief/
    decision-brief.tsx

lib/
  ai/
  documents/
  pricing/
  tools/
  db/
  validation/
  exports/

data/
  seed/
  fixtures/

types/
  rfx.ts
  vendor.ts
  quote.ts
  evidence.ts
  decision.ts
```

------------------------------------------------------------------------

# 57. Database Schema

Minimum tables:

``` text
users
rfqs
rfq_line_items
questionnaire_questions
vendors
vendor_responses
documents
extraction_runs
vendor_quotes
questionnaire_answers
evidence
commercial_issues
award_scenarios
award_allocations
chat_sessions
chat_messages
```

Use foreign keys.

Do not duplicate canonical commercial data unnecessarily.

------------------------------------------------------------------------

# 58. Seed Data Requirements

Generate:

-   30 line items
-   realistic quantities
-   realistic dimensions
-   realistic packaging descriptions
-   realistic vendor pricing
-   realistic questionnaire responses
-   realistic freight terms
-   realistic delivery lead times

Make the numerical relationships internally consistent.

The demo should have a meaningful but not absurd spread in vendor
pricing.

------------------------------------------------------------------------

# 59. Intentional Edge Cases

The seed dataset MUST include:

1.  Missing line.
2.  Per-box price with known pack size.
3.  Per-box price without pack size.
4.  USD quote.
5.  Freight included.
6.  Freight extra.
7.  Freight ambiguous.
8.  Contradictory email vs PDF.
9.  Questionnaire failure.
10. OCR challenge.
11. Vendor description mismatch.
12. Handwritten correction.
13. One vendor quoting 27/30 lines.
14. One vendor with 28/30.
15. One vendor with 29/30.

These are deliberate demo cases.

------------------------------------------------------------------------

# 60. Product Metrics Shown in UI

Use:

### Response coverage

``` text
143 / 150 expected quotes
```

### Evidence coverage

``` text
93%
```

Meaning:

> percentage of comparable commercial value supported by direct source
> evidence.

### Review queue

``` text
7 issues
```

### Vendor eligibility

``` text
4 / 5 eligible
```

### Potential savings

Only show if calculated deterministically.

------------------------------------------------------------------------

# 61. Trust UX

For every AI-generated decision, show a small:

**Why?**

drawer.

Example:

> **Why is Vendor C excluded?**
>
> Vendor C failed mandatory quality question Q4.
>
> Source: Vendor C questionnaire.pdf --- Page 3
>
> \[Open evidence\]

This is one of the strongest trust mechanisms in the prototype.

------------------------------------------------------------------------

# 62. AI Activity Indicator

During AI operations, show meaningful progress.

Bad:

> Thinking...

Better:

``` text
Analyzing Vendor D

✓ Reading document
✓ Identifying tables
✓ Matching 29 line items
→ Checking commercial terms
○ Building evidence
```

For RFx creation:

``` text
Understanding requirement
✓
Clarifying scope
✓
Drafting line items
✓
Creating questionnaire
→
Preparing commercial terms
```

Do not fake progress if possible; use actual pipeline states.

------------------------------------------------------------------------

# 63. Performance

Target:

-   initial page load \< 2.5s where practical
-   table interaction instant
-   no full-page reloads
-   extraction can be asynchronous
-   chat response streaming preferred
-   optimistic UI only where safe

Do not block the whole application while processing five documents.

------------------------------------------------------------------------

# 64. Security

Even though this is a prototype:

-   never expose API key to client after submission;
-   never commit `.env` secrets;
-   add `.env.local` to gitignore;
-   validate uploaded file types;
-   cap upload size;
-   sanitize filenames;
-   do not execute uploaded files;
-   use server-side AI calls;
-   avoid logging sensitive document contents.

------------------------------------------------------------------------

# 65. Accessibility

Minimum:

-   keyboard navigation
-   visible focus states
-   sufficient contrast
-   semantic buttons
-   tooltips for icon-only actions
-   screen-reader labels for important controls

------------------------------------------------------------------------

# 66. Empty / Loading / Error States

Every important screen needs:

### Empty

> No vendor responses yet.

### Loading

> Processing 5 vendor responses...

### Partial

> 4 of 5 responses processed. Vendor D needs review.

### Error

> Vendor D could not be fully processed.
>
> 27 of 30 lines were extracted.
>
> \[Review extraction\]

Never show blank screens.

------------------------------------------------------------------------

# 67. What We Deliberately Leave Out

Document this in the final one-page product note.

Excluded from prototype:

-   real vendor authentication
-   production email delivery
-   ERP integration
-   enterprise SSO
-   billing
-   production RBAC
-   vendor portal
-   live FX
-   live market data
-   production-scale document storage
-   procurement approval workflows

Reason:

> The prototype prioritizes the core AI loops and decision-confidence
> experience over infrastructure plumbing.

------------------------------------------------------------------------

# 68. Final Product Story

The final interview narrative should be:

> **I started with their stated problem: procurement teams manually
> consolidate messy supplier responses.**
>
> **But while building it, I found that extraction wasn't the deepest
> problem.**
>
> **The real problem is establishing a trusted commercial truth layer
> between supplier documents and a high-stakes award decision.**
>
> So I built three AI loops:
>
> 1.  **Create the RFx**
> 2.  **Understand and normalize vendor responses**
> 3.  **Interrogate and simulate the resulting commercial truth**
>
> And I made uncertainty explicit rather than hiding it.

------------------------------------------------------------------------

# 69. Definition of Done

The product is ready for the live interview when a fresh user can:

1.  Log in.
2.  Connect an Anthropic API key.
3.  Create an RFx entirely through conversation.
4.  Generate 30 line items.
5.  Generate a questionnaire.
6.  Review the RFx.
7.  Simulate sending it to five vendors.
8.  Process five messy vendor responses.
9.  See the normalized comparison.
10. Click any important number and see its source.
11. See unresolved ambiguities.
12. Ask natural-language questions.
13. Get deterministic award calculations.
14. Run scenarios.
15. Ask why the recommendation could be wrong.
16. Generate a decision brief.
17. Export the result.
18. Reset the demo.

No hardcoded answers to the demo questions.

No fake extraction.

No fake reasoning.

No silent assumptions.

------------------------------------------------------------------------

# 70. Claude Code Operating Instructions

You are the principal engineer implementing this product.

## Build philosophy

Do not attempt to generate the entire application in one uncontrolled
pass.

Build in vertical slices.

### Slice 1

Foundation:

-   Next.js
-   TypeScript
-   styling
-   routing
-   database
-   environment configuration
-   basic shell

### Slice 2

AI RFx Copilot:

-   chat
-   context state
-   structured RFx generation
-   draft review
-   editing

### Slice 3

Seed dataset + vendor response fixtures.

### Slice 4

Document ingestion + extraction.

### Slice 5

Commercial Truth.

### Slice 6

Deterministic pricing/award engine.

### Slice 7

Decision Copilot.

### Slice 8

Decision brief + export.

### Slice 9

Polish + demo reliability.

After every slice:

1.  run typecheck;
2.  run lint;
3.  run tests;
4.  manually verify the critical flow;
5.  fix errors before proceeding.

Do not leave the project in a broken intermediate state.

------------------------------------------------------------------------

# 71. Claude Code Rules

### Rule 1

Read the existing code before changing it.

### Rule 2

Do not rewrite working components unnecessarily.

### Rule 3

Prefer small composable components.

### Rule 4

Keep AI prompts versioned and separate.

### Rule 5

Keep deterministic business logic independent from UI.

### Rule 6

Keep the database as the source of truth.

### Rule 7

Never hardcode the final answer to a demo question.

### Rule 8

Never hide uncertainty.

### Rule 9

Do not create fake loading animations that imply AI work that did not
occur.

### Rule 10

If a feature cannot be implemented robustly within prototype scope, stub
the infrastructure but keep the AI/product behavior real.

------------------------------------------------------------------------

# 72. Claude Code First Task

Before writing application code:

1.  Inspect the repository.
2.  Create a concise implementation plan.
3.  Create/update `README.md`.
4.  Create/update `.env.example`.
5.  Create the folder structure.
6.  Define the TypeScript domain types.
7.  Define the database schema/migrations.
8.  Define the AI provider interface.
9.  Define the tool interfaces.
10. Implement the application shell.
11. Run validation.
12. Only then begin Slice 2.

Do not build all screens as static mocks first.

The application should become functional incrementally.

------------------------------------------------------------------------

# 73. Quality Bar

The final prototype should make an experienced product leader think:

> "This person understands procurement, AI reliability, decision
> systems, and enterprise UX."

It should NOT make them think:

> "This is a nice ChatGPT wrapper."

The winning characteristics are:

-   excellent information hierarchy
-   real AI behavior
-   real messy-document extraction
-   deterministic calculations
-   evidence everywhere
-   explicit uncertainty
-   strong scenario analysis
-   concise decision UX
-   polished demo flow

------------------------------------------------------------------------

# 74. Final North Star

The product should answer one question exceptionally well:

> **"Can I trust this system enough to use it to make and defend a
> sourcing decision?"**

Everything in the prototype should contribute to answering that
question.
