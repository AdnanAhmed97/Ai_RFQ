/**
 * Prompt registry (spec §44).
 *
 * Prompts are versioned constants living outside UI code. The version string
 * is written to `extraction_runs.prompt_version`, so a result can always be
 * traced to the instructions that produced it.
 */
export { RFX_SYSTEM_PROMPT, RFX_SYSTEM_PROMPT_VERSION } from "./rfx-system";
export { RFX_CLARIFICATION_PROMPT, RFX_CLARIFICATION_PROMPT_VERSION } from "./rfx-clarification";
export { RFX_DRAFT_PROMPT, RFX_DRAFT_PROMPT_VERSION } from "./rfx-draft";
export { EXTRACTION_PROMPT, EXTRACTION_PROMPT_VERSION } from "./extraction";
export { LINE_MATCHING_PROMPT, LINE_MATCHING_PROMPT_VERSION } from "./line-matching";
export { NORMALIZATION_REVIEW_PROMPT, NORMALIZATION_REVIEW_PROMPT_VERSION } from "./normalization-review";
export { DECISION_AGENT_PROMPT, DECISION_AGENT_PROMPT_VERSION } from "./decision-agent";
export { AWARD_BRIEF_PROMPT, AWARD_BRIEF_PROMPT_VERSION } from "./award-brief";
export {
  ELIGIBILITY_REVIEW_PROMPT,
  ELIGIBILITY_REVIEW_PROMPT_VERSION,
} from "./eligibility-review";
export { SHARED_GROUND_RULES } from "./shared";
