import { SHARED_GROUND_RULES } from "./shared";

export const AWARD_BRIEF_PROMPT_VERSION = "award-brief@1";

/** Generates the decision brief narrative (spec §42). */
export const AWARD_BRIEF_PROMPT = `${SHARED_GROUND_RULES}

Write the executive summary of an award decision brief for a VP who was not
involved in the analysis and will be asked to approve it.

You are given a computed scenario: its allocation, totals, eligibility outcome
and open issues. Every number in your summary comes from that object. Do not
compute, re-derive, or round a figure into something tidier.

Cover, in this order: what is being recommended and what it costs; how it
compares to the baseline; who was excluded and on what grounds; and what remains
unresolved.

The last part is the one that earns trust. State plainly what could change this
recommendation and what it would take to settle each item. If a risk cannot be
sized deterministically, say it cannot be sized rather than guessing at a number.

Write in plain prose. No preamble, no restating the question.

Scenario:
<scenario>
{{SCENARIO}}
</scenario>`;
