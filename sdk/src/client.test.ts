/**
 * Tests for sdk/src/client.ts — createAirdropClient methods,
 * and for formatAmount exported from index.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatAmount } from "./index.js";

// ---------------------------------------------------------------------------
// formatAmount
// ---------------------------------------------------------------------------

describe("formatAmount", () => {
  it("formats a whole number", () => {
    // 10_000_000 stroops = 1 XLM
    expect(formatAmount(10_000_000n)).toBe("1");
  });

  it("formats a fractional amount", () => {
    // 123_456_789 stroops = 12.3456789 XLM
    expect(formatAmount(123_456_789n)).toBe("12.3456789");
  });

  it("strips trailing zeros", () => {
    // 5_000_000 stroops = 0.5 XLM
    expect(formatAmount(5_000_000n)).toBe("0.5");
  });

  it("formats zero", () => {
    expect(formatAmount(0n)).toBe("0");
  });

  it("respects custom decimals", () => {
    expect(formatAmount(1_000n, 3)).toBe("1");
    expect(formatAmount(1_500n, 3)).toBe("1.5");
  });

  it("handles large amounts", () => {
    // 1_000_000_000 * 10_000_000 stroops = 1_000_000_000 XLM
    expect(formatAmount(10_000_000_000_000_000n)).toBe("1000000000");
  });
});

// ---------------------------------------------------------------------------
// createAirdropClient — unit tests with mocked @stellar/stellar-sdk
// ---------------------------------------------------------------------------

// We mock the stellar SDK module so that rpc.Server is replaced with a
// factory returning our controlled mock object.
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();

  // We replace rpc.Server with a constructor that returns our mock instance.
  // The mock instance is stored on the module so tests can configure it.
  const mockServerInstance = {
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn(),
    getAccount: vi.fn(),
  };

  class MockServer {
    simulateTransaction = mockServerInstance.simulateTransaction;
    sendTransaction = mockServerInstance.sendTransaction;
    getTransaction = mockServerInstance.getTransaction;
    getAccount = mockServerInstance.getAccount;
  }

  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: MockServer,
    },
    __mockServerInstance: mockServerInstance,
  };
});

import {
  xdr,
  nativeToScVal,
  rpc,
  Keypair,
  SorobanDataBuilder,
} from "@stellar/stellar-sdk";
import { createAirdropClient } from "./client.js";

// Access our mock server instance through the module mock.
const sdk = await import("@stellar/stellar-sdk") as typeof import("@stellar/stellar-sdk") & {
  __mockServerInstance: {
    simulateTransaction: ReturnType<typeof vi.fn>;
    sendTransaction: ReturnType<typeof vi.fn>;
    getTransaction: ReturnType<typeof vi.fn>;
    getAccount: ReturnType<typeof vi.fn>;
  };
};

const mockServer = sdk.__mockServerInstance;

const TEST_SECRET = Keypair.random().secret();
const TEST_PUBLIC = Keypair.fromSecret(TEST_SECRET).publicKey();

const config = {
  network: "testnet" as const,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
};

/** Minimal Account-like object for getAccount mock. */
function fakeAccount(publicKey: string) {
  return {
    id: publicKey,
    sequence: "1000",
    accountId: () => publicKey,
    sequenceNumber: () => "1000",
    incrementSequenceNumber: () => {},
  };
}

/** Build a minimal SimulateTransactionSuccessResponse for read-only calls. */
function makeReadSimSuccess(retval: xdr.ScVal): rpc.Api.SimulateTransactionSuccessResponse {
  return {
    id: "1",
    latestLedger: 100,
    cost: { cpuInsns: "0", memBytes: "0" },
    result: { retval, auth: [] },
    stateChanges: [],
    _parsed: true,
  } as unknown as rpc.Api.SimulateTransactionSuccessResponse;
}

