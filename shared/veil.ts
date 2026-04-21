export type RouteMode = 'human' | 'hybrid' | 'agent'

export type LeaderboardEntry = {
  id?: string
  name: string
  badge: string
  score: number
  delta: string
  note: string
  txHash?: string
}

export type Arena = {
  id: string
  track: string
  title: string
  summary: string
  longform: string
  sponsor: string
  rewardPool: string
  participants: number
  entryFee: number
  commitDeadline: string
  settlementRule: string
  initiaHook: string
  tags: string[]
  leaderboard: LeaderboardEntry[]
}

export type AgentProfile = {
  id: string
  arenaId: string
  name: string
  specialty: string
  mode: string
  accuracy: string
  fee: string
}

export type ActivityTone = 'commit' | 'reveal' | 'system'

export type ActivityItem = {
  id: string
  tone: ActivityTone
  message: string
  createdAt: string
}

export type CommitmentStatus = 'committed' | 'revealed'

export type CommitmentRecord = {
  id: string
  arenaId: string
  routeMode: RouteMode
  confidence: number
  commitmentHash: string
  initiaAddress: string
  evmAddress: string | null
  username: string | null
  commitTxHash?: string
  revealTxHash?: string
  createdAt: string
  revealedAt?: string
  thesis?: string
  evidence?: string
  score?: number
  status: CommitmentStatus
}

export type CommitPayload = {
  arenaId: string
  routeMode: RouteMode
  thesis: string
  evidence: string
  confidence: number
  salt: string
  initiaAddress: string
}

export type CommitRequest = {
  id: string
  arenaId: string
  routeMode: RouteMode
  confidence: number
  commitmentHash: string
  initiaAddress: string
  evmAddress: string | null
  username: string | null
  commitTxHash: string
}

export type RevealRequest = {
  commitmentId: string
  initiaAddress: string
  thesis: string
  evidence: string
  salt: string
  revealTxHash: string
}

export type VeilBootstrap = {
  arenas: Arena[]
  agents: AgentProfile[]
  activity: ActivityItem[]
  leaderboards: Record<string, LeaderboardEntry[]>
  userCommitments: CommitmentRecord[]
  stats: {
    totalCommitted: number
    totalRevealed: number
    activeArenas: number
    connectedSignalers: number
  }
  runtime: {
    moduleReady: boolean
    chainId: string
    network: 'testnet'
    liveAnchors: boolean
    moduleAddress: string | null
    moduleName: string
  }
}

export const ROUTE_LABELS: Record<RouteMode, string> = {
  human: 'Human only',
  hybrid: 'Human + agent',
  agent: 'Autonomous agent',
}

// Arena configuration with dynamic deadlines
// commitDeadlineTs is a Unix timestamp (ms) for the commit window end
// If not set, arena is always open for commits
export type ArenaConfig = Omit<Arena, 'commitDeadline' | 'leaderboard' | 'participants'> & {
  commitDeadlineTs: number | null
}

// Helper to calculate remaining time string from timestamp
export function formatDeadline(deadlineTs: number | null): string {
  if (!deadlineTs) return 'Always open'

  const now = Date.now()
  const remaining = deadlineTs - now

  if (remaining <= 0) return 'Commit window closed'

  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `Commit window ends in ${days}d ${hours % 24}h`
  }

  return `Commit window ends in ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`
}

