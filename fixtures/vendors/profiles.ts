/**
 * The five suppliers, and the shape of what each one sent back.
 *
 * Every vendor here behaves like a different real company: a different house
 * format for item descriptions, a different way of stating freight, a different
 * degree of compliance with the quoting unit that was asked for. That variation
 * is the point — it is what the extraction pipeline will have to survive.
 *
 * SEED DATA ONLY.
 */

export type VendorKey = "vendor-a" | "vendor-b" | "vendor-c" | "vendor-d" | "vendor-e";

export interface VendorProfile {
  key: VendorKey;
  shortLabel: string;
  name: string;
  legalSuffix: string;
  city: string;
  state: string;
  addressLine: string;
  gstin: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  quotationRef: string;
  quotationDate: string;
  /** Multiplier applied to the RFx base price before deterministic jitter. */
  priceMultiplier: number;
  /** RFx SKUs this vendor did not quote at all. */
  omittedSkus: string[];
  /** How this vendor states freight in its own documents. */
  freightStatement: string;
  paymentTerms: string;
  validityDays: number;
  leadTimeDays: number;
}

export const VENDOR_PROFILES: Record<VendorKey, VendorProfile> = {
  "vendor-a": {
    key: "vendor-a",
    shortLabel: "Vendor A",
    name: "PackRight Industries",
    legalSuffix: "Pvt. Ltd.",
    city: "Pune",
    state: "Maharashtra",
    addressLine: "Plot 47, Chakan Industrial Area, Phase II, Pune 410501",
    gstin: "27AACCP4471K1ZP",
    contactName: "Sandeep Kulkarni",
    contactEmail: "sandeep.k@packrightind.co.in",
    phone: "+91 20 6742 1180",
    quotationRef: "PRI/QT/2603/0147",
    quotationDate: "14 March 2026",
    priceMultiplier: 1.0,
    omittedSkus: [],
    freightStatement:
      "All rates are inclusive of freight, delivered to your nominated plant locations (DDP).",
    paymentTerms: "60 days from date of invoice",
    validityDays: 90,
    leadTimeDays: 14,
  },
  "vendor-b": {
    key: "vendor-b",
    shortLabel: "Vendor B",
    name: "BoxWorks India",
    legalSuffix: "Pvt. Ltd.",
    city: "Ahmedabad",
    state: "Gujarat",
    addressLine: "Survey 188/2, Changodar Industrial Estate, Ahmedabad 382213",
    gstin: "24AABCB9912M1Z4",
    contactName: "Rakesh Patel",
    contactEmail: "rakesh@boxworksindia.com",
    phone: "+91 79 2974 3300",
    quotationRef: "BWI-QTN-0392/26",
    quotationDate: "17 March 2026",
    priceMultiplier: 0.97,
    // Does not run the very large double-wall line or roll stock.
    omittedSkus: ["CP-5R-013", "CP-7R-019", "CP-WRP-030"],
    freightStatement:
      "Prices quoted are Ex-Works Changodar. Freight extra, at actuals.",
    paymentTerms: "45 days from invoice",
    validityDays: 60,
    leadTimeDays: 18,
  },
  "vendor-c": {
    key: "vendor-c",
    shortLabel: "Vendor C",
    name: "CorrugateCo",
    legalSuffix: "Industries Ltd.",
    city: "Chennai",
    state: "Tamil Nadu",
    addressLine: "No. 22, SIDCO Industrial Estate, Ambattur, Chennai 600098",
    gstin: "33AAACC8823R1ZN",
    contactName: "M. Vigneshwaran",
    contactEmail: "vignesh@corrugateco.in",
    phone: "+91 44 2625 7714",
    quotationRef: "CC/SALES/26-27/118",
    quotationDate: "16 March 2026",
    priceMultiplier: 0.915,
    omittedSkus: [],
    // The Excel says nothing about freight at all. It surfaces only in the email.
    freightStatement: "",
    paymentTerms: "30 days from invoice",
    validityDays: 45,
    leadTimeDays: 12,
  },
  "vendor-d": {
    key: "vendor-d",
    shortLabel: "Vendor D",
    name: "PrimePack",
    legalSuffix: "Packaging Pvt. Ltd.",
    city: "Vapi",
    state: "Gujarat",
    addressLine: "Plot 218/A, GIDC Phase III, Vapi 396195",
    gstin: "24AADCP5567Q1ZB",
    contactName: "Jignesh Desai",
    contactEmail: "jignesh.desai@primepack.co.in",
    phone: "+91 260 240 8821",
    quotationRef: "PP/Q/26/0554",
    quotationDate: "19 March 2026",
    priceMultiplier: 0.985,
    omittedSkus: ["CP-7R-019"],
    // Conditional on distance — and printed small, at the foot of the page.
    freightStatement:
      "Rates inclusive of freight within 200 km of Vapi works. Beyond 200 km freight extra at actuals, approx. Rs. 2.20 per km per vehicle.",
    paymentTerms: "45 days from invoice",
    validityDays: 60,
    leadTimeDays: 16,
  },
  "vendor-e": {
    key: "vendor-e",
    shortLabel: "Vendor E",
    name: "GlobalPack",
    legalSuffix: "Exports Pvt. Ltd.",
    city: "Mumbai",
    state: "Maharashtra",
    addressLine: "Unit 9, Marol MIDC, Andheri East, Mumbai 400093",
    gstin: "27AAGCG2214L1ZM",
    contactName: "Farida Merchant",
    contactEmail: "farida.m@globalpackexports.com",
    phone: "+91 22 2836 4409",
    quotationRef: "GPE/RC/2026-27",
    quotationDate: "21 March 2026",
    priceMultiplier: 1.04,
    omittedSkus: ["CP-WRP-030", "CP-5T-017"],
    freightStatement: "Freight: As applicable.",
    paymentTerms: "30 days",
    validityDays: 30,
    leadTimeDays: 21,
  },
};

export const VENDOR_KEYS: VendorKey[] = [
  "vendor-a",
  "vendor-b",
  "vendor-c",
  "vendor-d",
  "vendor-e",
];
