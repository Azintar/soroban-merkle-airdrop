/**
 * `merkle-airdrop pause` / `merkle-airdrop unpause`
 *
 * Activate or deactivate the airdrop contract. Only the admin key can call
 * this — the contract will reject any other signer.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createAirdropClient, NETWORKS } from "@soroban-merkle-airdrop/sdk";

export const pauseCommand = new Command("pause")
  .description("Pause the airdrop (set_active false)")
  .option("-k, --admin-key <key>", "Admin secret key (prefer STELLAR_SECRET_KEY env var)")
  .action(async (opts, cmd) => {
    await setActiveCommand(false, opts, cmd);
  });

export const unpauseCommand = new Command("unpause")
  .description("Unpause the airdrop (set_active true)")
  .option("-k, --admin-key <key>", "Admin secret key (prefer STELLAR_SECRET_KEY env var)")
  .action(async (opts, cmd) => {
    await setActiveCommand(true, opts, cmd);
  });

async function setActiveCommand(
  active: boolean,
  opts: { adminKey?: string },
  cmd: { parent?: { opts: () => Record<string, string> } }
): Promise<void> {
  const globalOpts = cmd.parent?.opts() ?? {};
  const network = globalOpts["network"] ?? "testnet";
  const contractId = globalOpts["contractId"] ?? process.env.AIRDROP_CONTRACT_ID;

  if (opts.adminKey) {
    console.warn(
      chalk.yellow(
        "Warning: passing secret keys as command-line arguments is insecure. " +
          "Use STELLAR_SECRET_KEY env var instead."
      )
    );
  }

  const secretKey = opts.adminKey ?? process.env.STELLAR_SECRET_KEY;

  if (!contractId) {
    console.error(chalk.red("Error: --contract-id or AIRDROP_CONTRACT_ID required"));
    process.exit(1);
  }
  if (!secretKey) {
    console.error(chalk.red("Error: --admin-key or STELLAR_SECRET_KEY required"));
    process.exit(1);
  }

  const label = active ? "Unpausing" : "Pausing";
  const spinner = ora(`${label} the airdrop...`).start();

  try {
    const preset = NETWORKS[network];
    const client = createAirdropClient({ ...preset, contractId });

    const result = await client.setActive(active, secretKey);

    spinner.succeed(
      chalk.green(`Airdrop ${active ? "unpaused (active)" : "paused (inactive)"}.`)
    );
    console.log(`\n  ${chalk.bold("Tx hash:")} ${chalk.cyan(result.txHash)}\n`);
  } catch (err) {
    spinner.fail(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
