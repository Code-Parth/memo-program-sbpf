# ============================================================================
# Solana Memo Program - sBPF Assembly Implementation
# ============================================================================
# Uses the aligned BPF loader serialization format
#
# Input Buffer Layout:
# +0x00: num_accounts (u64)
# For each account:
#   +0: marker (1 byte) - 0xFF for real account, index for duplicate
#   +1: is_signer (1 byte)
#   +2: is_writable (1 byte)
#   +3: is_executable (1 byte)
#   +4: padding (4 bytes)
#   +8: pubkey (32 bytes)
#   +40: owner (32 bytes)
#   +72: lamports (8 bytes)
#   +80: data_len (8 bytes)
#   +88: data (data_len bytes)
#   +88+data_len: reserved space (10240 bytes) - MAX_PERMITTED_DATA_INCREASE
#   +88+data_len+10240: rent_epoch (8 bytes)
# Total account size = 10336 + data_len
# After all accounts:
#   instruction_data_len (8 bytes)
#   instruction_data (bytes)
# ============================================================================

.equ MAX_PERMITTED_DATA_INCREASE, 10240
.equ ACCOUNT_FIXED_SIZE, 10336          # 88 + 10240 + 8

.globl entrypoint

entrypoint:
    mov64 r6, r1                        # Save input buffer pointer
    mov64 r7, 0                         # Current offset
    mov64 r9, 0                         # Signer found flag

    # Read num_accounts
    ldxdw r8, [r6 + 0]                  # r8 = num_accounts
    add64 r7, 8                         # r7 = 8

    jeq r8, 0, error_no_signers         # No accounts = error

check_account:
    jeq r8, 0, done_checking_accounts   # All accounts processed

    # Check for duplicate marker
    mov64 r1, r6
    add64 r1, r7
    ldxb r2, [r1 + 0]                   # Read first byte (marker or duplicate)

    # If duplicate (< 255), skip to next account quickly
    mov64 r3, 255
    jlt r2, r3, handle_duplicate

    # Real account - read is_signer
    ldxb r2, [r1 + 1]                   # is_signer at offset +1
    jeq r2, 0, read_data_len

    mov64 r9, 1                         # Mark signer found

read_data_len:
    # Read data_len from offset +80
    ldxdw r3, [r1 + 80]                 # r3 = data_len

    # Skip full account: fixed size + data_len
    add64 r7, ACCOUNT_FIXED_SIZE        # Add 10336
    add64 r7, r3                        # Add data_len

    sub64 r8, 1                         # Decrement account counter
    ja check_account

handle_duplicate:
    # Duplicate accounts are 8 bytes (1 byte index + 7 bytes padding)
    add64 r7, 8
    sub64 r8, 1
    ja check_account

done_checking_accounts:
    jeq r9, 0, error_no_signers         # Must have a signer

    # Read instruction data
    mov64 r1, r6
    add64 r1, r7
    ldxdw r2, [r1 + 0]                  # r2 = instruction_data_len

    jeq r2, 0, error_empty_memo         # Empty memo = error

    add64 r1, 8                         # Point to instruction data

    call sol_log_                       # Log the memo (r1=data, r2=len)

    mov64 r0, 0                         # Success
    exit

error_no_signers:
    mov64 r0, 1
    exit

error_empty_memo:
    mov64 r0, 2
    exit
