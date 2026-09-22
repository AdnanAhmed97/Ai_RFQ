import "server-only";
import { getSql } from "@/lib/db/sql";

/**
 * The RFx as the buyer wrote it: scope, line items, questionnaire, terms.
 *
 * Read straight from the database. Slice 2 will let the copilot author and edit
 * this; being able to see it does not have to wait for that.
 */
export interface RfxLineView {
  id: string;
  position: number;
  skuCode: string;
  description: string;
  specifications: Record<string, string>;
  quantity: number;
  unit: string;
}

export interface RfxQuestionView {
  id: string;
  ref: string;
  question: string;
  type: string;
  required: boolean;
  mandatoryForEligibility: boolean;
  options: string[] | null;
}

export interface RfxDetailView {
  id: string;
  title: string;
  category: string;
  objective: string;
  scope: string;
  geography: string | null;
  status: string;
  commercialTerms: Record<string, unknown>;
  lines: RfxLineView[];
  questions: RfxQuestionView[];
  criteria: { label: string; weight: number; description: string | null }[];
}

export async function loadRfxDetail(rfqId: string): Promise<RfxDetailView | null> {
  const sql = getSql();

  const [rfq] = await sql<
    {
      id: string;
      title: string;
      category: string;
      objective: string;
      scope: string;
      geography: string | null;
      status: string;
      commercial_terms: Record<string, unknown>;
    }[]
  >`
    select id, title, category, objective, scope, geography,
           status::text as status, commercial_terms
      from rfqs where id = ${rfqId}
  `;
  if (!rfq) return null;

  const lines = await sql<
    {
      id: string;
      position: number;
      sku_code: string;
      description: string;
      specifications: Record<string, string>;
      quantity: number;
      unit: string;
    }[]
  >`
    select id, position, sku_code, description, specifications, quantity, unit
      from rfq_line_items where rfq_id = ${rfqId} order by position
  `;

  const questions = await sql<
    {
      id: string;
      position: number;
      question: string;
      type: string;
      required: boolean;
      mandatory_for_eligibility: boolean;
      options: string[] | null;
    }[]
  >`
    select id, position, question, type::text as type, required,
           mandatory_for_eligibility, options
      from questionnaire_questions where rfq_id = ${rfqId} order by position
  `;

  const criteria = await sql<{ label: string; weight: number; description: string | null }[]>`
    select label, weight, description from evaluation_criteria where rfq_id = ${rfqId}
  `;

  return {
    id: rfq.id,
    title: rfq.title,
    category: rfq.category,
    objective: rfq.objective,
    scope: rfq.scope,
    geography: rfq.geography,
    status: rfq.status,
    commercialTerms: rfq.commercial_terms,
    lines: lines.map((l) => ({
      id: l.id,
      position: l.position,
      skuCode: l.sku_code,
      description: l.description,
      specifications: l.specifications,
      quantity: Number(l.quantity),
      unit: l.unit,
    })),
    questions: questions.map((q) => ({
      id: q.id,
      ref: `Q${q.position}`,
      question: q.question,
      type: q.type,
      required: q.required,
      mandatoryForEligibility: q.mandatory_for_eligibility,
      options: q.options,
    })),
    criteria: criteria.map((c) => ({ ...c, weight: Number(c.weight) })),
  };
}

// --- One vendor's submission -----------------------------------------------

export interface ExtractedQuoteView {
  id: string;
  rawDescription: string | null;
  quotedPrice: number | null;
  currency: string | null;
  quotedUnit: string | null;
  quantityBasis: number | null;
  freightStatus: string;
  confidence: string;
  matchStatus: string;
  matchScore: number | null;
  matchReasoning: string | null;
  rfqLineSku: string | null;
  rfqLinePosition: number | null;
  documentName: string;
  evidence: {
    sheet: string | null;
    page: number | null;
    row: number | null;
    column: string | null;
    sourceText: string | null;
  } | null;
}

export interface VendorAnswerView {
  ref: string;
  question: string;
  mandatoryForEligibility: boolean;
  rawAnswer: string | null;
  confidence: string;
  sourceText: string | null;
}

export interface VendorDetailView {
  rfqId: string;
  rfqTitle: string;
  vendorId: string;
  shortLabel: string;
  name: string;
  city: string | null;
  documents: { id: string; filename: string; kind: string; byteSize: number; state: string }[];
  quotes: ExtractedQuoteView[];
  answers: VendorAnswerView[];
  issues: { category: string; severity: string; summary: string; detail: string | null; skuCode: string | null }[];
  lineItemCount: number;
}

