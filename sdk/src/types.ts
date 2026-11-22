/** A single entry in the airdrop distribution list. */
export interface AirdropEntry {
  /** Stellar address of the recipient (G... or C...). */
  address: string;
  /** Token amount allocated to this recipient (in base units, e.g. stroops). */
  amount: bigint;
}

/** A claimant's proof package — everything needed to call `claim`. */
export interface ClaimProof {
  address: string;
  amount: bigint;
  /** Ordered list of sibling hashes (hex strings) from leaf to root. */
  proof: string[];
}

/** The full output of MerkleTree construction. */
export interface MerkleTreeResult {
  /** 32-byte Merkle root as a hex string. */
  root: string;
  /** Map from address → ClaimProof for every entry. */
  proofs: Map<string, ClaimProof>;
}

/** Network config for the airdrop contract client. */
export interface NetworkConfig {
  network: "testnet" | "mainnet";
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}

/** Well-known network presets. */
export const NETWORKS: Record<string, Omit<NetworkConfig, "contractId">> = {
  testnet: {
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  mainnet: {
    network: "mainnet",
    rpcUrl: "https://mainnet.sorobanrpc.com",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
};

/** Result returned from a claim transaction. */
export interface ClaimResult {
  success: boolean;
  txHash: string;
  address: string;
  amount: bigint;
}

/**
 * Format a raw token amount (in stroops) as a human-readable decimal string.
 *
 * @param amount - Raw amount in base units (stroops).
 * @param decimals - Number of decimal places (default 7 for XLM/Soroban tokens).
 * @returns Formatted string, e.g. "12.3456789".
 */
export function formatAmount(amount: bigint, decimals = 7): string {
  const factor = BigInt(10) ** BigInt(decimals);
  const whole = amount / factor;
  const frac = amount % factor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
}
