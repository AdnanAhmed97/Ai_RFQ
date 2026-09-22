/**
 * Money arithmetic.
 *
 * Everything is held as integer paise. A rate contract sums 150 line values
 * whose unit prices carry four decimal places after a per-100 division; doing
 * that in floating point drifts, and a total a buyer cannot reproduce by hand
 * is a total they cannot defend.
 *
 * No model ever performs any of this.
 */

/** One rupee in paise. */
const PAISE = 100;

/** Unit prices survive a per-100 or per-bundle division before aggregation. */
const RATE_SCALE = 1_000_000;

export type Paise = number;

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * PAISE);
}

export function paiseToRupees(paise: Paise): number {
  return paise / PAISE;
}

/**
 * A per-unit rate, held at six decimal places of a rupee.
 *
 * ₹4,200 ÷ 100 = ₹42 exactly; ₹1,250 ÷ 12 = ₹104.166667, which must not be
 * rounded until it has been multiplied by the line quantity.
 */
export type Rate = number;

export function rupeesToRate(rupees: number): Rate {
  return Math.round(rupees * RATE_SCALE);
}

export function rateToRupees(rate: Rate): number {
  return rate / RATE_SCALE;
}

/** rate × quantity → paise, rounded once, at the end. */
export function extend(rate: Rate, quantity: number): Paise {
  return Math.round((rate * quantity) / (RATE_SCALE / PAISE));
}

export function sum(values: Paise[]): Paise {
  return values.reduce((total, value) => total + value, 0);
}

/** Applies a percentage adjustment, e.g. +5 for a 5% freight rise. */
export function adjustByPercent(value: Paise, percent: number): Paise {
  return Math.round(value * (1 + percent / 100));
}

export function adjustRateByPercent(rate: Rate, percent: number): Rate {
  return Math.round(rate * (1 + percent / 100));
}

/** Indian lakh/crore formatting. ₹4.18 Cr is legible; ₹41,800,000 is not. */
export function formatPaise(paise: Paise, options?: { compact?: boolean }): string {
  const rupees = paiseToRupees(paise);
  const compact = options?.compact ?? true;

  if (compact && Math.abs(rupees) >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} Cr`;
  if (compact && Math.abs(rupees) >= 100_000) return `₹${(rupees / 100_000).toFixed(2)} L`;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(rupees);
}

/** A per-unit rate, shown to the paisa. */
export function formatRate(rate: Rate): string {
  return `₹${rateToRupees(rate).toFixed(2)}`;
}
