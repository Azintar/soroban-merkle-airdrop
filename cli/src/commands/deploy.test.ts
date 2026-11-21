/**
 * Unit tests for the programmatic deploy command (Issues #69, #500).
 *
 * All Stellar RPC calls are mocked — no real network access occurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { programmaticDeploy, type DeployOptions } from "./deploy.js";

// ─── Hoist shared values so they are available inside vi.mock factories ──────

const { mockServer, defaultReadFile } = vi.hoisted(() => {
  const defaultReadFile = (path: unknown) => {
    if (String(path).endsWith(".wasm")) {
      return Promise.resolve(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    }
    return Promise.resolve(
      JSON.stringify({
        root: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        totalAmount: "150000",
        proofs: {},
      })
    );
  };

  const mockServer = {
    getAccount: vi.fn(),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn(),
  };

  return { mockServer, defaultReadFile };
});

// ─── Mock @stellar/stellar-sdk ──────────────────────────────────────────────

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();

  // Capture real XDR type tags so === comparisons in source code work correctly.
  const scvBytesTag = actual.xdr.ScValType.scvBytes();
  const scvAddressTag = actual.xdr.ScValType.scvAddress();
  const scAddressContractTag = actual.xdr.ScAddressType.scAddressTypeContract();

  const MockServer = vi.fn(() => mockServer);

  // Fake contract address bytes (32 bytes).
  const fakeContractBytes = Buffer.alloc(32, 0xcc);

  // fromXDR returns scvBytes on first call (WASM upload result) and
  // scvAddress on second call (deploy contract result).
  const fromXDR = vi.fn()
    .mockReturnValueOnce({
      v3: vi.fn().mockReturnValue({
        sorobanMeta: vi.fn().mockReturnValue({
          returnValue: vi.fn().mockReturnValue({
            switch: vi.fn().mockReturnValue(scvBytesTag),
            bytes: vi.fn().mockReturnValue(Buffer.alloc(32, 0xab)),
          }),
        }),
      }),
    })
    .mockReturnValue({
      v3: vi.fn().mockReturnValue({
        sorobanMeta: vi.fn().mockReturnValue({
          returnValue: vi.fn().mockReturnValue({
            switch: vi.fn().mockReturnValue(scvAddressTag),
            address: vi.fn().mockReturnValue({
              switch: vi.fn().mockReturnValue(scAddressContractTag),
              contractId: vi.fn().mockReturnValue(fakeContractBytes),
            }),
          }),
        }),
      }),
    });

  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: MockServer,
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
      random: vi.fn().mockReturnValue({ publicKey: vi.fn().mockReturnValue("GRND") }),
    },
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({ sign: vi.fn(), toXDR: vi.fn() }),
    })),
    Operation: {
      ...actual.Operation,
      uploadContractWasm: vi.fn().mockReturnValue({}),
      createCustomContract: vi.fn().mockReturnValue({}),
    },
    Contract: vi.fn().mockImplementation(() => ({
      call: vi.fn().mockReturnValue({}),
    })),
    Address: Object.assign(
      vi.fn().mockImplementation((addr: string) => ({
        toScVal: vi.fn().mockReturnValue({}),
        toString: () => addr,
      })),
      {
        // Static method used in extractContractIdFromResult.
        contract: vi.fn().mockReturnValue({
          toString: () => "CMOCKCONTRACTID123456789012345678901234567890123456",
        }),
      }
    ),
    xdr: {
      ...actual.xdr,
      ScVal: {
        ...actual.xdr.ScVal,
        scvBytes: vi.fn().mockReturnValue({}),
      },
      TransactionMeta: {
        fromXDR,
      },
      ScValType: actual.xdr.ScValType,
      ScAddressType: actual.xdr.ScAddressType,
    },
    nativeToScVal: vi.fn().mockReturnValue({}),
    Networks: actual.Networks,
  };
});

// ─── Mock fs/promises ────────────────────────────────────────────────────────

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockImplementation(defaultReadFile),
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

const BASE_OPTS: DeployOptions = {
  wasm: "contract.wasm",
  token: "CTOKEN123",
  tree: "merkle-tree.json",
  expiration: "9999999999",
  secretKey: "STEST123SECRETKEY",
  network: "testnet",
  pollIntervalMs: 0, // skip sleep() delays in tests
};

/** Build a successful simResult (no 'error' key). */
function simSuccess() {
  return {
    result: { retval: {} },
    transactionData: {},
    minResourceFee: "100",
  };
}

