# Contract Events — soroban-merkle-airdrop

Every state-changing function in `AirdropContract` publishes a Soroban event
so off-chain indexers, monitoring tools, and audit logs can track the full
history of an airdrop without querying contract storage.

Events follow the Soroban convention: `(topics_tuple, data_value)`.

---

## `init` — airdrop initialised

**Emitted by**: `initialize()`

| Field            | Value                               |
|------------------|-------------------------------------|
| Topic 0          | `Symbol("init")`                    |
| Topic 1          | `admin: Address`                    |
| Data             | `(merkle_root: BytesN<32>, total_amount: i128)` |

Emitted once when the airdrop is first set up. Use this event to confirm
that the correct Merkle root and total supply were recorded on-chain.

---

## `claimed` — tokens claimed

**Emitted by**: `claim()`

| Field    | Value                   |
|----------|-------------------------|
| Topic 0  | `Symbol("claimed")`     |
| Topic 1  | `claimant: Address`     |
| Data     | `amount: i128`          |

Emitted once per successful claim. The `claimant` topic lets indexers filter
all claims for a specific address.

---

## `paused` — active flag toggled

**Emitted by**: `set_active()`

| Field    | Value               |
|----------|---------------------|
| Topic 0  | `Symbol("paused")`  |
| Topic 1  | `admin: Address`    |
| Data     | `active: bool`      |

Emitted on every call to `set_active()`, whether pausing (`false`) or
resuming (`true`). The event name `"paused"` is kept for both transitions
for backwards compatibility with existing indexers.

---

## `reclaimed` — unclaimed tokens recovered

**Emitted by**: `reclaim()`

| Field    | Value                 |
|----------|-----------------------|
| Topic 0  | `Symbol("reclaimed")` |
| Topic 1  | `admin: Address`      |
| Data     | `balance: i128`       |

Emitted after all remaining tokens are transferred back to the admin.
`balance` is the number of tokens actually transferred (may be `0` if the
contract was already empty).

---

## `exp_ext` — expiration extended

**Emitted by**: `extend_expiration()`

| Field    | Value                   |
|----------|-------------------------|
| Topic 0  | `Symbol("exp_ext")`     |
| Topic 1  | `admin: Address`        |
| Data     | `new_expiration: u64`   |

Emitted when the admin successfully extends the airdrop window.
`new_expiration` is the updated unix timestamp (seconds) after which
`reclaim()` becomes permitted.

---

## Subscribing to events

Use the Stellar Horizon API or any Soroban-compatible RPC to stream events:

```bash
stellar events \
  --network testnet \
  --contract-id <CONTRACT_ID> \
  --start-ledger <LEDGER>
```

Filter by the first topic to watch for a specific event type:

```bash
# Watch all claim events
stellar events --network testnet --contract-id <ID> \
  | jq 'select(.topic[0] == "claimed")'
```
