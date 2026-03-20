"use client";

import {
  Contract,
  Networks,
  TransactionBuilder,
  Keypair,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  rpc,
} from "@stellar/stellar-sdk";
import {
  isConnected,
  getAddress,
  signTransaction,
  setAllowed,
  isAllowed,
  requestAccess,
} from "@stellar/freighter-api";

// ============================================================
// CONSTANTS — Update these for your contract
// ============================================================

/** Your deployed Soroban contract ID */
export const CONTRACT_ADDRESS =
  "CBNUTDPVS6NCLWGJWAC7DDIUJ2ETWJFSS27FOEYHXLM7AD2TOVIAHANE";

/** Network passphrase (testnet by default) */
export const NETWORK_PASSPHRASE = Networks.TESTNET;

/** Soroban RPC URL */
export const RPC_URL = "https://soroban-testnet.stellar.org";

/** Horizon URL */
export const HORIZON_URL = "https://horizon-testnet.stellar.org";

/** Network name for Freighter */
export const NETWORK = "TESTNET";

// ============================================================
// RPC Server Instance
// ============================================================

const server = new rpc.Server(RPC_URL);

// ============================================================
// Wallet Helpers
// ============================================================

export async function checkConnection(): Promise<boolean> {
  const result = await isConnected();
  return result.isConnected;
}

export async function connectWallet(): Promise<string> {
  const connResult = await isConnected();
  if (!connResult.isConnected) {
    throw new Error("Freighter extension is not installed or not available.");
  }

  const allowedResult = await isAllowed();
  if (!allowedResult.isAllowed) {
    await setAllowed();
    await requestAccess();
  }

  const { address } = await getAddress();
  if (!address) {
    throw new Error("Could not retrieve wallet address from Freighter.");
  }
  return address;
}

export async function getWalletAddress(): Promise<string | null> {
  try {
    const connResult = await isConnected();
    if (!connResult.isConnected) return null;

    const allowedResult = await isAllowed();
    if (!allowedResult.isAllowed) return null;

    const { address } = await getAddress();
    return address || null;
  } catch {
    return null;
  }
}

// ============================================================
// Contract Interaction Helpers
// ============================================================

/**
 * Build, simulate, and optionally sign + submit a Soroban contract call.
 *
 * @param method   - The contract method name to invoke
 * @param params   - Array of xdr.ScVal parameters for the method
 * @param caller   - The public key (G...) of the calling account
 * @param sign     - If true, signs via Freighter and submits. If false, only simulates.
 * @returns        The result of the simulation or submission
 */
export async function callContract(
  method: string,
  params: xdr.ScVal[] = [],
  caller: string,
  sign: boolean = true
) {
  const contract = new Contract(CONTRACT_ADDRESS);
  const account = await server.getAccount(caller);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(
      `Simulation failed: ${(simulated as rpc.Api.SimulateTransactionErrorResponse).error}`
    );
  }

  if (!sign) {
    // Read-only call — just return the simulation result
    return simulated;
  }

  // Prepare the transaction with the simulation result
  const prepared = rpc.assembleTransaction(tx, simulated).build();

  // Sign with Freighter
  const { signedTxXdr } = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const txToSubmit = TransactionBuilder.fromXDR(
    signedTxXdr,
    NETWORK_PASSPHRASE
  );

  const result = await server.sendTransaction(txToSubmit);

  if (result.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${result.status}`);
  }

  // Poll for confirmation
  let getResult = await server.getTransaction(result.hash);
  while (getResult.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getResult = await server.getTransaction(result.hash);
  }

  if (getResult.status === "FAILED") {
    throw new Error("Transaction failed on chain.");
  }

  return getResult;
}

/**
 * Read-only contract call (does not require signing).
 */
export async function readContract(
  method: string,
  params: xdr.ScVal[] = [],
  caller?: string
) {
  const account =
    caller || Keypair.random().publicKey(); // Use a random keypair for read-only
  const sim = await callContract(method, params, account, false);
  if (
    rpc.Api.isSimulationSuccess(sim as rpc.Api.SimulateTransactionResponse) &&
    (sim as rpc.Api.SimulateTransactionSuccessResponse).result
  ) {
    return scValToNative(
      (sim as rpc.Api.SimulateTransactionSuccessResponse).result!.retval
    );
  }
  return null;
}

// ============================================================
// ScVal Conversion Helpers
// ============================================================

export function toScValString(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "string" });
}

export function toScValU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

export function toScValI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function toScValAddress(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function toScValBool(value: boolean): xdr.ScVal {
  return nativeToScVal(value, { type: "bool" });
}

// ============================================================
// Decentralized Job Board — Contract Methods
// ============================================================

export function toScValU64(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

/**
 * Post a new job listing. Any wallet can post.
 * Calls: post_job(poster: Address, title: String, description: String, reward: i128) -> u32
 */
export async function postJob(
  caller: string,
  title: string,
  description: string,
  reward: bigint
) {
  return callContract(
    "post_job",
    [
      toScValAddress(caller),
      toScValString(title),
      toScValString(description),
      toScValI128(reward),
    ],
    caller,
    true
  );
}

/**
 * Apply to a job.
 * Calls: apply(applicant: Address, job_id: u32, proposal: String, proposed_price: i128)
 */
export async function applyToJob(
  caller: string,
  jobId: number,
  proposal: string,
  proposedPrice: bigint
) {
  return callContract(
    "apply",
    [
      toScValAddress(caller),
      toScValU32(jobId),
      toScValString(proposal),
      toScValI128(proposedPrice),
    ],
    caller,
    true
  );
}

/**
 * Get all jobs posted to the board (read-only).
 * Calls: get_all_jobs() -> Vec<Job>
 */
export async function getAllJobs(caller?: string) {
  return readContract("get_all_jobs", [], caller);
}

/**
 * Get a single job by ID (read-only).
 * Calls: get_job(job_id: u32) -> Job
 */
export async function getJob(jobId: number, caller?: string) {
  return readContract("get_job", [toScValU32(jobId)], caller);
}

/**
 * Get applications for a job (read-only).
 * Calls: get_applications(job_id: u32) -> Vec<Application>
 */
export async function getApplications(jobId: number, caller?: string) {
  return readContract("get_applications", [toScValU32(jobId)], caller);
}

/**
 * Withdraw your own application.
 * Calls: withdraw_application(applicant: Address, job_id: u32)
 */
export async function withdrawApplication(caller: string, jobId: number) {
  return callContract(
    "withdraw_application",
    [toScValAddress(caller), toScValU32(jobId)],
    caller,
    true
  );
}

/**
 * Close a job listing. Only the poster can close.
 * Calls: close_job(poster: Address, job_id: u32)
 */
export async function closeJob(caller: string, jobId: number) {
  return callContract(
    "close_job",
    [toScValAddress(caller), toScValU32(jobId)],
    caller,
    true
  );
}

/**
 * Set the winning applicant. Only the poster can select a winner.
 * Calls: set_winner(poster: Address, job_id: u32, winner: Address)
 */
export async function setWinner(
  caller: string,
  jobId: number,
  winnerAddress: string
) {
  return callContract(
    "set_winner",
    [toScValAddress(caller), toScValU32(jobId), toScValAddress(winnerAddress)],
    caller,
    true
  );
}

/**
 * Claim reward. Only the selected winner can claim.
 * Calls: claim_reward(winner: Address, job_id: u32)
 */
export async function claimReward(caller: string, jobId: number) {
  return callContract(
    "claim_reward",
    [toScValAddress(caller), toScValU32(jobId)],
    caller,
    true
  );
}

export { nativeToScVal, scValToNative, Address, xdr };
