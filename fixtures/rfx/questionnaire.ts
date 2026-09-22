/**
 * Supplier questionnaire for the FY27 corrugated RFx.
 *
 * Four questions are eligibility-bearing. They were chosen because a failing
 * answer genuinely should disqualify a supplier for this category — a plant
 * that cannot produce a batch bursting-strength certificate cannot support a
 * quality claim downstream, whatever its price.
 *
 * SEED DATA ONLY.
 */

export interface FixtureQuestion {
  position: number;
  /** Buyer-facing reference, e.g. "Q4". Vendors answer against these. */
  ref: string;
  question: string;
  type: "yes_no" | "text" | "number" | "single_select" | "multi_select";
  required: boolean;
  mandatoryForEligibility: boolean;
  options?: string[];
}

export const QUESTIONNAIRE: FixtureQuestion[] = [
  {
    position: 1,
    ref: "Q1",
    question: "Is your manufacturing facility ISO 9001:2015 certified?",
    type: "yes_no",
    required: true,
    mandatoryForEligibility: true,
  },
  {
    position: 2,
    ref: "Q2",
    question:
      "Do your corrugated boxes conform to IS 2771 (Part 1) for fibreboard shipping containers?",
    type: "yes_no",
    required: true,
    mandatoryForEligibility: true,
  },
  {
    position: 3,
    ref: "Q3",
    question: "What is your monthly corrugated production capacity, in metric tonnes?",
    type: "number",
    required: true,
    mandatoryForEligibility: false,
  },
  {
    position: 4,
    ref: "Q4",
    question:
      "Will you supply a bursting-strength test certificate per IS 7028 with every despatched batch?",
    type: "yes_no",
    required: true,
    mandatoryForEligibility: true,
  },
  {
    position: 5,
    ref: "Q5",
    question: "Do you hold a valid FSC or PEFC chain-of-custody certificate?",
    type: "yes_no",
    required: true,
    mandatoryForEligibility: true,
  },
  {
    position: 6,
    ref: "Q6",
    question: "How many manufacturing plants do you operate?",
    type: "number",
    required: true,
    mandatoryForEligibility: false,
  },
  {
    position: 7,
    ref: "Q7",
    question: "Which regions can you service on a delivered basis?",
    type: "multi_select",
    required: true,
    mandatoryForEligibility: false,
    options: ["North", "West", "South", "East", "Central"],
  },
  {
    position: 8,
    ref: "Q8",
    question: "What is your standard lead time from purchase order, in days?",
    type: "number",
    required: true,
    mandatoryForEligibility: false,
  },
  {
    position: 9,
    ref: "Q9",
    question: "What percentage of recycled fibre do you use in your standard kraft liner?",
    type: "number",
    required: false,
    mandatoryForEligibility: false,
  },
  {
    position: 10,
    ref: "Q10",
    question:
      "Please name two customer references in FMCG or pharmaceutical manufacturing.",
    type: "text",
    required: true,
    mandatoryForEligibility: false,
  },
];

export const COMMERCIAL_TERMS = {
  currency: "INR" as const,
  pricingBasis: "per piece, delivered to plant",
  paymentTermsDays: 60,
  deliveryTerms: "Delivered to plant (DDP) at each of 12 nominated locations",
  freightExpectation: "INCLUDED" as const,
  quoteValidityDays: 90,
  notes:
    "Rates must be quoted inclusive of freight to each nominated plant. GST to " +
    "be shown separately and is not part of rate comparison. Quote per the unit " +
    "stated against each line; where a supply bundle differs from the quoting " +
    "unit, state the bundle quantity explicitly.",
};

export const EVALUATION_CRITERIA = [
  {
    label: "Delivered cost",
    weight: 60,
    description: "Total landed cost across the awarded lines, freight inclusive.",
  },
  {
    label: "Quality and compliance",
    weight: 20,
    description: "Certification, batch testing regime and conformance to IS 2771.",
  },
  {
    label: "Lead time and reliability",
    weight: 10,
    description: "Standard lead time and ability to service urgent replenishment.",
  },
  {
    label: "Capacity and resilience",
    weight: 10,
    description: "Monthly capacity headroom and multi-plant coverage.",
  },
];