export async function loadVendorDetail(
  rfqId: string,
  vendorId: string,
): Promise<VendorDetailView | null> {
  const sql = getSql();

  const [vendor] = await sql<
    { id: string; short_label: string; name: string; country: string | null; rfq_title: string; line_count: number }[]
  >`
    select v.id, v.short_label, v.name, v.country,
           r.title as rfq_title,
           (select count(*) from rfq_line_items li where li.rfq_id = r.id)::int as line_count
      from vendors v join rfqs r on r.id = v.rfq_id
     where v.id = ${vendorId} and v.rfq_id = ${rfqId}
  `;
  if (!vendor) return null;

  const documents = await sql<
    { id: string; filename: string; kind: string; byte_size: string; state: string }[]
  >`
    select d.id, d.filename, d.kind::text as kind, d.byte_size,
           coalesce(j.state::text, 'QUEUED') as state
      from documents d
      join vendor_responses vr on vr.id = d.vendor_response_id
      left join extraction_jobs j on j.document_id = d.id
     where vr.vendor_id = ${vendorId}
     order by d.filename
  `;

  const quotes = await sql<
    {
      id: string;
      raw_description: string | null;
      quoted_price: number | null;
      currency: string | null;
      quoted_unit: string | null;
      quantity_basis: number | null;
      freight_status: string;
      confidence: string;
      match_status: string;
      match_score: number | null;
      match_reasoning: string | null;
      sku_code: string | null;
      position: number | null;
      filename: string;
      sheet: string | null;
      page: number | null;
      row: number | null;
      column: string | null;
      source_text: string | null;
    }[]
  >`
    select q.id, q.raw_description, q.quoted_price, q.currency, q.quoted_unit,
           q.quantity_basis, q.freight_status::text as freight_status,
           q.confidence::text as confidence, q.match_status::text as match_status,
           q.match_score, q.match_reasoning,
           li.sku_code, li.position,
           d.filename,
           e.sheet, e.page, e."row", e."column", e.source_text
      from vendor_quotes q
      join documents d on d.id = q.source_document_id
      left join rfq_line_items li on li.id = q.rfq_line_id
      left join lateral (
        select sheet, page, "row", "column", source_text
          from evidence ev
         where ev.subject_type = 'VENDOR_QUOTE' and ev.subject_id = q.id
         limit 1
      ) e on true
     where q.vendor_id = ${vendorId}
     order by li.position nulls last, q.created_at
  `;

  const answers = await sql<
    {
      position: number;
      question: string;
      mandatory_for_eligibility: boolean;
      raw_answer: string | null;
      confidence: string;
      source_text: string | null;
    }[]
  >`
    select qq.position, qq.question, qq.mandatory_for_eligibility,
           qa.raw_answer, qa.confidence::text as confidence,
           (select source_text from evidence ev
             where ev.subject_type = 'QUESTIONNAIRE_ANSWER' and ev.subject_id = qa.id
             limit 1) as source_text
      from questionnaire_answers qa
      join questionnaire_questions qq on qq.id = qa.question_id
     where qa.vendor_id = ${vendorId}
     order by qq.position
  `;

  const issues = await sql<
    { category: string; severity: string; summary: string; detail: string | null; sku_code: string | null }[]
  >`
    select ci.category::text as category, ci.severity::text as severity,
           ci.summary, ci.detail, li.sku_code
      from commercial_issues ci
      left join rfq_line_items li on li.id = ci.rfq_line_id
     where ci.vendor_id = ${vendorId} and ci.resolved_at is null
     order by case ci.severity when 'BLOCKER' then 0 when 'WARNING' then 1 else 2 end,
              li.position nulls last
  `;

  return {
    rfqId,
    rfqTitle: vendor.rfq_title,
    vendorId: vendor.id,
    shortLabel: vendor.short_label,
    name: vendor.name,
    city: vendor.country,
    lineItemCount: vendor.line_count,
    documents: documents.map((d) => ({
      id: d.id,
      filename: d.filename,
      kind: d.kind,
      byteSize: Number(d.byte_size),
      state: d.state,
    })),
    quotes: quotes.map((q) => ({
      id: q.id,
      rawDescription: q.raw_description,
      quotedPrice: q.quoted_price === null ? null : Number(q.quoted_price),
      currency: q.currency,
      quotedUnit: q.quoted_unit,
      quantityBasis: q.quantity_basis === null ? null : Number(q.quantity_basis),
      freightStatus: q.freight_status,
      confidence: q.confidence,
      matchStatus: q.match_status,
      matchScore: q.match_score === null ? null : Number(q.match_score),
      matchReasoning: q.match_reasoning,
      rfqLineSku: q.sku_code,
      rfqLinePosition: q.position,
      documentName: q.filename,
      evidence: q.source_text || q.sheet || q.page
        ? { sheet: q.sheet, page: q.page, row: q.row, column: q.column, sourceText: q.source_text }
        : null,
    })),
    answers: answers.map((a) => ({
      ref: `Q${a.position}`,
      question: a.question,
      mandatoryForEligibility: a.mandatory_for_eligibility,
      rawAnswer: a.raw_answer,
      confidence: a.confidence,
      sourceText: a.source_text,
    })),
    issues: issues.map((i) => ({
      category: i.category,
      severity: i.severity,
      summary: i.summary,
      detail: i.detail,
      skuCode: i.sku_code,
    })),
  };
}
