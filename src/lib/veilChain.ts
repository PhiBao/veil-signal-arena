import { MsgExecuteJSON } from '@initia/initia.proto/initia/move/v1/tx'
import { InitiaAddress, createMoveClient } from '@initia/utils'
import {
  ARENA_CONFIGS,
  INITIAL_AGENTS,
  ROUTE_LABELS,
  buildArenasFromConfig,
  buildLeaderboardDelta,
  buildSeedLeaderboards,
  createSeedActivity,
  formatPublicHandle,
  scoreCommitment,
  type ActivityItem,
  type Arena,
  type CommitmentRecord,
  type LeaderboardEntry,
  type RouteMode,
  type VeilBootstrap,
} from '../../shared/veil.ts'
import {
  VEIL_CHAIN_ID,
  VEIL_MODULE_ADDRESS,
  VEIL_MODULE_NAME,
  VEIL_NETWORK,
  VEIL_REGISTRY_URL,
  VEIL_REST_URL,
} from './initia.ts'

type RegistryApiEntry = {
  address?: string
}

type RegistryChain = {
  chain_id?: string
  apis?: {
    rest?: RegistryApiEntry[]
  }
}

type RawOnchainCommitment = {
  id?: unknown
  owner?: unknown
  arena_id?: unknown
  route_mode?: unknown
  commitment_hash?: unknown
  confidence?: unknown
  created_at_secs?: unknown
  revealed_at_secs?: unknown
  revealed?: unknown
  thesis?: unknown
  evidence?: unknown
}

export const VEIL_MOVE_EXECUTE_JSON_TYPE_URL = '/initia.move.v1.MsgExecuteJSON'

let restUrlPromise: Promise<string> | null = null

function getEmptyBootstrap(): VeilBootstrap {
  const arenas = buildArenasFromConfig()
  return {
    arenas,
    agents: INITIAL_AGENTS,
    activity: createSeedActivity(),
    leaderboards: buildSeedLeaderboards(arenas),
    userCommitments: [],
    stats: {
      totalCommitted: 0,
      totalRevealed: 0,
      activeArenas: arenas.length,
      connectedSignalers: 0,
    },
    runtime: {
      moduleReady: false,
      chainId: VEIL_CHAIN_ID,
      network: VEIL_NETWORK,
      liveAnchors: true,
      moduleAddress: VEIL_MODULE_ADDRESS || null,
      moduleName: VEIL_MODULE_NAME,
    },
  }
}

function pickFirstAddress(entries?: RegistryApiEntry[]) {
  return entries?.find((entry) => entry.address)?.address || ''
}

async function resolveRestUrl() {
  if (VEIL_REST_URL) {
    return VEIL_REST_URL
  }

  if (!restUrlPromise) {
    restUrlPromise = (async () => {
      const response = await fetch(`${VEIL_REGISTRY_URL.replace(/\/$/, '')}/chains.json`)
      const chains = (await response.json()) as RegistryChain[]
      const chain = chains.find((candidate) => candidate.chain_id === VEIL_CHAIN_ID)
      const restUrl = pickFirstAddress(chain?.apis?.rest)

      if (!restUrl) {
        throw new Error(
          `Missing rest URL for ${VEIL_CHAIN_ID}. Set VEIL_REST_URL to query the Veil module directly.`,
        )
      }

      return restUrl
    })()
  }

  return restUrlPromise
}

function unwrapOption(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined
  }

  if (Array.isArray(value)) {
    return value.length ? unwrapOption(value[0]) : undefined
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>

    if ('vec' in record && Array.isArray(record.vec)) {
      return record.vec.length ? unwrapOption(record.vec[0]) : undefined
    }

    if ('value' in record) {
      return unwrapOption(record.value)
    }

    if ('some' in record) {
      return unwrapOption(record.some)
    }

    if ('inner' in record) {
      return unwrapOption(record.inner)
    }
  }

  return value
}

function coerceString(value: unknown, fallback = '') {
  const unwrapped = unwrapOption(value)
  return typeof unwrapped === 'string' ? unwrapped : fallback
}

