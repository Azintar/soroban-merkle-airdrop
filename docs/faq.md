# Frequently Asked Questions — soroban-merkle-airdrop

---

## Does `reclaim()` deactivate the contract?

No. `reclaim()` transfers all remaining tokens back to the admin but does **not**
change the `Active` flag. The contract remains `Active = true` after the call.

Any subsequent `claim()` will not get a `NotActive` error — instead it will
panic at the token transfer step because the contract balance is zero
(insufficient balance).

If you want to prevent further claim attempts after reclaiming, explicitly call
`set_active(false)` before or after `reclaim()`:

```bash
# recommended sequence
soroban contract invoke ... -- set_active --active false
soroban contract invoke ... -- reclaim
```

---

## Can I claim twice?

No. The contract records a persistent `Claimed(address)` flag the first time a
claimant calls `claim()`. Any subsequent call with the same address returns the
`AlreadyClaimed` error, regardless of whether the contract is still active or
the airdrop period is still open.

---

## What happens if I supply the wrong Merkle proof?

`claim()` returns an `InvalidProof` error and the transaction is reverted. No
tokens are moved and the claimant's `Claimed` flag is **not** set, so they can
retry with the correct proof.

Proofs are order-sensitive: use the TypeScript SDK's `getMerkleProof()` helper
to generate them, as it handles leaf hashing and sibling ordering automatically.

---

## How do I pause the airdrop temporarily?

Call `set_active(false)` from the admin account. While paused, every `claim()`
call returns `NotActive`. Resume by calling `set_active(true)`.

Pausing does not affect the expiration timestamp or the stored Merkle root.

---

## What is the expiration timestamp used for?

It is a Unix timestamp (seconds) set at initialisation. Before that timestamp,
calling `reclaim()` returns `NotYetExpired`. Once the ledger timestamp is at or
past the expiration value, the admin can call `reclaim()` to retrieve unclaimed
tokens.

The expiration has no effect on `claim()` — claims are gated only by the
`Active` flag, not by time. If you want to stop claims at expiration time,
call `set_active(false)` when the airdrop period ends.

---

## Can anyone restore the contract if it gets archived?

Yes. The `restore()` function is public and requires no authentication. Anyone
can pay to extend the instance-storage TTL and bring the contract back from
Soroban's archival state. Query functions (`merkle_root`, `is_claimed`,
`is_active`, `token`, `admin`, `total_deposited`, `expiration`) also refresh
the TTL automatically whenever they are called.
