/**
 * `merkle-airdrop update-root`
 *
 * Rotate the on-chain Merkle root to a new distribution tree. Only the
 * contract admin may call this — the admin keypair signs the transaction.
 *
 * Usage:
 *   merkle-airdrop update-root \
 *     --tree merkle-tree.json \
 *     --admin-key S... \
 *     [--network testnet] [--contract-id C...]
 */

import { Command } from "commander";
import { readFile } from "fs/promises";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import { createAirdropClient, NETWORKS } from "@soroban-merkle-airdrop/sdk";
import { translateContractError } from "../errors.js";

// ─── Exported options interface (for tests) ───────────────────────────────────

export interface UpdateRootOptions {
  tree: string;
  adminKey: string;
  network: string;
  contractId: string;
}

export interface UpdateRootResult {
  txHash: string;
  root: string;
  totalAmount: bigint;
}

// ─── Core logic (exported so tests can call it directly) ─────────────────────

export async function runUpdateRoot(opts: UpdateRootOptions): Promise<UpdateRootResult> {
  const raw = JSON.parse(await readFile(resolve(opts.tree), "utf-8"));

  const root: string = raw.root;
  const totalAmount: bigint = BigInt(raw.totalAmount ?? raw.total_amount ?? 0);

  if (!root) {
    throw new Error("Tree JSON is missing a 'root' field");
  }
  if (totalAmount === 0n) {
    throw new Error(
      "Tree JSON is missing 'totalAmount'. Re-run `merkle-airdrop generate` to rebuild."
    );
  }

  const preset = NETWORKS[opts.network];
  if (!preset) {
    throw new Error(`Unknown network: ${opts.network}. Use testnet or mainnet.`);
  }

  const client = createAirdropClient({ ...preset, contractId: opts.contractId });
  const result = await client.updateMerkleRoot(root, totalAmount, opts.adminKey);

  return { txHash: result.txHash, root, totalAmount };
}

// ─── Commander command definition ─────────────────────────────────────────────

export const updateRootCommand = new Command("update-root")
  .description("Rotate the on-chain Merkle root to a new distribution tree (admin only)")
  .requiredOption("-t, --tree <file>", "New Merkle tree JSON (output of generate)")
  .requiredOption(
    "-k, --admin-key <key>",
    "Admin Stellar secret key (or set STELLAR_SECRET_KEY)"
  )
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network: string = globalOpts.network ?? "testnet";
    const contractId: string | undefined =
      globalOpts.contractId ?? process.env.AIRDROP_CONTRACT_ID;
    const adminKey: string | undefined =
      opts.adminKey ?? process.env.STELLAR_SECRET_KEY;

    if (!contractId) {
      console.error(chalk.red("Error: --contract-id or AIRDROP_CONTRACT_ID required"));
      process.exit(1);
    }
    if (!adminKey) {
      console.error(chalk.red("Error: --admin-key or STELLAR_SECRET_KEY required"));
      process.exit(1);
    }

    const spinner = ora("Loading Merkle tree...").start();
    try {
      spinner.text = "Submitting update-root transaction...";
      const result = await runUpdateRoot({ tree: opts.tree, adminKey, network, contractId });

      spinner.succeed(chalk.green("Merkle root updated!"));
      console.log(`\n  ${chalk.bold("Tx hash:")}      ${chalk.cyan(result.txHash)}`);
      console.log(`  ${chalk.bold("New root:")}     ${chalk.cyan(result.root)}`);
      console.log(`  ${chalk.bold("Total amount:")} ${result.totalAmount.toString()}\n`);
    } catch (err) {
      const message = translateContractError((err as Error).message);
      spinner.fail(`Error: ${message}`);
      process.exit(1);
    }
  });
