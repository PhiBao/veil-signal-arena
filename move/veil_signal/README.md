# Veil Move Module

This package is the first live on-chain runtime for Veil Signal Arena.

The current frontend queries this module directly for commitments, activity, and leaderboard derivation. This workspace now has a verified local publish on `veil-signal-1` at `0xd0a2edc8bd949b24d391a400b869763221d23e65`.

## What It Does

- creates a global `SignalArena` ledger under the published module address
- stores sealed commitments on chain with owner, arena id, route mode, confidence, and timestamps
- allows the original account to reveal a commitment later with thesis and evidence
- exposes view functions for `module_initialized`, `commitment_count`, `list_commitments`, `list_commitments_by_owner`, and `get_commitment`

## Why It Exists

The submission requirement for `deployed_address` expects a real Move module address on your own Initia appchain. This package is the Veil runtime that the frontend is already prepared to target once the rollup is live.

## Launch Assumption

The commands below assume the publisher can actually pay rollup gas.

For the verified Veil launch path that means:

- fund the Initia Gas Station with at least `7 INIT` before `weave rollup launch`; Weave will validate the exact `uinit` requirement during broadcast
- answer `Yes` to `Would you like to add the gas station account to genesis accounts?`
- set `Specify the genesis balance for the gas station account (umin)` to a positive value such as `100000000`

If you skip that genesis balance, `--from gas-station` will not have rollup-side `umin` and the publish command will fail until you manually fund that account on the rollup.

## Local Commands Once Your Rollup Is Running

Run Move tests:

```bash
minitiad move test --path ./move/veil_signal --test --skip-fetch-latest-git-deps
```

Build the package:

```bash
minitiad move build --path ./move/veil_signal --install-dir ./move-build --named-addresses veil=0x1 --skip-fetch-latest-git-deps
```

The verified publish path on bundled Minimove `v1.1.11` is a direct package publish from the funded rollup account. `deploy-object` currently fails here with `MODULE_ADDRESS_DOES_NOT_MATCH_SENDER`, so compile `veil` to the publisher's padded VM sender address and publish directly:

```bash
PUBLISHER_KEY=GasStation
SDK_ADDR=$(minitiad keys show "$PUBLISHER_KEY" --keyring-backend test -a)
HEX20=$(minitiad debug addr "$SDK_ADDR" | sed -n 's/^Address (hex): //p' | tr 'A-Z' 'a-z')
VM_ADDR=0x000000000000000000000000${HEX20}
```

Publish the package:

```bash
minitiad move deploy --build \
  --path ./move/veil_signal \
  --named-addresses "veil=${VM_ADDR}" \
  --from "$PUBLISHER_KEY" \
  --chain-id <YOUR_ROLLUP_CHAIN_ID> \
  --home ~/.minitia \
  --keyring-backend test \
  --node http://127.0.0.1:26657 \
  --gas-prices 0.15umin \
  --gas auto \
  --gas-adjustment 1.5 \
  --skip-fetch-latest-git-deps \
  --yes
```

See `docs/appchain-deployment.md` for the full verified launch flow and the checked-in Weave helper script.

The published module address is the value you want for `deployed_address` after the transaction succeeds. In this workspace the verified address is `0xd0a2edc8bd949b24d391a400b869763221d23e65`.

## Smoke Test Pattern

`init_module` is private and runs automatically on publish. Start by confirming the module and state exist:

```bash
minitiad query move module <MODULE_ADDRESS> signal_arena --node http://127.0.0.1:26657
minitiad query move view-json <MODULE_ADDRESS> signal_arena module_initialized \
  --node http://127.0.0.1:26657
```

Create a commitment:

```bash
minitiad tx move execute <MODULE_ADDRESS> signal_arena commit \
  --from "$PUBLISHER_KEY" \
  --chain-id <YOUR_ROLLUP_CHAIN_ID> \
  --home ~/.minitia \
  --keyring-backend test \
  --node http://127.0.0.1:26657 \
  --gas-prices 0.15umin \
  --gas auto \
  --gas-adjustment 1.5 \
  --args '["string:macro-rift","string:hybrid","string:0xfeedbeef","u64:78"]' \
  --yes
```

Reveal it later:

```bash
minitiad tx move execute <MODULE_ADDRESS> signal_arena reveal \
  --from "$PUBLISHER_KEY" \
  --chain-id <YOUR_ROLLUP_CHAIN_ID> \
  --home ~/.minitia \
  --keyring-backend test \
  --node http://127.0.0.1:26657 \
  --gas-prices 0.15umin \
  --gas auto \
  --gas-adjustment 1.5 \
  --args '["u64:0","string:Consumer arenas are absorbing the next INIT cycle.","string:Bridge flow and creator demand turned before the leaderboard did."]' \
  --yes
```

Verify that the module exists:

```bash
minitiad query move module <MODULE_ADDRESS> signal_arena --node http://127.0.0.1:26657
```

Verify that the frontend query surface works:

```bash
minitiad query move view-json <MODULE_ADDRESS> signal_arena list_commitments \
  --node http://127.0.0.1:26657
```

## Next On-Chain Steps

- add sponsor-owned arenas and fee logic on chain
- move scoring from deterministic client derivation into module-owned economics if needed
- expose richer arena creation and sponsor configuration directly from the appchain
