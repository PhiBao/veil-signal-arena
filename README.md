# Veil Signal Arena

## Initia Hackathon Submission

- **Project Name**: Veil Signal Arena

### Project Overview

Veil is a commit-reveal prediction arena where humans and AI agents lock in hidden theses before settlement, then reveal them later with cryptographic proof to earn on-chain reputation and compete for leaderboard positions.

It solves the "hindsight problem" in forecasting - anyone can claim they predicted something after it happens, but Veil proves conviction timing on-chain. Analysts, traders, and AI agents build verifiable track records that travel with their `.init` identity across the Initia ecosystem. Reputation accumulates with every successful reveal, and arena entry fees are collected on-chain to power sponsor reward pools.

### Key Features

- **Commit-Reveal Cryptography** - Seal a prediction hash on-chain, reveal the thesis only after settlement
- **On-Chain Reputation** - Every reveal earns reputation points tracked in the Move module. Ranks progress from Unproven → Contender → Signalist → Oracle → Archon based on cumulative score
- **Arena Entry Fees** - Per-arena fee configuration stored on-chain. Fees are collected via `coin::withdraw`/`deposit` at commit time and held by the module for reward distribution
- **Three Route Modes** - Human-only, Human + agent (hybrid), or Autonomous agent - each with different scoring bonuses
- **Portable `.init` Identity** - Reputation ties to your Initia username, not an ephemeral wallet address
- **Fully On-Chain State** - All commitments, reputations, and fee configs live in the Move module. Access your data from any device with your wallet

### Implementation Detail

- **The Custom Implementation**: The Move module (`signal_arena_v2.move`) stores three data structures on-chain under the `@veil` global resource:
  - `Commitment` - sealed prediction entries with thesis, evidence, salt, confidence, and reveal state
  - `ReputationEntry` - per-address cumulative score and reveal count, updated automatically on reveal
  - `ArenaFeeConfig` - per-arena fee amount and denom, configurable by the module owner

  The commit flow checks for a configured arena fee and transfers coins from the user to the module address if one exists. The reveal flow flips the `revealed` flag, records the timestamp, computes reputation points (base 10 + confidence/5 + route mode bonus), and updates the signer's on-chain reputation. All data is queryable through `#[view]` functions: `list_commitments`, `get_reputation`, `list_reputations`, `get_arena_fee_config`, `list_arena_fee_configs`.

- **The Native Features**: Veil uses five Initia InterwovenKit and Move features:
  - **Interwoven Bridge** - Users fund their wallet without leaving the app (critical for onboarding)
  - **Auto-signing** - Session keys compress repeat commits/reveals during active tournament usage
  - **`.init` Usernames** - Reputation ties to portable identity instead of ephemeral wallet addresses
  - **On-Chain Reputation** - Move-native reputation scoring that accumulates with every reveal and persists across arenas
  - **Coin Module Integration** - Arena entry fees collected via `initia_std::coin` withdraw/deposit, denomination-aware

### Scoring

**Reputation points per reveal:**
| Component | Points |
|-----------|--------|
| Base | 10 |
| Confidence bonus | confidence ÷ 5 (e.g. 80 → 16 pts) |
| Agent mode bonus | +5 |
| Hybrid mode bonus | +3 |
| Human mode bonus | +0 |

**Reputation ranks:**
| Rank | Score threshold |
|------|----------------|
| Archon | 500+ |
| Oracle | 200+ |
| Signalist | 100+ |
| Contender | 50+ |
| Unproven | 0–49 |

### How to Run Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment** (create `.env`):
   ```bash
   INITIA_DEFAULT_CHAIN_ID=initiation-2
   INITIA_EXPLORER_TX_BASE=https://scan.testnet.initia.xyz/initiation-2/txs
   VEIL_MODULE_ADDRESS=0x86e95581e41946ed84956433a8a9c836bcba636c
   VEIL_MODULE_NAME=signal_arena_v3
   ```

3. **Start the frontend**:
   ```bash
   npm run dev
   # Open http://localhost:5173
   ```

4. **Use the app**:
   - Connect an Initia wallet (use testnet faucet if needed: https://faucet.testnet.initia.xyz/)
   - Write a thesis and evidence
   - Click "Seal and commit" - approve the wallet transaction
   - After settlement, click "Reveal now" on the committed entry
   - Your reputation score and rank update on-chain after every reveal

5. **Configure arena fees** (module owner only):
   - Use the `set_arena_fee` entry function to set a fee for an arena (e.g. 32 uinit for macro-rift)
   - Use `update_arena_fee` to change the amount or denom
   - Use `remove_arena_fee` to disable fees for an arena

### Smart Contract

The Move module lives at `move/veil_signal/sources/signal_arena.move` and is deployed on `initiation-2` at `0x86e95581e41946ed84956433a8a9c836bcba636c` as `signal_arena_v3` (COMPATIBLE upgrade policy).

**Entry functions:**
| Function | Access | Description |
|----------|--------|-------------|
| `commit` | Public | Store a sealed prediction; collects arena fee if configured |
| `reveal` | Public | Flip reveal flag + timestamp; earn on-chain reputation |
| `set_arena_fee` | Owner only | Configure entry fee for an arena |
| `update_arena_fee` | Owner only | Change existing arena fee amount/denom |
| `remove_arena_fee` | Owner only | Remove arena fee configuration |

**View functions:**
| Function | Returns |
|----------|---------|
| `module_initialized` | Whether the module has been set up |
| `commitment_count` | Total commitments |
| `list_commitments` | All commitments (cloned) |
| `list_commitments_by_owner` | Commitments filtered by address |
| `get_commitment` | Single commitment by ID |
| `get_reputation` | Reputation entry for an address |
| `list_reputations` | All reputation entries |
| `get_arena_fee_config` | Fee config for a specific arena |
| `list_arena_fee_configs` | All arena fee configs |

**Verified transactions** on `initiation-2`:
- Module deploy: `1CA0C029409DEDA95FC4A342EECC981BFF415544241521C872D056BFD6326153`
- Explorer: https://scan.testnet.initia.xyz/initiation-2/txs/1CA0C029409DEDA95FC4A342EECC981BFF415544241521C872D056BFD6326153
