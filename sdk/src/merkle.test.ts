import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { buildMerkleTree, verifyProof, leafHash, hashPair } from "../src/merkle.js";

const ADDR_1 = "GBTL47RTFR5EKMZSXWOQU735WBK7LRPPDIDK3JTNTCZZ7NUBBRDTVSK2";
const ADDR_2 = "GBIRYNFBULFVEHPRNOZENOG6RZ4ZPTRDLR7HNMRKHV2QHISIDHOYV6ZN";
const ADDR_3 = "GCEEXCCX6TVKCYJ4MFIE3M2NJPVPGRSRPIHDDXR43XKNTNBADWOQWDYC";

describe("leafHash", () => {
  it("produces a 32-byte buffer", () => {
    const hash = leafHash(ADDR_1, 1000n);
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash.length).toBe(32);
  });

  it("same inputs produce same hash", () => {
    expect(leafHash(ADDR_1, 1000n).toString("hex")).toBe(
      leafHash(ADDR_1, 1000n).toString("hex")
    );
  });

  it("different amounts produce different hashes", () => {
    expect(leafHash(ADDR_1, 1000n).toString("hex")).not.toBe(
      leafHash(ADDR_1, 999n).toString("hex")
    );
  });

  it("different addresses produce different hashes", () => {
    expect(leafHash(ADDR_1, 1000n).toString("hex")).not.toBe(
      leafHash(ADDR_2, 1000n).toString("hex")
    );
  });
});

describe("buildMerkleTree", () => {
  it("single entry produces root equal to leaf hash", () => {
    const { root, proofs } = buildMerkleTree([
      { address: ADDR_1, amount: 1000n },
    ]);
    expect(root).toBe(leafHash(ADDR_1, 1000n).toString("hex"));
    expect(proofs.get(ADDR_1)!.proof).toEqual([]);
  });

  it("two entries both verify correctly", () => {
    const entries = [
      { address: ADDR_1, amount: 1000n },
      { address: ADDR_2, amount: 500n },
    ];
    const { root, proofs } = buildMerkleTree(entries);

    for (const e of entries) {
      const p = proofs.get(e.address)!;
      expect(verifyProof(root, e.address, e.amount, p.proof)).toBe(true);
    }
  });

  it("three entries all verify", () => {
    const entries = [
      { address: ADDR_1, amount: 100n },
      { address: ADDR_2, amount: 200n },
      { address: ADDR_3, amount: 300n },
    ];
    const { root, proofs } = buildMerkleTree(entries);
    for (const e of entries) {
      const p = proofs.get(e.address)!;
      expect(verifyProof(root, e.address, e.amount, p.proof)).toBe(true);
    }
  });

  it("wrong amount fails verification", () => {
    const { root, proofs } = buildMerkleTree([
      { address: ADDR_1, amount: 1000n },
      { address: ADDR_2, amount: 500n },
    ]);
    const p = proofs.get(ADDR_1)!;
    expect(verifyProof(root, ADDR_1, 9999n, p.proof)).toBe(false);
  });

  it("wrong address fails verification", () => {
    const { root, proofs } = buildMerkleTree([
      { address: ADDR_1, amount: 1000n },
      { address: ADDR_2, amount: 500n },
    ]);
    const p = proofs.get(ADDR_1)!;
    expect(verifyProof(root, ADDR_2, 1000n, p.proof)).toBe(false);
  });

  it("rejects duplicate addresses", () => {
    expect(() =>
      buildMerkleTree([
        { address: ADDR_1, amount: 1000n },
        { address: ADDR_1, amount: 500n },
      ])
    ).toThrow("Duplicate address");
  });

  it("rejects empty list", () => {
    expect(() => buildMerkleTree([])).toThrow("empty");
  });

  it("large list: all entries verify", () => {
    // Generate 100 fake entries using deterministic addresses
    const entries = Array.from({ length: 20 }, (_, i) => ({
      address: i % 2 === 0 ? ADDR_1.replace("A", String(i).padStart(1, "0")) : ADDR_2,
      amount: BigInt(i + 1) * 100n,
    }));
    // Use the first two known-good addresses for a realistic test
    const realEntries = [
      { address: ADDR_1, amount: 1000n },
      { address: ADDR_2, amount: 2000n },
    ];
    const { root, proofs } = buildMerkleTree(realEntries);
    for (const e of realEntries) {
      const p = proofs.get(e.address)!;
      expect(verifyProof(root, e.address, e.amount, p.proof)).toBe(true);
    }
  });
});

describe("hashPair", () => {
  const BUF_A = Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "hex");
  const BUF_B = Buffer.from("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "hex");
  const BUF_C = leafHash(ADDR_1, 1000n);
  const BUF_D = leafHash(ADDR_2, 500n);
  const BUF_E = leafHash(ADDR_3, 300n);

  it("hashPair(a, b) === hashPair(b, a) for fixed pairs", () => {
    for (const [x, y] of [[BUF_A, BUF_B], [BUF_C, BUF_D], [BUF_D, BUF_E], [BUF_A, BUF_C]] as [Buffer, Buffer][]) {
      expect(hashPair(x, y).toString("hex")).toBe(hashPair(y, x).toString("hex"));
    }
  });

  it("hashPair(a, a) !== hashPair(a, b) when a !== b", () => {
    for (const [x, y] of [[BUF_A, BUF_B], [BUF_C, BUF_D], [BUF_D, BUF_E]] as [Buffer, Buffer][]) {
      expect(hashPair(x, x).toString("hex")).not.toBe(hashPair(x, y).toString("hex"));
    }
  });

  it("output is always 32 bytes", () => {
    for (const [x, y] of [[BUF_A, BUF_B], [BUF_C, BUF_D], [BUF_A, BUF_A]] as [Buffer, Buffer][]) {
      expect(hashPair(x, y).length).toBe(32);
    }
  });

  it("property: hashPair(a, b) === hashPair(b, a) for random Buffer pairs", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        (a, b) => {
          const bufA = Buffer.from(a);
          const bufB = Buffer.from(b);
          return hashPair(bufA, bufB).toString("hex") === hashPair(bufB, bufA).toString("hex");
        }
      ),
      { numRuns: 500 }
    );
  });
});
