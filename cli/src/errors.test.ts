/**
 * Tests for cli/src/errors.ts — translateContractError and ERROR_MAP.
 *
 * Verifies that all 8 Rust AirdropError codes map to the correct messages,
 * and that variant-name strings are also handled.
 */

import { describe, it, expect } from "vitest";
import { translateContractError, ERROR_MAP } from "./errors.js";

describe("ERROR_MAP", () => {
  it("contains exactly 8 entries", () => {
    expect(ERROR_MAP).toHaveLength(8);
  });
});

describe("translateContractError", () => {
  // -------------------------------------------------------------------------
  // Numeric code matching (the format produced by the Stellar SDK)
  // -------------------------------------------------------------------------

  it("#1 → AlreadyInitialized message", () => {
    const result = translateContractError("Error(Contract, #1)");
    expect(result).toBe("This contract has already been initialized.");
  });

  it("#2 → AlreadyClaimed message", () => {
    const result = translateContractError("Error(Contract, #2)");
    expect(result).toBe("This address has already claimed their allocation.");
  });

  it("#3 → InvalidProof message", () => {
    const result = translateContractError("Error(Contract, #3)");
    expect(result).toContain("Invalid Merkle proof");
  });

  it("#4 → NotActive (paused) message", () => {
    const result = translateContractError("Error(Contract, #4)");
    expect(result).toContain("paused");
  });

  it("#5 → NotInitialized message", () => {
    const result = translateContractError("Error(Contract, #5)");
    expect(result).toBe("The contract has not been initialized yet.");
  });

  it("#6 → ZeroAmount message", () => {
    const result = translateContractError("Error(Contract, #6)");
    expect(result).toBe("Amount must be greater than zero.");
  });

  it("#7 → NotYetExpired message", () => {
    const result = translateContractError("Error(Contract, #7)");
    expect(result).toContain("not expired yet");
  });

  it("#8 → ExpirationInPast message", () => {
    const result = translateContractError("Error(Contract, #8)");
    expect(result).toContain("future");
  });

  // -------------------------------------------------------------------------
  // Variant name matching (useful when SDK surfaces the variant text)
  // -------------------------------------------------------------------------

  it("matches AlreadyClaimed variant name (case-insensitive)", () => {
    expect(translateContractError("AlreadyClaimed")).toBe(
      "This address has already claimed their allocation."
    );
  });

  it("matches NotActive variant name", () => {
    expect(translateContractError("NotActive")).toContain("paused");
  });

  it("matches InvalidProof variant name", () => {
    expect(translateContractError("invalidproof")).toContain("Invalid Merkle proof");
  });

  // -------------------------------------------------------------------------
  // Correct mapping — issue #486 regression checks
  // -------------------------------------------------------------------------

  it("#2 returns 'already claimed' message, NOT 'paused'", () => {
    const result = translateContractError("Error(Contract, #2)");
    expect(result).not.toContain("paused");
    expect(result).toContain("already claimed");
  });

  it("#4 returns 'paused' message, NOT 'already claimed'", () => {
    const result = translateContractError("Error(Contract, #4)");
    expect(result).not.toContain("already claimed");
    expect(result).toContain("paused");
  });

  // -------------------------------------------------------------------------
  // Unknown errors pass through unchanged
  // -------------------------------------------------------------------------

  it("returns the raw string for unrecognised errors", () => {
    const raw = "Error(Contract, #99)";
    expect(translateContractError(raw)).toBe(raw);
  });

  it("returns the raw string when no contract error", () => {
    const raw = "Network timeout";
    expect(translateContractError(raw)).toBe(raw);
  });
});
