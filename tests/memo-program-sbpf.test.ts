import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import type {
  KeypairJSON,
  ValidatorInfo,
  TransactionError,
  TransactionSignature,
} from "./types";
import {
  ErrorMessages,
  isKeypairJSON,
  isValidatorInfo,
  ProgramErrorCode,
  isProgramErrorCode,
} from "./types";
import { expect } from "chai";
import { describe, it, before } from "mocha";
import type { Commitment } from "@solana/web3.js";

// ============================================================================
// PROGRAM AND SIGNER SETUP
// ============================================================================

// Load program keypair from deployment
// The program ID is the public key of this keypair
import programSeed from "../deploy/memo-program-sbpf-keypair.json";

// Validate and type the program seed
if (!isKeypairJSON(programSeed)) {
  throw new Error("Invalid program keypair JSON format");
}
const programKeypair: Keypair = Keypair.fromSecretKey(
  new Uint8Array(programSeed as KeypairJSON)
);
const program: PublicKey = programKeypair.publicKey;

// Load signer from environment variable (set by test script in package.json)
// The test script runs: SIGNER=$(cat $KEYPAIR) mocha ...
const signerSeedRaw: string = process.env.SIGNER!;
const signerSeed: KeypairJSON = JSON.parse(signerSeedRaw) as KeypairJSON;

if (!isKeypairJSON(signerSeed)) {
  throw new Error("Invalid signer keypair JSON format");
}
const signer: Keypair = Keypair.fromSecretKey(new Uint8Array(signerSeed));

// Create connection to local validator
const ENDPOINT: string = "http://127.0.0.1:8899";
const COMMITMENT: Commitment = "confirmed";

const connection: Connection = new Connection(ENDPOINT, {
  commitment: COMMITMENT,
});

/**
 * Confirm a transaction on-chain
 * @param signature - Transaction signature to confirm
 * @returns The confirmed signature
 */
const confirm = async (
  signature: TransactionSignature
): Promise<TransactionSignature> => {
  const block = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    signature,
    ...block,
  });
  return signature;
};

/**
 * Sign and send a transaction
 * @param tx - Transaction to send
 * @param signers - Array of signers (defaults to [signer])
 * @returns Transaction signature
 */
const signAndSend = async (
  tx: Transaction,
  signers: Keypair[] = [signer]
): Promise<TransactionSignature> => {
  const block = await connection.getLatestBlockhash();
  tx.recentBlockhash = block.blockhash;
  tx.lastValidBlockHeight = block.lastValidBlockHeight;
  const signature: TransactionSignature = await connection.sendTransaction(
    tx,
    signers
  );
  return signature;
};

/**
 * Get transaction logs for debugging
 * @param signature - Transaction signature
 * @returns Array of log messages
 */
const getTransactionLogs = async (
  signature: TransactionSignature
): Promise<string[]> => {
  const transaction = await connection.getTransaction(signature, {
    commitment: COMMITMENT,
    maxSupportedTransactionVersion: 0,
  });
  return transaction?.meta?.logMessages || [];
};

/**
 * Request SOL airdrop to a public key
 * @param publicKey - Account to receive SOL
 * @param amountSol - Amount of SOL to request (default: 1)
 * @returns Promise that resolves when airdrop is confirmed
 */
const airdropSol = async (
  publicKey: PublicKey,
  amountSol: number = 1
): Promise<void> => {
  const lamports: number = amountSol * LAMPORTS_PER_SOL;
  const airdropSignature: TransactionSignature =
    await connection.requestAirdrop(publicKey, lamports);
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    signature: airdropSignature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  console.log(
    `    ✓ Airdropped ${amountSol} SOL to ${publicKey
      .toBase58()
      .slice(0, 8)}...`
  );
};

/**
 * Extract program error code from transaction error message
 * @param error - Error object from failed transaction
 * @returns Typed ProgramErrorCode or null if not found
 */
const extractErrorCode = (error: any): ProgramErrorCode | null => {
  const errorMessage: string = error?.message || "";

  // Match patterns like "custom program error: 0x1" or "0x2"
  const hexMatch = errorMessage.match(
    /(?:custom program error: )?(0x[0-9a-fA-F]+)/
  );

  if (hexMatch) {
    const hexValue: string = hexMatch[1];
    const errorCode: number = parseInt(hexValue, 16);

    // Validate using type guard
    if (isProgramErrorCode(errorCode)) {
      return errorCode as ProgramErrorCode;
    }
  }

  return null;
};

