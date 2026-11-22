/**
 * Unit tests for the airdrop SDK client.
 *
 * All RPC and network calls are mocked so no live Stellar node is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AirdropContractError, RpcError } from "./types.js";

// ─── Shared test fixtures ────────────────────────────────────────────────────

// Real valid Stellar keypair used as the admin signer.
const SECRET    = "SBOPD4RGXYWZWJ67CXWX3HJ7N66KY5R5YP33SM3Q7H2THGQKRG5OC7FP";
const NEW_ROOT  = "a".repeat(64);  // 32-byte hex placeholder
const NEW_TOTAL = 5_000_000n;

const TX_HASH = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

const config = {
  network: "testnet" as const,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
};

// ─── Mutable server state shared across tests ────────────────────────────────

let mockSimulate:   ReturnType<typeof vi.fn>;
let mockSend:       ReturnType<typeof vi.fn>;
let mockGetTx:      ReturnType<typeof vi.fn>;
let mockGetAccount: ReturnType<typeof vi.fn>;

function resetServerMocks({
  simulateError    = false,
  contractErrorCode = null as number | null,
  sendStatus       = "PENDING" as "PENDING" | "ERROR",
  pollStatus       = "SUCCESS" as "SUCCESS" | "FAILED",
  returnVal        = undefined as unknown,
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
    id: "GAXNTM3N5VOBGZ4SKXIQREMQ6FC67WTYTIUKS2XHWKCDXYNLIZYLUD5T",
    accountId: () => "GAXNTM3N5VOBGZ4SKXIQREMQ6FC67WTYTIUKS2XHWKCDXYNLIZYLUD5T",
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

// ─── #493 — updateMerkleRoot ──────────────────────────────────────────────────

describe("#493 updateMerkleRoot", () => {
  beforeEach(() => resetServerMocks());

  it("returns { txHash } on success", async () => {
    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);
    const result = await client.updateMerkleRoot(NEW_ROOT, NEW_TOTAL, SECRET);

    expect(result).toEqual({ txHash: TX_HASH });
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("throws RpcError when newRoot is not 64 hex chars", async () => {
    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);

    await expect(
      client.updateMerkleRoot("tooshort", NEW_TOTAL, SECRET)
    ).rejects.toBeInstanceOf(RpcError);
  });

  it("throws AirdropContractError for a contract-level error code", async () => {
    resetServerMocks({ simulateError: true, contractErrorCode: 5 });
    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);

    await expect(
      client.updateMerkleRoot(NEW_ROOT, NEW_TOTAL, SECRET)
    ).rejects.toBeInstanceOf(AirdropContractError);
  });

  it("throws RpcError for a generic simulation failure", async () => {
    resetServerMocks({ simulateError: true });
    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);

    await expect(
      client.updateMerkleRoot(NEW_ROOT, NEW_TOTAL, SECRET)
    ).rejects.toBeInstanceOf(RpcError);
  });

  it("throws RpcError when sendTransaction returns ERROR", async () => {
    resetServerMocks({ sendStatus: "ERROR" });
    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);

    await expect(
      client.updateMerkleRoot(NEW_ROOT, NEW_TOTAL, SECRET)
    ).rejects.toBeInstanceOf(RpcError);
  });

  it("throws RpcError when polled transaction returns FAILED", async () => {
    resetServerMocks({ pollStatus: "FAILED" });
    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);

    await expect(
      client.updateMerkleRoot(NEW_ROOT, NEW_TOTAL, SECRET)
    ).rejects.toBeInstanceOf(RpcError);
  });
});
