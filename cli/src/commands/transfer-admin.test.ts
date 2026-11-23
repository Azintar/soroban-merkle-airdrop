/**
 * Unit tests for the transfer-admin command (Issue #502).
 *
 * All Stellar RPC calls are mocked — no real network access occurs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transferAdminCore, type TransferAdminOptions } from "./transfer-admin.js";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// vi.mock() factories are hoisted before module-level code, so any variables
// they reference must also be hoisted via vi.hoisted().

const mockServer = vi.hoisted(() => ({
  getAccount: vi.fn(),
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
}));

// ─── Mock @stellar/stellar-sdk ───────────────────────────────────────────────

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();

  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn(() => mockServer),
      assembleTransaction: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue({ sign: vi.fn(), toXDR: vi.fn() }),
      }),
      Api: {
        ...(actual.rpc?.Api ?? {}),
        isSimulationError: (r: unknown) =>
          typeof r === "object" && r !== null && "error" in r,
      },
    },
    Keypair: {
      ...actual.Keypair,
      fromSecret: vi.fn().mockReturnValue({
        publicKey: vi.fn().mockReturnValue("GADMIN123PUBLICKEY"),
        sign: vi.fn(),
      }),
    },
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({ sign: vi.fn(), toXDR: vi.fn() }),
    })),
    Contract: vi.fn().mockImplementation(() => ({
      call: vi.fn().mockReturnValue({}),
    })),
    Address: vi.fn().mockImplementation((addr: string) => ({
      toScVal: vi.fn().mockReturnValue({}),
      toString: () => addr,
    })),
    Networks: actual.Networks,
  };
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

const BASE_OPTS: TransferAdminOptions = {
  contractId: "CCONTRACT123",
  newAdmin: "GNEWADMIN456PUBLICKEY",
  adminKey: "SADMIN123SECRETKEY",
  network: "testnet",
};

function simSuccess() {
  return { result: { retval: {} }, transactionData: {}, minResourceFee: "100" };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("transferAdminCore (Issue #502)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockServer.getAccount.mockResolvedValue({
      id: "GADMIN123PUBLICKEY",
      sequenceNumber: () => "100",
      incrementSequenceNumber: vi.fn(),
    });

    mockServer.simulateTransaction.mockResolvedValue(simSuccess());

    mockServer.sendTransaction.mockResolvedValue({
      status: "PENDING",
      hash: "transfer-admin-tx-hash",
    });

    mockServer.getTransaction.mockResolvedValue({ status: "SUCCESS" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("successfully transfers admin and returns txHash and newAdmin", async () => {
    const promise = transferAdminCore(BASE_OPTS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.txHash).toBe("transfer-admin-tx-hash");
    expect(result.newAdmin).toBe(BASE_OPTS.newAdmin);
  });

  it("calls getAccount, simulateTransaction, and sendTransaction once each", async () => {
    const promise = transferAdminCore(BASE_OPTS);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockServer.getAccount).toHaveBeenCalledTimes(1);
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("throws if simulation returns an error", async () => {
    mockServer.simulateTransaction.mockResolvedValue({
      error: "Simulation error: out of budget",
    });

    const promise = transferAdminCore(BASE_OPTS);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/transfer_admin simulation failed/);
  });

  it("throws if sendTransaction returns ERROR status", async () => {
    mockServer.sendTransaction.mockResolvedValue({
      status: "ERROR",
      errorResult: { toXDR: () => "errorXDR" },
    });

    const promise = transferAdminCore(BASE_OPTS);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/transfer_admin transaction failed/);
  });

  it("throws a timeout error if getTransaction never returns SUCCESS", async () => {
    mockServer.getTransaction.mockResolvedValue({ status: "NOT_FOUND" });

    const promise = transferAdminCore(BASE_OPTS);
    // Advance past the 90s POLL_TIMEOUT_MS
    await vi.advanceTimersByTimeAsync(200_000);

    await expect(promise).rejects.toThrow(/Transaction confirmation timeout/);
  });

  it("throws if the transaction fails on-chain", async () => {
    mockServer.getTransaction.mockResolvedValue({ status: "FAILED" });

    const promise = transferAdminCore(BASE_OPTS);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/Transaction failed on-chain/);
  });

  it("throws for an unknown network", async () => {
    const promise = transferAdminCore({ ...BASE_OPTS, network: "unknownnet" });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/Unknown network/);
  });

  it("uses a custom rpcUrl when provided", async () => {
    const { rpc } = await import("@stellar/stellar-sdk");
    const promise = transferAdminCore({
      ...BASE_OPTS,
      rpcUrl: "https://custom-rpc.example.com",
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(rpc.Server).toHaveBeenCalledWith(
      "https://custom-rpc.example.com",
      expect.any(Object)
    );
  });
});
