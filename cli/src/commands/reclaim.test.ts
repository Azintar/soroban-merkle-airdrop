import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runReclaimAction } from "./reclaim.js";
import { createAirdropClient, AirdropContractError } from "@soroban-merkle-airdrop/sdk";
import ora from "ora";

const mockReclaim = vi.fn();

vi.mock("ora", () => {
  const spinner: any = {
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    text: "",
  };
  spinner.start.mockReturnValue(spinner);
  let lastSpinner: any;
  const oraMock: any = vi.fn(() => {
    lastSpinner = spinner;
    return spinner;
  });
  oraMock.lastSpinner = () => lastSpinner;
  return { default: oraMock };
});

vi.mock("@soroban-merkle-airdrop/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@soroban-merkle-airdrop/sdk")>();
  return {
    ...actual,
    createAirdropClient: vi.fn(),
  };
});

const exitSpy = vi
  .spyOn(process, "exit")
  .mockImplementation((() => {}) as never);
const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

const origContractId = process.env.AIRDROP_CONTRACT_ID;
const origSecretKey = process.env.STELLAR_SECRET_KEY;

function setEnv(contractId?: string, secretKey?: string): void {
  if (contractId === undefined) {
    delete process.env.AIRDROP_CONTRACT_ID;
  } else {
    process.env.AIRDROP_CONTRACT_ID = contractId;
  }
  if (secretKey === undefined) {
    delete process.env.STELLAR_SECRET_KEY;
  } else {
    process.env.STELLAR_SECRET_KEY = secretKey;
  }
}

const fakeCmd = { parent: { opts: () => ({ network: "testnet" }) } };

beforeEach(() => {
  vi.clearAllMocks();
  setEnv("test-contract-id", "S_TEST_SECRET_KEY");
  vi.mocked(createAirdropClient).mockReturnValue(
    { reclaim: mockReclaim } as unknown as ReturnType<typeof createAirdropClient>
  );
});

afterEach(() => {
  setEnv(origContractId, origSecretKey);
});

describe("reclaim command", () => {
  it("test_reclaim_success", async () => {
    mockReclaim.mockResolvedValue({ txHash: "abc", amount: 500n });

    await runReclaimAction({ secretKey: "S_KEY" }, fakeCmd);

    expect(mockReclaim).toHaveBeenCalledWith("S_KEY");
    const logOutput = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logOutput).toContain("abc");
    expect(logOutput).toContain("500");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("test_reclaim_missing_contract_id", async () => {
    setEnv(undefined, "S_KEY");

    await runReclaimAction({ secretKey: "S_KEY" }, fakeCmd);

    const errorOutput = errorSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(errorOutput).toContain("contract-id or AIRDROP_CONTRACT_ID required");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("test_reclaim_missing_secret_key", async () => {
    setEnv("test-contract-id", undefined);

    await runReclaimAction({}, fakeCmd);

    const errorOutput = errorSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(errorOutput).toContain("secret-key or STELLAR_SECRET_KEY required");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("test_reclaim_contract_error", async () => {
    mockReclaim.mockRejectedValue(new AirdropContractError(7));

    await runReclaimAction({ secretKey: "S_KEY" }, fakeCmd);

    const spinner = (ora as any).lastSpinner?.();
    expect(spinner.fail).toHaveBeenCalledWith(
      expect.stringContaining("not yet expired")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});