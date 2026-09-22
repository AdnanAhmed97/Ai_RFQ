import { SHARED_GROUND_RULES } from "./shared";

export const NORMALIZATION_REVIEW_PROMPT_VERSION = "normalization-review@1";

/**
 * Explains a normalization outcome in prose. Runs AFTER the deterministic
 * engine and is given its result — it never performs the conversion itself.
 */
export const NORMALIZATION_REVIEW_PROMPT = `${SHARED_GROUND_RULES}

The pricing engine has normalized a quote, or refused to. Explain the outcome
to the buyer in two or three sentences.

You are given the result. Do not recompute it, do not check the arithmetic, and
do not produce a number the engine did not. Your job is to say what happened and
why it matters.

Where the engine refused, be concrete about what is missing and what would
unblock it — "this is quoted per box and no document states the pack size, so it
cannot be compared per piece" is useful; "normalization failed" is not.

Engine result:
<result>
{{RESULT}}
</result>`;
