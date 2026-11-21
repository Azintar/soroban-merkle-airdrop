/**
 * Unit tests for the update-root command (issue #503).
 *
 * All SDK and file-system calls are mocked — no real network access occurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runUpdateRoot } from "./update-root.js";

// ─── Mock the SDK ─────────────────────────────────────────────────────────────
// vi.mock is hoisted to the top — no top-level variable references inside factories.

vi.mock("@soroban-merkle-airdrop/sdk", () => ({
  createAirdropClient: vi.fn(() => ({
    updateMerkleRoot: vi.fn().mockResolvedValue({ txHash: "deadbeef1234" }),
  })),
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_TREE = JSON.stringify({
  root: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  totalAmount: "500000",
  proofs: {},
});

const BASE_OPTS = {
  tree: "tree.json",
  adminKey: "SSECRETADMINKEY",
  network: "testnet",
  contractId: "CTEST123",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("update-root command (issue #503)", () => {
  let mockUpdateMerkleRoot: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up fs/promises mock to return valid tree JSON by default.
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockResolvedValue(VALID_TREE);

    // Re-configure the SDK mock so we can capture the updateMerkleRoot spy.
    const sdk = await import("@soroban-merkle-airdrop/sdk");
    mockUpdateMerkleRoot = vi.fn().mockResolvedValue({ txHash: "deadbeef1234" });
    vi.mocked(sdk.createAirdropClient).mockReturnValue({
      updateMerkleRoot: mockUpdateMerkleRoot,
    } as ReturnType<typeof sdk.createAirdropClient>);
  });

  it("calls updateMerkleRoot with root and totalAmount from tree JSON", async () => {
    const sdk = await import("@soroban-merkle-airdrop/sdk");
    const result = await runUpdateRoot(BASE_OPTS);

    expect(vi.mocked(sdk.createAirdropClient)).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "CTEST123" })
    );
    expect(mockUpdateMerkleRoot).toHaveBeenCalledWith(
      "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      500000n,
      "SSECRETADMINKEY"
    );
    expect(result.txHash).toBe("deadbeef1234");
    expect(result.root).toBe(
      "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );
    expect(result.totalAmount).toBe(500000n);
  });

  it("accepts total_amount (snake_case) as an alternative to totalAmount", async () => {
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        root: "aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
        total_amount: "250000",
      })
    );

    const result = await runUpdateRoot(BASE_OPTS);

    expect(mockUpdateMerkleRoot).toHaveBeenCalledWith(
      "aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
      250000n,
      "SSECRETADMINKEY"
    );
    expect(result.totalAmount).toBe(250000n);
  });

  it("throws when tree JSON has no root field", async () => {
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({ totalAmount: "1000", proofs: {} })
    );

    await expect(runUpdateRoot(BASE_OPTS)).rejects.toThrow(/missing a 'root' field/);
  });

  it("throws when tree JSON has zero totalAmount", async () => {
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        root: "aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
        totalAmount: "0",
      })
    );

    await expect(runUpdateRoot(BASE_OPTS)).rejects.toThrow(/missing 'totalAmount'/);
  });

  it("throws for unknown network", async () => {
    await expect(
      runUpdateRoot({ ...BASE_OPTS, network: "regtest" })
    ).rejects.toThrow(/Unknown network/);
  });

  it("propagates SDK errors", async () => {
    mockUpdateMerkleRoot.mockRejectedValueOnce(new Error("Error(Contract, #5)"));
    await expect(runUpdateRoot(BASE_OPTS)).rejects.toThrow("Error(Contract, #5)");
  });
});
