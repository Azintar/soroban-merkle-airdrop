/**
 * Unit tests for the generate command's --contract-id validation (issue #509).
 *
 * generateCommand marks --contract-id as requiredOption. These tests confirm:
 *   a. The command is defined with --contract-id as a required option.
 *   b. A valid C... contract ID flows through to the written output JSON.
 *   c. The output JSON contains all expected fields.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks so they are available in vi.mock factories ──────────────────

const { mockReadFile, mockWriteFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
}));

// ─── Mock fs/promises ────────────────────────────────────────────────────────

vi.mock("fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

// ─── Mock ora (spinner) ───────────────────────────────────────────────────────

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_CONTRACT_ID = "CCONTRACT1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ01234";

/** Single-entry CSV that produces a valid single-node Merkle tree. */
const SAMPLE_CSV = "GABC1234567890EXAMPLEADDRESS12345678901234,1000\n";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("generate command --contract-id validation (issue #509)", () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockReadFile.mockResolvedValue(SAMPLE_CSV);
    mockWriteFile.mockResolvedValue(undefined);
  });

  // ── Option definitions ───────────────────────────────────────────────────

  it("defines --contract-id as a required option", async () => {
    const { generateCommand } = await import("./generate.js");

    const opt = generateCommand.options.find((o) => o.long === "--contract-id");

    expect(opt).toBeDefined();
    // mandatory === true means the option was added with requiredOption().
    expect(opt!.mandatory).toBe(true);
  });

  it("defines --input as a required option", async () => {
    const { generateCommand } = await import("./generate.js");
    const opt = generateCommand.options.find((o) => o.long === "--input");
    expect(opt?.mandatory).toBe(true);
  });

  it("defines --output as a required option", async () => {
    const { generateCommand } = await import("./generate.js");
    const opt = generateCommand.options.find((o) => o.long === "--output");
    expect(opt?.mandatory).toBe(true);
  });

  // ── Happy path: contract ID flows through to output ──────────────────────

  it("passes the contract ID into the written output JSON", async () => {
    const { runGenerateAction } = await import("./generate.js");

    await runGenerateAction({
      contractId: VALID_CONTRACT_ID,
      input: "airdrop.csv",
      output: "tree.json",
    });

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const [, writtenContent] = mockWriteFile.mock.calls[0];
    const parsed = JSON.parse(writtenContent as string);

    expect(parsed.contractId).toBe(VALID_CONTRACT_ID);
  });

  it("output JSON includes root, contractId, totalEntries, totalAmount, and proofs", async () => {
    const { runGenerateAction } = await import("./generate.js");

    await runGenerateAction({
      contractId: VALID_CONTRACT_ID,
      input: "airdrop.csv",
      output: "tree.json",
    });

    const [, writtenContent] = mockWriteFile.mock.calls[0];
    const parsed = JSON.parse(writtenContent as string);

    expect(typeof parsed.root).toBe("string");
    expect(parsed.contractId).toBe(VALID_CONTRACT_ID);
    expect(parsed.totalEntries).toBe(1);
    expect(parsed.totalAmount).toBe("1000");
    expect(typeof parsed.proofs).toBe("object");
  });

  it("root is a 64-character hex string (SHA-256 output)", async () => {
    const { runGenerateAction } = await import("./generate.js");

    await runGenerateAction({
      contractId: VALID_CONTRACT_ID,
      input: "airdrop.csv",
      output: "tree.json",
    });

    const [, writtenContent] = mockWriteFile.mock.calls[0];
    const { root } = JSON.parse(writtenContent as string);

    expect(root).toMatch(/^[0-9a-f]{64}$/);
  });

  it("proofs object contains an entry for each address in the CSV", async () => {
    const { runGenerateAction } = await import("./generate.js");

    await runGenerateAction({
      contractId: VALID_CONTRACT_ID,
      input: "airdrop.csv",
      output: "tree.json",
    });

    const [, writtenContent] = mockWriteFile.mock.calls[0];
    const { proofs } = JSON.parse(writtenContent as string);

    const address = "GABC1234567890EXAMPLEADDRESS12345678901234";
    expect(proofs).toHaveProperty(address);
    expect(proofs[address].amount).toBe("1000");
    expect(Array.isArray(proofs[address].proof)).toBe(true);
  });
});
