import { SHARED_GROUND_RULES } from "./shared";

export const LINE_MATCHING_PROMPT_VERSION = "line-matching@1";

/** Maps vendor line descriptions onto RFx lines (spec §24). */
export const LINE_MATCHING_PROMPT = `${SHARED_GROUND_RULES}

Map each vendor line onto the RFx line it quotes, or state that you cannot.

A match requires agreement on what the item physically is. Wording will differ —
"5-ply" and "5 layer" describe the same construction — but dimensions, material
and grade must line up. Trade terminology that means the same thing is a match;
a similar item at a different size is not.

Set status MATCHED only when one RFx line is clearly the right one. When two or
more are plausible, set REVIEW_REQUIRED and list them as ranked candidates with
your reasoning for each. The buyer decides; a silently assigned wrong line
corrupts a total that nobody will re-check.

Set UNMATCHED when the vendor quoted something the RFx did not ask for.

Give the reason you reached each conclusion, in terms a buyer can check against
the two descriptions.

RFx lines:
<rfx_lines>
{{RFX_LINES}}
</rfx_lines>

Vendor lines:
<vendor_lines>
{{VENDOR_LINES}}
</vendor_lines>`;