/**
 * Get human-readable error message for a program error code
 * @param code - Program error code
 * @returns Human-readable error message
 */
const getErrorMessage = (code: ProgramErrorCode): string => {
  return ErrorMessages[code];
};

/**
 * Create a typed transaction error object
 * @param error - Raw error from transaction
 * @returns Typed TransactionError object
 */
const createTransactionError = (error: any): TransactionError => {
  const code = extractErrorCode(error);

  return {
    message: error?.message || "Unknown error",
    code: code ?? undefined,
    logs: error?.logs,
  };
};

// ============================================================================
// TEST SUITE
// ============================================================================

describe("Memo Program (sBPF Assembly)", () => {
  // --------------------------------------------------------------------
  // SETUP - Runs once before all tests
  // --------------------------------------------------------------------
  before(async function () {
    this.timeout(30000); // 30 seconds for setup

    console.log("\n🔧 Setting up test environment...\n");

    // Verify validator is running
    try {
      const version: ValidatorInfo =
        (await connection.getVersion()) as ValidatorInfo;

      if (!isValidatorInfo(version)) {
        throw new Error("Invalid validator version response");
      }

      console.log(`✓ Connected to local validator`);
      console.log(`✓ Validator version: ${version["solana-core"]}`);
    } catch (error) {
      throw new Error(
        "Cannot connect to solana-test-validator. Make sure it's running!"
      );
    }

    // Display program and signer info
    console.log(`✓ Program ID: ${program.toBase58()}`);
    console.log(`✓ Signer: ${signer.publicKey.toBase58().slice(0, 8)}...`);

    // Check signer balance
    const balance: number = await connection.getBalance(signer.publicKey);
    console.log(`✓ Signer balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    console.log("✓ Test environment ready!\n");
  });

  // ========================================================================
  // TEST 1: Valid Memo with Signer (SUCCESS CASE)
  // ========================================================================
  it("should successfully log a valid memo with a signer", async function () {
    this.timeout(10000);

    console.log("\n📝 Test 1: Valid memo with signer");

    // --------------------------------------------------------------------
    // STEP 1: Prepare the memo text
    // --------------------------------------------------------------------
    const memoText: string = "Hello from Solana sBPF assembly! 🚀";
    console.log(`  Memo text: "${memoText}"`);

    // Convert string to UTF-8 bytes
    // This becomes the instruction data that our assembly program will read
    const memoData: Buffer = Buffer.from(memoText, "utf-8");

    // --------------------------------------------------------------------
    // STEP 2: Create the memo instruction
    // --------------------------------------------------------------------
    // TransactionInstruction tells Solana:
    //   - Which program to call (programId)
    //   - Which accounts are involved (keys)
    //   - What data to pass (data)
    const memoInstruction = new TransactionInstruction({
      keys: [
        {
          pubkey: signer.publicKey, // The signer's account
          isSigner: true, // ✓ This account will sign the transaction
          isWritable: true, // Allow modifications (not needed but common)
        },
      ],
      programId: program, // Our memo program
      data: memoData, // The memo text as instruction data
    });

    // --------------------------------------------------------------------
    // STEP 3: Build and send the transaction
    // --------------------------------------------------------------------
    const tx: Transaction = new Transaction();
    tx.add(memoInstruction);

    // Send transaction and wait for confirmation
    const signature: TransactionSignature = await signAndSend(tx).then(confirm);

    // --------------------------------------------------------------------
    // STEP 4: Verify the memo was logged
    // --------------------------------------------------------------------
    // Our assembly program calls sol_log_ to write the memo to logs
    const logs: string[] = await getTransactionLogs(signature);
    console.log(`  ✓ Retrieved ${logs.length} log entries`);

    // Check if the memo appears in the logs
    const memoLogged: boolean = logs.some((log: string) =>
      log.includes(memoText)
    );

    expect(memoLogged, "Memo text should appear in transaction logs").to.be
      .true;

    console.log(`  ✓ Memo successfully logged!\n`);
  });

  // ========================================================================
  // TEST 2: Memo Without Signer (FAILURE CASE)
  // ========================================================================
  it("should reject a memo without a signer", async function () {
    this.timeout(10000);

    console.log("\n🚫 Test 2: Memo without signer (should fail)");

    const memoText: string = "This should fail - no signer!";
    const memoData: Buffer = Buffer.from(memoText, "utf-8");

    // Create a read-only account (not a signer)
    const readOnlyAccount: Keypair = Keypair.generate();

    // --------------------------------------------------------------------
    // Create instruction with isSigner=false
    // --------------------------------------------------------------------
    const memoInstruction = new TransactionInstruction({
      keys: [
        {
          pubkey: readOnlyAccount.publicKey,
          isSigner: false, // ✗ NOT a signer - assembly should reject!
          isWritable: false,
        },
      ],
      programId: program,
      data: memoData,
    });

    const tx = new Transaction();
    tx.add(memoInstruction);

    // --------------------------------------------------------------------
    // Attempt to send - this should fail!
    // --------------------------------------------------------------------
    try {
      await signAndSend(tx).then(confirm);

      // If we reach here, the test should fail
      expect.fail("Transaction should have failed without a signer!");
    } catch (error: any) {
      // We expect an error - that's success!
      console.log(`  ✓ Transaction rejected as expected`);
      console.log(`  Error: ${error.message.split("\n")[0]}`);

      // Extract and validate error code
      const errorCode: ProgramErrorCode | null = extractErrorCode(error);

      expect(errorCode).to.not.be.null;
      expect(errorCode).to.equal(
        ProgramErrorCode.NoSigners,
        "Should return NoSigners error code (0x1)"
      );

      // Display human-readable error message
      if (errorCode !== null) {
        const errorMsg: string = getErrorMessage(errorCode);
        console.log(`  ✓ Error code: ${errorCode} - ${errorMsg}`);
      }

      // Verify it's a program error
      expect(error.message).to.match(
        /failed|error/i,
        "Error should indicate transaction failure"
      );
    }

    console.log(`  ✓ Signer validation working!\n`);
  });

  // ========================================================================
  // TEST 3: Empty Memo (FAILURE CASE)
  // ========================================================================
  it("should reject an empty memo", async function () {
    this.timeout(10000);

    console.log("\n🚫 Test 3: Empty memo (should fail)");

    // --------------------------------------------------------------------
    // Create instruction with empty data
    // --------------------------------------------------------------------
    const memoInstruction = new TransactionInstruction({
      keys: [
        {
          pubkey: signer.publicKey,
          isSigner: true, // Valid signer
          isWritable: true,
        },
      ],
      programId: program,
      data: Buffer.from([]), // ✗ Empty data - assembly should reject!
    });

    const tx = new Transaction();
    tx.add(memoInstruction);

    // --------------------------------------------------------------------
    // Attempt to send - should fail with error code 2
    // --------------------------------------------------------------------
    try {
      await signAndSend(tx).then(confirm);

      expect.fail("Transaction should have failed with empty memo!");
    } catch (error: any) {
      console.log(`  ✓ Transaction rejected as expected`);
      console.log(`  Error: ${error.message.split("\n")[0]}`);

      // Extract and validate error code
      const errorCode: ProgramErrorCode | null = extractErrorCode(error);

      expect(errorCode).to.not.be.null;
      expect(errorCode).to.equal(
        ProgramErrorCode.EmptyMemo,
        "Should return EmptyMemo error code (0x2)"
      );

      // Display human-readable error message
      if (errorCode !== null) {
        const errorMsg: string = getErrorMessage(errorCode);
        console.log(`  ✓ Error code: ${errorCode} - ${errorMsg}`);
      }

      // Our assembly program returns error code 2 for empty memos
      expect(error.message).to.match(
        /failed|error/i,
        "Error should indicate transaction failure"
      );
    }

    console.log(`  ✓ Empty memo validation working!\n`);
  });

  // ========================================================================
  // TEST 4: Long Memo (SUCCESS CASE)
  // ========================================================================
  it("should successfully handle a long memo (256+ characters)", async function () {
    this.timeout(10000);

    console.log("\n📝 Test 4: Long memo (256+ characters)");

    // --------------------------------------------------------------------
    // Create a memo longer than 256 characters
    // --------------------------------------------------------------------
    const longMemo =
      "This is a very long memo to test the program's ability to handle large instruction data. " +
      "Solana transactions can contain up to 1232 bytes of instruction data per instruction. " +
      "Our sBPF assembly program should handle any valid length without issues. " +
      "This memo is intentionally verbose to exceed 256 characters and verify proper parsing!";

    console.log(`  Memo length: ${longMemo.length} characters`);
    expect(longMemo.length).to.be.greaterThan(
      256,
      "Memo should be longer than 256 chars"
    );

    const memoData = Buffer.from(longMemo, "utf-8");

    // --------------------------------------------------------------------
    // Send the transaction
    // --------------------------------------------------------------------
    const memoInstruction = new TransactionInstruction({
      keys: [
        {
          pubkey: signer.publicKey,
          isSigner: true,
          isWritable: true,
        },
      ],
      programId: program,
      data: memoData,
    });

    const tx = new Transaction();
    tx.add(memoInstruction);

    const signature = await signAndSend(tx).then(confirm);

    // --------------------------------------------------------------------
    // Verify the long memo was logged
    // --------------------------------------------------------------------
    const logs = await getTransactionLogs(signature);

    // Check if the memo appears in logs (might be truncated in display)
    const memoLogged = logs.some((log) =>
      log.includes(longMemo.substring(0, 50))
    );

    expect(memoLogged, "Long memo should be logged successfully").to.be.true;

    console.log(`  ✓ Long memo handled correctly!\n`);
  });

  // ========================================================================
  // TEST 5: Multiple Memos in One Transaction (SUCCESS CASE)
  // ========================================================================
  it("should handle multiple memo instructions in one transaction", async function () {
    this.timeout(10000);

    console.log("\n📝 Test 5: Multiple memos in one transaction");

    // --------------------------------------------------------------------
    // Create three different memos
    // --------------------------------------------------------------------
    const memos = [
      "First memo in the transaction",
      "Second memo in the transaction",
      "Third memo in the transaction",
    ];

    console.log(
      `  Creating transaction with ${memos.length} memo instructions`
    );

    // --------------------------------------------------------------------
    // Build a transaction with multiple memo instructions
    // --------------------------------------------------------------------
    const tx = new Transaction();

    // Add each memo as a separate instruction
    for (const memoText of memos) {
      const memoData = Buffer.from(memoText, "utf-8");

      const memoInstruction = new TransactionInstruction({
        keys: [
          {
            pubkey: signer.publicKey,
            isSigner: true,
            isWritable: true,
          },
        ],
        programId: program,
        data: memoData,
      });

      tx.add(memoInstruction);
    }

    // --------------------------------------------------------------------
    // Send the transaction
    // --------------------------------------------------------------------
    const signature = await signAndSend(tx).then(confirm);

    // --------------------------------------------------------------------
    // Verify all memos were logged
    // --------------------------------------------------------------------
    const logs = await getTransactionLogs(signature);

    console.log(`  Verifying all ${memos.length} memos in logs...`);

    // Check that each memo appears in the logs
    for (const memo of memos) {
      const found = logs.some((log) => log.includes(memo));
      expect(found, `Memo "${memo}" should appear in logs`).to.be.true;
      console.log(`    ✓ Found: "${memo}"`);
    }

    console.log(`  ✓ All memos logged successfully!\n`);
  });

  // ========================================================================
  // TEST 6: Memo with Multiple Signers (SUCCESS CASE)
  // ========================================================================
  it("should accept a memo with multiple signers", async function () {
    this.timeout(15000);

    console.log("\n📝 Test 6: Memo with multiple signers");

    // --------------------------------------------------------------------
    // Create additional signer accounts
    // --------------------------------------------------------------------
    const signer1 = Keypair.generate();
    const signer2 = Keypair.generate();

    // Fund the additional signers (they need SOL for rent)
    await airdropSol(signer1.publicKey, 0.1);
    await airdropSol(signer2.publicKey, 0.1);

    const memoText = "Memo signed by multiple parties";
    const memoData = Buffer.from(memoText, "utf-8");

    // --------------------------------------------------------------------
    // Create instruction with multiple signers
    // --------------------------------------------------------------------
    const memoInstruction = new TransactionInstruction({
      keys: [
        {
          pubkey: signer.publicKey,
          isSigner: true, // Signer 1
          isWritable: true,
        },
        {
          pubkey: signer1.publicKey,
          isSigner: true, // Signer 2
          isWritable: false,
        },
        {
          pubkey: signer2.publicKey,
          isSigner: true, // Signer 3
          isWritable: false,
        },
      ],
      programId: program,
      data: memoData,
    });

    const tx = new Transaction();
    tx.add(memoInstruction);

    // --------------------------------------------------------------------
    // Send with all three signers
    // --------------------------------------------------------------------
    const signature = await signAndSend(tx, [signer, signer1, signer2]).then(
      confirm
    );
    console.log(`  ✓ Multiple signers accepted!`);

    // --------------------------------------------------------------------
    // Verify memo was logged
    // --------------------------------------------------------------------
    const logs = await getTransactionLogs(signature);
    const memoLogged = logs.some((log) => log.includes(memoText));

    expect(memoLogged, "Memo should be logged with multiple signers").to.be
      .true;

    console.log(`  ✓ Memo logged successfully!\n`);
  });

  // ========================================================================
  // TEST 7: Error Code Type Validation (TYPE SAFETY TEST)
  // ========================================================================
  it("should properly validate and type error codes", async function () {
    this.timeout(5000);

    console.log("\n🔍 Test 7: Error code type validation");

    // --------------------------------------------------------------------
    // Test 1: Validate ProgramErrorCode enum values
    // --------------------------------------------------------------------
    console.log(`  Testing ProgramErrorCode enum...`);

    expect(ProgramErrorCode.Success).to.equal(0);
    expect(ProgramErrorCode.NoSigners).to.equal(1);
    expect(ProgramErrorCode.EmptyMemo).to.equal(2);

    console.log(`    ✓ All error codes have correct values`);

    // --------------------------------------------------------------------
    // Test 2: Validate ErrorMessages mapping
    // --------------------------------------------------------------------
    console.log(`  Testing ErrorMessages mapping...`);

    expect(ErrorMessages[ProgramErrorCode.Success]).to.equal(
      "Transaction succeeded"
    );
    expect(ErrorMessages[ProgramErrorCode.NoSigners]).to.equal(
      "No signers found - at least one signer required"
    );
    expect(ErrorMessages[ProgramErrorCode.EmptyMemo]).to.equal(
      "Empty memo - memo text cannot be empty"
    );

    console.log(`    ✓ All error messages mapped correctly`);

    // --------------------------------------------------------------------
    // Test 3: Validate isProgramErrorCode type guard
    // --------------------------------------------------------------------
    console.log(`  Testing isProgramErrorCode type guard...`);

    expect(isProgramErrorCode(0)).to.be.true;
    expect(isProgramErrorCode(1)).to.be.true;
    expect(isProgramErrorCode(2)).to.be.true;
    expect(isProgramErrorCode(3)).to.be.false;
    expect(isProgramErrorCode(-1)).to.be.false;
    expect(isProgramErrorCode(999)).to.be.false;

    console.log(`    ✓ Type guard validates correctly`);

    // --------------------------------------------------------------------
    // Test 4: Validate error code extraction from mock errors
    // --------------------------------------------------------------------
    console.log(`  Testing error code extraction...`);

    const mockError1 = {
      message: "Transaction failed: custom program error: 0x1",
    };
    const mockError2 = {
      message: "Transaction failed: custom program error: 0x2",
    };
    const mockError3 = { message: "Generic error without code" };

    const code1: ProgramErrorCode | null = extractErrorCode(mockError1);
    const code2: ProgramErrorCode | null = extractErrorCode(mockError2);
    const code3: ProgramErrorCode | null = extractErrorCode(mockError3);

    expect(code1).to.equal(ProgramErrorCode.NoSigners);
    expect(code2).to.equal(ProgramErrorCode.EmptyMemo);
    expect(code3).to.be.null;

    console.log(`    ✓ Error extraction works correctly`);

    // --------------------------------------------------------------------
    // Test 5: Validate getErrorMessage function
    // --------------------------------------------------------------------
    console.log(`  Testing getErrorMessage function...`);

    expect(getErrorMessage(ProgramErrorCode.Success)).to.equal(
      ErrorMessages[ProgramErrorCode.Success]
    );
    expect(getErrorMessage(ProgramErrorCode.NoSigners)).to.equal(
      ErrorMessages[ProgramErrorCode.NoSigners]
    );
    expect(getErrorMessage(ProgramErrorCode.EmptyMemo)).to.equal(
      ErrorMessages[ProgramErrorCode.EmptyMemo]
    );

    console.log(`    ✓ Error messages retrieved correctly`);

    // --------------------------------------------------------------------
    // Test 6: Validate createTransactionError function
    // --------------------------------------------------------------------
    console.log(`  Testing createTransactionError function...`);

    const mockErrorWithCode = {
      message: "Failed: custom program error: 0x2",
      logs: ["Log 1", "Log 2"],
    };

    const txError: TransactionError = createTransactionError(mockErrorWithCode);

    expect(txError.message).to.equal(mockErrorWithCode.message);
    expect(txError.code).to.equal(ProgramErrorCode.EmptyMemo);
    expect(txError.logs).to.deep.equal(mockErrorWithCode.logs);

    console.log(`    ✓ TransactionError created correctly`);

    console.log(`  ✓ All type validation tests passed!\n`);
  });
});

// ============================================================================
// END OF TEST SUITE
// ============================================================================
