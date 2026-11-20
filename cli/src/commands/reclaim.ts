/**
 * `merkle-airdrop reclaim`
 *
 * Reclaim unclaimed airdrop tokens back to the admin (contract owner).
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  createAirdropClient,
  AirdropContractError,
  NETWORKS,
} from "@soroban-merkle-airdrop/sdk";

export interface ReclaimResult {
  txHash: string;
  amount: bigint;
}

/**
 * Reclaim action logic. Extracted so it can be unit tested without
 * instantiating a full commander command.
 */
export async function runReclaimAction(opts: Record<string, unknown>, cmd: Record<string, unknown>): Promise<void> {
  const globalOpts = (cmd as { parent?: { opts?: () => Record<string, unknown> } }).parent?.opts?.() ?? {};
  const network = (globalOpts.network ?? "testnet") as string;
  const contractId =
    (globalOpts.contractId ?? process.env.AIRDROP_CONTRACT_ID) as string | undefined;
  const secretKey =
    (opts.secretKey ?? process.env.STELLAR_SECRET_KEY) as string | undefined;

  if (!contractId) {
    console.error(chalk.red("Error: --contract-id or AIRDROP_CONTRACT_ID required"));
    process.exit(1);
    return;
  }
  if (!secretKey) {
    console.error(chalk.red("Error: --secret-key or STELLAR_SECRET_KEY required"));
    process.exit(1);
    return;
  }

  const spinner = ora("Reclaiming tokens...").start();
  try {
    const preset = NETWORKS[network];
    const client = createAirdropClient({ ...preset, contractId });
    const result = await client.reclaim(secretKey);

    spinner.succeed("Reclaim submitted!");
    console.log(`\n  ${chalk.bold("Tx hash:")} ${chalk.cyan(result.txHash)}`);
    console.log(`  ${chalk.bold("Amount:")}  ${result.amount.toString()}\n`);
  } catch (err) {
    if (err instanceof AirdropContractError && err.code === 7) {
      spinner.fail(
        "Error: The airdrop has not yet expired — reclaim is not available yet."
      );
    } else {
      spinner.fail(`Error: ${(err as Error).message}`);
    }
    process.exit(1);
    return;
  }
}

export const reclaimCommand = new Command("reclaim")
  .description("Reclaim unclaimed airdrop tokens back to the admin")
  .option(
    "-k, --secret-key <key>",
    "Admin secret key (or set STELLAR_SECRET_KEY)"
  )
  .action(async (opts, cmd) => {
    await runReclaimAction(opts as Record<string, unknown>, cmd as Record<string, unknown>);
  });