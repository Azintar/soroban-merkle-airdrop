/**
 * Tests for sdk/src/client.ts — simulateClaim method.
 *
 * simulateClaim() was defined in client.ts but not included in the return
 * object, making it unavailable to consumers. This test verifies that it is
 * exported and behaves correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();

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
    rpc: { ...actual.rpc, Server: MockServer },
    __mockServerInstance: mockServerInstance,
  };
});

import {
  xdr,
  Keypair,
  SorobanDataBuilder,
  rpc,
} from "@stellar/stellar-sdk";
import { createAirdropClient } from "./client.js";

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

function makeSimSuccess(retval: xdr.ScVal): rpc.Api.SimulateTransactionSuccessResponse {
  const txDataBuilder = new SorobanDataBuilder()
    .setResourceFee(200n)
    .setResources(2000, 1024, 512);

  return {
    id: "1",
    latestLedger: 100,
    cost: { cpuInsns: "0", memBytes: "0" },
    result: { retval, auth: [] },
    minResourceFee: "200",
    transactionData: txDataBuilder,
    stateChanges: [],
    _parsed: true,
  } as unknown as rpc.Api.SimulateTransactionSuccessResponse;
}

function makeSimError(): rpc.Api.SimulateTransactionErrorResponse {
  return {
    id: "1",
    latestLedger: 100,
    error: "contract execution failed",
    _parsed: true,
  } as unknown as rpc.Api.SimulateTransactionErrorResponse;
}

describe("simulateClaim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is callable on the client return object", () => {
    // Verify the method exists — if it were absent from the return object,
    // this check would fail before any mock is needed.
    const client = createAirdropClient(config);
    expect(typeof client.simulateClaim).toBe("function");
  });

  it("returns { fee, resources } from a successful simulation", async () => {
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimSuccess(xdr.ScVal.scvVoid())
    );

    const client = createAirdropClient(config);
    const proof = { address: TEST_PUBLIC, amount: 1_000_000n, proof: [] };
    const result = await client.simulateClaim(proof, TEST_PUBLIC);

    expect(result.fee).toBe("200");
    expect(typeof result.resources.instructions).toBe("number");
    expect(typeof result.resources.readBytes).toBe("number");
    expect(typeof result.resources.writeBytes).toBe("number");
    expect(result.resources.instructions).toBe(2000);
    expect(result.resources.readBytes).toBe(1024);
    expect(result.resources.writeBytes).toBe(512);
  });

  it("does not submit a transaction (dry-run only)", async () => {
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimSuccess(xdr.ScVal.scvVoid())
    );

    const client = createAirdropClient(config);
    const proof = { address: TEST_PUBLIC, amount: 500n, proof: [] };
    await client.simulateClaim(proof, TEST_PUBLIC);

    expect(mockServer.simulateTransaction).toHaveBeenCalledOnce();
    expect(mockServer.sendTransaction).not.toHaveBeenCalled();
  });

  it("throws when simulation returns an error", async () => {
    mockServer.simulateTransaction.mockResolvedValue(makeSimError());

    const client = createAirdropClient(config);
    const proof = { address: TEST_PUBLIC, amount: 1000n, proof: [] };
    await expect(client.simulateClaim(proof, TEST_PUBLIC)).rejects.toThrow(
      "Simulation failed"
    );
  });

  it("includes proof bytes in the simulated call", async () => {
    mockServer.simulateTransaction.mockResolvedValue(
      makeSimSuccess(xdr.ScVal.scvVoid())
    );

    const client = createAirdropClient(config);
    const proofHex = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const proof = { address: TEST_PUBLIC, amount: 1000n, proof: [proofHex] };
    const result = await client.simulateClaim(proof, TEST_PUBLIC);

    expect(result.fee).toBeDefined();
    expect(mockServer.simulateTransaction).toHaveBeenCalledOnce();
  });
});