// Arena definitions - deadlines are now timestamps, participants derived from chain
export const ARENA_CONFIGS: ArenaConfig[] = [
  {
    id: 'macro-rift',
    track: 'AI & Tooling',
    title: 'Macro Rift',
    summary: 'Hidden macro calls from humans and agents, settled after the weekly close.',
    longform:
      'Macro Rift is the flagship arena for Veil. Contenders seal directional theses about market rotation before anyone else can react publicly. After settlement, they reveal the thesis and evidence pack to earn score, sponsor rewards, and portable `.init` reputation.',
    sponsor: 'Northstar Research Syndicate',
    rewardPool: '4800 INIT',
    entryFee: 32,
    commitDeadlineTs: null, // Always open for hackathon demo
    settlementRule: 'Friday close vs 7D VWAP',
    initiaHook:
      'Session signing compresses commit and reveal into a low-friction loop even during high-frequency tournaments.',
    tags: ['Sealed forecast', 'Agent battle', '.init reputation'],
  },
  {
    id: 'governor-shadow',
    track: 'DeFi',
    title: 'Governor Shadow',
    summary: 'Private treasury memos that reveal only once DAO votes settle.',
    longform:
      'Governor Shadow turns governance into a performance arena. Analysts and agents submit sealed treasury calls before a proposal vote finishes. This lets communities identify who consistently sees governance outcomes early without leaking the alpha during deliberation.',
    sponsor: 'House Meridian',
    rewardPool: '3100 INIT',
    entryFee: 55,
    commitDeadlineTs: null, // Always open for hackathon demo
    settlementRule: 'Forum vote plus onchain tally confirmation',
    initiaHook:
      'Arena fees stay inside the appchain while `.init` identity makes pseudonymous analysts portable across communities.',
    tags: ['Private governance', 'Squad scoring', 'Revenue-first'],
  },
  {
    id: 'launch-echo',
    track: 'Gaming',
    title: 'Launch Echo',
    summary: 'Creator and launch predictions that settle after traffic and retention land.',
    longform:
      'Launch Echo is the sponsor-ready consumer variant: creators, communities, and AI copilots all post hidden launch picks before a release. Once retention and volume settle, Veil reveals who actually had the right instinct before the feed was flooded with hindsight.',
    sponsor: 'Mirage Capsule Studio',
    rewardPool: '2600 INIT',
    entryFee: 18,
    commitDeadlineTs: null, // Always open for hackathon demo
    settlementRule: '24h retention and creator GMV threshold',
    initiaHook:
      'Bridge-in onboarding keeps creator fans out of bridge mazes, while sponsor rakes remain app-owned revenue.',
    tags: ['Creator arenas', 'Fast onboarding', 'Sponsored reveals'],
  },
]

// Build runtime arenas from config (participants will be overwritten from chain data)
export function buildArenasFromConfig(configs: ArenaConfig[] = ARENA_CONFIGS): Arena[] {
  return configs.map((config) => ({
    ...config,
    commitDeadline: formatDeadline(config.commitDeadlineTs),
    participants: 0,
    leaderboard: [],
  }))
}

export const INITIAL_ARENAS: Arena[] = buildArenasFromConfig()

// Agent profiles - these represent AI agents that can participate in arenas
// In production, these would be registered on-chain with verifiable track records
export const INITIAL_AGENTS: AgentProfile[] = [
  {
    id: 'oracle-7',
    arenaId: 'macro-rift',
    name: 'Oracle-7',
    specialty: 'Cross-rollup macro scanner tuned for flow divergence and momentum breakouts.',
    mode: 'Autonomous commit mode',
    accuracy: 'Track record pending',
    fee: '0.8 INIT / call',
  },
  {
    id: 'quietmint',
    arenaId: 'governor-shadow',
    name: 'QuietMint',
    specialty: 'Governance analyst agent trained on turnout shifts, delegate drift, and late-vote flips.',
    mode: 'Private memo mode',
    accuracy: 'Track record pending',
    fee: '1.2 INIT / memo',
  },
  {
    id: 'gamma-owl',
    arenaId: 'launch-echo',
    name: 'Gamma Owl',
    specialty: 'Launch watcher tuned for creator retention, social velocity, and bridge conversion.',
    mode: 'Launch copilot mode',
    accuracy: 'Track record pending',
    fee: '0.5 INIT / reveal',
  },
  {
    id: 'delta-noir',
    arenaId: 'macro-rift',
    name: 'Delta Noir',
    specialty: 'Contrarian signal hunter that flags consensus fatigue before momentum cracks.',
    mode: 'Human + agent pairing',
    accuracy: 'Track record pending',
    fee: '0.9 INIT / brief',
  },
  {
    id: 'satin-loop',
    arenaId: 'launch-echo',
    name: 'Satin Loop',
    specialty: 'Creator economy copilot focused on audience overlap and high-intent buyer cohorts.',
    mode: 'Reveal summarizer',
    accuracy: 'Track record pending',
    fee: '0.4 INIT / arena',
  },
  {
    id: 'vector-house',
    arenaId: 'governor-shadow',
    name: 'Vector House',
    specialty: 'Private treasury strategist that turns vote forecasts into sponsor-ready memos.',
    mode: 'Analyst assist mode',
    accuracy: 'Track record pending',
    fee: '1.1 INIT / dossier',
  },
]

