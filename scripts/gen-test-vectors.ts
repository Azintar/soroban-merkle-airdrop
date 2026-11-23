/**
 * scripts/gen-test-vectors.ts
 *
 * Regenerate test-vectors/leaf-hash-vectors.json after the domain-separation
 * change introduced in issue #50 (leafHash now takes a contractId parameter).
 *
 * Usage:
 *   cd /workspaces/soroban-merkle-airdrop
 *   npx ts-node --project scripts/tsconfig.json scripts/gen-test-vectors.ts \
 *       > test-vectors/leaf-hash-vectors.json
 *
 * The script writes a JSON array to stdout. Each element has the shape:
 *   {
 *     "_comment":          "<description of this vector>",
 *     "contract_id":       "<Stellar C-strkey of the airdrop contract>",
 *     "address":           "<Stellar G- or C-strkey of the claimant>",
 *     "amount":            "<decimal string — avoids JS number precision loss>",
 *     "expected_leaf_hex": "<64-character lowercase hex of SHA-256 leaf hash>"
 *   }
 *
 * Regeneration instructions
 * ─────────────────────────
 * Run this script whenever leafHash() changes so that:
 *   1. test-vectors/leaf-hash-vectors.json is replaced with the new output.
 *   2. The Rust cross-language test (test_leaf_hash_vectors in test.rs) passes
 *      without #[ignore].
 *   3. cd sdk && pnpm test produces 0 skipped vector tests.
 *
 * Closes #474
 */

import { createHash } from "crypto";

// ─── Inline leafHash — mirrors sdk/src/merkle.ts exactly ──────────────────
//
// We re-implement the three-step algorithm here rather than importing from
// the built SDK so this script can be run without a prior `pnpm build` step.

function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

function leafHash(contractId: string, address: string, amount: bigint): Buffer {
  // Step 1: SHA-256 the UTF-8 bytes of the contract strkey (domain separator).
  const contractHash = sha256(Buffer.from(contractId, "utf8"));

  // Step 2: SHA-256 the UTF-8 bytes of the claimant strkey.
  const addrHash = sha256(Buffer.from(address, "utf8"));

  // Step 3: Encode amount as 16-byte big-endian i128 (hi/lo split).
  const amountBuf = Buffer.alloc(16);
  const hi = amount >> 64n;
  const lo = amount & 0xffffffffffffffffn;
  amountBuf.writeBigInt64BE(BigInt.asIntN(64, hi), 0);
  amountBuf.writeBigUInt64BE(lo, 8);

  // Step 4: SHA-256(contract_hash ++ addr_hash ++ amount_be16)
  return sha256(Buffer.concat([contractHash, addrHash, amountBuf]));
}

// ─── Stable addresses used across the vectors ─────────────────────────────

// Two contract addresses (C-strkeys) — one is the domain-separator contract,
// one doubles as a C-address claimant.
const CONTRACT_A = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const CONTRACT_B = "CBEZIXBSAPZ5YBH2WQHLISNOQDXVZKZQRPX3MF5GRCJJMH3SBYXEWYJ";

// Several G-address claimants from the existing test suite.
const ADDR_G1 = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const ADDR_G2 = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
const ADDR_G3 = "GAYOLLLUIZE4DZMBB2ZBKGBUBZLIOYU6XFLW37GBP2VZD3ABNXCW4BVA";
const ADDR_G4 = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGPFWEPDFWPTTG6CQRPMSZ";
const ADDR_G5 = "GC2XDH63N3GGWP7QH36PFPTSEMC77HNHHCFK4MT5P7UY2LVJRLXIYWW";
const ADDR_G6 = "GBVZJYDVQ4WY7GQFKNGJQZ3HVFMR3PNJYMLFKPQWIGZPHNVBNKMKFXM";
const ADDR_G7 = "GDXF5SHEF3XNZE3EF3VIJTNS3FMTMHQSXMLLWFUJL7YFJPMIHYF5KAW";
const ADDR_G8 = "GDMGJ4JCWZL6FJDAKBLH3UQ7GBWJMPBWLGVP4G5UYXZ3AVZDLJ5L3AO";

// C-address claimant (a Soroban contract receiving tokens).
const ADDR_C1 = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

// i128::MAX = 2^127 - 1
const I128_MAX = 170141183460469231731687303715884105727n;

// ─── Vector definitions ───────────────────────────────────────────────────

interface VectorDef {
  _comment: string;
  contract_id: string;
  address: string;
  amount: bigint;
}

