import "server-only";
import type { Sql } from "postgres";
import type { DocumentExtraction, LineMatchBatch } from "@/lib/ai/schemas";
import type { RfxContext } from "./context";
import type { ValidationIssue } from "./validate";

/**
 * Writes an extraction to the database.
 *
 * Everything for one document lands in a single transaction: quotes, the
 * evidence behind them, questionnaire answers, and the issues raised. A partial
 * write would leave values on screen whose provenance was never recorded, which
 * is worse than no write at all.
 *
 * Nothing normalized is written here. `vendor_quotes` holds what the document
 * said; `commercial_truth` stays empty until the pricing engine has run.
 */

export interface PersistParams {
  sql: Sql;
  context: RfxContext;
  rfqId: string;
  vendorId: string;
  documentId: string;
  extractionRunId: string;
  extraction: DocumentExtraction;
  matches: LineMatchBatch["matches"];
  issues: ValidationIssue[];
}

export interface PersistResult {
  quoteIds: string[];
  answerCount: number;
  evidenceCount: number;
  issueCount: number;
}

export async function persistExtraction(params: PersistParams): Promise<PersistResult> {
  const { sql, context, extraction, matches, issues } = params;

  return sql.begin(async (tx) => {
    // Re-running a document replaces its previous output rather than
    // accumulating duplicates alongside it.
    await tx`delete from vendor_quotes where source_document_id = ${params.documentId}`;
    await tx`
      delete from evidence
      where document_id = ${params.documentId} and subject_type in ('VENDOR_QUOTE', 'QUESTIONNAIRE_ANSWER')
    `;

    const matchByIndex = new Map(matches.map((m) => [m.vendorLineIndex, m]));
    const quoteIds: string[] = [];
    const quoteIdByIndex = new Map<number, string>();
    let evidenceCount = 0;

    for (const [index, quote] of extraction.quotes.entries()) {
      const match = matchByIndex.get(index);
      const rfqLineId =
        match?.status === "MATCHED" && match.rfqLineId ? match.rfqLineId : null;

      const [row] = await tx<{ id: string }[]>`
        insert into vendor_quotes (
          rfq_id, vendor_id, source_document_id, extraction_run_id, rfq_line_id,
          raw_description, match_status, match_score, match_reasoning, match_candidates,
          quoted_price, currency, quoted_unit, quantity_basis, quantity_basis_unit,
          freight_status, freight_amount, freight_currency, freight_basis,
          taxes_included, tax_rate, lead_time_days, moq, confidence
        ) values (
          ${params.rfqId}, ${params.vendorId}, ${params.documentId}, ${params.extractionRunId},
          ${rfqLineId},
          ${quote.rawDescription}, ${match?.status ?? "UNMATCHED"}, ${match?.score ?? null},
          ${match?.reasoning ?? null}, ${tx.json(match?.candidates ?? [])},
          ${quote.quotedPrice}, ${quote.currency}, ${quote.quotedUnit},
          ${quote.quantityBasis}, ${quote.quantityBasisUnit},
          ${quote.freight.status}, ${quote.freight.amount}, ${quote.freight.currency},
          ${quote.freight.basis},
          ${quote.taxesIncluded}, ${quote.taxRate}, ${quote.leadTimeDays}, ${quote.moq},
          ${quote.confidence}
        )
        returning id
      `;

      const quoteId = row!.id;
      quoteIds.push(quoteId);
      quoteIdByIndex.set(index, quoteId);

      const reference = quote.evidence;
      await tx`
        insert into evidence (
          document_id, subject_type, subject_id, field,
          page, sheet, "row", "column", source_text
        ) values (
          ${params.documentId}, 'VENDOR_QUOTE', ${quoteId}, 'quoted_price',
          ${reference.page}, ${reference.sheet}, ${reference.row}, ${reference.column},
          ${reference.sourceText}
        )
      `;
      evidenceCount += 1;
    }

    // --- Questionnaire answers -------------------------------------------
    // The document cites "Q4"; the database keys on a UUID. The mapping is
    // resolved here in code, not by asking the model for an id it never saw.
    const questionByRef = new Map(context.questions.map((q) => [q.ref.toUpperCase(), q]));
    let answerCount = 0;

    for (const answer of extraction.questionnaireAnswers) {
      const question = questionByRef.get(answer.questionRef.trim().toUpperCase());
      if (!question) continue;

      const [row] = await tx<{ id: string }[]>`
        insert into questionnaire_answers (
          vendor_id, question_id, extraction_run_id, raw_answer, normalized_answer,
          passes, confidence
        ) values (
          ${params.vendorId}, ${question.id}, ${params.extractionRunId},
          ${answer.rawAnswer}, ${tx.json(null)},
          -- Whether an answer satisfies the question is an eligibility
          -- judgement made in Slice 6 over the extracted text, not here.
          null, ${answer.confidence}
        )
        on conflict (vendor_id, question_id) do update set
          extraction_run_id = excluded.extraction_run_id,
          raw_answer        = excluded.raw_answer,
          normalized_answer = excluded.normalized_answer,
          confidence        = excluded.confidence
        returning id
      `;
      answerCount += 1;

      const answerReference = answer.evidence;
      await tx`
        insert into evidence (
          document_id, subject_type, subject_id, field,
          page, sheet, "row", "column", source_text
        ) values (
          ${params.documentId}, 'QUESTIONNAIRE_ANSWER', ${row!.id},
          ${`questionnaire:${question.ref}`},
          ${answerReference.page}, ${answerReference.sheet}, ${answerReference.row},
          ${answerReference.column}, ${answerReference.sourceText}
        )
      `;
      evidenceCount += 1;
    }

    // --- Issues -----------------------------------------------------------
    await tx`
      delete from commercial_issues
      where vendor_id = ${params.vendorId}
        and rfq_id = ${params.rfqId}
        and id in (
          select ci.id from commercial_issues ci
          where ci.vendor_id = ${params.vendorId} and ci.resolved_at is null
        )
        and category != 'MISSING_LINE'
    `;

    for (const issue of issues) {
      await tx`
        insert into commercial_issues (
          rfq_id, vendor_id, rfq_line_id, category, severity, summary, detail
        ) values (
          ${params.rfqId}, ${params.vendorId},
          ${issue.rfqLineId ?? null}, ${issue.category}, ${issue.severity},
          ${issue.summary}, ${issue.detail ?? null}
        )
      `;
    }

    return {
      quoteIds,
      answerCount,
      evidenceCount,
      issueCount: issues.length,
    };
  });
}

/** Records missing-line issues once a supplier's documents are all processed. */
export async function persistMissingLines(params: {
  sql: Sql;
  rfqId: string;
  vendorId: string;
  issues: ValidationIssue[];
}): Promise<number> {
  const { sql } = params;

  await sql`
    delete from commercial_issues
    where rfq_id = ${params.rfqId} and vendor_id = ${params.vendorId}
      and category = 'MISSING_LINE'
  `;

  for (const issue of params.issues) {
    await sql`
      insert into commercial_issues (rfq_id, vendor_id, rfq_line_id, category, severity, summary, detail)
      values (
        ${params.rfqId}, ${params.vendorId}, ${issue.rfqLineId ?? null},
        'MISSING_LINE', ${issue.severity}, ${issue.summary}, ${issue.detail ?? null}
      )
    `;
  }

  return params.issues.length;
}