/**
 * Build a SimulateTransactionSuccessResponse that includes the transaction
 * data shape required by rpc.assembleTransaction.
 * assembleTransaction calls success.transactionData.build(), so we must pass
 * a SorobanDataBuilder instance, not a raw xdr.SorobanTransactionData.
 */
function makeWriteSimSuccess(retval: xdr.ScVal): rpc.Api.SimulateTransactionSuccessResponse {
  const txDataBuilder = new SorobanDataBuilder()
    .setResourceFee(100n)
    .setResources(1000, 512, 256);

  return {
    id: "1",
    latestLedger: 100,
    cost: { cpuInsns: "0", memBytes: "0" },
    result: { retval, auth: [] },
    minResourceFee: "100",
    transactionData: txDataBuilder,
    stateChanges: [],
    _parsed: true,
  } as unknown as rpc.Api.SimulateTransactionSuccessResponse;
}

/** Minimal SimulateTransactionErrorResponse. */
function makeSimError(): rpc.Api.SimulateTransactionErrorResponse {
  return {
    id: "1",
    latestLedger: 100,
    error: "contract error",
    _parsed: true,
  } as unknown as rpc.Api.SimulateTransactionErrorResponse;
}

describe("createAirdropClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServer.getAccount.mockImplementation((pk: string) =>
      Promise.resolve(fakeAccount(pk))
    );
  });

  // -------------------------------------------------------------------------
  // isActive
  // -------------------------------------------------------------------------

  describe("isActive", () => {
    it("returns true when contract says active", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeReadSimSuccess(nativeToScVal(true, { type: "bool" }))
      );
      const client = createAirdropClient(config);
      expect(await client.isActive()).toBe(true);
    });

    it("returns false when contract says inactive", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeReadSimSuccess(nativeToScVal(false, { type: "bool" }))
      );
      const client = createAirdropClient(config);
      expect(await client.isActive()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // isClaimed
  // -------------------------------------------------------------------------

  describe("isClaimed", () => {
    it("returns false for unclaimed address", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeReadSimSuccess(nativeToScVal(false, { type: "bool" }))
      );
      const client = createAirdropClient(config);
      expect(await client.isClaimed(TEST_PUBLIC)).toBe(false);
    });

    it("returns true for already-claimed address", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeReadSimSuccess(nativeToScVal(true, { type: "bool" }))
      );
      const client = createAirdropClient(config);
      expect(await client.isClaimed(TEST_PUBLIC)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // setActive
  // -------------------------------------------------------------------------

  describe("setActive", () => {
    it("builds and submits a transaction, returns txHash", async () => {
      const expectedHash = "aabbcc112233";
      mockServer.simulateTransaction.mockResolvedValue(
        makeWriteSimSuccess(xdr.ScVal.scvVoid())
      );
      mockServer.sendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: expectedHash,
      });
      mockServer.getTransaction.mockResolvedValue({ status: "SUCCESS" });

      const client = createAirdropClient(config);
      const result = await client.setActive(false, TEST_SECRET);

      expect(mockServer.simulateTransaction).toHaveBeenCalledOnce();
      expect(mockServer.sendTransaction).toHaveBeenCalledOnce();
      expect(result.txHash).toBe(expectedHash);
    });

    it("throws when simulation fails", async () => {
      mockServer.simulateTransaction.mockResolvedValue(makeSimError());

      const client = createAirdropClient(config);
      await expect(client.setActive(true, TEST_SECRET)).rejects.toThrow(
        "Simulation failed"
      );
    });

    it("throws when transaction fails on-chain", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeWriteSimSuccess(xdr.ScVal.scvVoid())
      );
      mockServer.sendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: "abc",
      });
      mockServer.getTransaction.mockResolvedValue({ status: "FAILED" });

      const client = createAirdropClient(config);
      await expect(client.setActive(false, TEST_SECRET)).rejects.toThrow(
        "Transaction failed on-chain"
      );
    });

    it("sets active=true without error", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeWriteSimSuccess(xdr.ScVal.scvVoid())
      );
      mockServer.sendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: "hash123",
      });
      mockServer.getTransaction.mockResolvedValue({ status: "SUCCESS" });

      const client = createAirdropClient(config);
      const result = await client.setActive(true, TEST_SECRET);
      expect(result.txHash).toBe("hash123");
    });
  });

  // -------------------------------------------------------------------------
  // reclaim
  // -------------------------------------------------------------------------

  describe("reclaim", () => {
    it("returns txHash and amount from contract return value", async () => {
      const expectedHash = "ddeeff001122";
      const expectedAmount = 500_000_000n;

      mockServer.simulateTransaction.mockResolvedValue(
        makeWriteSimSuccess(nativeToScVal(expectedAmount, { type: "i128" }))
      );
      mockServer.sendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: expectedHash,
      });
      mockServer.getTransaction.mockResolvedValue({
        status: "SUCCESS",
        returnValue: nativeToScVal(expectedAmount, { type: "i128" }),
      });

      const client = createAirdropClient(config);
      const result = await client.reclaim(TEST_SECRET);

      expect(result.txHash).toBe(expectedHash);
      expect(result.amount).toBe(expectedAmount);
    });

    it("returns amount=0n when no returnValue in poll response", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeWriteSimSuccess(xdr.ScVal.scvVoid())
      );
      mockServer.sendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: "xyz",
      });
      mockServer.getTransaction.mockResolvedValue({ status: "SUCCESS" });

      const client = createAirdropClient(config);
      const result = await client.reclaim(TEST_SECRET);
      expect(result.amount).toBe(0n);
    });

    it("throws when simulation fails", async () => {
      mockServer.simulateTransaction.mockResolvedValue(makeSimError());

      const client = createAirdropClient(config);
      await expect(client.reclaim(TEST_SECRET)).rejects.toThrow(
        "Simulation failed"
      );
    });

    it("throws when transaction fails on-chain", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeWriteSimSuccess(xdr.ScVal.scvVoid())
      );
      mockServer.sendTransaction.mockResolvedValue({
        status: "PENDING",
        hash: "fail-hash",
      });
      mockServer.getTransaction.mockResolvedValue({ status: "FAILED" });

      const client = createAirdropClient(config);
      await expect(client.reclaim(TEST_SECRET)).rejects.toThrow(
        "Transaction failed on-chain"
      );
    });
  });

  // -------------------------------------------------------------------------
  // simulateClaim
  // -------------------------------------------------------------------------

  describe("simulateClaim", () => {
    it("returns fee and resources from a successful simulation", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeWriteSimSuccess(xdr.ScVal.scvVoid())
      );

      const client = createAirdropClient(config);
      const proof = { address: TEST_PUBLIC, amount: 1000n, proof: [] };
      const result = await client.simulateClaim(proof, TEST_PUBLIC);

      expect(result.fee).toBe("100");
      expect(typeof result.resources.instructions).toBe("number");
      expect(typeof result.resources.readBytes).toBe("number");
      expect(typeof result.resources.writeBytes).toBe("number");
    });

    it("throws when simulation errors", async () => {
      mockServer.simulateTransaction.mockResolvedValue(makeSimError());

      const client = createAirdropClient(config);
      const proof = { address: TEST_PUBLIC, amount: 1000n, proof: [] };
      await expect(client.simulateClaim(proof, TEST_PUBLIC)).rejects.toThrow(
        "Simulation failed"
      );
    });

    it("does not submit a transaction (simulateTransaction called once, sendTransaction never)", async () => {
      mockServer.simulateTransaction.mockResolvedValue(
        makeWriteSimSuccess(xdr.ScVal.scvVoid())
      );

      const client = createAirdropClient(config);
      const proof = { address: TEST_PUBLIC, amount: 2000n, proof: [] };
      await client.simulateClaim(proof, TEST_PUBLIC);

      expect(mockServer.simulateTransaction).toHaveBeenCalledOnce();
      expect(mockServer.sendTransaction).not.toHaveBeenCalled();
    });
  });
});
