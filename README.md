# Solana Memo Program - sBPF Assembly

A Solana memo program written in pure sBPF assembly with type safety and test coverage.

## Overview

This project demonstrates how to build Solana programs directly in assembly language. The memo program accepts text messages, validates the signers, and is implemented in assembly.

## Features

- [x] **Pure sBPF Assembly** - Written directly in assembly
- [x] **Signer Validation** - Ensures at least one account signed the transaction
- [x] **Empty Memo Protection** - Rejects transactions with no memo text
- [x] **Type-Safe TypeScript** - type definitions with runtime validation
- [x] **Comprehensive Testing** - 7 test cases covering all scenarios
- [x] **Error Code Validation** - Typed error codes with human-readable messages
- [x] **Code Quality** - Proper error handling and edge case coverage

## Installation

1. **Clone the repository**

  ```bash
  git clone https://github.com/Code-Parth/memo-program-sbpf.git
  ```

   ```bash
   cd memo-program-sbpf
   ```

2. **Install dependencies**

   ```bash
   yarn install
   ```

3. **Start local Solana validator** (in a separate terminal)

   ```bash
   solana-test-validator
   ```

4. **Generate program keypair**
   ```bash
   solana-keygen new --outfile deploy/memo-program-sbpf-keypair.json --force --no-passphrase
   ```

## Project Structure

```
memo-program-ts/
├── src/
│   └── memo-program-ts/
│       └── memo-program-ts.s             # sBPF assembly source code
├── tests/
│   ├── types.ts                          # TypeScript type definitions
│   └── memo-program-sbpf.test.ts         # Comprehensive test suite
├── deploy/
│   └── memo-program-sbpf-keypair.json    # Program keypair (generated)
├── package.json                          # Node.js dependencies
├── tsconfig.json                         # TypeScript configuration
└── README.md                             # This file
```

## Usage

### Available Commands

```bash
# Compile the assembly program
sbpf build

# Deploy to local validator
sbpf deploy

# Run tests
sbpf test
# or
yarn test

# Build, deploy, and test in one command
sbpf e2e
```

### Quick Start Workflow

```bash
# 1. Start validator (separate terminal)
solana-test-validator

# 2. Build, deploy, and test
sbpf e2e
```

## How It Works

### Assembly Program Logic

The memo program (`src/memo-program-ts/memo-program-ts.s`) follows this flow:

1. **Read Account Count** - Validate at least one account exists
2. **Iterate Accounts** - Check each account for signer flag
3. **Validate Signer** - Ensure at least one signer found (error 0x1 if not)
4. **Read Memo Data** - Extract instruction data length and pointer
5. **Validate Length** - Ensure memo is not empty (error 0x2 if empty)
6. **Log Memo** - Call `sol_log_` syscall to log the memo text
7. **Return Success** - Exit with code 0

### Memory Layout (Aligned BPF Format)

The program parses Solana's aligned BPF input buffer:

```
Offset 0x00: num_accounts (8 bytes)

For each account:
  +0x00: marker (1 byte) - 0xFF for real, index for duplicate
  +0x01: is_signer (1 byte)
  +0x02: is_writable (1 byte)
  +0x03: is_executable (1 byte)
  +0x04: padding (4 bytes)
  +0x08: pubkey (32 bytes)
  +0x28: owner (32 bytes)
  +0x48: lamports (8 bytes)
  +0x50: data_len (8 bytes)
  +0x58: data (data_len bytes)
  +0x58+data_len: reserved (10,240 bytes) - MAX_PERMITTED_DATA_INCREASE
  +0x58+data_len+10240: rent_epoch (8 bytes)

Total account size = 10,336 + data_len

After all accounts:
  instruction_data_len (8 bytes)
  instruction_data (variable bytes) - the memo text
```

### Key Insight: Account Size Calculation

The critical fix was calculating the correct account size:

```assembly
.equ MAX_PERMITTED_DATA_INCREASE, 10240
.equ ACCOUNT_FIXED_SIZE, 10336          # 88 + 10240 + 8

add64 r7, ACCOUNT_FIXED_SIZE            # Add 10336
add64 r7, r3                            # Add data_len
```

## Testing

### Test Suite

The project includes 7 comprehensive tests:

| #   | Test Name              | Description                   | Expected Result    |
| --- | ---------------------- | ----------------------------- | ------------------ |
| 1   | Valid memo with signer | Standard memo operation       | ✅ Success         |
| 2   | Memo without signer    | No signer account             | ❌ Error 0x1       |
| 3   | Empty memo             | Zero-length instruction data  | ❌ Error 0x2       |
| 4   | Long memo (256+ chars) | Large instruction data        | ✅ Success         |
| 5   | Multiple memos         | 3 memos in one transaction    | ✅ All logged      |
| 6   | Multiple signers       | 3 signers on one memo         | ✅ Success         |
| 7   | Type validation        | TypeScript type safety checks | ✅ All types valid |

### Running Tests

```bash
# Run all tests
yarn test

# Run tests with sbpf (includes build & deploy)
sbpf e2e
```

## Error Codes

| Code | Hex | Name      | Description                              |
| ---- | --- | --------- | ---------------------------------------- |
| 0    | 0x0 | Success   | Transaction completed successfully       |
| 1    | 0x1 | NoSigners | No signer accounts found in transaction  |
| 2    | 0x2 | EmptyMemo | Instruction data is empty (no memo text) |

## Development

### Modifying the Assembly Program

1. Edit `src/memo-program-ts/memo-program-ts.s`
2. Rebuild: `sbpf build`
3. Deploy: `sbpf deploy`
4. Test: `yarn test`

### Adding New Tests

1. Open `tests/memo-program-sbpf.test.ts`
2. Add new test case:
   ```typescript
   it("should handle your test case", async function () {
     // Your test logic here
   });
   ```
3. Run: `yarn test`

## Resources

### sBPF & Assembly

- [Blueshift sBPF Course](https://learn.blueshift.gg/en/courses/introduction-to-assembly/assembly-101)
- [Assembly Memo Challenge](https://learn.blueshift.gg/en/challenges/assembly-memo)
- [sBPF GitHub](https://github.com/blueshift-gg/sbpf)

### Solana Development

- [Solana Docs](https://docs.solana.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [BPF Loader Source](https://github.com/solana-labs/solana/tree/master/programs/bpf_loader)

### TypeScript & Testing

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertions](https://www.chaijs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the [MIT License](https://github.com/Code-Parth/memo-program-sbpf?tab=MIT-1-ov-file).

## Acknowledgments

- Built with [sBPF](https://github.com/blueshift-gg/sbpf) by Blueshift
- Inspired by the [Blueshift Assembly Course](https://learn.blueshift.gg)
- Solana BPF loader serialisation format
