import { writeFile } from "node:fs/promises";
import path from "node:path";

import { LINE_ITEMS } from "../rfx/corrugated-fy27";
import { VENDOR_PROFILES } from "../vendors/profiles";
import {
  VENDOR_C_FREIGHT_PER_PIECE,
  VENDOR_C_REVISED_SKUS,
  buildVendorLines,
  vendorCRevisedPrice,
} from "../vendors/quote-data";
import type { EvidenceRecord, GeneratedDocument } from "./types";

/**
 * Vendor C's follow-up email.
 *
 * This is where the real commercial position lives. It revises four rates the
 * spreadsheet already stated, introduces a freight charge the spreadsheet never
 * mentioned, and refers to items by the buyer's shorthand rather than by any
 * code. The spreadsheet is not reissued, so both documents stay on file saying
 * different things — which is precisely what happens in practice.
 */
export async function generateVendorCEmail(root: string): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES["vendor-c"];
  const lines = buildVendorLines("vendor-c");
  const evidence: EvidenceRecord[] = [];

  const revisionLines = VENDOR_C_REVISED_SKUS.map((sku) => {
    const rfxLine = LINE_ITEMS.find((l) => l.skuCode === sku)!;
    const original = lines.find((l) => l.skuCode === sku)!;
    const revised = vendorCRevisedPrice(sku)!;
    const size = rfxLine.specifications["internalDimensionsMm"]!.replace(/\s/g, "");
    return { sku, size, original: original.printedPrice, revised };
  });

  const body = `From: ${profile.contactName} <${profile.contactEmail}>
To: procurement@northfieldconsumer.co.in
Cc: krishnan.s@corrugateco.in
Date: Thu, 19 Mar 2026 18:42:11 +0530
Subject: RE: RFx FY27 Corrugated - our quote ref ${profile.quotationRef}
Message-ID: <CAF8h${profile.quotationRef.replace(/\W/g, "")}@mail.corrugateco.in>

Dear Sir,

Thank you for the call this afternoon. As discussed, please treat the following
as our revised position on the 5-ply double wall sizes. The rest of the sheet we
sent on Monday stands as quoted.

Revised rates, per piece:

${revisionLines
  .map((r) => `  ${r.size}  -  was ${r.original.toFixed(2)}, revised to ${r.revised.toFixed(2)}`)
  .join("\n")}

These revised rates are on the understanding that we get the full annual volume
on these four sizes and that the schedule is called off monthly.

Two other points which I should have covered in the original sheet:

1. Our rates are ex-works Ambattur. Freight to your plants will be charged extra
   at Rs. ${VENDOR_C_FREIGHT_PER_PIECE.toFixed(2)} per piece, flat, across all locations. We can absorb this
   if the order value crosses 2.5 crore for the year but I would need approval
   from our director for that.

2. On the bursting strength certificate point in your questionnaire - we do issue
   these, but per batch only for the larger lots. For the smaller sizes we work
   on a monthly consolidated test report. I hope this is acceptable. Please let
   me know if this is a problem and I will take it up internally.

Rest all terms same as last year.

Awaiting your confirmation.

Regards,

${profile.contactName}
Senior Manager - Sales
${profile.name} ${profile.legalSuffix}
${profile.addressLine}
M: ${profile.phone}
`;

  for (const r of revisionLines) {
    evidence.push({
      skuCode: r.sku,
      field: "quoted_price_revision",
      sourceText: `${r.size}  -  was ${r.original.toFixed(2)}, revised to ${r.revised.toFixed(2)}`,
    });
  }
  evidence.push({
    field: "freight",
    sourceText: `Our rates are ex-works Ambattur. Freight to your plants will be charged extra at Rs. ${VENDOR_C_FREIGHT_PER_PIECE.toFixed(2)} per piece, flat, across all locations.`,
  });
  evidence.push({
    field: "questionnaire:Q4",
    sourceText:
      "we do issue these, but per batch only for the larger lots. For the smaller sizes we work on a monthly consolidated test report.",
  });

  const relativePath = "vendors/vendor-c/commercial-email.txt";
  await writeFile(path.join(root, relativePath), body, "utf8");

  return { relativePath, mimeType: "text/plain", kind: "TEXT", evidence };
}
