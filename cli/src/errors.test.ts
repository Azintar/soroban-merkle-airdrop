/**
 * Unit tests for translateContractError (issue #506).
 *
 * translateContractError maps well-known Soroban contract error strings to
 * human-readable messages and passes unknown errors through unchanged.
 *
 * The error map contains three codes:
 *   #1 / AlreadyClaimed  — address has already claimed
 *   #2 / NotActive       — airdrop is paused
 *   #3 / InvalidProof    — Merkle proof is invalid
 */

import { describe, it, expect } from "vitest";
import { translateContractError } from "./errors.js";

describe("translateContractError", () => {
  // ── Error(Contract, #1) — AlreadyClaimed ───────────────────────────────

  it("maps Error(Contract, #1) to AlreadyClaimed message", () => {
    expect(translateContractError("Error(Contract, #1)")).toBe(
      "This address has already claimed their allocation."
    );
  });

  it("maps the named pattern 'AlreadyClaimed' to the same message", () => {
    expect(translateContractError("contract error: AlreadyClaimed")).toBe(
      "This address has already claimed their allocation."
    );
  });

  it("matches AlreadyClaimed case-insensitively", () => {
    expect(translateContractError("HostError: alreadyclaimed")).toBe(
      "This address has already claimed their allocation."
    );
  });

  // ── Error(Contract, #2) — NotActive ────────────────────────────────────

  it("maps Error(Contract, #2) to NotActive message", () => {
    expect(translateContractError("Error(Contract, #2)")).toBe(
      "The airdrop is currently paused. Please try again later."
    );
  });

  it("maps the named pattern 'NotActive' to the same message", () => {
    expect(translateContractError("contract error: NotActive")).toBe(
      "The airdrop is currently paused. Please try again later."
    );
  });

  it("matches NotActive case-insensitively", () => {
    expect(translateContractError("HostError: notactive")).toBe(
      "The airdrop is currently paused. Please try again later."
    );
  });

  // ── Error(Contract, #3) — InvalidProof ─────────────────────────────────

  it("maps Error(Contract, #3) to InvalidProof message", () => {
    expect(translateContractError("Error(Contract, #3)")).toBe(
      "Invalid Merkle proof. Your proof file may be outdated."
    );
  });

  it("maps the named pattern 'InvalidProof' to the same message", () => {
    expect(translateContractError("contract error: InvalidProof")).toBe(
      "Invalid Merkle proof. Your proof file may be outdated."
    );
  });

  it("matches InvalidProof case-insensitively", () => {
    expect(translateContractError("HostError: invalidproof")).toBe(
      "Invalid Merkle proof. Your proof file may be outdated."
    );
  });

  // ── Passthrough — unknown errors returned unchanged ─────────────────────

  it("passes through an unknown error code unchanged", () => {
    const raw = "Error(Contract, #99)";
    expect(translateContractError(raw)).toBe(raw);
  });

  it("passes through a network error unchanged", () => {
    const raw = "Network request failed: ECONNREFUSED";
    expect(translateContractError(raw)).toBe(raw);
  });

  it("passes through an empty string unchanged", () => {
    expect(translateContractError("")).toBe("");
  });

  it("passes through an unrelated error type unchanged", () => {
    const raw = "TypeError: Cannot read properties of undefined";
    expect(translateContractError(raw)).toBe(raw);
  });
});
