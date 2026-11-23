/**
 * Unit tests for the batch-claim command (issue #504).
 *
 * All SDK and file-system calls are mocked — no real network access occurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runBatchClaim } from "./batch-claim.js";

// ─── Mock the SDK ─────────────────────────────────────────────────────────────

vi.mock("@soroban-merkle-airdrop/sdk", () => ({
  createAirdropClient: vi.fn(() => ({
    batchClaim: vi.fn().mockResolvedValue({ txHash: "batchhash123" }),
    buildBatchClaimTransaction: vi
      .fn()
      .mockResolvedValue({ xdr: "AAAAAXDR==", fee: "12345" }),
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

vi.mock("@stellar/stellar-sdk", () => ({
  Keypair: {
    fromSecret: vi.fn(() => ({
      publicKey: vi.fn().mockReturnValue("GOPUBKEY123"),
    })),
  },
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

// ─── Test data ────────────────────────────────────────────────────────────────

const ADDR_A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const ADDR_B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

const VALID_TREE = JSON.stringify({
  root: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  totalAmount: "2000",
  proofs: {
    [ADDR_A]: { address: ADDR_A, amount: "1000", proof: ["aabb"] },
    [ADDR_B]: { address: ADDR_B, amount: "1000", proof: ["ccdd"] },
  },
});

const VALID_ADDRESSES = `${ADDR_A}\n${ADDR_B}\n`;

const BASE_OPTS = {
  tree: "tree.json",
  addresses: "addresses.txt",
  operatorKey: "SOPERATOR123KEY",
  network: "testnet",
  contractId: "CTEST123",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("batch-claim command (issue #504)", () => {
  let mockBatchClaim: ReturnType<typeof vi.fn>;
  let mockBuildBatchClaimTransaction: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default fs mock — tree.json returns VALID_TREE, addresses.txt returns addresses.
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockImplementation((path: unknown) => {
      if (String(path).endsWith(".json")) return Promise.resolve(VALID_TREE);
      return Promise.resolve(VALID_ADDRESSES);
    });

    // Re-configure SDK mocks so we have fresh spies per test.
    const sdk = await import("@soroban-merkle-airdrop/sdk");
    vi.mocked(sdk.verifyProof).mockReturnValue(true);

    mockBatchClaim = vi.fn().mockResolvedValue({ txHash: "batchhash123" });
    mockBuildBatchClaimTransaction = vi
      .fn()
      .mockResolvedValue({ xdr: "AAAAAXDR==", fee: "12345" });

    vi.mocked(sdk.createAirdropClient).mockReturnValue({
      batchClaim: mockBatchClaim,
      buildBatchClaimTransaction: mockBuildBatchClaimTransaction,
    } as ReturnType<typeof sdk.createAirdropClient>);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("calls batchClaim with entries built from tree and address file", async () => {
    const result = await runBatchClaim(BASE_OPTS);

    expect(mockBatchClaim).toHaveBeenCalledWith(
      [
        { address: ADDR_A, amount: 1000n, proof: ["aabb"] },
        { address: ADDR_B, amount: 1000n, proof: ["ccdd"] },
      ],
      "SOPERATOR123KEY"
    );
    expect(result).toEqual({ txHash: "batchhash123", count: 2 });
  });

  it("returns txHash and count on success", async () => {
    const result = await runBatchClaim(BASE_OPTS);
    expect("txHash" in result && result.txHash).toBe("batchhash123");
    expect(result.count).toBe(2);
  });

  // ── Dry-run ─────────────────────────────────────────────────────────────────

  it("calls buildBatchClaimTransaction instead of batchClaim in dry-run mode", async () => {
    const result = await runBatchClaim({ ...BASE_OPTS, dryRun: true });

    expect(mockBatchClaim).not.toHaveBeenCalled();
    expect(mockBuildBatchClaimTransaction).toHaveBeenCalled();
    expect("xdr" in result && result.xdr).toBe("AAAAAXDR==");
    expect("fee" in result && result.fee).toBe("12345");
    expect(result.count).toBe(2);
  });

  // ── Address file parsing ────────────────────────────────────────────────────

  it("ignores blank lines and comment lines in the addresses file", async () => {
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockImplementation((path: unknown) => {
      if (String(path).endsWith(".json")) return Promise.resolve(VALID_TREE);
      return Promise.resolve(`# comment\n\n${ADDR_A}\n  \n${ADDR_B}\n`);
    });

    const result = await runBatchClaim(BASE_OPTS);
    expect(result.count).toBe(2);
  });

  it("throws when addresses file is empty", async () => {
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockImplementation((path: unknown) => {
      if (String(path).endsWith(".json")) return Promise.resolve(VALID_TREE);
      return Promise.resolve("# only comments\n\n");
    });

    await expect(runBatchClaim(BASE_OPTS)).rejects.toThrow(
      /Addresses file is empty/
    );
  });

  // ── Missing addresses ───────────────────────────────────────────────────────

  it("throws when an address is not in the tree", async () => {
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockImplementation((path: unknown) => {
      if (String(path).endsWith(".json")) return Promise.resolve(VALID_TREE);
      return Promise.resolve(`${ADDR_A}\nGUNKNOWN999\n`);
    });

    await expect(runBatchClaim(BASE_OPTS)).rejects.toThrow(
      /not found in the airdrop tree/
    );
  });

  // ── Proof verification ──────────────────────────────────────────────────────

  it("throws when local proof verification fails for an address", async () => {
    const sdk = await import("@soroban-merkle-airdrop/sdk");
    vi.mocked(sdk.verifyProof).mockReturnValueOnce(false);

    await expect(runBatchClaim(BASE_OPTS)).rejects.toThrow(
      /Proof verification failed/
    );
  });

  // ── Network validation ──────────────────────────────────────────────────────

  it("throws for an unknown network", async () => {
    await expect(
      runBatchClaim({ ...BASE_OPTS, network: "regtest" })
    ).rejects.toThrow(/Unknown network/);
  });

  // ── SDK error propagation ───────────────────────────────────────────────────

  it("propagates SDK errors from batchClaim", async () => {
    mockBatchClaim.mockRejectedValueOnce(new Error("Error(Contract, #1)"));

    await expect(runBatchClaim(BASE_OPTS)).rejects.toThrow("Error(Contract, #1)");
  });
});
