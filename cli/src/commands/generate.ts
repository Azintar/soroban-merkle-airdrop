/**
 * `merkle-airdrop generate`
 *
 * Read a CSV of (address, amount) pairs and produce a Merkle tree JSON
 * containing the root and all per-address proofs.
 */

import { Command } from "commander";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import chalk from "chalk";
import ora from "ora";
import { buildMerkleTree } from "@soroban-merkle-airdrop/sdk";
import type { AirdropEntry } from "@soroban-merkle-airdrop/sdk";

export interface GenerateOptions {
  contractId: string;
  input: string;
  output: string;
}

/**
 * Core generate logic, exported for unit testing.
 * Reads a CSV, builds the Merkle tree, and writes the output JSON.
 */
export async function runGenerateAction(opts: GenerateOptions): Promise<void> {
  const spinner = ora("Reading airdrop list...").start();

  try {
    const csv = await readFile(resolve(opts.input), "utf-8");
    const entries: AirdropEntry[] = [];

    for (const line of csv.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [address, amountStr] = trimmed.split(",").map((s) => s.trim());
      if (!address || !amountStr) continue;
      entries.push({ address, amount: BigInt(amountStr) });
    }

    spinner.text = `Building Merkle tree for ${entries.length} entries...`;
    const { root, proofs } = buildMerkleTree(entries);

    const output = {
      contractId: opts.contractId,
      root,
      totalEntries: entries.length,
      totalAmount: entries.reduce((s, e) => s + e.amount, 0n).toString(),
      generatedAt: new Date().toISOString(),
      proofs: Object.fromEntries(
        [...proofs.entries()].map(([addr, p]) => [
          addr,
          { ...p, amount: p.amount.toString() },
        ])
      ),
    };

    await writeFile(resolve(opts.output), JSON.stringify(output, null, 2));
    spinner.succeed(chalk.green(`Merkle tree generated!`));
    console.log(`\n  ${chalk.bold("Root:")}        ${chalk.cyan(root)}`);
    console.log(`  ${chalk.bold("Contract:")}    ${chalk.cyan(opts.contractId)}`);
    console.log(`  ${chalk.bold("Entries:")}     ${entries.length}`);
    console.log(`  ${chalk.bold("Output:")}      ${opts.output}\n`);
  } catch (err) {
    spinner.fail(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

export const generateCommand = new Command("generate")
  .description("Build a Merkle tree from a CSV airdrop list")
  .requiredOption("-i, --input <file>", "CSV file: address,amount (one per line)")
  .requiredOption("-o, --output <file>", "Output JSON file for Merkle tree + proofs")
  .requiredOption("--contract-id <address>", "Airdrop contract address (C...) to embed in the output")
  .action((opts) => runGenerateAction(opts));