/** Build a fake successful GetTransaction response. */
function txSuccess() {
  return {
    status: "SUCCESS" as const,
    resultMetaXdr: {
      toXDR: () => Buffer.alloc(0),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("programmaticDeploy (Issues #69, #500)", () => {
  beforeEach(async () => {
    // Reset only the RPC server mocks (not the SDK module mocks which are complex to restore).
    mockServer.getAccount.mockReset();
    mockServer.simulateTransaction.mockReset();
    mockServer.sendTransaction.mockReset();
    mockServer.getTransaction.mockReset();

    // Restore readFile default after reset.
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockReset();
    vi.mocked(readFile).mockImplementation(defaultReadFile);

    // Restore nativeToScVal.
    const { nativeToScVal } = await import("@stellar/stellar-sdk");
    vi.mocked(nativeToScVal).mockReset();
    vi.mocked(nativeToScVal).mockReturnValue({} as never);

    // Restore TransactionBuilder.
    const { TransactionBuilder } = await import("@stellar/stellar-sdk");
    vi.mocked(TransactionBuilder).mockReset();
    vi.mocked(TransactionBuilder).mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({ sign: vi.fn(), toXDR: vi.fn() }),
    }) as never);

    // Restore Contract.
    const { Contract, Address } = await import("@stellar/stellar-sdk");
    vi.mocked(Contract).mockReset();
    vi.mocked(Contract).mockImplementation(() => ({ call: vi.fn().mockReturnValue({}) }) as never);

    // Restore Address constructor mock (instance method toScVal).
    vi.mocked(Address).mockReset();
    vi.mocked(Address).mockImplementation((addr: string) => ({
      toScVal: vi.fn().mockReturnValue({}),
      toString: () => addr,
    }) as never);

    // Restore Address.contract static method if it exists on the mock.
    const addressContractMock = (Address as unknown as { contract?: ReturnType<typeof vi.fn> }).contract;
    if (addressContractMock && typeof addressContractMock.mockReturnValue === "function") {
      addressContractMock.mockReset();
      addressContractMock.mockReturnValue({
        toString: () => "CMOCKCONTRACTID123456789012345678901234567890123456",
      });
    }

    // Restore Keypair.fromSecret.
    const { Keypair } = await import("@stellar/stellar-sdk");
    vi.mocked(Keypair.fromSecret).mockReset();
    vi.mocked(Keypair.fromSecret).mockReturnValue({
      publicKey: vi.fn().mockReturnValue("GADMIN123PUBLICKEY"),
      sign: vi.fn(),
    } as never);

    // Restore xdr.TransactionMeta.fromXDR with correct per-call return values.
    const { xdr } = await import("@stellar/stellar-sdk");
    const actual = await import("@stellar/stellar-sdk");
    const scvBytesTag = actual.xdr.ScValType.scvBytes();
    const scvAddressTag = actual.xdr.ScValType.scvAddress();
    const scAddressContractTag = actual.xdr.ScAddressType.scAddressTypeContract();
    const fakeContractBytes = Buffer.alloc(32, 0xcc);

    vi.mocked(xdr.TransactionMeta.fromXDR).mockReset();
    vi.mocked(xdr.TransactionMeta.fromXDR)
      .mockReturnValueOnce({
        v3: vi.fn().mockReturnValue({
          sorobanMeta: vi.fn().mockReturnValue({
            returnValue: vi.fn().mockReturnValue({
              switch: vi.fn().mockReturnValue(scvBytesTag),
              bytes: vi.fn().mockReturnValue(Buffer.alloc(32, 0xab)),
            }),
          }),
        }),
      } as never)
      .mockReturnValue({
        v3: vi.fn().mockReturnValue({
          sorobanMeta: vi.fn().mockReturnValue({
            returnValue: vi.fn().mockReturnValue({
              switch: vi.fn().mockReturnValue(scvAddressTag),
              address: vi.fn().mockReturnValue({
                switch: vi.fn().mockReturnValue(scAddressContractTag),
                contractId: vi.fn().mockReturnValue(fakeContractBytes),
              }),
            }),
          }),
        }),
      } as never);

    // Restore rpc.assembleTransaction.
    const { rpc } = await import("@stellar/stellar-sdk");
    vi.mocked(rpc.assembleTransaction).mockReset();
    vi.mocked(rpc.assembleTransaction).mockReturnValue({
      build: vi.fn().mockReturnValue({ sign: vi.fn(), toXDR: vi.fn() }),
    } as never);

    // Default happy-path RPC responses.
    mockServer.getAccount.mockResolvedValue({
      id: "GADMIN123PUBLICKEY",
      sequenceNumber: () => "100",
      incrementSequenceNumber: vi.fn(),
    });
    mockServer.simulateTransaction.mockResolvedValue(simSuccess());
    mockServer.sendTransaction.mockResolvedValue({ status: "PENDING", hash: "txhash123" });
    mockServer.getTransaction.mockResolvedValue(txSuccess());
  });

  it("calls simulateTransaction and sendTransaction for each of the 3 steps", async () => {
    mockServer.sendTransaction
      .mockResolvedValueOnce({ status: "PENDING", hash: "upload-hash" })
      .mockResolvedValueOnce({ status: "PENDING", hash: "deploy-hash" })
      .mockResolvedValueOnce({ status: "PENDING", hash: "init-hash" });

    mockServer.getTransaction.mockResolvedValue(txSuccess());

    await programmaticDeploy(BASE_OPTS);

    // simulateTransaction called 3 times (upload + deploy + init)
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(3);
    // sendTransaction called 3 times
    expect(mockServer.sendTransaction).toHaveBeenCalledTimes(3);
  });

  it("throws if WASM upload simulation returns an error", async () => {
    mockServer.simulateTransaction.mockResolvedValueOnce({
      error: "Simulation error: out of budget",
    });

    await expect(programmaticDeploy(BASE_OPTS)).rejects.toThrow(
      /WASM upload simulation failed/
    );
  });

  it("throws if contract deploy simulation returns an error", async () => {
    mockServer.simulateTransaction
      .mockResolvedValueOnce(simSuccess())
      .mockResolvedValueOnce({ error: "Deploy simulation error" });

    await expect(programmaticDeploy(BASE_OPTS)).rejects.toThrow(
      /Contract deploy simulation failed/
    );
  });

  it("throws if initialize simulation returns an error", async () => {
    mockServer.simulateTransaction
      .mockResolvedValueOnce(simSuccess())   // upload
      .mockResolvedValueOnce(simSuccess())   // deploy
      .mockResolvedValueOnce({ error: "Init simulation error" }); // init

    await expect(programmaticDeploy(BASE_OPTS)).rejects.toThrow(
      /Initialize simulation failed/
    );
  });

  it("throws if upload sendTransaction returns ERROR status", async () => {
    mockServer.sendTransaction.mockResolvedValueOnce({
      status: "ERROR",
      errorResult: { toXDR: () => "errorXDR" },
    });

    await expect(programmaticDeploy(BASE_OPTS)).rejects.toThrow(
      /WASM upload transaction failed/
    );
  });

  it("throws if deploy sendTransaction returns ERROR status", async () => {
    mockServer.sendTransaction
      .mockResolvedValueOnce({ status: "PENDING", hash: "upload-hash" })
      .mockResolvedValueOnce({ status: "ERROR", errorResult: { toXDR: () => "err" } });

    await expect(programmaticDeploy(BASE_OPTS)).rejects.toThrow(
      /Contract deploy transaction failed/
    );
  });

  it("throws a timeout error if getTransaction never returns SUCCESS", async () => {
    mockServer.getTransaction.mockResolvedValue({ status: "NOT_FOUND" });

    const realDateNow = Date.now;
    let callCount = 0;
    vi.spyOn(Date, "now").mockImplementation(() => {
      callCount++;
      return callCount > 5 ? realDateNow() + 100_000 : realDateNow();
    });

    try {
      await expect(programmaticDeploy(BASE_OPTS)).rejects.toThrow(
        /Transaction confirmation timeout/
      );
    } finally {
      vi.restoreAllMocks();
    }
  }, 30_000);

  it("rejects if Merkle tree JSON has no root field", async () => {
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockImplementation((path) => {
      if (String(path).endsWith(".wasm")) return Promise.resolve(Buffer.from([0x00]));
      return Promise.resolve(JSON.stringify({ totalAmount: "1000" }));
    });

    await expect(programmaticDeploy(BASE_OPTS)).rejects.toThrow(
      /missing a 'root' field/
    );
  });

  it("rejects if Merkle tree JSON has no totalAmount field", async () => {
    const { readFile } = await import("fs/promises");
    vi.mocked(readFile).mockImplementation((path) => {
      if (String(path).endsWith(".wasm")) return Promise.resolve(Buffer.from([0x00]));
      return Promise.resolve(
        JSON.stringify({ root: "abc123".repeat(10).slice(0, 64) })
      );
    });

    await expect(programmaticDeploy(BASE_OPTS)).rejects.toThrow(
      /missing 'totalAmount'/
    );
  });

  // ── Issue #500: 7-argument initialize call ───────────────────────────────

  it("passes 7 arguments to initialize (5 required + 2 Option<u32> for TTLs)", async () => {
    const { Contract, nativeToScVal } = await import("@stellar/stellar-sdk");
    const mockCallFn = vi.fn().mockReturnValue({});
    vi.mocked(Contract).mockImplementation(() => ({ call: mockCallFn }) as never);

    mockServer.sendTransaction
      .mockResolvedValueOnce({ status: "PENDING", hash: "upload-hash" })
      .mockResolvedValueOnce({ status: "PENDING", hash: "deploy-hash" })
      .mockResolvedValueOnce({ status: "PENDING", hash: "init-hash" });

    await programmaticDeploy(BASE_OPTS);

    // contractInst.call("initialize", ...7 ScVal args) → 8 total call args.
    const initCall = mockCallFn.mock.calls.find(([method]) => method === "initialize");
    expect(initCall).toBeDefined();
    expect(initCall!.length).toBe(8);

    // nativeToScVal is called for: totalAmount (i128), expiration (u64),
    // claimed_ttl (option null), instance_ttl (option null) — at least 4.
    expect(vi.mocked(nativeToScVal).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("passes numeric claimed_ttl and instance_ttl as u32 ScVals when provided", async () => {
    const { nativeToScVal } = await import("@stellar/stellar-sdk");

    await programmaticDeploy({ ...BASE_OPTS, claimedTtl: 1000, instanceTtl: 2000 });

    const calls = vi.mocked(nativeToScVal).mock.calls;
    const u32Calls = calls.filter(([, opts]) => (opts as { type: string })?.type === "u32");
    expect(u32Calls.length).toBe(2);
    expect(u32Calls[0][0]).toBe(1000);
    expect(u32Calls[1][0]).toBe(2000);
  });

  it("passes Option::None ScVals for TTLs when claimedTtl and instanceTtl are omitted", async () => {
    const { nativeToScVal } = await import("@stellar/stellar-sdk");

    await programmaticDeploy(BASE_OPTS); // no claimedTtl / instanceTtl

    const calls = vi.mocked(nativeToScVal).mock.calls;
    const optionNoneCalls = calls.filter(
      ([val, opts]) => val === null && (opts as { type: string })?.type === "option"
    );
    // One None for claimed_ttl, one for instance_ttl.
    expect(optionNoneCalls.length).toBe(2);
  });
});
