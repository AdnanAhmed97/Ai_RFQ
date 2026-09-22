-- ---------------------------------------------------------------------------
-- RFx Intelligence — initial schema
--
-- Design notes:
--   * The database is the source of truth. Extraction runs once and is
--     persisted; every later query is deterministic and cheap (spec §55).
--   * Commercial values are stored at BOTH layers: vendor_quotes holds what the
--     document said, commercial_truth holds what is safely comparable. The raw
--     layer is never overwritten, so evidence survives re-normalization.
--   * Money uses numeric, never float. Unit prices carry 6 decimal places so a
--     per-100 or per-box division does not lose precision before aggregation.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --- Enumerations ----------------------------------------------------------

create type confidence_state as enum (
  'VERIFIED', 'INFERRED', 'REVIEW_REQUIRED', 'BLOCKED', 'CONFLICT'
);

create type ai_operation_status as enum (
  'QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'REVIEW_REQUIRED', 'FAILED'
);

create type rfx_status as enum (
  'DRAFT', 'SENT', 'RESPONSES', 'ANALYSIS', 'DECISION', 'AWARDED'
);

create type rfx_creation_state as enum (
  'DISCOVERY', 'CLARIFYING', 'DRAFTING', 'REVIEW', 'APPROVED'
);

create type question_type as enum (
  'yes_no', 'text', 'number', 'single_select', 'multi_select'
);

create type document_kind as enum ('XLSX', 'PDF', 'DOCX', 'IMAGE', 'TEXT');

create type freight_status as enum ('INCLUDED', 'EXTRA', 'UNKNOWN');

create type match_status as enum ('MATCHED', 'REVIEW_REQUIRED', 'UNMATCHED');

create type issue_category as enum (
  'MISSING_LINE', 'UNIT_MISMATCH', 'CURRENCY_MISMATCH', 'MISSING_PACK_SIZE',
  'CONFLICTING_PRICE', 'FREIGHT_AMBIGUITY', 'QUESTIONNAIRE_FAILURE',
  'LOW_EXTRACTION_CONFIDENCE', 'UNMATCHED_LINE'
);

create type issue_severity as enum ('BLOCKER', 'WARNING', 'INFO');

create type scenario_kind as enum (
  'BASELINE', 'SINGLE_VENDOR', 'SPLIT', 'EXCLUDE_VENDOR',
  'FREIGHT_SHIFT', 'FX_SHIFT', 'STRICT_ELIGIBILITY', 'CUSTOM'
);

create type chat_surface as enum ('RFX_COPILOT', 'DECISION_COPILOT');

create type chat_role as enum ('user', 'assistant', 'tool');

create type response_channel as enum ('EMAIL', 'UPLOAD');

-- --- Identity --------------------------------------------------------------

-- Prototype auth only. No password column: the demo login issues a signed
-- session cookie. Real authentication is explicitly out of scope (spec §67).
create table users (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  display_name text not null,
  role         text not null default 'BUYER',
  created_at   timestamptz not null default now()
);

-- --- RFx -------------------------------------------------------------------

