import "server-only";
import { getSql } from "@/lib/db/sql";

/**
 * The RFx context supplied to extraction and matching.
 *
 * Kept small and stable on purpose: it sits at the front of every prompt, so
 * it is the part worth caching, and a field that changes per document would
 * cost the cache hit on all of them.
 */

export interface RfxLineContext {
  id: string;
  position: number;
  skuCode: string;
  description: string;
  specifications: Record<string, string>;
  quantity: number;
  unit: string;
}

export interface QuestionContext {
  id: string;
  /** Buyer-facing reference, e.g. "Q4" — what vendor documents actually cite. */
  ref: string;
  question: string;
  type: string;
  mandatoryForEligibility: boolean;
}

export interface RfxContext {
  rfqId: string;
  title: string;
  category: string;
  pricingBasis: string;
  currency: string;
  lines: RfxLineContext[];
  questions: QuestionContext[];
}

export async function loadRfxContext(rfqId: string): Promise<RfxContext> {
  const sql = getSql();

  const [rfq] = await sql<
    { id: string; title: string; category: string; commercial_terms: Record<string, unknown> }[]
  >`select id, title, category, commercial_terms from rfqs where id = ${rfqId}`;
  if (!rfq) throw new Error(`RFx ${rfqId} not found.`);

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
      mandatory_for_eligibility: boolean;
    }[]
  >`
    select id, position, question, type, mandatory_for_eligibility
    from questionnaire_questions where rfq_id = ${rfqId} order by position
  `;

  const terms = rfq.commercial_terms as { pricingBasis?: string; currency?: string };

  return {
    rfqId: rfq.id,
    title: rfq.title,
    category: rfq.category,
    pricingBasis: terms.pricingBasis ?? "per piece",
    currency: terms.currency ?? "INR",
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
      // Documents cite "Q4", not a UUID. The mapping lives here, in code.
      ref: `Q${q.position}`,
      question: q.question,
      type: q.type,
      mandatoryForEligibility: q.mandatory_for_eligibility,
    })),
  };
}

/** The RFx lines, rendered for a prompt. */
export function renderRfxLines(context: RfxContext): string {
  return context.lines
    .map((line) => {
      const specs = Object.entries(line.specifications)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
      return `<line id="${line.id}" position="${line.position}" sku="${line.skuCode}">
  description: ${line.description}
  specifications: ${specs}
  annual quantity: ${line.quantity} ${line.unit}
</line>`;
    })
    .join("\n");
}

export function renderQuestionnaire(context: RfxContext): string {
  return context.questions
    .map(
      (q) =>
        `<question ref="${q.ref}" type="${q.type}"${q.mandatoryForEligibility ? ' mandatory="true"' : ""}>${q.question}</question>`,
    )
    .join("\n");
}
