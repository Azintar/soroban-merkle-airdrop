/**
 * `merkle-airdrop batch-claim`
 *
 * Claim tokens on behalf of multiple addresses in a single transaction
 * (operator-pays pattern). Useful when users do not have wallets to sign
 * their own transactions.
 *
 * Usage:
 *   merkle-airdrop batch-claim \
 *     --tree merkle-tree.json \
 *     --addresses addresses.txt \
 *     --operator-key S... \
 *     [--dry-run] [--network testnet] [--contract-id C...]
 *
 * --addresses   Text file with one Stellar address per line.
 * --dry-run     Print the assembled XDR and estimated fee instead of submitting.
 */

import { Command } from "commander";
import { readFile } from "fs/promises";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import { createAirdropClient, verifyProof, NETWORKS } from "@soroban-merkle-airdrop/sdk";
import type { ClaimProof } from "@soroban-merkle-airdrop/sdk";
import { translateContractError } from "../errors.js";

// ─── Exported types (for tests) ───────────────────────────────────────────────

export interface BatchClaimOptions {
  tree: string;
  addresses: string;
  operatorKey: string;
  network: string;
  contractId: string;
  dryRun?: boolean;
}

export interface BatchClaimResult {
  txHash: string;
  count: number;
}

export interface BatchClaimDryRunResult {
  xdr: string;
  fee: string;
  count: number;
}

// ─── Core logic (exported for tests) ─────────────────────────────────────────

export async function runBatchClaim(
  opts: BatchClaimOptions
): Promise<BatchClaimResult | BatchClaimDryRunResult> {
  // Load tree JSON.
  const raw = JSON.parse(await readFile(resolve(opts.tree), "utf-8"));

  // Parse addresses file — one address per line, skip blanks and comments.
  const addressesRaw = await readFile(resolve(opts.addresses), "utf-8");
  const addresses = addressesRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (addresses.length === 0) {
    throw new Error("Addresses file is empty or contains no valid addresses");
  }

  // Build proof entries, verifying each proof locally before submitting.
  const entries: ClaimProof[] = [];
  const missing: string[] = [];

  for (const address of addresses) {
    const entry = raw.proofs[address];
    if (!entry) {
      missing.push(address);
      continue;
    }
    const proof: ClaimProof = { ...entry, amount: BigInt(entry.amount) };

    const valid = verifyProof(raw.root, proof.address, proof.amount, proof.proof);
    if (!valid) {
      throw new Error(
        `Proof verification failed for ${address} — tree file may be corrupted`
      );
    }
    entries.push(proof);
  }

  if (missing.length > 0) {
    throw new Error(
      `The following addresses were not found in the airdrop tree:\n  ${missing.join("\n  ")}`
    );
  }

  const preset = NETWORKS[opts.network];
  if (!preset) {
    throw new Error(`Unknown network: ${opts.network}. Use testnet or mainnet.`);
  }

  const client = createAirdropClient({ ...preset, contractId: opts.contractId });

  if (opts.dryRun) {
    // For dry-run we need an operator public key. Derive it from the secret key.
    const { Keypair } = await import("@stellar/stellar-sdk");
    const operatorPublicKey = Keypair.fromSecret(opts.operatorKey).publicKey();
    const dryResult = await client.buildBatchClaimTransaction(entries, operatorPublicKey);
    return { xdr: dryResult.xdr, fee: dryResult.fee, count: entries.length };
  }

  const result = await client.batchClaim(entries, opts.operatorKey);
  return { txHash: result.txHash, count: entries.length };
}

// ─── Commander command definition ─────────────────────────────────────────────

export const batchClaimCommand = new Command("batch-claim")
  .description(
    "Claim tokens for multiple addresses in one transaction (operator-pays)"
  )
  .requiredOption("-t, --tree <file>", "Merkle tree JSON (output of generate)")
  .requiredOption(
    "--addresses <file>",
    "Text file with one Stellar address per line"
  )
  .requiredOption(
    "--operator-key <key>",
    "Operator Stellar secret key (pays fees, or set STELLAR_SECRET_KEY)"
  )
  .option("--dry-run", "Print assembled XDR and estimated fee without submitting")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network: string = globalOpts.network ?? "testnet";
    const contractId: string | undefined =
      globalOpts.contractId ?? process.env.AIRDROP_CONTRACT_ID;
    const operatorKey: string | undefined =
      opts.operatorKey ?? process.env.STELLAR_SECRET_KEY;

    if (!contractId) {
      console.error(chalk.red("Error: --contract-id or AIRDROP_CONTRACT_ID required"));
      process.exit(1);
    }
    if (!operatorKey) {
      console.error(chalk.red("Error: --operator-key or STELLAR_SECRET_KEY required"));
      process.exit(1);
    }

    const spinner = ora("Loading Merkle tree and addresses...").start();
    try {
      spinner.text = opts.dryRun
        ? "Building batch transaction (dry-run)..."
        : "Submitting batch claim transaction...";

      const result = await runBatchClaim({
        tree: opts.tree,
        addresses: opts.addresses,
        operatorKey,
        network,
        contractId,
        dryRun: opts.dryRun,
      });

      if ("xdr" in result) {
        // Dry-run output.
        spinner.succeed(chalk.green("Dry-run complete — transaction not submitted"));
        console.log(`\n  ${chalk.bold("Addresses:")} ${result.count}`);
        console.log(`  ${chalk.bold("Est. fee:")} ${chalk.cyan(result.fee)} stroops`);
        console.log(`\n  ${chalk.bold("Encoded XDR:")}`);
        console.log(chalk.gray(`  ${result.xdr}\n`));
      } else {
        spinner.succeed(chalk.green(`Batch claim submitted for ${result.count} addresses!`));
        console.log(`\n  ${chalk.bold("Tx hash:")}   ${chalk.cyan(result.txHash)}`);
        console.log(`  ${chalk.bold("Addresses:")} ${result.count}\n`);
      }
    } catch (err) {
      const message = translateContractError((err as Error).message);
      spinner.fail(`Error: ${message}`);
      process.exit(1);
    }
  });