create table rfqs (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references users(id) on delete cascade,
  title           text not null,
  category        text not null,
  objective       text not null default '',
  scope           text not null default '',
  geography       text,
  status          rfx_status not null default 'DRAFT',
  creation_state  rfx_creation_state not null default 'DISCOVERY',
  -- Denormalized commercial terms: they are edited and read as one unit.
  commercial_terms jsonb not null default '{}'::jsonb,
  -- What the copilot has learned, so it does not re-ask (spec §14).
  copilot_context jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index rfqs_owner_idx on rfqs(owner_id);

create table rfq_line_items (
  id             uuid primary key default gen_random_uuid(),
  rfq_id         uuid not null references rfqs(id) on delete cascade,
  position       integer not null,
  sku_code       text not null,
  description    text not null,
  specifications jsonb not null default '{}'::jsonb,
  quantity       numeric(18,4) not null check (quantity > 0),
  unit           text not null,
  currency       text,
  required_by    date,
  notes          text,
  unique (rfq_id, position)
);

create index rfq_line_items_rfq_idx on rfq_line_items(rfq_id);

create table questionnaire_questions (
  id                        uuid primary key default gen_random_uuid(),
  rfq_id                    uuid not null references rfqs(id) on delete cascade,
  position                  integer not null,
  question                  text not null,
  type                      question_type not null,
  required                  boolean not null default true,
  -- A failing answer here makes the vendor ineligible. Enforced in code, not
  -- by the model (spec §34).
  mandatory_for_eligibility boolean not null default false,
  options                   text[],
  unique (rfq_id, position)
);

create table rfq_assumptions (
  id         uuid primary key default gen_random_uuid(),
  rfq_id     uuid not null references rfqs(id) on delete cascade,
  statement  text not null,
  origin     text not null check (origin in ('BUYER','AI_SUGGESTED','SYSTEM_DEFAULT')),
  accepted   boolean not null default false,
  rationale  text,
  created_at timestamptz not null default now()
);

create table rfq_clarifications (
  id                uuid primary key default gen_random_uuid(),
  rfq_id            uuid not null references rfqs(id) on delete cascade,
  question          text not null,
  suggested_answers text[],
  answer            text,
  answered_at       timestamptz,
  created_at        timestamptz not null default now()
);

create table evaluation_criteria (
  id          uuid primary key default gen_random_uuid(),
  rfq_id      uuid not null references rfqs(id) on delete cascade,
  label       text not null,
  weight      numeric(5,2) not null check (weight >= 0 and weight <= 100),
  description text
);

-- --- Vendors and their responses -------------------------------------------

create table vendors (
  id            uuid primary key default gen_random_uuid(),
  rfq_id        uuid not null references rfqs(id) on delete cascade,
  name          text not null,
  short_label   text not null,
  contact_email text,
  country       text,
  unique (rfq_id, short_label)
);

create table vendor_responses (
  id                  uuid primary key default gen_random_uuid(),
  rfq_id              uuid not null references rfqs(id) on delete cascade,
  vendor_id           uuid not null references vendors(id) on delete cascade,
  received_at         timestamptz not null default now(),
  channel             response_channel not null default 'UPLOAD',
  status              ai_operation_status not null default 'QUEUED',
  quoted_line_count   integer,
  expected_line_count integer,
  notes               text,
  unique (rfq_id, vendor_id)
);

create table documents (
  id                 uuid primary key default gen_random_uuid(),
  vendor_response_id uuid not null references vendor_responses(id) on delete cascade,
  filename           text not null,
  kind               document_kind not null,
  mime_type          text not null,
  byte_size          bigint not null check (byte_size >= 0),
  -- Path inside the storage bucket, or a repo-relative fixture path.
  storage_path       text not null,
  part_count         integer,
  -- Extracted text / sheet structure, cached so the raw file is read once.
  parsed_content     jsonb,
  uploaded_at        timestamptz not null default now()
);

create index documents_response_idx on documents(vendor_response_id);

-- --- Extraction ------------------------------------------------------------

create table extraction_runs (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references documents(id) on delete cascade,
  model          text not null,
  prompt_version text not null,
  status         ai_operation_status not null default 'QUEUED',
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  duration_ms    integer,
  input_tokens   integer,
  output_tokens  integer,
  -- Operator-facing message only. Never contains keys or document contents.
  error          text
);

create index extraction_runs_document_idx on extraction_runs(document_id);

-- What the document said. Never overwritten by normalization.
create table vendor_quotes (
  id                  uuid primary key default gen_random_uuid(),
  rfq_id              uuid not null references rfqs(id) on delete cascade,
  vendor_id           uuid not null references vendors(id) on delete cascade,
  source_document_id  uuid not null references documents(id) on delete cascade,
  extraction_run_id   uuid not null references extraction_runs(id) on delete cascade,
  rfq_line_id         uuid references rfq_line_items(id) on delete set null,

  raw_description     text,

  match_status        match_status not null default 'UNMATCHED',
  match_score         numeric(4,3),
  match_reasoning     text,
  -- Ranked alternatives when the match is ambiguous. The buyer picks.
  match_candidates    jsonb not null default '[]'::jsonb,

  quoted_price        numeric(18,6),
  currency            text,
  quoted_unit         text,
  quantity_basis      numeric(18,6),
  quantity_basis_unit text,

  freight_status      freight_status not null default 'UNKNOWN',
  freight_amount      numeric(18,6),
  freight_currency    text,
  freight_basis       text,

  taxes_included      boolean,
  tax_rate            numeric(6,3),

  lead_time_days      integer,
  moq                 numeric(18,4),

  confidence          confidence_state not null default 'REVIEW_REQUIRED',
  created_at          timestamptz not null default now()
);

create index vendor_quotes_rfq_idx on vendor_quotes(rfq_id);
create index vendor_quotes_line_idx on vendor_quotes(rfq_line_id);
create index vendor_quotes_vendor_idx on vendor_quotes(vendor_id);

create table questionnaire_answers (
  id                 uuid primary key default gen_random_uuid(),
  vendor_id          uuid not null references vendors(id) on delete cascade,
  question_id        uuid not null references questionnaire_questions(id) on delete cascade,
  extraction_run_id  uuid references extraction_runs(id) on delete set null,
  raw_answer         text,
  normalized_answer  jsonb,
  -- Null means undetermined. Undetermined is not the same as failing.
  passes             boolean,
  confidence         confidence_state not null default 'REVIEW_REQUIRED',
  unique (vendor_id, question_id)
);

-- --- Evidence --------------------------------------------------------------

-- One row per (value, source) pair. Polymorphic by subject so the same shape
-- serves quotes, questionnaire answers, and issues.
create table evidence (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  subject_type  text not null check (
                  subject_type in ('VENDOR_QUOTE','QUESTIONNAIRE_ANSWER','COMMERCIAL_ISSUE')
                ),
  subject_id    uuid not null,
  -- Which field of the subject this supports, e.g. 'quoted_price', 'freight'.
  field         text not null,
  page          integer,
  sheet         text,
  "row"         integer,
  "column"      text,
  -- The literal text the value was read from. Preserved verbatim.
  source_text   text,
  -- Normalized 0-1 bounding box for image / scanned-PDF regions.
  source_region jsonb,
  created_at    timestamptz not null default now()
);

create index evidence_subject_idx on evidence(subject_type, subject_id);
create index evidence_document_idx on evidence(document_id);

-- --- Commercial truth ------------------------------------------------------

-- The comparable layer. normalized_* is NULL whenever normalization was not
-- safe — a missing pack size blocks it rather than inventing a number.
create table commercial_truth (
  id                  uuid primary key default gen_random_uuid(),
  rfq_id              uuid not null references rfqs(id) on delete cascade,
  rfq_line_id         uuid not null references rfq_line_items(id) on delete cascade,
  vendor_id           uuid not null references vendors(id) on delete cascade,
  vendor_quote_id     uuid references vendor_quotes(id) on delete set null,

  quoted_amount       numeric(18,6) not null,
  quoted_currency     text not null,
  quoted_unit         text not null,

  normalized_amount   numeric(18,6),
  normalized_currency text,
  normalized_unit     text,
  -- Plain-language arithmetic, e.g. '₹4,200 ÷ 100 = ₹42'.
  derivation          text,

  freight_status      freight_status not null default 'UNKNOWN',
  freight_amount      numeric(18,6),
  freight_currency    text,
  freight_basis       text,

  taxes_included      boolean,
  tax_rate            numeric(6,3),

  eligible            boolean not null default true,
  eligibility_reasons text[] not null default '{}',

  confidence          confidence_state not null default 'REVIEW_REQUIRED',
  computed_at         timestamptz not null default now(),
  unique (rfq_line_id, vendor_id)
);

create index commercial_truth_rfq_idx on commercial_truth(rfq_id);
create index commercial_truth_vendor_idx on commercial_truth(vendor_id);

create table commercial_issues (
  id              uuid primary key default gen_random_uuid(),
  rfq_id          uuid not null references rfqs(id) on delete cascade,
  vendor_id       uuid not null references vendors(id) on delete cascade,
  rfq_line_id     uuid references rfq_line_items(id) on delete cascade,
  category        issue_category not null,
  severity        issue_severity not null default 'WARNING',
  summary         text not null,
  detail          text,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now()
);

create index commercial_issues_rfq_idx on commercial_issues(rfq_id) where resolved_at is null;

-- --- Decision --------------------------------------------------------------

create table award_scenarios (
  id                     uuid primary key default gen_random_uuid(),
  rfq_id                 uuid not null references rfqs(id) on delete cascade,
  name                   text not null,
  kind                   scenario_kind not null,
  inputs                 jsonb not null default '{}'::jsonb,
  assumptions            jsonb not null default '[]'::jsonb,
  -- NULL when the optimization could not be completed safely (spec §38).
  total_cost_inr         numeric(20,4),
  savings_vs_baseline_inr numeric(20,4),
  evidence_coverage      numeric(5,4),
  -- Lines the optimizer refused to award, with reasons. Never silently dropped.
  unawarded_lines        jsonb not null default '[]'::jsonb,
  complete               boolean not null default false,
  computed_at            timestamptz not null default now()
);

create index award_scenarios_rfq_idx on award_scenarios(rfq_id);

create table award_allocations (
  id              uuid primary key default gen_random_uuid(),
  scenario_id     uuid not null references award_scenarios(id) on delete cascade,
  rfq_line_id     uuid not null references rfq_line_items(id) on delete cascade,
  vendor_id       uuid not null references vendors(id) on delete cascade,
  quantity        numeric(18,4) not null,
  unit_price_inr  numeric(18,6) not null,
  line_value_inr  numeric(20,4) not null,
  freight_inr     numeric(20,4),
  rationale       text,
  unique (scenario_id, rfq_line_id)
);

create table decision_briefs (
  id                uuid primary key default gen_random_uuid(),
  rfq_id            uuid not null references rfqs(id) on delete cascade,
  scenario_id       uuid not null references award_scenarios(id) on delete cascade,
  executive_summary text not null,
  risks             jsonb not null default '[]'::jsonb,
  generated_at      timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid references users(id) on delete set null
);

-- --- Conversations ---------------------------------------------------------

create table chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  rfq_id     uuid not null references rfqs(id) on delete cascade,
  surface    chat_surface not null,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role       chat_role not null,
  content    text not null,
  -- Tool calls made on this turn, backing the "view calculation" affordance.
  tool_calls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_session_idx on chat_messages(session_id, created_at);

-- --- Observability ---------------------------------------------------------

-- One row per AI operation (spec §54). Never stores prompts, keys, or document
-- contents — only the metadata needed to explain cost and latency.
create table ai_operation_log (
  id            uuid primary key default gen_random_uuid(),
  rfq_id        uuid references rfqs(id) on delete cascade,
  operation     text not null,
  model         text not null,
  status        ai_operation_status not null,
  duration_ms   integer,
  input_tokens  integer,
  output_tokens integer,
  tool_name     text,
  error         text,
  created_at    timestamptz not null default now()
);

create index ai_operation_log_rfq_idx on ai_operation_log(rfq_id, created_at desc);
