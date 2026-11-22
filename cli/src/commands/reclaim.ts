/**
 * `merkle-airdrop reclaim`
 *
 * Reclaim undistributed tokens from the contract after the airdrop expires.
 * Only the admin key may call this, and only once the expiration timestamp
 * has passed.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createAirdropClient, formatAmount, NETWORKS } from "@soroban-merkle-airdrop/sdk";

export const reclaimCommand = new Command("reclaim")
  .description("Reclaim unspent tokens after airdrop expiry")
  .option("-k, --secret-key <key>", "Admin secret key (prefer STELLAR_SECRET_KEY env var)")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network = globalOpts["network"] ?? "testnet";
    const contractId = globalOpts["contractId"] ?? process.env.AIRDROP_CONTRACT_ID;

    if (opts.secretKey) {
      console.warn(
        chalk.yellow(
          "Warning: passing secret keys as command-line arguments is insecure. " +
            "Use STELLAR_SECRET_KEY env var instead."
        )
      );
    }

    const secretKey = opts.secretKey ?? process.env.STELLAR_SECRET_KEY;

    if (!contractId) {
      console.error(chalk.red("Error: --contract-id or AIRDROP_CONTRACT_ID required"));
      process.exit(1);
    }
    if (!secretKey) {
      console.error(chalk.red("Error: --secret-key or STELLAR_SECRET_KEY required"));
      process.exit(1);
    }

    const spinner = ora("Reclaiming tokens...").start();

    try {
      const preset = NETWORKS[network];
      const client = createAirdropClient({ ...preset, contractId });

      const result = await client.reclaim(secretKey);

      spinner.succeed(chalk.green("Tokens reclaimed successfully."));
      console.log(`\n  ${chalk.bold("Tx hash:")} ${chalk.cyan(result.txHash)}`);
      console.log(
        `  ${chalk.bold("Amount:")}  ${formatAmount(result.amount)} (${result.amount.toString()} stroops)\n`
      );
    } catch (err) {
      spinner.fail(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
