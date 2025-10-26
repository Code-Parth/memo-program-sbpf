import type {
  Keypair,
  PublicKey,
  Commitment,
  Connection,
  Transaction,
} from "@solana/web3.js";

// ============================================================================
// KEYPAIR AND CONFIGURATION TYPES
// ============================================================================

/**
 * Type representing the structure of a Solana keypair JSON file
 * Contains an array of 64 numbers (0-255) representing the secret key
 */
export type KeypairJSON = number[];

/**
 * Validator information returned from connection.getVersion()
 */
export interface ValidatorInfo {
  "solana-core": string;
  "feature-set"?: number;
  [key: string]: string | number | undefined;
}

/**
 * Configuration for the test environment
 */
export interface TestConfig {
  /** Connection to Solana validator */
  connection: Connection;
  /** Program public key */
  programId: PublicKey;
  /** Main signer keypair */
  signer: Keypair;
  /** Connection commitment level */
  commitment: Commitment;
  /** RPC endpoint URL */
  endpoint: string;
}

// ============================================================================
// PROGRAM ERROR CODES
// ============================================================================

/**
 * Error codes returned by the memo program assembly implementation
 */
export enum ProgramErrorCode {
  /** Transaction succeeded */
  Success = 0,
  /** Memo text is empty */
  EmptyMemo = 1,
}

/**
 * Human-readable error messages for program error codes
 */
export const ErrorMessages: Record<ProgramErrorCode, string> = {
  [ProgramErrorCode.Success]: "Transaction succeeded",
  [ProgramErrorCode.EmptyMemo]: "Empty memo - memo text cannot be empty",
};

/**
 * Transaction error information
 */
export interface TransactionError {
  /** Error message */
  message: string;
  /** Extracted error code if available */
  code?: ProgramErrorCode;
  /** Transaction logs */
  logs?: string[];
}

// ============================================================================
// MEMO INSTRUCTION TYPES
// ============================================================================

/**
 * Parameters for creating a memo instruction
 */
export interface MemoInstructionParams {
  /** The memo text to log */
  memoText: string;
  /** Accounts that will sign the transaction */
  signers: PublicKey[];
  /** Additional accounts (non-signers) */
  accounts?: PublicKey[];
  /** Program ID to invoke */
  programId: PublicKey;
}

/**
 * Account metadata for transaction instructions
 */
export interface AccountMeta {
  /** Public key of the account */
  pubkey: PublicKey;
  /** Whether this account is a signer */
  isSigner: boolean;
  /** Whether this account is writable */
  isWritable: boolean;
}

// ============================================================================
// TRANSACTION HELPER TYPES
// ============================================================================

/**
 * Options for confirming a transaction
 */
export interface ConfirmOptions {
  /** Transaction signature to confirm */
  signature: string;
  /** Optional timeout in milliseconds */
  timeout?: number;
}

/**
 * Options for sending a transaction
 */
export interface SendTransactionOptions {
  /** Transaction to send */
  transaction: Transaction;
  /** Signers for the transaction */
  signers: Keypair[];
  /** Whether to skip preflight checks */
  skipPreflight?: boolean;
}

/**
 * Result of a confirmed transaction
 */
export interface ConfirmedTransaction {
  /** Transaction signature */
  signature: string;
  /** Log messages from the transaction */
  logs: string[];
  /** Whether the transaction succeeded */
  success: boolean;
}

/**
 * Airdrop request parameters
 */
export interface AirdropParams {
  /** Public key to receive SOL */
  publicKey: PublicKey;
  /** Amount of SOL to airdrop */
  amountSol: number;
}

// ============================================================================
// TEST HELPER TYPES
// ============================================================================

/**
 * Transaction helper functions interface
 */
export interface TransactionHelpers {
  /** Confirm a transaction on-chain */
  confirm: (signature: string) => Promise<string>;

  /** Sign and send a transaction */
  signAndSend: (tx: Transaction, signers?: Keypair[]) => Promise<string>;

  /** Get transaction logs */
  getTransactionLogs: (signature: string) => Promise<string[]>;

  /** Request SOL airdrop */
  airdropSol: (publicKey: PublicKey, amountSol?: number) => Promise<void>;
}

/**
 * Test case metadata
 */
export interface TestCase {
  /** Test name/description */
  name: string;
  /** Expected outcome */
  shouldSucceed: boolean;
  /** Expected error code if failure */
  expectedError?: ProgramErrorCode;
  /** Timeout in milliseconds */
  timeout?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a value is a valid KeypairJSON
 */
export function isKeypairJSON(value: unknown): value is KeypairJSON {
  return (
    Array.isArray(value) &&
    value.length === 64 &&
    value.every((n) => typeof n === "number" && n >= 0 && n <= 255)
  );
}

/**
 * Type guard to check if error code is valid
 */
export function isProgramErrorCode(code: number): code is ProgramErrorCode {
  return Object.values(ProgramErrorCode).includes(code);
}

/**
 * Type guard to check if validator info is valid
 */
export function isValidatorInfo(value: unknown): value is ValidatorInfo {
  return (
    typeof value === "object" &&
    value !== null &&
    "solana-core" in value &&
    typeof (value as ValidatorInfo)["solana-core"] === "string"
  );
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract log messages that match a pattern
 */
export type LogFilter = (logs: string[]) => string[];

/**
 * Async function that returns void
 */
export type AsyncVoidFunction = () => Promise<void>;

/**
 * Transaction signature (base58 string)
 */
export type TransactionSignature = string;

/**
 * SOL amount in lamports or SOL
 */
export type SolAmount = {
  lamports: bigint;
  sol: number;
};
