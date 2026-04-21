# Veil Appchain Deployment Guide

This guide turns the current Veil repo into a submission-ready Initia appchain project.

It assumes the frontend is already wired for direct Move queries and Move execute transactions, and that you now want the real rollup plus module publish so `deployed_address` becomes a real value in `.initia/submission.json`.

## Outcome

By the end of this guide you should have:

- a local Move-compatible Initia rollup
- a funded Gas Station account
- `gas-station` imported into both `initiad` and `minitiad`
- the Veil Move module published from `move/veil_signal`
- the module initialized with its global commitment ledger ready for frontend queries
- a real module address to place in `.initia/submission.json`

## 1. Local prerequisites

Already verified on this machine:

- Docker is installed.
- Docker Compose is installed.
- Go is installed.
- Weave was installed locally at `$HOME/.local/bin/weave`.
- `lz4` is available at `$HOME/.local/bin/lz4`.

Created on first successful launch:

- local Initia binaries
- local rollup state under `~/.minitia`

If `lz4` is missing on another machine, install it first:

```bash
sudo apt-get update
sudo apt-get install -y lz4
```

If you do not have sudo, use a machine where you can install `lz4`, or install it in a custom location and add it to `PATH` before running Weave.

## 2. Add Weave to your shell PATH

For the current shell session:

```bash
export PATH="$HOME/.local/bin:$PATH"
weave version
```

## 3. Check the Gas Station first

Inspect the Gas Station addresses and balances:

```bash
weave gas-station show
```

Verified requirement for the Veil launch path:

- Move VM
- Initia L1 as DA
- default funding preset

Weave validates the exact Initia L1 requirement during broadcast, and the shortfall can vary slightly with the answers you give in the wizard. In this environment, the safe prerequisite for the verified Veil launch paths is funding at least `7 INIT` to the Initia Gas Station account before launch. If the balance is lower, the flow stops with:

```text
insufficient balance: insufficient initia balance: have <CURRENT> uinit, want <REQUIRED>
```

Practical requirement: faucet at least `7 INIT` to the Initia Gas Station address shown by `weave gas-station show`.

Useful endpoint:

- Faucet: `https://app.testnet.initia.xyz/faucet`

## 4. Launch the rollup

Start the guided launch directly:

```bash
weave rollup launch
```

If the alt-screen TUI is flaky in this remote environment, use the checked-in helper instead:

```bash
python3 scripts/launch_veil_rollup.py --chain-id veil-signal-1
```

The helper needs Python 3 plus `pexpect`. Add `--force` if you want it to remove an incomplete `~/.minitia` from a previous failed launch before retrying.

Recommended answers for Veil:

- L1 network: `Testnet (initiation-2)`
- VM: `Move`
- Rollup chain ID: `veil-signal-1` or another unique variant
- Rollup gas denom: keep the default `umin`
- Node moniker: keep the default `operator`
- Submission interval: keep the default `1m`
- Finalization period: keep the default `168h`
- Data availability: `Initia L1`
- Oracle price feed: `Enable`
- System keys: `Generate new system keys`
- Funding option: `Use the default preset`
- Fee whitelist: leave empty
- `Would you like to add the gas station account to genesis accounts?`: `Yes`
- `Specify the genesis balance for the gas station account (umin)`: `100000000`
- `Would you like to add genesis accounts?`: `No`

Why the gas-station genesis entry matters:

- the default funding preset only funds L1 system accounts
- Weave appends the system keys to rollup genesis with zero `umin`
- without a positive rollup-side publisher balance, the final `minitiad move deploy --from <publisher-key>` step will need a manual L2 transfer before it can pay gas

When the final confirmation prompt appears, confirm the transaction only after the Gas Station shows at least `7 INIT` on Initia L1.

## 5. Start the bridge infrastructure

Initialize and start the executor:

```bash
weave opinit init executor
weave opinit start executor -d
```

Initialize and start the relayer:

```bash
weave relayer init
weave relayer start -d
```

## 6. Import the Gas Station keys

Weave stores the mnemonic in its config. Import it into both keyrings:

```bash
MNEMONIC=$(jq -r '.common.gas_station.mnemonic' ~/.weave/config.json)

initiad keys add gas-station \
  --recover \
  --keyring-backend test \
  --coin-type 60 \
  --key-type eth_secp256k1 \
  --source <(echo -n "$MNEMONIC")

minitiad keys add gas-station \
  --recover \
  --keyring-backend test \
  --coin-type 60 \
  --key-type eth_secp256k1 \
  --source <(echo -n "$MNEMONIC")
```

Verify the key exists:

```bash
initiad keys list --keyring-backend test
minitiad keys list --keyring-backend test
```

## 7. Test the Move package

From the repo root:

```bash
minitiad move test --path ./move/veil_signal --test --skip-fetch-latest-git-deps
```

If you want the bytecode artifacts locally first:

```bash
minitiad move build --path ./move/veil_signal --install-dir ./move-build --named-addresses veil=0x1 --skip-fetch-latest-git-deps
```

## 8. Publish the Veil module

The commands below assume you answered `Yes` to adding `gas-station` to genesis and gave it a positive `umin` balance. If you skipped that step, fund the publisher on the rollup first or publish from another funded rollup account.

The verified publish path on bundled Minimove `v1.1.11` is a direct package publish from the funded rollup account.

Why not `deploy-object` here:

- `minitiad move deploy-object` currently fails on this toolchain with `MODULE_ADDRESS_DOES_NOT_MATCH_SENDER`
- `minitiad move deploy` succeeds as long as `veil` is compiled to the publisher's padded VM sender address

Use the exact key name you imported into `minitiad`. In this workspace that key was `GasStation`:

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

The published module address is the canonical module address for that account. In this workspace the verified address is `0xd0a2edc8bd949b24d391a400b869763221d23e65`, and that is the value now recorded in `.initia/submission.json`.

## 9. Smoke test the deployment

`init_module` is a private module initializer, so it runs automatically on publish. Start by checking that the module and state exist:

```bash
minitiad query move module <MODULE_ADDRESS> signal_arena --node http://127.0.0.1:26657
minitiad query move view-json <MODULE_ADDRESS> signal_arena module_initialized \
  --node http://127.0.0.1:26657
```

Commit one sealed signal:

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

Reveal it:

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
  --args '["u64:0","string:Consumer-heavy arenas won the week.","string:Bridge flow and creator demand turned before the leaderboard did."]' \
  --yes
```

Confirm the frontend view surface is ready:

```bash
minitiad query move view-json <MODULE_ADDRESS> signal_arena list_commitments \
  --node http://127.0.0.1:26657
```

## 10. Update the submission file

Once the publish transaction succeeds:

- set `deployed_address` to the real module address
- replace `commit_sha` with a real git commit
- replace `repo_url` with the public GitHub URL
- update `demo_video_url` once the walkthrough is uploaded

## 11. What this does not solve yet

This deployment is intentionally minimal. It proves Veil has real Move application logic and a real module address, but it does not yet replace the current local API for:

- arena creation and sponsor configuration
- full leaderboard calculation
- historical activity feed aggregation
- browser-vault to chain synchronization

Those are the next migration steps after the first publish.
