/**
 * `merkle-airdrop claim`
 *
 * Submit a claim transaction for a given address using the Merkle proof
 * from the generated tree JSON.
 *
 * Pass --verify-only to check eligibility and on-chain status without
 * submitting a transaction.
 */

import { Command } from "commander";
import { readFile } from "fs/promises";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import { createAirdropClient, verifyProof, NETWORKS } from "@soroban-merkle-airdrop/sdk";
import { translateContractError } from "../errors.js";

// ─── Exported types (for tests) ───────────────────────────────────────────────

export interface ClaimOptions {
  tree: string;
  address: string;
  secretKey: string;
  network: string;
  contractId: string;
  verifyOnly?: boolean;
}

export interface ClaimResult {
  txHash: string;
  address: string;
  amount: bigint;
}

export interface VerifyOnlyResult {
  verified: true;
  alreadyClaimed: boolean;
  rootMismatch: boolean;
  onChainRoot: string | null;
  treeRoot: string;
  address: string;
  amount: bigint;
}

// ─── Core logic (exported for tests) ─────────────────────────────────────────

export async function runClaim(opts: ClaimOptions): Promise<ClaimResult | VerifyOnlyResult> {
  const raw = JSON.parse(await readFile(resolve(opts.tree), "utf-8"));
  const entry = raw.proofs[opts.address];

  if (!entry) {
    throw new Error(`Address ${opts.address} not found in airdrop list`);
  }

  const proof = { ...entry, amount: BigInt(entry.amount) };

  const valid = verifyProof(raw.root, proof.address, proof.amount, proof.proof);
  if (!valid) {
    throw new Error("Proof verification failed — tree may be corrupted");
  }

  const preset = NETWORKS[opts.network];
  if (!preset) {
    throw new Error(`Unknown network: ${opts.network}. Use testnet or mainnet.`);
  }

  const client = createAirdropClient({ ...preset, contractId: opts.contractId });

  if (opts.verifyOnly) {
    const [alreadyClaimed, onChainRoot] = await Promise.all([
      client.isClaimed(opts.address),
      client.merkleRoot(),
    ]);

    const rootMismatch =
      onChainRoot !== null && onChainRoot !== raw.root;

    return {
      verified: true,
      alreadyClaimed,
      rootMismatch,
      onChainRoot,
      treeRoot: raw.root,
      address: opts.address,
      amount: proof.amount,
    };
  }

  const already = await client.isClaimed(opts.address);
  if (already) {
    throw new Error(`${opts.address} has already claimed.`);
  }

  const result = await client.claim(proof, opts.secretKey);
  return { txHash: result.txHash, address: result.address, amount: result.amount };
}

// ─── Commander command definition ─────────────────────────────────────────────

export const claimCommand = new Command("claim")
  .description("Claim tokens from the airdrop")
  .requiredOption("-t, --tree <file>", "Merkle tree JSON (output of generate)")
  .requiredOption("-a, --address <address>", "Address to claim for")
  .option("-k, --secret-key <key>", "Stellar secret key (or set STELLAR_SECRET_KEY)")
  .option(
    "--verify-only",
    "Check eligibility and on-chain status without submitting a transaction"
  )
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network = globalOpts.network ?? "testnet";
    const contractId = globalOpts.contractId ?? process.env.AIRDROP_CONTRACT_ID;
    const secretKey = opts.secretKey ?? process.env.STELLAR_SECRET_KEY;

    if (!contractId) {
      console.error(chalk.red("Error: --contract-id or AIRDROP_CONTRACT_ID required"));
      process.exit(1);
    }
    if (!opts.verifyOnly && !secretKey) {
      console.error(chalk.red("Error: --secret-key or STELLAR_SECRET_KEY required"));
      process.exit(1);
    }

    const spinner = ora("Loading Merkle tree...").start();
    try {
      const result = await runClaim({
        tree: opts.tree,
        address: opts.address,
        secretKey: secretKey ?? "",
        network,
        contractId,
        verifyOnly: opts.verifyOnly,
      });

      if ("verified" in result) {
        // Verify-only output.
        if (result.alreadyClaimed) {
          spinner.warn(
            chalk.yellow(`${result.address} has already claimed their allocation.`)
          );
        } else if (result.rootMismatch) {
          spinner.warn(
            chalk.yellow(
              `On-chain root (${result.onChainRoot}) does not match tree root (${result.treeRoot}). ` +
              `The tree file may be outdated.`
            )
          );
        } else {
          spinner.succeed(chalk.green("Proof is valid and address has not yet claimed."));
          console.log(`\n  ${chalk.bold("Address:")} ${result.address}`);
          console.log(`  ${chalk.bold("Amount:")}  ${result.amount.toString()}\n`);
        }
        process.exit(0);
      }

      spinner.succeed(chalk.green("Claim submitted!"));
      console.log(`\n  ${chalk.bold("Tx hash:")} ${chalk.cyan(result.txHash)}`);
      console.log(`  ${chalk.bold("Address:")} ${result.address}`);
      console.log(`  ${chalk.bold("Amount:")}  ${result.amount.toString()}\n`);
    } catch (err) {
      const message = translateContractError((err as Error).message);
      spinner.fail(`Error: ${message}`);
      process.exit(1);
    }
  });
