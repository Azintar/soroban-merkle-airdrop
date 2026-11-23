/**
 * Unit tests for the status command (issue #507).
 *
 * Verifies that:
 *   - claimedCount is fetched and shown in human-readable output.
 *   - --json output includes a claimedCount field.
 *   - claimedCount shows "N/A" gracefully when the client throws or returns null.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runStatusAction } from "./status.js";

// ─── Hoist mock client so it is available in vi.mock factory ─────────────────

const mockClient = vi.hoisted(() => ({
  isActive: vi.fn(),
  merkleRoot: vi.fn(),
  totalDeposited: vi.fn(),
  expiration: vi.fn(),
  claimedCount: vi.fn(),
  isClaimed: vi.fn(),
}));

// ─── Mock @soroban-merkle-airdrop/sdk ─────────────────────────────────────────

vi.mock("@soroban-merkle-airdrop/sdk", () => ({
  createAirdropClient: vi.fn(() => mockClient),
  NETWORKS: {
    testnet: {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
  },
}));

// ─── Mock ora ────────────────────────────────────────────────────────────────

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTRACT_ID = "CCONTRACTID1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ01";
const MOCK_ROOT = "abcdef01234567890abcdef0123456789abcdef0123456789abcdef0123456789";

const BASE_OPTS = {
  network: "testnet",
  contractId: CONTRACT_ID,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("status command claimed addresses (issue #507)", () => {
  beforeEach(() => {
    mockClient.isActive.mockReset().mockResolvedValue(true);
    mockClient.merkleRoot.mockReset().mockResolvedValue(MOCK_ROOT);
    mockClient.totalDeposited.mockReset().mockResolvedValue(50000n);
    mockClient.expiration.mockReset().mockResolvedValue(9999999999n);
    mockClient.claimedCount.mockReset().mockResolvedValue(42);
    mockClient.isClaimed.mockReset().mockResolvedValue(false);
  });

  // ── claimedCount is fetched ──────────────────────────────────────────────

  it("calls claimedCount on the client", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runStatusAction(BASE_OPTS);
    } finally {
      consoleSpy.mockRestore();
    }
    expect(mockClient.claimedCount).toHaveBeenCalledOnce();
  });

  it("displays the claimed address count in human-readable output", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runStatusAction(BASE_OPTS);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toMatch(/42/);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("shows 'N/A' when claimedCount throws", async () => {
    mockClient.claimedCount.mockRejectedValue(new Error("not supported"));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runStatusAction(BASE_OPTS);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toMatch(/N\/A/i);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("shows 'N/A' when claimedCount returns null", async () => {
    mockClient.claimedCount.mockResolvedValue(null);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runStatusAction(BASE_OPTS);
      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toMatch(/N\/A/i);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // ── JSON output ──────────────────────────────────────────────────────────

  it("--json output includes claimedCount field", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runStatusAction({ ...BASE_OPTS, json: true });
      const jsonCall = consoleSpy.mock.calls.find(([arg]) =>
        typeof arg === "string" && arg.trim().startsWith("{")
      );
      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(jsonCall![0] as string);
      expect(parsed).toHaveProperty("claimedCount", 42);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--json claimedCount is null when claimedCount returns null", async () => {
    mockClient.claimedCount.mockResolvedValue(null);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runStatusAction({ ...BASE_OPTS, json: true });
      const jsonCall = consoleSpy.mock.calls.find(([arg]) =>
        typeof arg === "string" && arg.trim().startsWith("{")
      );
      const parsed = JSON.parse(jsonCall![0] as string);
      expect(parsed.claimedCount).toBeNull();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--json output includes all expected fields", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runStatusAction({ ...BASE_OPTS, json: true });
      const jsonCall = consoleSpy.mock.calls.find(([arg]) =>
        typeof arg === "string" && arg.trim().startsWith("{")
      );
      const parsed = JSON.parse(jsonCall![0] as string);

      expect(parsed).toHaveProperty("contractId", CONTRACT_ID);
      expect(parsed).toHaveProperty("network", "testnet");
      expect(parsed).toHaveProperty("active", true);
      expect(parsed).toHaveProperty("root");
      expect(parsed).toHaveProperty("deposited");
      expect(parsed).toHaveProperty("claimedCount", 42);
      expect(parsed).toHaveProperty("expiration");
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
