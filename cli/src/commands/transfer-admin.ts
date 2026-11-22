/**
 * `merkle-airdrop transfer-admin`
 *
 * Transfer admin ownership of the airdrop contract to a new address.
 *
 * Usage:
 *   merkle-airdrop transfer-admin \
 *     --new-admin <address> \
 *     [--admin-key S...] [--network testnet]
 *
 * The current admin must sign the transaction. Supply their secret key via
 * --admin-key or the STELLAR_SECRET_KEY environment variable.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  rpc as StellarRpc,
  Address,
  Contract,
} from "@stellar/stellar-sdk";

// ─── RPC preset URLs ─────────────────────────────────────────────────────────

const RPC_URLS: Record<string, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://mainnet.sorobanrpc.com",
};

const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TransferAdminOptions {
  contractId: string;
  newAdmin: string;
  adminKey: string;
  network: string;
  rpcUrl?: string;
}

export interface TransferAdminResult {
  txHash: string;
  newAdmin: string;
}

// ─── Core logic (exported for unit tests) ────────────────────────────────────

/**
 * Call the contract's `transfer_admin` function directly via the Stellar SDK.
 *
 * Steps:
 *  1. Load the current admin's account from the RPC.
 *  2. Build a transaction calling `contract.call("transfer_admin", newAdmin)`.
 *  3. Simulate, assemble, sign, and submit the transaction.
 *  4. Poll until the transaction is confirmed (SUCCESS) or times out.
 *
 * @throws if simulation, submission, or confirmation fails.
 */
export async function transferAdminCore(
  opts: TransferAdminOptions
): Promise<TransferAdminResult> {
  const { contractId, newAdmin, adminKey, network } = opts;
  const rpcUrl = opts.rpcUrl ?? RPC_URLS[network];
  const networkPassphrase = NETWORK_PASSPHRASES[network];

  if (!rpcUrl) throw new Error(`Unknown network: ${network}. Use testnet or mainnet.`);
  if (!networkPassphrase) throw new Error(`No passphrase for network: ${network}`);

  const keypair = Keypair.fromSecret(adminKey);
  const server = new StellarRpc.Server(rpcUrl, { allowHttp: false });
  const contractInst = new Contract(contractId);

  // ── Load admin account ──────────────────────────────────────────────────
  const sourceAccount = await server.getAccount(keypair.publicKey());

  // ── Build transaction ───────────────────────────────────────────────────
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contractInst.call(
        "transfer_admin",
        new Address(newAdmin).toScVal()
      )
    )
    .setTimeout(60)
    .build();

  // ── Simulate ────────────────────────────────────────────────────────────
  const simResult = await server.simulateTransaction(tx);
  if (StellarRpc.Api.isSimulationError(simResult)) {
    throw new Error(`transfer_admin simulation failed: ${simResult.error}`);
  }

  // ── Assemble, sign, submit ───────────────────────────────────────────────
  const preparedTx = StellarRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(keypair);

  const sendResult = await server.sendTransaction(preparedTx);
  if (sendResult.status === "ERROR") {
    throw new Error(
      `transfer_admin transaction failed: ${
        sendResult.errorResult?.toXDR("base64") ?? "unknown"
      }`
    );
  }

  // ── Poll for confirmation ────────────────────────────────────────────────
  const txHash = sendResult.hash;
  await pollTransactionSuccess(server, txHash);

  return { txHash, newAdmin };
}

// ─── Polling helpers ──────────────────────────────────��───────────────────────

const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;

async function pollTransactionSuccess(
  server: StellarRpc.Server,
  txHash: string
): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(POLL_INTERVAL_MS);
    if (Date.now() >= deadline) {
      throw new Error(
        `Transaction confirmation timeout after ${POLL_TIMEOUT_MS}ms: ${txHash}`
      );
    }
    const poll = await server.getTransaction(txHash);
    if (poll.status === "SUCCESS") return;
    if (poll.status === "FAILED") {
      throw new Error(`Transaction failed on-chain: ${txHash}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Commander command definition ─────────────────────────────────────────────

export const transferAdminCommand = new Command("transfer-admin")
  .description("Transfer admin ownership of the airdrop contract to a new address")
  .requiredOption("--new-admin <address>", "New admin address (G... or C...)")
  .option("-k, --admin-key <key>", "Current admin secret key (or set STELLAR_SECRET_KEY)")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network: string = globalOpts.network ?? "testnet";
    const rpcUrl: string | undefined = globalOpts.rpcUrl;
    const contractId: string | undefined =
      globalOpts.contractId ?? process.env.AIRDROP_CONTRACT_ID;
    const adminKey: string | undefined =
      opts.adminKey ?? process.env.STELLAR_SECRET_KEY;

    if (!contractId) {
      console.error(
        chalk.red("Error: --contract-id or AIRDROP_CONTRACT_ID required")
      );
      process.exit(1);
    }

    if (!adminKey) {
      console.error(
        chalk.red("Error: --admin-key or STELLAR_SECRET_KEY required")
      );
      process.exit(1);
    }

    const spinner = ora("Transferring admin ownership…").start();

    try {
      const result = await transferAdminCore({
        contractId,
        newAdmin: opts.newAdmin,
        adminKey,
        network,
        rpcUrl,
      });

      spinner.succeed(chalk.green("Admin transfer complete!"));
      console.log(`\n  ${chalk.bold("Tx hash:")}  ${chalk.cyan(result.txHash)}`);
      console.log(`  ${chalk.bold("New admin:")} ${chalk.cyan(result.newAdmin)}\n`);
    } catch (err) {
      spinner.fail(chalk.red(`Transfer failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });
