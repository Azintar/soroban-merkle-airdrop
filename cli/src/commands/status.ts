/**
 * `merkle-airdrop status`
 *
 * Query the on-chain airdrop contract status and optionally check
 * whether specific addresses have claimed.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createAirdropClient, NETWORKS } from "@soroban-merkle-airdrop/sdk";

export interface StatusActionOptions {
  address?: string;
  json?: boolean;
  network: string;
  contractId: string;
}

/**
 * Core status logic, exported for unit testing.
 */
export async function runStatusAction(opts: StatusActionOptions): Promise<void> {
  const { address, network, contractId } = opts;

  const spinner = ora(`Querying contract on ${chalk.cyan(network)}...`).start();
  try {
    const preset = NETWORKS[network];
    const client = createAirdropClient({ ...preset, contractId });

    const [active, root, total, exp] = await Promise.all([
      client.isActive(),
      client.merkleRoot(),
      client.totalDeposited(),
      client.expiration(),
    ]);

    // Fetch claimedCount separately — non-fatal if the contract doesn't expose it yet.
    let claimedCountValue: number | null = null;
    try {
      claimedCountValue = await client.claimedCount();
    } catch {
      claimedCountValue = null;
    }

    // ── JSON output ──────────────────────────────────────────────────────
    if (opts.json) {
      spinner.stop();
      const jsonOutput: Record<string, unknown> = {
        contractId,
        network,
        active,
        root: root ?? null,
        deposited: total.toString(),
        claimedCount: claimedCountValue,
        expiration: exp !== null ? exp.toString() : null,
      };
      if (address) {
        jsonOutput.addressClaimed = await client.isClaimed(address);
      }
      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    // ── Human-readable output ────────────────────────────────────────────
    let expirationLine: string;
    if (exp === null) {
      expirationLine = chalk.gray("not set");
    } else {
      const expMs = Number(exp) * 1000;
      const expDate = new Date(expMs).toUTCString();
      const nowMs = Date.now();
      if (nowMs > expMs) {
        expirationLine = `${expDate}  ${chalk.red("(EXPIRED)")}`;
      } else {
        expirationLine = expDate;
      }
    }

    spinner.succeed("Contract status:");
    console.log(`\n  ${chalk.bold("Contract:")}    ${chalk.cyan(contractId)}`);
    console.log(`  ${chalk.bold("Network:")}     ${network}`);
    console.log(`  ${chalk.bold("Active:")}      ${active ? chalk.green("yes") : chalk.red("no")}`);
    console.log(`  ${chalk.bold("Root:")}        ${chalk.cyan(root ?? "not initialized")}`);
    console.log(`  ${chalk.bold("Deposited:")}   ${total.toString()}`);
    console.log(
      `  ${chalk.bold("Claimed addresses:")} ${
        claimedCountValue !== null ? claimedCountValue : chalk.gray("N/A")
      }`
    );
    console.log(`  ${chalk.bold("Expiration:")}  ${expirationLine}`);

    if (address) {
      const claimed = await client.isClaimed(address);
      console.log(
        `\n  ${chalk.bold(address)}: ${
          claimed ? chalk.yellow("already claimed") : chalk.green("not yet claimed")
        }`
      );
    }
    console.log();
  } catch (err) {
    spinner.fail(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

export const statusCommand = new Command("status")
  .description("Query on-chain airdrop contract status")
  .option("-a, --address <address>", "Check if a specific address has claimed")
  .option("--json", "Output status as JSON")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network: string = globalOpts.network ?? "testnet";
    const contractId: string | undefined =
      globalOpts.contractId ?? process.env.AIRDROP_CONTRACT_ID;

    if (!contractId) {
      console.error(chalk.red("Error: --contract-id or AIRDROP_CONTRACT_ID required"));
      process.exit(1);
    }

    await runStatusAction({
      address: opts.address,
      json: opts.json,
      network,
      contractId,
    });
  });
