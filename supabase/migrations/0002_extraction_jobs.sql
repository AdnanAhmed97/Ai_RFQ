-- ---------------------------------------------------------------------------
-- Extraction jobs
--
-- Document processing is modelled as an asynchronous job from the start, even
-- though the prototype runs it in-process. The point is the coupling, not the
-- infrastructure: if the UI reads job state from the database rather than from
-- a request's return value, then moving execution to a worker later changes
-- nothing above this line.
--
-- The state machine is finer-grained than a generic status because the buyer
-- is shown real pipeline stages (spec §62) — "Matching 29 line items" is only
-- honest if the system actually knows it is matching.
-- ---------------------------------------------------------------------------

create type extraction_job_state as enum (
  'QUEUED',        -- accepted, not yet picked up
  'PROCESSING',    -- claimed by a runner; document being read
  'EXTRACTING',    -- model reading commercial values out of the document
  'MATCHING',      -- mapping vendor lines onto RFx lines
  'VALIDATING',    -- deterministic checks over what was extracted
  'COMPLETE',      -- finished, nothing outstanding
  'NEEDS_REVIEW',  -- finished, but a human must confirm something
  'FAILED'         -- did not finish; error recorded
);

create table extraction_jobs (
  id                 uuid primary key default gen_random_uuid(),
  rfq_id             uuid not null references rfqs(id) on delete cascade,
  vendor_response_id uuid not null references vendor_responses(id) on delete cascade,
  document_id        uuid not null references documents(id) on delete cascade,

  state              extraction_job_state not null default 'QUEUED',
  -- 0-100, for the staged progress indicator. Set from real stage transitions,
  -- never animated ahead of the work (spec §62, Rule 9).
  progress           smallint not null default 0 check (progress between 0 and 100),

  attempt            smallint not null default 0,
  max_attempts       smallint not null default 3,

  -- Set when a runner claims the job, so a crashed runner's job can be reclaimed.
  claimed_at         timestamptz,
  claimed_by         text,

  queued_at          timestamptz not null default now(),
  started_at         timestamptz,
  finished_at        timestamptz,
  duration_ms        integer,

  -- Operator-facing failure reason. Never contains keys or document contents.
  error              text,
  -- Why the job ended in NEEDS_REVIEW, in terms the buyer can act on.
  review_reason      text,

  unique (document_id)
);

create index extraction_jobs_rfq_idx on extraction_jobs(rfq_id);
create index extraction_jobs_state_idx on extraction_jobs(state) where state in ('QUEUED', 'PROCESSING');

-- Every transition, in order. This is what makes a completed run auditable and
-- what the UI replays to show which stage a document is actually at.
create table extraction_job_events (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references extraction_jobs(id) on delete cascade,
  from_state  extraction_job_state,
  to_state    extraction_job_state not null,
  note        text,
  occurred_at timestamptz not null default now()
);

create index extraction_job_events_job_idx on extraction_job_events(job_id, occurred_at);

-- Links an extraction run to the job that scheduled it, so the model call and
-- the pipeline stage it served can be reconciled.
alter table extraction_runs
  add column job_id uuid references extraction_jobs(id) on delete set null;

create index extraction_runs_job_idx on extraction_runs(job_id);
