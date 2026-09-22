import "server-only";
import { getSql } from "@/lib/db/sql";
import { loadAnalysisSnapshot } from "@/lib/pricing/analysis";
import { calculateAward, calculateSingleVendorAwards } from "@/lib/pricing/award";
import { describeAssumptions, runScenario } from "@/lib/pricing/scenarios";
import { canReceiveAward } from "@/lib/pricing/eligibility";
import { formatPaise, paiseToRupees, rateToRupees } from "@/lib/pricing/money";
import { ToolNames } from "./definitions";
import type { ToolImplementations } from "./registry";

/**
 * The deterministic implementations behind every Decision Copilot tool.
 *
 * The model chooses which of these runs and with what arguments. It never
 * computes a figure itself — every number a buyer sees in an answer originates
 * here, in TypeScript, from the persisted commercial truth.
 *
 * Each tool returns figures the model can quote verbatim AND the caveats it
 * must not omit, because an answer that states a total without its unawarded
 * lines is worse than no answer.
 */
export function buildToolImplementations(rfqId: string): ToolImplementations {
  async function snapshot() {
    const loaded = await loadAnalysisSnapshot(rfqId);
    if (!loaded) throw new Error(`RFx ${rfqId} not found.`);
    return loaded;
  }

  function vendorNames(snap: Awaited<ReturnType<typeof snapshot>>) {
    return new Map(snap.vendors.map((v) => [v.id, v.shortLabel]));
  }

  return {
    [ToolNames.getRfxContext]: async () => {
      const sql = getSql();
      const snap = await snapshot();
      const [rfq] = await sql<
        { title: string; category: string; objective: string; commercial_terms: unknown }[]
      >`select title, category, objective, commercial_terms from rfqs where id = ${rfqId}`;
      const questions = await sql<
        { position: number; question: string; mandatory_for_eligibility: boolean }[]
      >`select position, question, mandatory_for_eligibility from questionnaire_questions
         where rfq_id = ${rfqId} order by position`;

      return {
        title: rfq?.title,
        category: rfq?.category,
        objective: rfq?.objective,
        commercialTerms: rfq?.commercial_terms,
        lineCount: snap.lines.length,
        lines: snap.lines.map((l) => ({
          sku: l.skuCode,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
        })),
        questionnaire: questions.map((q) => ({
          ref: `Q${q.position}`,
          question: q.question,
          eligibilityBearing: q.mandatory_for_eligibility,
        })),
        fxAssumption: snap.fxNote,
      };
    },

    [ToolNames.getVendorSummary]: async (input) => {
      const { vendorId } = input as { vendorId: string | null };
      const sql = getSql();
      const snap = await snapshot();

      const coverage = await sql<
        { vendor_id: string; quoted: number | null; expected: number | null; comparable: number }[]
      >`
        select v.id as vendor_id, vr.quoted_line_count as quoted, vr.expected_line_count as expected,
               (select count(*) from commercial_truth ct
                 where ct.vendor_id = v.id and ct.normalized_amount is not null)::int as comparable
          from vendors v join vendor_responses vr on vr.vendor_id = v.id
         where v.rfq_id = ${rfqId}
      `;
      const coverageBy = new Map(coverage.map((c) => [c.vendor_id, c]));

      return snap.vendors
        .filter((v) => !vendorId || v.id === vendorId)
        .map((vendor) => {
          const eligibility = snap.eligibility.find((e) => e.vendorId === vendor.id);
          const cover = coverageBy.get(vendor.id);
          return {
            vendorId: vendor.id,
            name: vendor.shortLabel,
            legalName: vendor.name,
            linesQuoted: cover?.quoted ?? null,
            linesRequested: cover?.expected ?? snap.lines.length,
            linesComparable: cover?.comparable ?? 0,
            eligibility: eligibility?.status ?? "UNDETERMINED",
            eligibilityReasons: eligibility?.reasons ?? [],
            canReceiveAward: eligibility ? canReceiveAward(eligibility) : false,
          };
        });
    },

    [ToolNames.getCommercialTruth]: async (input) => {
      const { vendorIds, rfqLineIds, comparableOnly } = input as {
        vendorIds: string[] | null;
        rfqLineIds: string[] | null;
        comparableOnly: boolean;
      };
      const snap = await snapshot();
      const names = vendorNames(snap);
      const lineById = new Map(snap.lines.map((l) => [l.rfqLineId, l]));

      return snap.quotes
        .filter((q) => !vendorIds?.length || vendorIds.includes(q.vendorId))
        .filter((q) => !rfqLineIds?.length || rfqLineIds.includes(q.rfqLineId))
        .filter((q) => !comparableOnly || q.unitRateInr > 0)
        .map((quote) => {
          const line = lineById.get(quote.rfqLineId);
          return {
            sku: line?.skuCode,
            description: line?.description,
            quantity: line?.quantity,
            vendor: names.get(quote.vendorId),
            unitRateInr: rateToRupees(quote.unitRateInr),
            landedRateInr:
              quote.landedRateInr === null ? null : rateToRupees(quote.landedRateInr),
            freightResolved: quote.landedRateInr !== null,
            confidence: quote.confidence,
          };
        });
    },

    [ToolNames.getExceptions]: async (input) => {
      const { includeResolved } = input as { includeResolved: boolean };
      const sql = getSql();
      const rows = await sql<
        {
          category: string;
          severity: string;
          summary: string;
          detail: string | null;
          short_label: string;
          sku_code: string | null;
        }[]
      >`
        select ci.category::text as category, ci.severity::text as severity, ci.summary, ci.detail,
               v.short_label, li.sku_code
          from commercial_issues ci
          join vendors v on v.id = ci.vendor_id
          left join rfq_line_items li on li.id = ci.rfq_line_id
         where ci.rfq_id = ${rfqId}
           ${includeResolved ? sql`` : sql`and ci.resolved_at is null`}
         order by case ci.severity when 'BLOCKER' then 0 when 'WARNING' then 1 else 2 end
         limit 200
      `;
      const byCategory = new Map<string, number>();
      for (const row of rows) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);

      return {
        total: rows.length,
        blockers: rows.filter((r) => r.severity === "BLOCKER").length,
        byCategory: Object.fromEntries(byCategory),
        issues: rows.slice(0, 60).map((row) => ({
          category: row.category,
          severity: row.severity,
          vendor: row.short_label,
          sku: row.sku_code,
          summary: row.summary,
          detail: row.detail,
        })),
      };
    },

    [ToolNames.getEvidence]: async (input) => {
      const { subjectType, subjectId } = input as { subjectType: string; subjectId: string };
      const sql = getSql();
      const rows = await sql<
        {
          field: string;
          page: number | null;
          sheet: string | null;
          row: number | null;
          column: string | null;
          source_text: string | null;
          filename: string;
        }[]
      >`
        select e.field, e.page, e.sheet, e."row", e."column", e.source_text, d.filename
          from evidence e join documents d on d.id = e.document_id
         where e.subject_type = ${subjectType} and e.subject_id = ${subjectId}
      `;
      return rows.map((row) => ({
        field: row.field,
        document: row.filename,
        sheet: row.sheet,
        page: row.page,
        row: row.row,
        column: row.column,
        sourceText: row.source_text,
      }));
    },

    [ToolNames.calculateSingleVendorAward]: async (input) => {
      const { eligibleOnly, vendorId, includeFreight } = input as {
        eligibleOnly: boolean;
        vendorId: string | null;
        includeFreight: boolean;
      };
      const snap = await snapshot();
      const names = vendorNames(snap);

      const allowed = eligibleOnly
        ? snap.eligibility.filter((e) => canReceiveAward(e)).map((e) => e.vendorId)
        : null;

      const results = calculateSingleVendorAwards({
        lines: snap.lines,
        quotes: snap.quotes,
        vendorIds: vendorId ? [vendorId] : (allowed ?? snap.vendors.map((v) => v.id)),
        options: { eligibleVendorIds: allowed, includeFreight },
      });

      return [...results.entries()]
        .map(([id, award]) => ({
          vendor: names.get(id),
          totalInr: paiseToRupees(award.totalPaise),
          totalFormatted: formatPaise(award.totalPaise),
          complete: award.complete,
          // The caveat the model must not drop.
          note: award.complete
            ? null
            : `Cannot take a complete single-supplier award: ${award.unawarded.length} lines unquoted or not comparable.`,
          unawardedLines: award.unawarded.map((u) => ({ sku: u.skuCode, reason: u.reason })),
          evidenceCoverage: Number(award.evidenceCoverage.toFixed(4)),
        }))
        .sort((a, b) => Number(b.complete) - Number(a.complete) || a.totalInr - b.totalInr);
    },

    [ToolNames.calculateSplitAward]: async (input) => {
      const { eligibleOnly, includeFreight, excludedVendorIds } = input as {
        eligibleOnly: boolean;
        includeFreight: boolean;
        excludedVendorIds: string[];
      };
      const snap = await snapshot();
      const names = vendorNames(snap);

      const excluded = new Set(excludedVendorIds);
      const allowed = (
        eligibleOnly ? snap.eligibility.filter((e) => canReceiveAward(e)) : snap.eligibility
      )
        .map((e) => e.vendorId)
        .filter((id) => !excluded.has(id));

      const award = calculateAward({
        lines: snap.lines,
        quotes: snap.quotes,
        options: { eligibleVendorIds: allowed, includeFreight },
      });

      const byVendor = new Map<string, { lines: number; valuePaise: number }>();
      for (const allocation of award.allocations) {
        const entry = byVendor.get(allocation.vendorId) ?? { lines: 0, valuePaise: 0 };
        entry.lines += 1;
        entry.valuePaise += allocation.lineValuePaise;
        byVendor.set(allocation.vendorId, entry);
      }

      return {
        totalInr: paiseToRupees(award.totalPaise),
        totalFormatted: formatPaise(award.totalPaise),
        complete: award.complete,
        allocation: [...byVendor.entries()]
          .map(([id, entry]) => ({
            vendor: names.get(id),
            lines: entry.lines,
            valueInr: paiseToRupees(entry.valuePaise),
            valueFormatted: formatPaise(entry.valuePaise),
          }))
          .sort((a, b) => b.valueInr - a.valueInr),
        unawardedLines: award.unawarded.map((u) => ({ sku: u.skuCode, reason: u.reason })),
        evidenceCoverage: Number(award.evidenceCoverage.toFixed(4)),
        linesRestingOnInferredValues: award.inferredLineCount,
        excludedVendors: snap.eligibility
          .filter((e) => !allowed.includes(e.vendorId))
          .map((e) => ({ vendor: names.get(e.vendorId), reason: e.reasons[0] })),
      };
    },

    [ToolNames.calculateScenario]: async (input) => {
      const params = input as {
        name: string;
        freightAdjustmentPercent: number | null;
        fxAdjustmentPercent: number | null;
        excludedVendorIds: string[];
        requiredQuestionnaireQuestionIds: string[];
        singleVendorId: string | null;
        includeFreight: boolean;
      };
      const snap = await snapshot();
      const names = vendorNames(snap);

      const inputs = {
        freightAdjustmentPercent: params.freightAdjustmentPercent ?? undefined,
        fxAdjustmentPercent: params.fxAdjustmentPercent ?? undefined,
        excludedVendorIds: params.excludedVendorIds,
        requiredQuestionIds: params.requiredQuestionnaireQuestionIds,
        singleVendorId: params.singleVendorId ?? undefined,
        includeFreight: params.includeFreight,
      };

      // The baseline this scenario is measured against.
      const baseline = calculateAward({
        lines: snap.lines,
        quotes: snap.quotes,
        options: {
          eligibleVendorIds: snap.eligibility
            .filter((e) => canReceiveAward(e))
            .map((e) => e.vendorId),
          includeFreight: params.includeFreight,
        },
      });

      const result = runScenario({
        name: params.name,
        kind: params.singleVendorId ? "SINGLE_VENDOR" : "CUSTOM",
        inputs,
        lines: snap.lines,
        quotes: snap.quotes,
        eligibility: snap.eligibility,
        assumptions: describeAssumptions({
          inputs,
          fxNote: snap.fxNote,
          hasConvertedValues: snap.hasConvertedValues,
        }),
        baselineTotalPaise: baseline.complete ? baseline.totalPaise : undefined,
      });

      return {
        name: result.name,
        totalInr: paiseToRupees(result.award.totalPaise),
        totalFormatted: formatPaise(result.award.totalPaise),
        complete: result.award.complete,
        assumptions: result.assumptions,
        savingsVsBaselineInr:
          result.savingsVsBaselinePaise === undefined
            ? null
            : paiseToRupees(result.savingsVsBaselinePaise),
        savingsNote:
          result.savingsVsBaselinePaise === undefined
            ? "Not comparable to the baseline: one of the two awards is incomplete."
            : null,
        unawardedLines: result.award.unawarded.map((u) => ({ sku: u.skuCode, reason: u.reason })),
        excludedVendors: result.excludedVendors.map((e) => ({
          vendor: names.get(e.vendorId),
          reason: e.reason,
        })),
        evidenceCoverage: Number(result.award.evidenceCoverage.toFixed(4)),
      };
    },

    [ToolNames.compareScenarios]: async () => ({
      error:
        "Scenario persistence is not yet implemented. Call calculate_scenario for each set of " +
        "assumptions and compare the returned totals; state that the comparison was made this way.",
    }),

    [ToolNames.generateAwardBrief]: async () => ({
      error:
        "Brief generation is a separate surface. Compute the scenario with calculate_scenario and " +
        "present the recommendation directly.",
    }),
  };
}
