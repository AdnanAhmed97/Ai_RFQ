/**
 * How each vendor answered the questionnaire, in their own words.
 *
 * Note what is NOT here: any field saying whether an answer passes. Vendor C's
 * answer to Q4 is a sentence, not a verdict — deciding that a conditional "on
 * request above 50,000 pieces" fails a mandatory requirement is the eligibility
 * engine's job in Slice 6, working from extracted text.
 *
 * SEED DATA ONLY.
 */

import type { VendorKey } from "./profiles";

export interface FixtureAnswer {
  ref: string;
  /** Exactly the text printed on the vendor's questionnaire document. */
  answerText: string;
}

export const QUESTIONNAIRE_ANSWERS: Record<VendorKey, FixtureAnswer[]> = {
  "vendor-a": [
    { ref: "Q1", answerText: "Yes. ISO 9001:2015, certificate no. IN-QMS-114872, valid to Nov 2027." },
    { ref: "Q2", answerText: "Yes. All shipping containers conform to IS 2771 (Part 1)." },
    { ref: "Q3", answerText: "1,450 MT per month" },
    { ref: "Q4", answerText: "Yes. A bursting-strength certificate per IS 7028 accompanies every despatch." },
    { ref: "Q5", answerText: "Yes. FSC Chain of Custody, licence FSC-C138204." },
    { ref: "Q6", answerText: "3" },
    { ref: "Q7", answerText: "West, North, Central" },
    { ref: "Q8", answerText: "14 days" },
    { ref: "Q9", answerText: "35%" },
    { ref: "Q10", answerText: "Britannia Industries (Pune); Cipla Ltd (Goa)" },
  ],
  "vendor-b": [
    { ref: "Q1", answerText: "Yes — ISO 9001:2015 certified since 2019." },
    { ref: "Q2", answerText: "Yes, IS 2771 Part 1 compliant." },
    { ref: "Q3", answerText: "980 MT/month" },
    { ref: "Q4", answerText: "Yes, BS test certificate issued with each batch as per IS 7028." },
    { ref: "Q5", answerText: "Yes — FSC CoC certificate held, FSC-C119887." },
    { ref: "Q6", answerText: "2" },
    { ref: "Q7", answerText: "West, North" },
    { ref: "Q8", answerText: "18 days ex-works" },
    { ref: "Q9", answerText: "60%" },
    { ref: "Q10", answerText: "Amul (Anand); Torrent Pharmaceuticals (Ahmedabad)" },
  ],
  "vendor-c": [
    { ref: "Q1", answerText: "Yes. ISO 9001:2015 held." },
    { ref: "Q2", answerText: "Yes — conforms to IS 2771 Part 1." },
    { ref: "Q3", answerText: "2,100 MT per month across both units" },
    // The mandatory exception. Deliberately a condition, not a flat "No" — a
    // flat No would be trivial to classify and would not test anything.
    {
      ref: "Q4",
      answerText:
        "Batch-wise bursting strength certificates are issued on request for orders above 50,000 pieces. For smaller lots we provide a consolidated monthly test report rather than a per-batch certificate.",
    },
    { ref: "Q5", answerText: "Yes. FSC CoC licence FSC-C151093." },
    { ref: "Q6", answerText: "2" },
    { ref: "Q7", answerText: "South, West" },
    { ref: "Q8", answerText: "12 days" },
    { ref: "Q9", answerText: "72%" },
    { ref: "Q10", answerText: "Hindustan Unilever (Puducherry); Saint-Gobain India (Chennai)" },
  ],
  "vendor-d": [
    { ref: "Q1", answerText: "Yes, ISO 9001:2015 (TUV), valid till 09/2028." },
    { ref: "Q2", answerText: "Yes" },
    { ref: "Q3", answerText: "1,180 MT" },
    { ref: "Q4", answerText: "Yes — IS 7028 bursting strength certificate provided per batch." },
    { ref: "Q5", answerText: "Yes, PEFC Chain of Custody, PEFC/31-32-0091." },
    { ref: "Q6", answerText: "2" },
    { ref: "Q7", answerText: "West, North, Central" },
    { ref: "Q8", answerText: "16 days" },
    { ref: "Q9", answerText: "55%" },
    { ref: "Q10", answerText: "Asian Paints (Khandala); Pidilite Industries (Vapi)" },
  ],
  "vendor-e": [
    { ref: "Q1", answerText: "Yes. ISO 9001:2015." },
    { ref: "Q2", answerText: "Yes, conforms to IS 2771 Part 1 and to ISTA export norms." },
    { ref: "Q3", answerText: "760 MT per month" },
    { ref: "Q4", answerText: "Yes. Bursting strength certificate accompanies every batch." },
    // Deliberately undeterminable: neither a Yes nor a No. Whether this clears a
    // mandatory certification requirement is a judgement the buyer must make.
    {
      ref: "Q5",
      answerText:
        "FSC Chain of Custody renewal is currently in process with the certifying body. The previous certificate lapsed in January 2026. Documentation can be shared on request.",
    },
    { ref: "Q6", answerText: "1" },
    { ref: "Q7", answerText: "West, South, East" },
    { ref: "Q8", answerText: "21 days" },
    { ref: "Q9", answerText: "40%" },
    { ref: "Q10", answerText: "Godrej Consumer Products (Mumbai); Marico Ltd (Mumbai)" },
  ],
};