const vectors: VectorDef[] = [
  // ── Vectors 0-6: original cross-language vectors, now with contract_id ──

  {
    _comment:
      "Vector 0 — G-address, typical amount 1 000 000; original cross-language vector from test.rs",
    contract_id: CONTRACT_A,
    address: ADDR_G1,
    amount: 1_000_000n,
  },
  {
    _comment: "Vector 1 — G-address, minimum positive amount = 1",
    contract_id: CONTRACT_A,
    address: ADDR_G2,
    amount: 1n,
  },
  {
    _comment:
      "Vector 2 — G-address, i128::MAX = 2^127 - 1; both high and low 64-bit words fully set",
    contract_id: CONTRACT_A,
    address: ADDR_G3,
    amount: I128_MAX,
  },
  {
    _comment:
      "Vector 3 — G-address, amount = 2^64; high 64-bit word = 1, low = 0; tests carry across word boundary",
    contract_id: CONTRACT_A,
    address: ADDR_G4,
    amount: 18_446_744_073_709_551_616n, // 2n ** 64n
  },
  {
    _comment: "Vector 4 — G-address, small amount 500",
    contract_id: CONTRACT_A,
    address: ADDR_G5,
    amount: 500n,
  },
  {
    _comment: "Vector 5 — G-address, billion-scale amount 1 000 000 000",
    contract_id: CONTRACT_A,
    address: ADDR_G6,
    amount: 1_000_000_000n,
  },
  {
    _comment: "Vector 6 — G-address, amount = 250",
    contract_id: CONTRACT_A,
    address: ADDR_G7,
    amount: 250n,
  },

  // ── Vectors 7-8: C-address claimants ─────────────────────────────────────

  {
    _comment:
      "Vector 7 — C-address claimant (Soroban contract), amount = 42; exercises contract address strkey hashing",
    contract_id: CONTRACT_A,
    address: ADDR_C1,
    amount: 42n,
  },
  {
    _comment: "Vector 8 — C-address claimant, large amount near 10^10",
    contract_id: CONTRACT_A,
    address: CONTRACT_B, // CONTRACT_B used as a claimant here
    amount: 9_999_999_999n,
  },

  // ── Vectors 9-10: high-word-only amounts ─────────────────────────────────

  {
    _comment:
      "Vector 9 — G-address, amount = 5 × 2^64 (high 64-bit word = 5, low = 0); exercises high-word encoding path",
    contract_id: CONTRACT_A,
    address: ADDR_G8,
    amount: 92_233_720_368_547_758_080n, // 5n * 2n**64n
  },
  {
    _comment:
      "Vector 10 — G-address, amount near i128::MAX/2 (high word = 2^62, tests mid-range high word)",
    contract_id: CONTRACT_A,
    address: ADDR_G1,
    amount: 85_070_591_730_234_615_865_843_651_857_942_052_864n,
  },

  // ── Vectors 11-15: domain-separation vectors (CONTRACT_B as the airdrop contract) ──

  {
    _comment:
      "Vector 11 — same address and amount as vector 0, but contract_id = CONTRACT_B; proves domain separation",
    contract_id: CONTRACT_B,
    address: ADDR_G1,
    amount: 1_000_000n,
  },
  {
    _comment:
      "Vector 12 — G-address with CONTRACT_B, amount = 1; confirms different contract produces different hash",
    contract_id: CONTRACT_B,
    address: ADDR_G2,
    amount: 1n,
  },
  {
    _comment:
      "Vector 13 — C-address claimant with CONTRACT_B, amount = 42; C-recipient under a different contract",
    contract_id: CONTRACT_B,
    address: ADDR_C1,
    amount: 42n,
  },

  // ── Vectors 14-15: additional boundary amounts ────────────────────────────

  {
    _comment:
      "Vector 14 — G-address, amount = 2^63 (exactly fills 63 bits of the low word; sign-bit boundary)",
    contract_id: CONTRACT_A,
    address: ADDR_G5,
    amount: 9_223_372_036_854_775_808n, // 2n ** 63n
  },
  {
    _comment:
      "Vector 15 — G-address, amount = 2 (low-word-only, non-trivial); quick sanity for small even amounts",
    contract_id: CONTRACT_A,
    address: ADDR_G6,
    amount: 2n,
  },
];

// ─── Emit JSON ────────────────────────────────────────────────────────────

interface OutputVector {
  _comment: string;
  contract_id: string;
  address: string;
  amount: string;
  expected_leaf_hex: string;
}

const output: OutputVector[] = vectors.map((v) => ({
  _comment: v._comment,
  contract_id: v.contract_id,
  address: v.address,
  amount: v.amount.toString(),
  expected_leaf_hex: leafHash(v.contract_id, v.address, v.amount).toString("hex"),
}));

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
