# Design: Bitmap-Based Claimed Tracking

**Status:** Proposal  
**Author:** soroban-merkle-airdrop contributors  
**Related issue:** [#469](https://github.com/eogenyi23-creator/soroban-merkle-airdrop/issues/469)

---

## 1. Current Approach

### Storage model

Each claimant's claimed state is stored as a separate persistent entry:

```
DataKey::Claimed(Address) → bool   (one entry per claimant)
```

The entry is written in `claim_entry` before the token transfer (re-entrancy
guard) and given a TTL of `CLAIMED_TTL` (≈ 2 years at 5 s/ledger).

### Cost model

Soroban charges for every persistent storage entry in terms of ledger entry
rent (expressed in stroops). As of Stellar Protocol 21:

| Metric | Value |
|---|---|
| Ledger entry size | ~100 bytes per `Claimed(Address)` entry (key + bool + metadata) |
| Minimum TTL (persistent) | 4,096 ledgers (≈ 5.7 hours) |
| Fee per ledger entry write | ~10,000 stroops (~0.001 XLM) at median fee |
| Fee per byte of persistent storage per ledger | ~12.5 nanoXLM |

For **100,000 recipients** at the minimum-fee level this amounts to roughly:

- **Write cost**: 100,000 × 10,000 stroops = **1 × 10⁹ stroops ≈ 100 XLM**
- **Ongoing rent** at CLAIMED_TTL ≈ 12,614,400 ledgers:
  - 100,000 entries × 100 bytes × 12,614,400 ledgers × 12.5 nanoXLM/byte/ledger
  - ≈ **1.57 × 10¹⁵ nanoXLM ≈ 1,575,000 XLM** over the full TTL period

In practice the fee market lowers the per-byte cost and validators may adjust
the rent schedule, but the per-entry write cost and the linear growth in
persistent entries remain structural constraints regardless of fee levels.

### Trade-offs of the current approach

**Advantages:**
- Simple implementation: `has(&DataKey::Claimed(addr))` is an O(1) lookup.
- No off-chain index needed: the claimant address is the key.
- TTL refresh on `is_claimed()` protects against archive-then-double-claim.

**Disadvantages:**
- One ledger entry per claimant: 100k recipients = 100k entries.
- Persistent storage rent accumulates over the full TTL window.
- Storage cost grows linearly with recipient count.

---

## 2. Bitmap Approach

### Core idea

Assign each leaf in the Merkle tree a 0-based integer index (its position in
the sorted leaf array). Store claimed state as a map from page number to a
256-bit bitmap:

```
DataKey::ClaimedPage(u32) → BytesN<32>   (one entry per 256 claimants)
```

For a 100,000-recipient airdrop this requires ceil(100,000 / 256) = **391
entries** instead of 100,000, a 256× reduction.

### Leaf index assignment

Leaf indices are determined by the same sort order the Merkle tree builder
already uses:

1. Compute `leaf_hash(contract_id, address, amount)` for every entry.
2. Sort leaves lexicographically by their hash (as byte arrays).
3. The 0-based position in the sorted array is the leaf index.

The TypeScript SDK (`buildMerkleTree`) already sorts leaves before building
layers, so the index is deterministic given the same input list.

### Storage operations

**Marking an index claimed** (inside `claim_entry`):

```rust
let page  = leaf_index / 256;
let bit   = leaf_index % 256;
let key   = DataKey::ClaimedPage(page);
let mut bitmap: BytesN<32> = env
    .storage()
    .persistent()
    .get(&key)
    .unwrap_or(BytesN::from_array(&env, &[0u8; 32]));

// Set bit `bit` in the 32-byte bitmap (big-endian bit ordering).
let byte_idx = (bit / 8) as usize;
let bit_idx  = 7 - (bit % 8);
let mut arr  = bitmap.to_array();
arr[byte_idx] |= 1 << bit_idx;
env.storage().persistent().set(&key, &BytesN::from_array(&env, &arr));
```

**Checking if an index is claimed**:

```rust
let page   = leaf_index / 256;
let bit    = leaf_index % 256;
let key    = DataKey::ClaimedPage(page);
let bitmap: BytesN<32> = env
    .storage()
    .persistent()
    .get(&key)
    .unwrap_or(BytesN::from_array(&env, &[0u8; 32]));
let byte_idx = (bit / 8) as usize;
let bit_idx  = 7 - (bit % 8);
(bitmap.to_array()[byte_idx] >> bit_idx) & 1 == 1
```

### Cost model

| Metric | Current (per-address) | Bitmap |
|---|---|---|
| Persistent entries for 100k recipients | 100,000 | 391 |
| Write cost (100k recipients × 10,000 stroops) | ≈ 100 XLM | ≈ 0.39 XLM |
| Entry size | ~100 bytes | ~100 bytes (but 256 claims per entry) |
| Ongoing rent (12.6M ledger TTL, 100 bytes/entry) | ≈ 1,575,000 XLM | ≈ 6,152 XLM |
| Lookup complexity | O(1) by address | O(1) by index (after index lookup) |

The bitmap reduces persistent-entry count and therefore both write fees and
ongoing rent by roughly 256×.

---

## 3. Trade-offs

| Concern | Current approach | Bitmap approach |
|---|---|---|
| Index-free lookup | ✅ — address is the key | ❌ — leaf index needed at claim time |
| Off-chain data required | None | Claimant must know their leaf index |
| SDK change | None | `buildMerkleTree` must return leaf indices; `ClaimProof` must include `leaf_index` |
| Contract change | None | New `DataKey::ClaimedPage(u32)`; `claim` signature gains `leaf_index: u32` |
| Proof security | Merkle proof alone | Merkle proof + correct `leaf_index` (mismatch is a no-op, not a security issue) |
| Double-claim protection | TTL-based; vulnerable if entry archives | Bitmap never archives (page entries are refreshed on each claim to that page) |
| `is_claimed(address)` without index | O(1) | Not directly possible without scanning all pages or a reverse index |
| Implementation complexity | Low | Medium (index assignment, bit manipulation) |
| Migration from existing deployments | N/A | Requires draining existing `Claimed(Address)` entries or deploying a fresh contract |

The most important practical constraint is **index availability at claim time**.
In the current system a claimant only needs their `(amount, proof)` from the
off-chain tree file. With bitmaps they additionally need their `leaf_index`,
which the SDK can include in the generated `ClaimProof` struct but which is not
currently part of the on-chain Merkle proof verification algorithm. Any
claimant using a tree file generated before the bitmap upgrade would fail to
claim until they regenerate the file.

---

## 4. Recommendation

**Use the current per-address approach unless storage fees exceed approximately
5 XLM per recipient across the airdrop's lifetime.**

Rationale:

- For airdrops under ~10,000 recipients the total persistent-storage rent is
  well below 100 XLM for the full TTL window — negligible relative to the
  token value being distributed.
- The per-address approach requires no off-chain index, no SDK changes, and no
  change to the `claim` function signature — all existing tools and tree files
  remain compatible.
- The bitmap approach's main benefit (storage cost) only becomes material at
  100k+ recipients. At that scale the more important bottleneck is typically
  the number of on-chain transactions (one per claimant), not ledger entry
  rent.
- The archive-then-double-claim risk in the current approach is mitigated by
  the `is_claimed()` TTL-refresh fix (issue #43). Bitmap pages avoid this
  risk entirely, but the fix makes it a non-issue for practical TTLs.

If a future deployment targets 100,000+ recipients and the organiser can
absorb the SDK changes, the bitmap approach is worth revisiting. The threshold
at which the bitmap's 256× storage reduction meaningfully lowers total cost is
roughly **50,000 recipients**, where the rent savings exceed the implementation
and migration effort.

---

## 5. Migration Path

If the bitmap approach is adopted in a future contract version:

1. **New deployments** use the bitmap from the start. No migration is needed
   for contracts that have never had any claims.

2. **Live contracts with existing claims** cannot be migrated transparently
   because the per-address `Claimed(Address)` entries in persistent storage
   would need to be converted to bitmap pages in a single upgrade transaction.
   For large airdrops this would exceed the per-transaction instruction budget.

   The recommended path for a live contract:
   - **Freeze claims** via `set_active(false)`.
   - **Deploy a new contract** with the bitmap implementation, initialised with
     the same Merkle root.
   - **Exclude already-claimed addresses** from the new tree (the organiser
     filters these from the original distribution list before rebuilding the
     tree with the TypeScript SDK).
   - **Re-activate** the new contract and redirect recipients to it.

3. **Off-chain tooling** (SDK, CLI, web UI) must be updated to:
   - Include `leaf_index` in `ClaimProof` (output of `buildMerkleTree`).
   - Pass `leaf_index` to the contract's `claim` and `claim_for` functions.
   - Support a `--regenerate` flag in the `generate` CLI command to rebuild
     tree files from an existing CSV when switching to a bitmap contract.
