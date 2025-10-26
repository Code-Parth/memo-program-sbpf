# ============================================================================
# Solana Memo Program - sBPF Assembly Implementation (Optimized)
# ============================================================================
# Matches official Solana Memo Program behavior:
# - No signer validation required (accepts 0+ accounts)
# - Only validates non-empty instruction data
#
# Input Buffer Layout (Aligned BPF Loader):
# +0x00: num_accounts (u64)
# For each account:
#   Real: marker (0xFF) + metadata + data = 10336 + data_len bytes
#   Duplicate: marker (0-254) + padding = 8 bytes
# After all accounts:
#   instruction_data_len (8 bytes)
#   instruction_data (bytes)
# ============================================================================

.equ ACCOUNT_FIXED_SIZE, 10336          # 88 + 10240 (MAX_PERMITTED_DATA_INCREASE) + 8

.globl entrypoint

entrypoint:
    ldxdw r8, [r1 + 0]                  # r8 = num_accounts
    mov64 r7, 8                         # r7 = offset (after num_accounts)

    # Fast path: if no accounts, instruction data at offset 8
    jeq r8, 0, read_instruction_data

skip_accounts_loop:
    mov64 r2, r1                        # r2 = base pointer
    add64 r2, r7                        # r2 = current account position
    ldxb r3, [r2 + 0]                   # r3 = marker byte

    # Check if duplicate (marker < 255)
    mov64 r4, 255
    jlt r3, r4, skip_duplicate_account

    # Real account: skip fixed size + data_len
    ldxdw r3, [r2 + 80]                 # r3 = data_len
    add64 r7, ACCOUNT_FIXED_SIZE        # Skip fixed part (10336)
    add64 r7, r3                        # Skip variable data
    ja next_account

skip_duplicate_account:
    add64 r7, 8                         # Duplicate is 8 bytes

next_account:
    sub64 r8, 1                         # Decrement account counter
    jne r8, 0, skip_accounts_loop       # Continue if more accounts remain

read_instruction_data:
    add64 r1, r7                        # Point to instruction_data_len
    ldxdw r2, [r1 + 0]                  # r2 = instruction_data_len

    jeq r2, 0, error_empty_memo         # Error if empty memo

    add64 r1, 8                         # Point to instruction data
    call sol_log_                       # Log memo (r1=data, r2=len)

    mov64 r0, 0                         # Success
    exit

error_empty_memo:
    mov64 r0, 1                         # Error code: empty memo
    exit
