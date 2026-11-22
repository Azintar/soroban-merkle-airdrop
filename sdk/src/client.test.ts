/**
 * Unit tests for the airdrop SDK client.
 *
 * All RPC and network calls are mocked so no live Stellar node is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AirdropContractError, RpcError } from "./types.js";

// ─── Shared test fixtures ────────────────────────────────────────────────────

// Real valid Stellar keypair used as the admin signer.
const SECRET      = "SBOPD4RGXYWZWJ67CXWX3HJ7N66KY5R5YP33SM3Q7H2THGQKRG5OC7FP";
const ADMIN_ADDR  = "GAXNTM3N5VOBGZ4SKXIQREMQ6FC67WTYTIUKS2XHWKCDXYNLIZYLUD5T";
const TOKEN_ADDR  = "GBXSC6IO7PCTTFAWVSK4TZXDREH67OOCVU3OD764AURWPPRJJH3MJ747";
const MERKLE_ROOT = "a".repeat(64);  // 32-byte hex placeholder

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

  mockSend       = vi.fn().mockResolvedValue(
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build an xdr.ScVal that scValToNative will convert to a plain JS value.
 * We use the actual SDK's nativeToScVal so the round-trip through
 * scValToNative produces the right type.
 */
async function nativeVal(value: unknown) {
  const { nativeToScVal } = await import("@stellar/stellar-sdk");
  if (value instanceof Uint8Array) return { _arm: "bytes", _value: value };  // scvBytes
  if (value === null || value === undefined) return { _arm: "void" };
  return nativeToScVal(value);
}

// ─── #494 — contractInfo ──────────────────────────────────────────────────────

describe("#494 contractInfo", () => {
  it("returns ContractInfo with all 6 fields when contract is initialised", async () => {
    // We need simulateTransaction to return different values on successive calls:
    // order: merkle_root, token, admin, total_deposited, is_active, expiration
    const { nativeToScVal, xdr } = await import("@stellar/stellar-sdk");

    const rootBytes  = Buffer.from(MERKLE_ROOT, "hex");
    const totalVal   = nativeToScVal(1_000_000, { type: "i128" });
    const expVal     = nativeToScVal(9_999_999, { type: "u64" });

    // scvBytes for the root
    const rootScVal  = xdr.ScVal.scvBytes(rootBytes);

    // scvString / scvAddress for token & admin — nativeToScVal on a string gives scvString
    const tokenScVal = nativeToScVal(TOKEN_ADDR, { type: "string" });
    const adminScVal = nativeToScVal(ADMIN_ADDR, { type: "string" });
    const activeVal  = nativeToScVal(true);

    const makeResponse = (retval: unknown) => ({
      result: { retval },
      transactionData: { build: () => ({}) },
      minResourceFee: "100",
    });

    mockSimulate = vi.fn()
      .mockResolvedValueOnce(makeResponse(rootScVal))   // merkle_root
      .mockResolvedValueOnce(makeResponse(tokenScVal))  // token
      .mockResolvedValueOnce(makeResponse(adminScVal))  // admin
      .mockResolvedValueOnce(makeResponse(totalVal))    // total_deposited
      .mockResolvedValueOnce(makeResponse(activeVal))   // is_active
      .mockResolvedValueOnce(makeResponse(expVal));     // expiration

    mockGetAccount = vi.fn().mockResolvedValue({
      id: ADMIN_ADDR,
      accountId: () => ADMIN_ADDR,
      sequence: "0",
      incrementSequenceNumber: vi.fn(),
    });

    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);
    const info = await client.contractInfo();

    expect(info).not.toBeNull();
    expect(info!.merkleRoot).toBe(MERKLE_ROOT);
    expect(info!.active).toBe(true);
    expect(typeof info!.totalDeposited).toBe("bigint");
    expect(info!.expiration).not.toBeNull();
  });

  it("returns null when merkle_root simulation returns void (not initialised)", async () => {
    const { xdr } = await import("@stellar/stellar-sdk");

    const makeResponse = (retval: unknown) => ({
      result: { retval },
      transactionData: { build: () => ({}) },
      minResourceFee: "100",
    });

    // merkle_root → scvVoid (Option::None)
    const voidVal = xdr.ScVal.scvVoid();

    mockSimulate = vi.fn()
      .mockResolvedValueOnce(makeResponse(voidVal))   // merkle_root → None
      .mockResolvedValue(makeResponse(xdr.ScVal.scvVoid())); // rest don't matter

    mockGetAccount = vi.fn().mockResolvedValue({
      id: ADMIN_ADDR,
      accountId: () => ADMIN_ADDR,
      sequence: "0",
      incrementSequenceNumber: vi.fn(),
    });

    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);
    const info = await client.contractInfo();

    expect(info).toBeNull();
  });

  it("throws RpcError when any RPC call fails", async () => {
    resetServerMocks({ simulateError: true });

    const { createAirdropClient } = await import("./client.js");
    const client = createAirdropClient(config);

    await expect(client.contractInfo()).rejects.toBeInstanceOf(RpcError);
  });
});
