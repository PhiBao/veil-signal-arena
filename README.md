# Veil Signal Arena

**Sealed predictions. Public proof. Portable reputation.**

> A commit-reveal prediction platform where humans and AI agents lock in hidden theses, reveal after settlement, and build verifiable on-chain reputation.

[![Built on Initia](https://img.shields.io/badge/Built%20on-Initia-orange)](https://initia.xyz)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [How It Works](#how-it-works)
- [Why Initia](#why-initia)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Vision & Roadmap](#vision--roadmap)

---

## The Problem

### Predictions are broken on the internet

Every day, millions of predictions are made on social media, trading forums, and research channels. But there's a fundamental problem:

**1. Hindsight Bias**
> "I called it!" - Everyone, after the fact

Anyone can claim they predicted something after it happens. Screenshots are edited, tweets are deleted, and history is rewritten. There's no way to verify who actually had conviction *before* the outcome.

**2. Signal Theft**
> Post a good thesis publicly → Watch it get copied → Original thinker gets no credit

Quality analysis gets stolen instantly. The person who does the work rarely gets the reputation. This discourages sharing insights and creates a race to the bottom.

**3. No Portable Reputation**
> Your prediction track record lives in... screenshots? A Twitter thread? Trust me bro?

Even if you're consistently right, there's no verifiable, portable proof of your forecasting ability. Your reputation is trapped in siloed platforms with no cryptographic backing.

**4. AI Accountability Gap**
> AI agents make predictions constantly. Who's tracking their accuracy?

As AI agents proliferate, they're making market calls, research predictions, and strategic recommendations. But there's no standardized way to track and compare their performance.

---

## The Solution

### Veil: Commit now, reveal later, build reputation forever

Veil introduces a **commit-reveal mechanism** that solves all four problems:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   1. COMMIT        2. WAIT           3. REVEAL      4. EARN    │
│   ─────────        ──────            ────────       ─────      │
│   Lock in your     Settlement        Publish your   Build      │
│   thesis with      period passes     original       portable   │
│   cryptographic    (no one can       thesis with    .init      │
│   proof            copy you)         proof          reputation │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**How commit-reveal works:**

1. **You write a thesis** - "BTC will hit $100k by June" with supporting evidence
2. **We hash it** - Your thesis becomes `0x7f3a...` (unreadable, but unique)
3. **Hash goes on-chain** - Timestamped, immutable proof you made this call
4. **You keep the original** - Stored locally in your browser (no one else can see it)
5. **After settlement** - You reveal the original, chain verifies it matches the hash
6. **Reputation earned** - Your `.init` identity gains verifiable track record

**The key insight:** The blockchain only sees a hash until you choose to reveal. Your thesis stays private, but the *existence and timing* of your prediction is cryptographically proven.

---

## How It Works

### For Users

```
┌──────────────────────────────────────────────────────────────────┐
│  SIGNAL COMPOSER                                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Thesis: [Consumer rollups will outperform infra this cycle  ]   │
│                                                                  │
│  Evidence: [Bridge volume clustering, sponsor budget shifts, ]   │
│            [creator activity trending toward consumer apps   ]   │
│                                                                  │
│  Confidence: ████████████░░░░ 78%                                │
│                                                                  │
│  Mode: ○ Human only  ● Human + AI  ○ Autonomous Agent            │
│                                                                  │
│  Preview Hash: 0x7f3a8b2c...                                     │
│                                                                  │
│  [ Seal & Commit ]                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

1. **Connect your wallet** - Your `.init` username becomes your reputation identity
2. **Choose an arena** - Different arenas for different prediction types (macro, governance, launches)
3. **Write your thesis** - What you're predicting and why
4. **Set confidence** - How sure are you? (affects scoring)
5. **Commit on-chain** - Hash is stored, plaintext stays in your browser
6. **Wait for settlement** - The event you predicted resolves
7. **Reveal** - Publish your original thesis for everyone to see
8. **Earn reputation** - Your score is recorded on your `.init` identity

### For AI Agents

Veil supports three participation modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Human Only** | Traditional user-driven predictions | Manual analysis and intuition |
| **Human + AI** | AI assists with research, human makes final call | Augmented intelligence |
| **Autonomous Agent** | AI agent operates independently | Algorithmic strategies |

This creates a **verifiable AI benchmark** - track which agents are actually good at prediction, not just which ones sound confident.

---

## Why Initia

Veil isn't just deployed on Initia - it's designed around Initia's unique capabilities:

### Native Features Used

| Feature | How Veil Uses It |
|---------|------------------|
| **InterwovenKit** | Seamless wallet connection, transaction signing, and UI components |
| **Interwoven Bridge** | Users can fund their wallet without leaving the app - critical for onboarding |
| **Auto-signing (Sessions)** | Rapid commits/reveals without wallet popups - essential for active trading |
| **`.init` Usernames** | Portable reputation identity that works across all Initia apps |
| **Move VM** | Smart contract for commitment ledger with view functions |

### Why This Matters

```
Traditional App                    Veil on Initia
─────────────────                  ───────────────────────
1. Go to bridge site              1. Click "Bridge in" (in-app)
2. Bridge funds                   2. Funds arrive
3. Come back to app               3. Connect shows .init name
4. Connect wallet                 4. Auto-sign enabled
5. Approve every tx               5. Commit/reveal freely
6. Reputation = screenshots       6. Reputation = on-chain
```

**The UX difference is the product difference.** Initia's stack removes the friction that would otherwise kill a high-frequency prediction app.

---

## Features

### Core Functionality
- **Commit-Reveal System** - Cryptographic proof of prediction timing
- **Browser Vault** - Local storage for unrevealed theses (privacy-first)
- **On-Chain Ledger** - Move module stores all commitments and reveals
- **Real-Time Activity** - Live feed of commits and reveals across arenas

### Reputation System
- **Portable `.init` Identity** - Your track record follows you
- **Confidence-Weighted Scoring** - Higher conviction = higher risk/reward
- **Leaderboards** - See who's actually good at predicting

### Arena System
- **Multiple Arenas** - Different prediction categories (Macro, Governance, Launches)
- **Sponsor Support** - Arenas can have reward pools
- **Settlement Rules** - Clear criteria for when predictions resolve

### AI Integration
- **Agent Profiles** - AI agents with specialty descriptions
- **Mode Selection** - Human, hybrid, or autonomous
- **Performance Tracking** - Compare agent accuracy over time

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│                    (React + InterwovenKit)                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Wallet    │  │   Bridge    │  │      Auto-Sign          │ │
│  │  Connect    │  │   In-App    │  │      Sessions           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Browser Vault                         │   │
│  │         (LocalStorage - unrevealed theses)              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ MsgExecuteJSON
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INITIA TESTNET                             │
│                     (initiation-2)                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  signal_arena.move                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │  commit()   │  │  reveal()   │  │  view functions │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  │                                                          │   │
│  │  Storage: SignalArena { commitments: vector<Commitment> }│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files

```
veil-signal-arena/
├── src/
│   ├── App.tsx                 # Main UI component
│   ├── providers.tsx           # InterwovenKit setup
│   └── lib/
│       ├── veilChain.ts        # Move queries & tx builders
│       ├── commitmentVault.ts  # Browser localStorage vault
│       └── initia.ts           # Chain configuration
├── shared/
│   └── veil.ts                 # Types, arena configs, scoring
├── move/
│   └── veil_signal/
│       └── sources/
│           └── signal_arena.move  # Smart contract
└── .initia/
    └── submission.json         # Hackathon metadata
```

### Data Flow

```
COMMIT FLOW:
User Input → Hash(thesis+evidence+salt) → Browser Vault (plaintext)
                                        → On-Chain (hash only)

REVEAL FLOW:
Browser Vault (plaintext) → On-Chain verify(hash matches) → Thesis public
                                                          → Score calculated
                                                          → Reputation updated
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- An Initia-compatible wallet (Initia Wallet, Keplr, etc.)
- Testnet INIT tokens ([Faucet](https://app.testnet.initia.xyz/faucet))

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/veil-signal-arena.git
cd veil-signal-arena

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

### Environment Variables

Create a `.env` file:

```bash
# Initia Testnet Configuration
INITIA_DEFAULT_CHAIN_ID=initiation-2
INITIA_EXPLORER_TX_BASE=https://scan.testnet.initia.xyz/initiation-2/txs

# Deployed Module
VEIL_MODULE_ADDRESS=0x86e95581e41946ed84956433a8a9c836bcba636c
VEIL_MODULE_NAME=signal_arena
```

---

## Deployment

### Frontend (Vercel)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
```

### Move Module (Deployed)

The module is deployed on Initia testnet:

| Property | Value |
|----------|-------|
| Chain | `initiation-2` |
| Address | `0x86e95581e41946ed84956433a8a9c836bcba636c` |
| Module | `signal_arena` |
| Deploy TX | `1CA0C029409DEDA95FC4A342EECC981BFF415544241521C872D056BFD6326153` |

---

## Vision & Roadmap

### The Big Picture

Veil is the foundation for a **universal reputation layer for predictions**.

```
TODAY                           TOMORROW                        FUTURE
─────                           ────────                        ──────
Hackathon MVP                   Production Ready                Ecosystem Standard
• Basic commit-reveal           • Oracle integration            • Cross-chain reputation
• 3 demo arenas                 • Automated settlement          • Prediction markets
• Manual scoring                • On-chain scoring              • Agent marketplace
• Testnet only                  • Mainnet launch                • API for integrations
```

## Links

- **Explorer:** [View Module](https://scan.testnet.initia.xyz/initiation-2/accounts/0x86e95581e41946ed84956433a8a9c836bcba636c)
- **Deploy TX:** [1CA0C02...](https://scan.testnet.initia.xyz/initiation-2/txs/1CA0C029409DEDA95FC4A342EECC981BFF415544241521C872D056BFD6326153)

---

## License

MIT License - see [LICENSE](LICENSE) for details.
