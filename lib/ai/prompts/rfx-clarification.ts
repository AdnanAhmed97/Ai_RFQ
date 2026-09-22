export const RFX_CLARIFICATION_PROMPT_VERSION = "rfx-clarification@1";

/** Per-turn instruction. Appended after the buyer's message. */
export const RFX_CLARIFICATION_PROMPT = `Given the conversation so far and what
you already know, decide what to do next.

If material information is still missing, ask for it — at most three questions,
each one that would change the RFx if answered differently.

If you have enough to draft, set readyToDraft true and say so plainly.

Record every fact you learned this turn in contextUpdates. Leave a field null if
this turn taught you nothing about it; do not restate values you already held
unless the buyer changed them.

Known so far:
<known_context>
{{CONTEXT}}
</known_context>`;
