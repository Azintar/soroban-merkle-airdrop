/**
 * @soroban-merkle-airdrop/sdk
 *
 * Public API surface for the soroban-merkle-airdrop TypeScript SDK.
 *
 * @example
 * ```ts
 * import { buildMerkleTree, createAirdropClient, NETWORKS } from '@soroban-merkle-airdrop/sdk';
 *
 * const { root, proofs } = buildMerkleTree([
 *   { address: "GABC...", amount: 1000n },
 * ]);
 *
 * const client = createAirdropClient({ ...NETWORKS.testnet, contractId: "C..." });
 * ```
 */

// ─── Merkle helpers ──────────────────────────────────────────────────────────
export { buildMerkleTree, leafHash, hashPair, verifyProof } from "./merkle.js";

// ─── Contract client ─────────────────────────────────────────────────────────
export { createAirdropClient } from "./client.js";

// ─── Types and network presets ───────────────────────────────────────────────
export type {
  AirdropEntry,
  ClaimProof,
  MerkleTreeResult,
  NetworkConfig,
  ClaimResult,
  ContractInfo,
} from "./types.js";
export { NETWORKS, AirdropContractError, RpcError, AirdropError } from "./types.js";
