# Contract ABI — soroban-merkle-airdrop

This document describes every public function exposed by the `AirdropContract`.
All functions are invoked via Soroban's standard contract-call mechanism.

---

## `initialize`

```
initialize(
  admin:        Address,
  token:        Address,
  merkle_root:  BytesN<32>,
  total_amount: i128,
  expiration:   u64,
) -> Result<(), AirdropError>
```

Initialises the airdrop. Must be called exactly once before any claims.
The `admin` transfers `total_amount` tokens from the SEP-41 `token` contract
into this contract and sets up all instance-storage keys.

**Arguments**

| Name           | Type          | Description                                                       |
|----------------|---------------|-------------------------------------------------------------------|
| `admin`        | `Address`     | Address that controls the airdrop (can pause/reclaim).            |
| `token`        | `Address`     | SEP-41 token contract address to distribute.                      |
| `merkle_root`  | `BytesN<32>`  | 32-byte Merkle root of the `(address, amount)` distribution tree. |
| `total_amount` | `i128`        | Total tokens to distribute; transferred from `admin` on call.     |
| `expiration`   | `u64`         | Unix timestamp (seconds) after which `reclaim()` is permitted.    |

**Errors**: `AlreadyInitialized`, `ZeroAmount`

**Events**: publishes `(("init", admin), (merkle_root, total_amount))`

---

## `claim`

```
claim(
  claimant: Address,
  amount:   i128,
  proof:    Vec<BytesN<32>>,
) -> Result<(), AirdropError>
```

Claims tokens on behalf of `claimant`. Verifies the Merkle proof, marks the
address as claimed (persistent storage), and transfers `amount` tokens to the
claimant. The claimant must sign the transaction.

**Arguments**

| Name       | Type               | Description                                             |
|------------|--------------------|---------------------------------------------------------|
| `claimant` | `Address`          | Address claiming tokens (must authorise the call).      |
| `amount`   | `i128`             | Token amount allocated to this claimant in the tree.    |
| `proof`    | `Vec<BytesN<32>>`  | Ordered sibling hashes from the leaf up to the root.    |

**Errors**: `NotInitialized`, `NotActive`, `ZeroAmount`, `AlreadyClaimed`, `InvalidProof`

**Events**: publishes `(("claimed", claimant), amount)`

---

## `set_active`

```
set_active(active: bool) -> Result<(), AirdropError>
```

Pauses (`false`) or unpauses (`true`) the airdrop. Admin only.
When `active` is `false`, all `claim()` calls return `NotActive`.

**Arguments**

| Name     | Type   | Description                      |
|----------|--------|----------------------------------|
| `active` | `bool` | `true` = live, `false` = paused. |

**Errors**: `NotInitialized`

**Events**: publishes `(("paused", admin), active)`

---

## `extend_expiration`

```
extend_expiration(new_expiration: u64) -> Result<(), AirdropError>
```

Extends the airdrop expiration timestamp. Admin only.

Allows the airdrop organiser to widen the distribution window without
redeploying. The new expiration must be **strictly greater** than the current
value — this prevents accidentally closing the window early.

**Arguments**

| Name              | Type  | Description                                                                 |
|-------------------|-------|-----------------------------------------------------------------------------|
| `new_expiration`  | `u64` | New unix timestamp (seconds). Must be strictly greater than current value.  |

**Errors**: `NotInitialized`, `ExpirationInPast`

**Events**: publishes `(("exp_ext", admin), new_expiration)`

---

## `restore`

```
restore()
```

Extends instance-storage TTL back to the maximum. Anyone may call this —
no authentication is required. Useful when the contract has been archived by
Soroban's state-archival mechanism and must be restored before it can be used.

---

## `reclaim`

```
reclaim() -> Result<i128, AirdropError>
```

Transfers all remaining token balance held by the contract back to the admin.
Can only be called after `expiration`. Admin only.

**Returns**: the amount of tokens transferred to the admin.

**Errors**: `NotInitialized`, `NotYetExpired`

**Events**: publishes `(("reclaimed", admin), balance)`

> **Post-reclaim: the Active flag is NOT reset.**
> A subsequent `claim()` will panic at the token layer (insufficient balance)
> rather than return `NotActive`. Call `set_active(false)` after `reclaim()`
> if you want to prevent further claim attempts.

---

## `merkle_root`

```
merkle_root() -> Option<BytesN<32>>
```

Returns the Merkle root stored at initialisation, or `None` if the contract
has not been initialised. Also refreshes instance-storage TTL.

---

## `is_claimed`

```
is_claimed(claimant: Address) -> bool
```

Returns `true` if `claimant` has already successfully called `claim()`.
Also refreshes instance-storage TTL.

---

## `is_active`

```
is_active() -> bool
```

Returns the current value of the `Active` flag. Returns `false` if the
contract has not been initialised. Also refreshes instance-storage TTL.

---

## `token`

```
token() -> Option<Address>
```

Returns the SEP-41 token contract address, or `None` before initialisation.
Also refreshes instance-storage TTL.

---

## `admin`

```
admin() -> Option<Address>
```

Returns the admin address, or `None` before initialisation.
Also refreshes instance-storage TTL.

---

## `total_deposited`

```
total_deposited() -> i128
```

Returns the total token amount deposited at initialisation. Returns `0` before
initialisation. Also refreshes instance-storage TTL.

---

## `expiration`

```
expiration() -> Option<u64>
```

Returns the expiration timestamp (unix seconds) after which `reclaim()` is
permitted, or `None` before initialisation. Also refreshes instance-storage TTL.

---

## Error codes

| Variant              | Meaning                                                            |
|----------------------|--------------------------------------------------------------------|
| `AlreadyInitialized` | `initialize()` was called on an already-initialised contract.      |
| `NotInitialized`     | A function was called before `initialize()`.                       |
| `NotActive`          | `claim()` was called while the `Active` flag is `false`.           |
| `ZeroAmount`         | `total_amount` or `amount` is ≤ 0.                                 |
| `AlreadyClaimed`     | The claimant has already claimed their allocation.                 |
| `InvalidProof`       | The supplied Merkle proof does not match the stored root.          |
| `NotYetExpired`      | `reclaim()` was called before the expiration timestamp.            |
| `ExpirationInPast`   | `extend_expiration()` was called with a value ≤ current expiration. |
