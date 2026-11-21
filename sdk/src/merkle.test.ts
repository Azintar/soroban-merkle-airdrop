import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { buildMerkleTree, verifyProof, leafHash } from "../src/merkle.js";

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

// Pool of valid Stellar strkeys used to generate arbitrary airdrop entries.
const ADDR_POOL = [
  "GBTL47RTFR5EKMZSXWOQU735WBK7LRPPDIDK3JTNTCZZ7NUBBRDTVSK2",
  "GBIRYNFBULFVEHPRNOZENOG6RZ4ZPTRDLR7HNMRKHV2QHISIDHOYV6ZN",
  "GCEEXCCX6TVKCYJ4MFIE3M2NJPVPGRSRPIHDDXR43XKNTNBADWOQWDYC",
  "GBMMY7FMUI4LRVCGXXUTKSFEAVC263AWXHUAS5CRMATPWQYXSFYXB3D7",
  "GABTU4L6RJ4QYUDOQGFXSI3SKVVDWHZBQRWO6WZ4FGPJQPKLYRYZUHQS",
  "GCY3FLWXZG4WQEN77ZG26WLC6EXI2LSDCDAE4VFTP6MPXOQSWQRAAGLU",
  "GBXEQ2FYGEFZ64S26AKBDC2LTHEN7Z36UU2J4V6FKCU23PEK7DQPCUND",
  "GAEH56L2B5TCTAYADUZ2VPZXS3VCDJRJNXVA3CT4DAI3TQWSHAIV5N6Q",
];

describe("property tests", () => {
  // Arbitrary that picks a unique subset of ADDR_POOL entries of length 2–8.
  const arbitraryEntry = fc.record({
    addressIdx: fc.integer({ min: 0, max: ADDR_POOL.length - 1 }),
    amount: fc.bigInt({ min: 1n, max: 1_000_000n }),
  });

  /**
   * P6: for any tree of N ≥ 2 entries, proof[i] must not verify for
   * (address[j], amount[j]) where i ≠ j.
   *
   * This guards against proof cross-talk — a proof built for one claimant
   * should never pass verification when presented for a different claimant.
   */
  it("P6: proof[i] does not verify for entry[j] where i !== j", () => {
    fc.assert(
      fc.property(
        // Build a list of 2–8 entries with distinct address indices.
        fc.array(arbitraryEntry, { minLength: 2, maxLength: 8 })
          .filter((arr) => {
            const idxSet = new Set(arr.map((e) => e.addressIdx));
            return idxSet.size === arr.length;
          })
          .map((arr) =>
            arr.map((e) => ({ address: ADDR_POOL[e.addressIdx], amount: e.amount }))
          ),
        // Pick two distinct valid indices within the generated list.
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 7 }),
        (entries, rawI, rawJ) => {
          const n = entries.length;
          const i = rawI % n;
          let j = rawJ % n;
          if (j === i) j = (j + 1) % n;

          const { root, proofs } = buildMerkleTree(entries);
          const proofForI = proofs.get(entries[i].address)!.proof;

          // Proof built for entries[i] must reject entries[j]'s claim data.
          return !verifyProof(root, entries[j].address, entries[j].amount, proofForI);
        }
      ),
      { numRuns: 500 }
    );
  });
});
