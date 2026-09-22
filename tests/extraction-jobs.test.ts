import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  EXTRACTION_JOB_STATES,
  STATE_LABELS,
  STATE_PROGRESS,
  TERMINAL_JOB_STATES,
  canTransition,
  isTerminal,
} from "@/lib/jobs/types";

describe("extraction job state machine", () => {
  it("defines the eight states the slice requires", () => {
    expect([...EXTRACTION_JOB_STATES]).toEqual([
      "QUEUED",
      "PROCESSING",
      "EXTRACTING",
      "MATCHING",
      "VALIDATING",
      "COMPLETE",
      "NEEDS_REVIEW",
      "FAILED",
    ]);
  });

  it("gives every state a progress value and a buyer-facing label", () => {
    for (const state of EXTRACTION_JOB_STATES) {
      expect(STATE_PROGRESS[state], state).toBeGreaterThanOrEqual(0);
      expect(STATE_PROGRESS[state], state).toBeLessThanOrEqual(100);
      expect(STATE_LABELS[state], state).toBeTruthy();
    }
  });

  it("walks the happy path one stage at a time", () => {
    const path = ["QUEUED", "PROCESSING", "EXTRACTING", "MATCHING", "VALIDATING", "COMPLETE"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("refuses to jump straight to COMPLETE, so progress cannot be faked", () => {
    // A job that reaches COMPLETE without passing through the work would be
    // indistinguishable afterwards from one that did it.
    expect(canTransition("QUEUED", "COMPLETE")).toBe(false);
    expect(canTransition("PROCESSING", "COMPLETE")).toBe(false);
    expect(canTransition("EXTRACTING", "COMPLETE")).toBe(false);
    expect(canTransition("MATCHING", "COMPLETE")).toBe(false);
  });

  it("never moves backwards through the pipeline", () => {
    expect(canTransition("MATCHING", "EXTRACTING")).toBe(false);
    expect(canTransition("VALIDATING", "MATCHING")).toBe(false);
  });

  it("lets any working state fail, and only a failure be re-queued", () => {
    for (const state of ["QUEUED", "PROCESSING", "EXTRACTING", "MATCHING", "VALIDATING"] as const) {
      expect(canTransition(state, "FAILED"), state).toBe(true);
    }
    expect(canTransition("FAILED", "QUEUED")).toBe(true);
    expect(canTransition("COMPLETE", "QUEUED")).toBe(false);
    expect(canTransition("NEEDS_REVIEW", "QUEUED")).toBe(false);
  });

  it("treats COMPLETE, NEEDS_REVIEW and FAILED as outcomes", () => {
    expect([...TERMINAL_JOB_STATES]).toEqual(["COMPLETE", "NEEDS_REVIEW", "FAILED"]);
    expect(isTerminal("COMPLETE")).toBe(true);
    expect(isTerminal("NEEDS_REVIEW")).toBe(true);
    expect(isTerminal("EXTRACTING")).toBe(false);
  });

  it("distinguishes NEEDS_REVIEW from COMPLETE, rather than collapsing them", () => {
    // "4 of 5 processed, one needs review" is the honest report; a single
    // success state would erase that (spec §49).
    expect(ALLOWED_TRANSITIONS.COMPLETE).toEqual([]);
    expect(ALLOWED_TRANSITIONS.NEEDS_REVIEW).toEqual([]);
    expect(STATE_LABELS.NEEDS_REVIEW).not.toBe(STATE_LABELS.COMPLETE);
  });

  it("only ever transitions into a declared state", () => {
    const declared = new Set<string>(EXTRACTION_JOB_STATES);
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(declared.has(from), from).toBe(true);
      for (const to of targets) expect(declared.has(to), `${from} -> ${to}`).toBe(true);
    }
  });
});
