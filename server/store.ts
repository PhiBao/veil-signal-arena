import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  INITIAL_AGENTS,
  INITIAL_ARENAS,
  buildSeedLeaderboards,
  createSeedActivity,
  leaderboardEntryFromCommitment,
  scoreCommitment,
  serializeCommitmentPayload,
  type ActivityItem,
  type CommitPayload,
  type CommitRequest,
  type CommitmentRecord,
  type RevealRequest,
  type VeilBootstrap,
} from '../shared/veil.ts'

type VeilStore = {
  commitments: CommitmentRecord[]
  activity: ActivityItem[]
}

const RUNTIME_FILE = resolve(process.cwd(), 'server/data/runtime.json')

function createEmptyStore(): VeilStore {
  return {
    commitments: [],
    activity: createSeedActivity(new Date()),
  }
}

async function ensureStore() {
  await mkdir(dirname(RUNTIME_FILE), { recursive: true })

  try {
    await readFile(RUNTIME_FILE, 'utf8')
  } catch {
    await writeFile(RUNTIME_FILE, JSON.stringify(createEmptyStore(), null, 2))
  }
}

async function readStore(): Promise<VeilStore> {
  await ensureStore()

  const contents = await readFile(RUNTIME_FILE, 'utf8')
  return JSON.parse(contents) as VeilStore
}

async function writeStore(store: VeilStore) {
  await writeFile(RUNTIME_FILE, JSON.stringify(store, null, 2))
}

function sortCommitmentsByNewest(commitments: CommitmentRecord[]) {
  return [...commitments].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )
}

function appendActivity(
  activity: ActivityItem[],
  tone: ActivityItem['tone'],
  message: string,
) {
  return [
    {
      id: randomUUID(),
      tone,
      message,
      createdAt: new Date().toISOString(),
    },
    ...activity,
  ].slice(0, 24)
}

function buildLeaderboards(commitments: CommitmentRecord[]) {
  const leaderboards = buildSeedLeaderboards()

  for (const commitment of commitments) {
    if (
      commitment.status !== 'revealed' ||
      !commitment.thesis ||
      commitment.score === undefined
    ) {
      continue
    }

    const entry = leaderboardEntryFromCommitment({
      ...commitment,
      thesis: commitment.thesis,
      score: commitment.score,
    })

    const existing = leaderboards[commitment.arenaId] ?? []
    leaderboards[commitment.arenaId] = [entry, ...existing]
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
  }

  return leaderboards
}

function buildStats(commitments: CommitmentRecord[]) {
  const uniqueSignalers = new Set(commitments.map((commitment) => commitment.initiaAddress))

  return {
    totalCommitted: commitments.length,
    totalRevealed: commitments.filter((commitment) => commitment.status === 'revealed')
      .length,
    activeArenas: INITIAL_ARENAS.length,
    connectedSignalers: uniqueSignalers.size,
  }
}

function hashCommitmentPayload(payload: CommitPayload) {
  return createHash('sha256').update(serializeCommitmentPayload(payload)).digest('hex')
}

function requireArena(arenaId: string) {
  const arena = INITIAL_ARENAS.find((candidate) => candidate.id === arenaId)

  if (!arena) {
    throw new Error(`Unknown arena: ${arenaId}`)
  }

  return arena
}

export async function getBootstrap(initiaAddress?: string): Promise<VeilBootstrap> {
  const store = await readStore()
  const commitments = sortCommitmentsByNewest(store.commitments)

  return {
    arenas: INITIAL_ARENAS,
    agents: INITIAL_AGENTS,
    activity: store.activity,
    leaderboards: buildLeaderboards(store.commitments),
    userCommitments: initiaAddress
      ? commitments.filter((commitment) => commitment.initiaAddress === initiaAddress)
      : [],
    reputations: [],
    arenaFees: {},
    stats: buildStats(store.commitments),
    runtime: {
      moduleReady: false,
      chainId: process.env.INITIA_DEFAULT_CHAIN_ID ?? 'initiation-2',
      network: 'testnet',
      liveAnchors: true,
      moduleAddress: null,
      moduleName: 'signal_arena',
    },
  }
}

export async function createCommitment(request: CommitRequest) {
  requireArena(request.arenaId)

  if (!request.commitmentHash || !request.initiaAddress || !request.commitTxHash) {
    throw new Error('Missing required commit fields')
  }

  const store = await readStore()

  if (store.commitments.some((commitment) => commitment.id === request.id)) {
    throw new Error('Commitment already exists')
  }

  const nextCommitment: CommitmentRecord = {
    id: request.id,
    arenaId: request.arenaId,
    routeMode: request.routeMode,
    confidence: request.confidence,
    commitmentHash: request.commitmentHash,
    initiaAddress: request.initiaAddress,
    evmAddress: request.evmAddress,
    username: request.username,
    commitTxHash: request.commitTxHash,
    createdAt: new Date().toISOString(),
    status: 'committed',
  }

  const arena = requireArena(request.arenaId)
  const updatedStore: VeilStore = {
    commitments: [nextCommitment, ...store.commitments],
    activity: appendActivity(
      store.activity,
      'commit',
      `${request.username ? `@${request.username}` : 'A signaler'} sealed a hidden call inside ${arena.title}.`,
    ),
  }

  await writeStore(updatedStore)
  return nextCommitment
}

export async function revealCommitment(request: RevealRequest) {
  if (!request.commitmentId || !request.initiaAddress || !request.revealTxHash) {
    throw new Error('Missing required reveal fields')
  }

  const store = await readStore()
  const commitmentIndex = store.commitments.findIndex(
    (commitment) => commitment.id === request.commitmentId,
  )

  if (commitmentIndex < 0) {
    throw new Error('Commitment not found')
  }

  const commitment = store.commitments[commitmentIndex]

  if (commitment.status === 'revealed') {
    throw new Error('Commitment already revealed')
  }

  if (commitment.initiaAddress !== request.initiaAddress) {
    throw new Error('Reveal signer did not match commitment owner')
  }

  const revealPayload: CommitPayload = {
    arenaId: commitment.arenaId,
    routeMode: commitment.routeMode,
    thesis: request.thesis,
    evidence: request.evidence,
    confidence: commitment.confidence,
    salt: request.salt,
    initiaAddress: request.initiaAddress,
  }

  const expectedHash = hashCommitmentPayload(revealPayload)

  if (expectedHash !== commitment.commitmentHash) {
    throw new Error('Reveal payload did not match the sealed commitment hash')
  }

  const score = scoreCommitment(
    commitment.commitmentHash,
    commitment.confidence,
    commitment.routeMode,
  )

  const revealedCommitment: CommitmentRecord = {
    ...commitment,
    thesis: request.thesis.trim(),
    evidence: request.evidence.trim(),
    revealedAt: new Date().toISOString(),
    revealTxHash: request.revealTxHash,
    score,
    status: 'revealed',
  }

  const nextCommitments = [...store.commitments]
  nextCommitments[commitmentIndex] = revealedCommitment

  const arena = requireArena(commitment.arenaId)
  const updatedStore: VeilStore = {
    commitments: nextCommitments,
    activity: appendActivity(
      store.activity,
      'reveal',
      `${revealedCommitment.username ? `@${revealedCommitment.username}` : 'A signaler'} revealed in ${arena.title} and scored ${score}.`,
    ),
  }

  await writeStore(updatedStore)
  return revealedCommitment
}
