export const RFX_DRAFT_PROMPT_VERSION = "rfx-draft@1";

/** Generates the structured RFx once clarification is complete (spec §15). */
export const RFX_DRAFT_PROMPT = `Produce the RFx draft from the requirement and
the clarifications below.

Line items:
- Generate the number of line items the buyer asked for. Each needs a distinct
  SKU code, a specific description, and the specifications a supplier would need
  in order to quote — for packaging that means ply, dimensions, GSM, and print.
- Quantities must be realistic for the stated scope and internally consistent
  across the set. Do not repeat one quantity across every line.

Questionnaire:
- Ask what would actually change an award decision. Mark a question
  mandatoryForEligibility only when a failing answer should disqualify a vendor
  outright; that flag is enforced by code and will exclude suppliers.

Assumptions:
- Every value you chose that the buyer did not state is an assumption. Record it
  with origin AI_SUGGESTED and say why you chose it.
- Anything still genuinely open belongs in unresolvedQuestions, not in an
  invented default.

Requirement:
<requirement>
{{REQUIREMENT}}
</requirement>

Clarified context:
<context>
{{CONTEXT}}
</context>`;