export function buildSeedLeaderboards(arenas: Arena[] = INITIAL_ARENAS) {
  return arenas.reduce<Record<string, LeaderboardEntry[]>>((accumulator, arena) => {
    accumulator[arena.id] = []
    return accumulator
  }, {})
}

// Returns empty activity when no on-chain activity exists yet
// All activity is now derived from on-chain commitments and reveals
export function createSeedActivity(_baseDate = new Date()): ActivityItem[] {
  return []
}

export function serializeCommitmentPayload(payload: CommitPayload) {
  return JSON.stringify({
    arenaId: payload.arenaId,
    routeMode: payload.routeMode,
    thesis: payload.thesis.trim(),
    evidence: payload.evidence.trim(),
    confidence: payload.confidence,
    salt: payload.salt,
    initiaAddress: payload.initiaAddress,
  })
}

/**
 * Calculate score for a revealed commitment.
 *
 * Scoring formula:
 * - Base score derived from commitment hash entropy (deterministic per commitment)
 * - Confidence bonus: higher confidence = higher risk/reward
 * - Route mode bonus: agent automation gets slight boost for consistency
 *
 * In production, this would incorporate:
 * - Actual outcome verification via oracle
 * - Time-weighted accuracy over multiple reveals
 * - Stake amount considerations
 */
export function scoreCommitment(
  commitmentHash: string,
  confidence: number,
  routeMode: RouteMode,
) {
  // Deterministic base from hash (ensures same commitment always scores same)
  const hashBytes = commitmentHash.replace(/^0x/, '').slice(0, 8)
  const seed = Number.parseInt(hashBytes, 16) || 0

  // Base score 50-75 range from hash entropy
  const base = 50 + (seed % 26)

  // Confidence bonus: 0-14 points based on stated confidence
  const confidenceBoost = Math.round((confidence / 100) * 14)

  // Route mode bonus: slight edge for automated/hybrid execution
  const routeBoost = routeMode === 'agent' ? 6 : routeMode === 'hybrid' ? 3 : 0

  return Math.min(99, base + confidenceBoost + routeBoost)
}

export function buildLeaderboardDelta(score: number) {
  return `+${Math.max(4, Math.round((score - 68) / 3))}`
}

export function truncateAddress(value: string) {
  if (!value) {
    return 'unknown'
  }

  return `${value.slice(0, 10)}...${value.slice(-6)}`
}

export function formatPublicHandle(username: string | null | undefined, fallbackAddress: string) {
  if (username?.trim()) {
    return username.startsWith('@') ? username : `@${username}`
  }

  return truncateAddress(fallbackAddress)
}

export function leaderboardEntryFromCommitment(
  commitment: CommitmentRecord & { thesis: string; score: number },
): LeaderboardEntry {
  return {
    id: commitment.id,
    name: formatPublicHandle(commitment.username, commitment.initiaAddress),
    badge: ROUTE_LABELS[commitment.routeMode],
    score: commitment.score,
    delta: buildLeaderboardDelta(commitment.score),
    note: commitment.thesis,
    txHash: commitment.revealTxHash,
  }
}
