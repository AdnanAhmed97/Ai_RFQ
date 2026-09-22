import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges conditional class names, resolving Tailwind conflicts predictably. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats INR the way procurement reads it: lakh and crore above a lakh,
 * plain rupees below. ₹4.18 Cr is legible; ₹41,800,000 is not.
 */
export function formatInr(amount: number, options?: { compact?: boolean }): string {
  if (!Number.isFinite(amount)) return "—";
  const compact = options?.compact ?? true;

  if (compact && Math.abs(amount) >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  }
  if (compact && Math.abs(amount) >= 100_000) {
    return `₹${(amount / 100_000).toFixed(2)} L`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}
