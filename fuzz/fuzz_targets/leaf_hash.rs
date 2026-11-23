#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{Address, Env};

fuzz_target!(|data: &[u8]| {
    // Need at least 16 bytes for the i128 amount; claimant is generated.
    if data.len() < 16 {
        return;
    }

    let env = Env::default();

    // Use a randomly generated address so the fuzz engine can vary it too,
    // while still producing a well-formed Address the SDK accepts.
    let claimant = Address::generate(&env);

    // Parse the first 16 bytes as a big-endian i128 amount.
    let amount_bytes: [u8; 16] = data[..16].try_into().unwrap();
    let amount = i128::from_be_bytes(amount_bytes);

    // Call leaf_hash — assert it never panics and always returns 32 bytes.
    let result = soroban_merkle_airdrop::merkle::leaf_hash(&env, &claimant, amount);
    assert_eq!(result.to_array().len(), 32);
});
