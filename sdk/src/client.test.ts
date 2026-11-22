/**
 * Unit tests for the airdrop SDK client — focusing on retry logic (#495).
 *
 * All RPC and network calls are mocked so no live Stellar node is needed.
 * Back-off delay is set to 0 ms via _backoffMs to keep tests fast.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AirdropContractError, RpcError } from "./types.js";

// ─── Shared test fixtures ────────────────────────────────────────────────────

const SECRET     = "SBOPD4RGXYWZWJ67CXWX3HJ7N66KY5R5YP33SM3Q7H2THGQKRG5OC7FP";
const ADMIN_ADDR = "GAXNTM3N5VOBGZ4SKXIQREMQ6FC67WTYTIUKS2XHWKCDXYNLIZYLUD5T";
const TX_HASH    = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// _backoffMs: 0 eliminates real setTimeout delays in retry tests.
const config = {
  network: "testnet" as const,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  maxRetries: 3,
  _backoffMs: 0,
};

// ─── Mutable server state shared across tests ────────────────────────────────

let mockSimulate:   ReturnType<typeof vi.fn>;
let mockSend:       ReturnType<typeof vi.fn>;
let mockGetTx:      ReturnType<typeof vi.fn>;
let mockGetAccount: ReturnType<typeof vi.fn>;

function resetServerMocks({
  simulateError     = false,
  contractErrorCode = null as number | null,
  sendStatus        = "PENDING" as "PENDING" | "ERROR",
  pollStatus        = "SUCCESS" as "SUCCESS" | "FAILED",
  returnVal         = undefined as unknown,
} = {}) {
  mockSimulate = vi.fn().mockResolvedValue(
    simulateError
      ? {
          error:
            contractErrorCode !== null
              ? `Error(Contract, #${contractErrorCode})`
              : "generic network error",
        }
      : {
          result: { retval: returnVal },
          transactionData: { build: () => ({}) },
          minResourceFee: "100",
        }
  );

  mockSend = vi.fn().mockResolvedValue(
    sendStatus === "ERROR"
      ? { status: "ERROR", errorResult: null }
      : { status: "PENDING", hash: TX_HASH }
  );
  mockGetTx      = vi.fn().mockResolvedValue({ status: pollStatus });
  mockGetAccount = vi.fn().mockResolvedValue({
    id: ADMIN_ADDR,
    accountId: () => ADMIN_ADDR,
    sequence: "0",
    incrementSequenceNumber: vi.fn(),
  });
}

// ─── Mock @stellar/stellar-sdk ───────────────────────────────────────────────

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();

  class FakeTransactionBuilder {
    constructor(_account: unknown, _opts: unknown) {}
    addOperation() { return this; }
    setTimeout()   { return this; }
    build() { return { sign: vi.fn(), toXDR: vi.fn(() => "xdrstring") }; }
    static fromXDR() { return { sign: vi.fn() }; }
  }

  class FakeServer {
    constructor(_url: string, _opts?: unknown) {}
    simulateTransaction(tx: unknown) { return mockSimulate(tx); }
    sendTransaction(tx: unknown)     { return mockSend(tx); }
    getTransaction(hash: string)     { return mockGetTx(hash); }
    getAccount(addr: string)         { return mockGetAccount(addr); }
  }

  const assembleTransaction = vi.fn(() => ({
    build: vi.fn(() => ({ sign: vi.fn(), toXDR: vi.fn(() => "xdrstring") })),
  }));

  return {
    ...actual,
    TransactionBuilder: FakeTransactionBuilder,
    rpc: {
      ...actual.rpc,
      Server: FakeServer,
      assembleTransaction,
      Api: {
        isSimulationError: (r: { error?: string }) => "error" in r && r.error !== undefined,
      },
    },
  };
});

// ─── #495 — withRetry / retry logic ──────────────────────────────────────────

describe("#495 retry logic", () => {
  beforeEach(() => resetServerMocks());

  it("succeeds on first attempt without retrying", async () => {
    const { nativeToScVal } = await import("@stellar/stellar-sdk");
    mockSimulate = vi.fn().mockResolvedValue({
      result: { retval: nativeToScVal(true) },
      transactionData: { build: () => ({}) },
      minResourceFee: "100",
    });

    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);
    const active = await client.isActive();

    expect(active).toBe(true);
    expect(mockSimulate).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failure and succeeds on 3rd attempt", async () => {
    const { nativeToScVal } = await import("@stellar/stellar-sdk");

    const successResponse = {
      result: { retval: nativeToScVal(true) },
      transactionData: { build: () => ({}) },
      minResourceFee: "100",
    };
    const networkErr = new Error("Network timeout");

    // Two transient failures, then success.
    mockSimulate = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce(successResponse);

    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);
    const active = await client.isActive();

    expect(active).toBe(true);
    expect(mockSimulate).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retry attempts", async () => {
    const networkErr = new Error("503 Service Unavailable");
    mockSimulate = vi.fn().mockRejectedValue(networkErr);

    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);  // maxRetries: 3

    await expect(client.isActive()).rejects.toThrow("503 Service Unavailable");
    expect(mockSimulate).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry AirdropContractError (deterministic contract failure)", async () => {
    // The simulation call succeeds but returns a contract error response.
    mockSimulate = vi.fn().mockResolvedValue({ error: "Error(Contract, #3)" });

    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);

    await expect(client.isActive()).rejects.toBeInstanceOf(AirdropContractError);
    // Exactly one attempt — AirdropContractError is never retried.
    expect(mockSimulate).toHaveBeenCalledTimes(1);
  });

  it("retries sendTransaction on transient failure (429/503)", async () => {
    const { nativeToScVal } = await import("@stellar/stellar-sdk");

    mockSimulate = vi.fn().mockResolvedValue({
      result: { retval: nativeToScVal(null) },
      transactionData: { build: () => ({}) },
      minResourceFee: "100",
    });

    // Two transient send failures, then success.
    const networkErr = new Error("429 Too Many Requests");
    mockSend = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce({ status: "PENDING", hash: TX_HASH });

    mockGetTx = vi.fn().mockResolvedValue({ status: "SUCCESS" });

    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);

    const claimResult = await client.claim(
      { address: ADMIN_ADDR, amount: 1000n, proof: [] },
      SECRET
    );

    expect(claimResult.txHash).toBe(TX_HASH);
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("maxRetries from NetworkConfig controls the number of attempts", async () => {
    const networkErr = new Error("network error");
    mockSimulate = vi.fn().mockRejectedValue(networkErr);

    const { createAirdropClient } = await import("./client.js");
    // Override maxRetries to 2 → exactly 2 attempts.
    const client = createAirdropClient({ ...config, maxRetries: 2 });

    await expect(client.isActive()).rejects.toThrow();
    expect(mockSimulate).toHaveBeenCalledTimes(2);
  });
});