function coerceNumber(value: unknown, fallback = 0) {
  const unwrapped = unwrapOption(value)

  if (typeof unwrapped === 'number') {
    return Number.isFinite(unwrapped) ? unwrapped : fallback
  }

  if (typeof unwrapped === 'string') {
    const parsed = Number(unwrapped)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

function coerceBoolean(value: unknown) {
  const unwrapped = unwrapOption(value)

  if (typeof unwrapped === 'boolean') {
    return unwrapped
  }

  if (typeof unwrapped === 'string') {
    return unwrapped === 'true'
  }

  return false
}

function normalizeRouteMode(value: unknown): RouteMode {
  const candidate = coerceString(value)
  return candidate === 'human' || candidate === 'hybrid' || candidate === 'agent'
    ? candidate
    : 'hybrid'
}

function normalizeInitiaAddress(value: string) {
  try {
    return InitiaAddress(value, 32).bech32
  } catch {
    return value
  }
}

function sameInitiaAddress(left: string, right: string) {
  try {
    return InitiaAddress(left, 32).bech32 === InitiaAddress(right, 32).bech32
  } catch {
    return left === right
  }
}

function toIsoTimestamp(secondsValue: unknown) {
  const seconds = coerceNumber(secondsValue)
  return new Date(seconds * 1000).toISOString()
}

function normalizeCommitment(
  raw: RawOnchainCommitment,
  viewerInitiaAddress?: string,
  viewerUsername?: string | null,
): CommitmentRecord {
  const owner = normalizeInitiaAddress(coerceString(raw.owner))
  const routeMode = normalizeRouteMode(raw.route_mode)
  const revealed = coerceBoolean(raw.revealed)
  const revealedAt = unwrapOption(raw.revealed_at_secs)
  const thesis = coerceString(raw.thesis, '').trim() || undefined
  const evidence = coerceString(raw.evidence, '').trim() || undefined
  const commitmentHash = coerceString(raw.commitment_hash)
  const confidence = coerceNumber(raw.confidence)
  const score = revealed ? scoreCommitment(commitmentHash, confidence, routeMode) : undefined

  return {
    id: `onchain-${coerceString(raw.id, String(coerceNumber(raw.id)))}`,
    arenaId: coerceString(raw.arena_id),
    routeMode,
    confidence,
    commitmentHash,
    initiaAddress: owner,
    evmAddress: null,
    username:
      viewerInitiaAddress && viewerUsername && sameInitiaAddress(owner, viewerInitiaAddress)
        ? viewerUsername
        : null,
    createdAt: toIsoTimestamp(raw.created_at_secs),
    revealedAt: revealedAt === undefined ? undefined : toIsoTimestamp(revealedAt),
    thesis,
    evidence,
    score,
    status: revealed ? 'revealed' : 'committed',
  }
}

function buildArenaRuntime(commitments: CommitmentRecord[]): Arena[] {
  return buildArenasFromConfig().map((arena) => {
    const participants = new Set(
      commitments
        .filter((commitment) => commitment.arenaId === arena.id)
        .map((commitment) => commitment.initiaAddress),
    ).size

    return {
      ...arena,
      participants,
    }
  })
}

function buildLeaderboards(commitments: CommitmentRecord[]) {
  return ARENA_CONFIGS.reduce<Record<string, LeaderboardEntry[]>>((accumulator, arena) => {
    accumulator[arena.id] = commitments
      .filter(
        (commitment) =>
          commitment.arenaId === arena.id &&
          commitment.status === 'revealed' &&
          Boolean(commitment.thesis),
      )
      .map((commitment) => {
        const score =
          commitment.score ??
          scoreCommitment(
            commitment.commitmentHash,
            commitment.confidence,
            commitment.routeMode,
          )

        return {
          id: commitment.id,
          name: formatPublicHandle(commitment.username, commitment.initiaAddress),
          badge: ROUTE_LABELS[commitment.routeMode],
          score,
          delta: buildLeaderboardDelta(score),
          note: commitment.thesis!,
        }
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 10)

    return accumulator
  }, {})
}

function buildActivity(commitments: CommitmentRecord[]): ActivityItem[] {
  const arenas = buildArenasFromConfig()
  const items = commitments.flatMap<ActivityItem>((commitment) => {
    const arena = arenas.find((candidate) => candidate.id === commitment.arenaId)
    const handle = formatPublicHandle(commitment.username, commitment.initiaAddress)
    const commitItem: ActivityItem = {
      id: `${commitment.id}-commit`,
      tone: 'commit',
      message: `${handle} sealed a hidden call inside ${arena?.title ?? commitment.arenaId}.`,
      createdAt: commitment.createdAt,
    }

    if (commitment.status !== 'revealed' || !commitment.revealedAt) {
      return [commitItem]
    }

    const revealItem: ActivityItem = {
      id: `${commitment.id}-reveal`,
      tone: 'reveal',
      message: `${handle} revealed a thesis in ${arena?.title ?? commitment.arenaId}.`,
      createdAt: commitment.revealedAt,
    }

    return [commitItem, revealItem]
  })

  return items
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, 24)
}

function buildStats(commitments: CommitmentRecord[]) {
  return {
    totalCommitted: commitments.length,
    totalRevealed: commitments.filter((commitment) => commitment.status === 'revealed').length,
    activeArenas: ARENA_CONFIGS.length,
    connectedSignalers: new Set(
      commitments.map((commitment) => commitment.initiaAddress),
    ).size,
  }
}

export async function fetchVeilBootstrap(
  viewerInitiaAddress?: string,
  viewerUsername?: string | null,
): Promise<VeilBootstrap> {
  const fallback = getEmptyBootstrap()

  if (!VEIL_MODULE_ADDRESS) {
    return fallback
  }

  try {
    const moveClient = createMoveClient(await resolveRestUrl())
    const moduleReady = await moveClient.viewFunction<boolean>({
      moduleAddress: VEIL_MODULE_ADDRESS,
      moduleName: VEIL_MODULE_NAME,
      functionName: 'module_initialized',
    })

    if (!moduleReady) {
      return {
        ...fallback,
        runtime: {
          ...fallback.runtime,
          moduleReady: false,
        },
      }
    }

    const rawCommitments = await moveClient.viewFunction<RawOnchainCommitment[]>({
      moduleAddress: VEIL_MODULE_ADDRESS,
      moduleName: VEIL_MODULE_NAME,
      functionName: 'list_commitments',
    })

    const commitments = rawCommitments
      .map((commitment) =>
        normalizeCommitment(commitment, viewerInitiaAddress, viewerUsername),
      )
      .filter((commitment) => Boolean(commitment.arenaId) && Boolean(commitment.commitmentHash))
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )

    return {
      arenas: buildArenaRuntime(commitments),
      agents: INITIAL_AGENTS,
      activity: buildActivity(commitments),
      leaderboards: buildLeaderboards(commitments),
      userCommitments: viewerInitiaAddress
        ? commitments.filter((commitment) =>
            sameInitiaAddress(commitment.initiaAddress, viewerInitiaAddress),
          )
        : [],
      stats: buildStats(commitments),
      runtime: {
        moduleReady: true,
        chainId: VEIL_CHAIN_ID,
        network: VEIL_NETWORK,
        liveAnchors: true,
        moduleAddress: VEIL_MODULE_ADDRESS,
        moduleName: VEIL_MODULE_NAME,
      },
    }
  } catch (error) {
    console.error('fetchVeilBootstrap failed:', error)
    // If we have a configured module address, be optimistic and assume it's ready.
    // The on-chain transaction will fail naturally if the module is truly missing.
    return {
      ...fallback,
      runtime: {
        ...fallback.runtime,
        moduleReady: Boolean(VEIL_MODULE_ADDRESS),
        moduleAddress: VEIL_MODULE_ADDRESS || null,
      },
    }
  }
}

export function buildCommitMessage(
  sender: string,
  payload: {
    arenaId: string
    routeMode: RouteMode
    commitmentHash: string
    confidence: number
  },
) {
  return {
    typeUrl: VEIL_MOVE_EXECUTE_JSON_TYPE_URL,
    value: MsgExecuteJSON.fromPartial({
      sender,
      moduleAddress: VEIL_MODULE_ADDRESS,
      moduleName: VEIL_MODULE_NAME,
      functionName: 'commit',
      typeArgs: [],
      args: [
        JSON.stringify(payload.arenaId),
        JSON.stringify(payload.routeMode),
        JSON.stringify(payload.commitmentHash),
        JSON.stringify(String(payload.confidence)),
      ],
    }),
  }
}

export function buildRevealMessage(
  sender: string,
  payload: {
    commitmentId: string
    thesis: string
    evidence: string
  },
) {
  return {
    typeUrl: VEIL_MOVE_EXECUTE_JSON_TYPE_URL,
    value: MsgExecuteJSON.fromPartial({
      sender,
      moduleAddress: VEIL_MODULE_ADDRESS,
      moduleName: VEIL_MODULE_NAME,
      functionName: 'reveal',
      typeArgs: [],
      args: [
        JSON.stringify(payload.commitmentId.replace(/^onchain-/, '')),
        JSON.stringify(payload.thesis),
        JSON.stringify(payload.evidence),
      ],
    }),
  }
}

export const veilProtoTypes: [string, typeof MsgExecuteJSON][] = [
  [VEIL_MOVE_EXECUTE_JSON_TYPE_URL, MsgExecuteJSON],
]
