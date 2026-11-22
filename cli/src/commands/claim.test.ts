/**
 * Tests for the claim command.
 *
 * Section 1: translateContractError unit tests (issue #66).
 * Section 2: --verify-only integration tests (issue #508).
 *
 * No actual RPC calls are made — all SDK interactions are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { translateContractError } from "../errors.js";
import { claimCommand } from "./claim.js";

// ─── Section 1: translateContractError ───────────────────────────────────────

describe("translateContractError", () => {
  // ── AlreadyClaimed ──────────────────────────────────────────────────────

  it("translates 'Error(Contract, #1)' to AlreadyClaimed message", () => {
    const result = translateContractError("Error(Contract, #1)");
    expect(result).toBe("This address has already claimed their allocation.");
  });

  it("translates string containing 'AlreadyClaimed'", () => {
    const result = translateContractError("contract error: AlreadyClaimed");
    expect(result).toBe("This address has already claimed their allocation.");
  });

  it("translates AlreadyClaimed case-insensitively", () => {
    const result = translateContractError("HostError: alreadyclaimed");
    expect(result).toBe("This address has already claimed their allocation.");
  });

  // ── NotActive ───────────────────────────────────────────────────────────

  it("translates 'Error(Contract, #2)' to NotActive message", () => {
    const result = translateContractError("Error(Contract, #2)");
    expect(result).toBe("The airdrop is currently paused. Please try again later.");
  });

  it("translates string containing 'NotActive'", () => {
    const result = translateContractError("contract error: NotActive");
    expect(result).toBe("The airdrop is currently paused. Please try again later.");
  });

  it("translates NotActive case-insensitively", () => {
    const result = translateContractError("HostError: notactive");
    expect(result).toBe("The airdrop is currently paused. Please try again later.");
  });

  // ── InvalidProof ────────────────────────────────────────────────────────

  it("translates 'Error(Contract, #3)' to InvalidProof message", () => {
    const result = translateContractError("Error(Contract, #3)");
    expect(result).toBe("Invalid Merkle proof. Your proof file may be outdated.");
  });

  it("translates string containing 'InvalidProof'", () => {
    const result = translateContractError("contract error: InvalidProof");
    expect(result).toBe("Invalid Merkle proof. Your proof file may be outdated.");
  });

  it("translates InvalidProof case-insensitively", () => {
    const result = translateContractError("HostError: invalidproof");
    expect(result).toBe("Invalid Merkle proof. Your proof file may be outdated.");
  });

  // ── Unknown errors — pass through unchanged ─────────────────────────────

  it("returns raw message for unknown error codes", () => {
    const raw = "Error(Contract, #99)";
    expect(translateContractError(raw)).toBe(raw);
  });

  it("returns raw message for network errors", () => {
    const raw = "Network request failed: ECONNREFUSED";
    expect(translateContractError(raw)).toBe(raw);
  });

  it("returns raw message for empty string", () => {
    expect(translateContractError("")).toBe("");
  });

  it("returns raw message for unrelated error text", () => {
    const raw = "TypeError: Cannot read properties of undefined";
    expect(translateContractError(raw)).toBe(raw);
  });
});

// ─── Section 2: --verify-only tests (issue #508) ─────────────────────────────

// All SDK interactions are mocked — vi.mock is hoisted so no top-level
// variable references inside the factory.

vi.mock("@soroban-merkle-airdrop/sdk", () => ({
  createAirdropClient: vi.fn(() => ({
    isClaimed: vi.fn(),
    merkleRoot: vi.fn(),
    claim: vi.fn(),
  })),
  verifyProof: vi.fn().mockReturnValue(true),
  NETWORKS: {
    testnet: {
      network: "testnet",
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
  },
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

const TEST_ROOT =
  "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const TEST_ADDR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const TREE_JSON = JSON.stringify({
  root: TEST_ROOT,
  totalAmount: "1000",
  proofs: {
    [TEST_ADDR]: { address: TEST_ADDR, amount: "1000", proof: ["aabb"] },
  },
});

const BASE_VERIFY_OPTS = {
  tree: "tree.json",
  address: TEST_ADDR,
  secretKey: "",
  network: "testnet",
  contractId: "CTEST123",
  verifyOnly: true as const,
};

describe("claim --verify-only (issue #508)", () => {
  let mockIsClaimed: ReturnType<typeof vi.fn>;
  let mockMerkleRoot: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Always return valid tree JSON from the filesystem.
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockResolvedValue(TREE_JSON);

    // Always return true for local proof verification.
    const sdk = await import("@soroban-merkle-airdrop/sdk");
    vi.mocked(sdk.verifyProof).mockReturnValue(true);

    // Set up fresh spies per test.
    mockIsClaimed = vi.fn();
    mockMerkleRoot = vi.fn();
    vi.mocked(sdk.createAirdropClient).mockReturnValue({
      isClaimed: mockIsClaimed,
      merkleRoot: mockMerkleRoot,
      claim: vi.fn(),
    } as ReturnType<typeof sdk.createAirdropClient>);
  });

  // ── a. Valid proof, address not yet claimed ─────────────────────────────

  it("returns verified=true and alreadyClaimed=false when proof is valid and not yet claimed", async () => {
    const { runClaim } = await import("./claim.js");

    mockIsClaimed.mockResolvedValue(false);
    mockMerkleRoot.mockResolvedValue(TEST_ROOT); // matches tree root

    const result = await runClaim(BASE_VERIFY_OPTS);

    expect("verified" in result && result.verified).toBe(true);
    if ("verified" in result) {
      expect(result.alreadyClaimed).toBe(false);
      expect(result.rootMismatch).toBe(false);
      expect(result.onChainRoot).toBe(TEST_ROOT);
      expect(result.treeRoot).toBe(TEST_ROOT);
      expect(result.address).toBe(TEST_ADDR);
      expect(result.amount).toBe(1000n);
    }
  });

  // ── b. Address has already claimed ─────────────────────────────────────

  it("returns alreadyClaimed=true when isClaimed returns true", async () => {
    const { runClaim } = await import("./claim.js");

    mockIsClaimed.mockResolvedValue(true);
    mockMerkleRoot.mockResolvedValue(TEST_ROOT);

    const result = await runClaim(BASE_VERIFY_OPTS);

    expect("verified" in result && result.verified).toBe(true);
    if ("verified" in result) {
      expect(result.alreadyClaimed).toBe(true);
    }
  });

  // ── c. On-chain root does not match tree root ───────────────────────────

  it("returns rootMismatch=true when on-chain root differs from tree root", async () => {
    const { runClaim } = await import("./claim.js");

    const differentRoot =
      "1111111111111111111111111111111111111111111111111111111111111111";
    mockIsClaimed.mockResolvedValue(false);
    mockMerkleRoot.mockResolvedValue(differentRoot);

    const result = await runClaim(BASE_VERIFY_OPTS);

    expect("verified" in result && result.verified).toBe(true);
    if ("verified" in result) {
      expect(result.rootMismatch).toBe(true);
      expect(result.onChainRoot).toBe(differentRoot);
      expect(result.treeRoot).toBe(TEST_ROOT);
    }
  });

  // ── Additional: null on-chain root (not initialised) ───────────────────

  it("does not report rootMismatch when on-chain root is null (contract not initialised)", async () => {
    const { runClaim } = await import("./claim.js");

    mockIsClaimed.mockResolvedValue(false);
    mockMerkleRoot.mockResolvedValue(null);

    const result = await runClaim(BASE_VERIFY_OPTS);

    if ("verified" in result) {
      expect(result.rootMismatch).toBe(false);
      expect(result.onChainRoot).toBeNull();
    }
  });

  // ── Additional: address not in tree ────────────────────────────────────

  it("throws when address is not in the tree", async () => {
    const { runClaim } = await import("./claim.js");

    await expect(
      runClaim({ ...BASE_VERIFY_OPTS, address: "GUNKNOWN999" })
    ).rejects.toThrow(/not found in airdrop list/);
  });

  // ── Additional: local proof verification failure ────────────────────────

  it("throws when local proof verification fails", async () => {
    const { runClaim } = await import("./claim.js");
    const sdk = await import("@soroban-merkle-airdrop/sdk");
    vi.mocked(sdk.verifyProof).mockReturnValue(false);

    await expect(runClaim(BASE_VERIFY_OPTS)).rejects.toThrow(
      /Proof verification failed/
    );
  });
});
