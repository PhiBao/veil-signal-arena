import { startTransition, useDeferredValue, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useInterwovenKit, usePortfolio } from '@initia/interwovenkit-react'
import './App.css'
import {
  ARENA_CONFIGS,
  INITIAL_AGENTS,
  ROUTE_LABELS,
  buildArenasFromConfig,
  buildSeedLeaderboards,
  createSeedActivity,
  formatPublicHandle,
  formatReputationScore,
  serializeCommitmentPayload,
  type CommitmentRecord,
  type RouteMode,
  type VeilBootstrap,
} from '../shared/veil.ts'
import {
  generateSalt,
  hashCommitmentPayload,
} from './lib/commitmentVault.ts'
import { formatRelativeTime, formatUsd, truncateMiddle } from './lib/format.ts'
import {
  VEIL_CHAIN_ID,
  buildExplorerTxUrl,
} from './lib/initia.ts'
import {
  buildCommitMessage,
  buildRevealMessage,
  fetchVeilBootstrap,
} from './lib/veilChain.ts'

function sameInitiaAddress(left: string, right: string) {
  if (left === right) return true
  const normalize = (s: string) => s.startsWith('init1') ? s : `init1${s}`
  return normalize(left) === normalize(right)
}

type DraftState = {
  thesis: string
  evidence: string
  confidence: number
}

type NoticeTone = 'neutral' | 'success' | 'error'

type Notice = {
  tone: NoticeTone
  text: string
}

type AnchorReceipt = {
  kind: 'commit' | 'reveal'
  txHash: string
  label: string
}

type TxHashMap = Record<string, { commitTxHash?: string; revealTxHash?: string }>

const VEIL_TX_STORAGE_KEY = 'veil_tx_hashes'

function loadTxHashMap(): TxHashMap {
  try {
    const raw = localStorage.getItem(VEIL_TX_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveTxHashEntry(
  key: string,
  entry: { commitTxHash?: string; revealTxHash?: string },
) {
  const map = loadTxHashMap()
  map[key] = { ...map[key], ...entry }
  localStorage.setItem(VEIL_TX_STORAGE_KEY, JSON.stringify(map))
}

function mergeTxHashes(
  commitments: CommitmentRecord[],
  txMap: TxHashMap,
): CommitmentRecord[] {
  return commitments.map((c) => {
    const entry = txMap[c.commitmentHash] || txMap[c.id]
    if (!entry) return c
    return {
      ...c,
      commitTxHash: c.commitTxHash || entry.commitTxHash,
      revealTxHash: c.revealTxHash || entry.revealTxHash,
    }
  })
}

const DEFAULT_DRAFT: DraftState = {
  thesis: '',
  evidence: '',
  confidence: 75,
}

function truncateHash(hash: string) {
  return truncateMiddle(hash, 14, 8)
}

function getFallbackBootstrap(): VeilBootstrap {
  const arenas = buildArenasFromConfig()
  return {
    arenas,
    agents: INITIAL_AGENTS,
    activity: createSeedActivity(),
    leaderboards: buildSeedLeaderboards(arenas),
    userCommitments: [],
    reputations: [],
    arenaFees: {},
    stats: {
      totalCommitted: 0,
      totalRevealed: 0,
      activeArenas: arenas.length,
      connectedSignalers: 0,
    },
    runtime: {
      moduleReady: false,
      chainId: VEIL_CHAIN_ID,
      network: 'testnet',
      liveAnchors: true,
      moduleAddress: null,
      moduleName: 'signal_arena',
    },
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function App() {
  const [selectedArenaId, setSelectedArenaId] = useState(ARENA_CONFIGS[0].id)
  const [routeMode, setRouteMode] = useState<RouteMode>('hybrid')
  const [draft, setDraft] = useState<DraftState>(DEFAULT_DRAFT)
  const [draftSalt, setDraftSalt] = useState(() => generateSalt())
  const [draftHash, setDraftHash] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [activeAction, setActiveAction] = useState<'commit' | 'reveal' | 'session' | null>(
    null,
  )
  const [lastAnchor, setLastAnchor] = useState<AnchorReceipt | null>(null)

  const thesisInputRef = useRef<HTMLInputElement>(null)
  const evidenceInputRef = useRef<HTMLTextAreaElement>(null)

  const queryClient = useQueryClient()
  const {
    address,
    autoSign,
    disconnect,
    initiaAddress,
    isConnected,
    openBridge,
    openConnect,
    openWallet,
    requestTxBlock,
    username,
  } = useInterwovenKit()
  const deferredInitiaAddress = useDeferredValue(initiaAddress || '')
  const portfolio = usePortfolio()
  const bootstrapQuery = useQuery({
    queryKey: ['bootstrap', deferredInitiaAddress || 'guest', username || 'anon'],
    queryFn: () => fetchVeilBootstrap(deferredInitiaAddress || undefined, username ?? null),
    refetchInterval: 15_000,
  })

  const bootstrap = bootstrapQuery.data ?? getFallbackBootstrap()
  const arenas = bootstrap.arenas.length ? bootstrap.arenas : buildArenasFromConfig()
  const selectedArena = arenas.find((a) => a.id === selectedArenaId) ?? arenas[0]
  const selectedAgents = bootstrap.agents.filter((agent) => agent.arenaId === selectedArena.id)
  const selectedCommitments = bootstrap.userCommitments.filter(
    (commitment) => commitment.arenaId === selectedArena.id,
  )
  const autoSignEnabled = Boolean(autoSign.isEnabledByChain[VEIL_CHAIN_ID])
  const currentIdentity = isConnected
    ? formatPublicHandle(username, initiaAddress || address || 'disconnected')
    : 'Disconnected'
  const confidenceDegrees = Math.round(draft.confidence * 3.6)
  const portfolioValue = Number(portfolio.totalValue ?? 0)
  const nativeFeatures = ['move execution', 'interwoven bridge', '.init usernames', 'on-chain reputation', 'arena entry fees']
  const chainRuntimeLabel = `${bootstrap.runtime.chainId} / ${bootstrap.runtime.network}`
  const moduleStatusLabel = bootstrap.runtime.moduleReady
    ? `${bootstrap.runtime.moduleName} live`
    : bootstrap.runtime.moduleAddress
      ? 'module not initialized'
      : 'module address missing'
  const commitmentCards = mergeTxHashes(
    [...selectedCommitments].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    ),
    loadTxHashMap(),
  )
  const userReputation = bootstrap.reputations.find((rep) =>
    initiaAddress && sameInitiaAddress(rep.initiaAddress, initiaAddress)
  )
  const selectedArenaFee = bootstrap.arenaFees[selectedArena.id]

  useEffect(() => {
    let cancelled = false

    async function buildPreviewHash() {
      const effectiveAddress = initiaAddress || address
      if (!effectiveAddress || !draft.thesis.trim()) {
        setDraftHash('')
        return
      }

      const previewPayload = serializeCommitmentPayload({
        arenaId: selectedArena.id,
        routeMode,
        thesis: draft.thesis,
        evidence: draft.evidence,
        confidence: draft.confidence,
        salt: draftSalt,
        initiaAddress: effectiveAddress,
      })
      const nextHash = await hashCommitmentPayload(previewPayload)

      if (!cancelled) {
        setDraftHash(nextHash)
      }
    }

    void buildPreviewHash()

    return () => {
      cancelled = true
    }
  }, [draft, draftSalt, initiaAddress, address, routeMode, selectedArena.id])

  function resetDraft() {
    setDraft(DEFAULT_DRAFT)
    setDraftSalt(generateSalt())
    setDraftHash('')
  }

  async function refreshBootstrap() {
    await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
  }

  async function handleSessionToggle() {
    setActiveAction('session')

    try {
      if (!isConnected) {
        throw new Error('Connect a wallet before enabling session signing.')
      }

      if (autoSignEnabled) {
        await autoSign.disable(VEIL_CHAIN_ID)
        setNotice({
          tone: 'success',
          text: 'Auto-sign disabled. Commits and reveals will ask for manual confirmation again.',
        })
      } else {
        await autoSign.enable(VEIL_CHAIN_ID)
        setNotice({
          tone: 'success',
          text: 'Auto-sign request opened. Approve the Initia session permission in the wallet drawer.',
        })
      }
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error) })
    } finally {
      setActiveAction(null)
    }
  }

  async function handleCreateCommitment() {
    setActiveAction('commit')

    try {
      if (!bootstrap.runtime.moduleAddress) {
        throw new Error('Move module address not configured. Set VEIL_MODULE_ADDRESS in .env')
      }

      if (!isConnected || !initiaAddress) {
        throw new Error('Connect a wallet before sealing a hidden signal.')
      }

      if (!draft.thesis.trim()) {
        thesisInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        thesisInputRef.current?.focus()
        throw new Error('A thesis headline is required before Veil can seal it.')
      }

      if (!draft.evidence.trim()) {
        evidenceInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        evidenceInputRef.current?.focus()
        throw new Error('Add the reasoning that proves the thesis once the arena settles.')
      }

      const commitmentPayload = {
        arenaId: selectedArena.id,
        routeMode,
        thesis: draft.thesis.trim(),
        evidence: draft.evidence.trim(),
        confidence: draft.confidence,
        salt: draftSalt,
        initiaAddress,
      }
      const commitmentHash = await hashCommitmentPayload(
        serializeCommitmentPayload(commitmentPayload),
      )
      const commitReceipt = await requestTxBlock({
        messages: [
          buildCommitMessage(initiaAddress, {
            arenaId: selectedArena.id,
            routeMode,
            commitmentHash,
            confidence: draft.confidence,
            thesis: draft.thesis.trim(),
            evidence: draft.evidence.trim(),
            salt: draftSalt,
          }),
        ],
        chainId: VEIL_CHAIN_ID,
      })

      setLastAnchor({
        kind: 'commit',
        txHash: commitReceipt.transactionHash,
        label: `Commit anchored for ${selectedArena.title}`,
      })
      saveTxHashEntry(commitmentHash, { commitTxHash: commitReceipt.transactionHash })
      setNotice({
        tone: 'success',
        text: 'Commit executed onchain. Thesis and evidence are stored on-chain. Reveal when settlement arrives.',
      })
      resetDraft()
      await refreshBootstrap()
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error) })
    } finally {
      setActiveAction(null)
    }
  }

  async function handleRevealCommitment(commitment: CommitmentRecord) {
    setActiveAction('reveal')

    try {
      if (!bootstrap.runtime.moduleAddress) {
        throw new Error('Move module address not configured. Set VEIL_MODULE_ADDRESS in .env')
      }

      if (!isConnected || !initiaAddress) {
        throw new Error('Connect the original wallet before revealing a sealed signal.')
      }

      const revealReceipt = await requestTxBlock({
        messages: [
          buildRevealMessage(initiaAddress, {
            commitmentId: commitment.id,
          }),
        ],
        chainId: VEIL_CHAIN_ID,
      })

      setLastAnchor({
        kind: 'reveal',
        txHash: revealReceipt.transactionHash,
        label: `Reveal anchored for ${selectedArena.title}`,
      })
      saveTxHashEntry(commitment.id, { revealTxHash: revealReceipt.transactionHash })
      saveTxHashEntry(commitment.commitmentHash, { revealTxHash: revealReceipt.transactionHash })
      setNotice({
        tone: 'success',
        text: 'Reveal executed onchain. The leaderboard and activity rail have been refreshed from live module state.',
      })
      await refreshBootstrap()
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error) })
    } finally {
      setActiveAction(null)
    }
  }

  function handleBridgeOpen() {
    openBridge()
  }

  function handleWalletButton() {
    if (isConnected) {
      openWallet()
      return
    }

    openConnect()
  }

  const anchorTxHash = lastAnchor?.txHash ?? null
  const anchorTxUrl = anchorTxHash ? buildExplorerTxUrl(anchorTxHash) : null
  const anchorTxHashLabel = anchorTxHash ?? ''

  return (
    <div className="app-shell">
      <div className="ambient ambient-left"></div>
      <div className="ambient ambient-right"></div>

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-chip">Veil</span>
          <div>
            <h1 className="brand-title">Signal Arena</h1>
            <p className="brand-subtitle">
              Sealed predictions for humans, agents, and pseudonymous alpha squads.
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="button ghost" onClick={handleBridgeOpen}>
            {isConnected ? 'Open bridge' : 'Bridge in'}
          </button>
          <button className="button primary" onClick={handleWalletButton}>
            {isConnected ? `Open ${truncateMiddle(currentIdentity, 16, 0)}` : 'Connect .init'}
          </button>
        </div>
      </header>

      <main className="content-grid">
        <section className="hero-panel panel">
          <div className="hero-copy">
            <div className="hero-kicker-row">
              <p className="eyebrow">INITIATE hackathon product</p>
              <span className="status-pill live">Live on {bootstrap.runtime.network}</span>
            </div>
            <h2 className="hero-headline">Private commitments. Public proof. Portable `.init` reputation.</h2>
            <p className="hero-text">
              Veil lets humans and AI agents commit hidden theses, reveal only after
              settlement, and build portable reputation under `.init` identities. All data
              lives on-chain - access your predictions from any device.
            </p>

            <div className="hero-status-band">
              <article>
                <span>Chain target</span>
                <strong>{chainRuntimeLabel}</strong>
              </article>
              <article>
                <span>Module status</span>
                <strong>{moduleStatusLabel}</strong>
              </article>
              <article>
                <span>Native rails</span>
                <strong>{nativeFeatures.length} features live</strong>
              </article>
            </div>

            <div className="hero-actions">
              <button
                className="button primary"
                disabled={activeAction === 'commit' || !bootstrap.runtime.moduleAddress}
                onClick={handleCreateCommitment}
              >
                {activeAction === 'commit' ? 'Committing onchain...' : 'Commit onchain'}
              </button>
              <button
                className="button secondary"
                disabled={activeAction === 'session' || autoSign.isLoading}
                onClick={handleSessionToggle}
              >
                {autoSignEnabled ? 'Disable auto-sign' : 'Enable auto-sign'}
              </button>
              {isConnected ? (
                <button className="button ghost" onClick={disconnect}>
                  Disconnect
                </button>
              ) : null}
            </div>

            <div className="metric-grid">
              <article>
                <span>Anchored commits</span>
                <strong>{bootstrap.stats.totalCommitted}</strong>
              </article>
              <article>
                <span>Revealed scores</span>
                <strong>{bootstrap.stats.totalRevealed}</strong>
              </article>
              <article>
                <span>Your reputation</span>
                <strong>{userReputation ? `${userReputation.score} pts (${userReputation.rank})` : isConnected ? 'No reveals yet' : 'Connect'}</strong>
              </article>
              <article>
                <span>Wallet value</span>
                <strong>{isConnected ? formatUsd(portfolioValue) : 'Connect'}</strong>
              </article>
            </div>
          </div>

          <aside className="signal-pane">
            <div className="signal-pane-top">
              <span className={`status-pill ${bootstrap.runtime.moduleReady ? 'live' : ''}`}>
                {bootstrap.runtime.moduleReady ? 'Move module live' : 'Move module pending'}
              </span>
              <span className="status-pill">{ROUTE_LABELS[routeMode]}</span>
            </div>

            <div className="signal-intro">
              <p className="signal-overline">On-chain control room</p>
              <h3>Bridge in, execute the commit, auto-sign the loop, reveal on settlement.</h3>
              <p>
                Veil is wired to direct Move execution and live module reads. All commitment
                data is stored on-chain - accessible from any device with your wallet.
              </p>
            </div>

            <div className="signal-feature-row">
              {nativeFeatures.map((feature) => (
                <span key={feature} className="tag signal-tag">
                  {feature}
                </span>
              ))}
            </div>

            <div className="signal-core">
              <div>
                <p className="signal-label">Handle</p>
                <strong className="signal-value">{currentIdentity}</strong>
              </div>
              <div>
                <p className="signal-label">Chain target</p>
                <strong className="signal-value">{chainRuntimeLabel}</strong>
              </div>
              <div>
                <p className="signal-label">Module</p>
                <strong className="signal-value">{moduleStatusLabel}</strong>
              </div>
              <div>
                <p className="signal-label">Reputation</p>
                <strong className={`signal-value ${userReputation ? 'live-copy' : ''}`}>
                  {userReputation ? `${userReputation.rank} · ${formatReputationScore(userReputation.score)}` : 'No reveals yet'}
                </strong>
              </div>
              <div>
                <p className="signal-label">Last tx</p>
                <span className="signal-value">
                  {lastAnchor ? truncateHash(lastAnchor.txHash) : 'Awaiting first execution'}
                </span>
              </div>
            </div>

            <div className="confidence-ring" aria-label={`Confidence ${draft.confidence}%`}>
              <div
                className="confidence-ring-fill"
                style={{ '--progress': `${confidenceDegrees}deg` } as React.CSSProperties}
              ></div>
              <div className="confidence-ring-inner">
                <span>Confidence</span>
                <strong>{draft.confidence}%</strong>
              </div>
            </div>

            <div className="signal-proof-row">
              {bootstrap.runtime.moduleAddress ? (
                <span className="signal-link">Module {truncateHash(bootstrap.runtime.moduleAddress)}</span>
              ) : null}
              {anchorTxUrl ? (
                <a className="signal-link" href={anchorTxUrl} rel="noreferrer" target="_blank">
                  Latest tx {truncateHash(anchorTxHashLabel)}
                </a>
              ) : (
                <span className="signal-link subtle">
                  Your first live module execution will surface an explorer link here.
                </span>
              )}
            </div>

            <ul className="hero-points">
              <li>All commitment data stored on-chain - access from any device.</li>
              <li>Reveal a commitment to earn on-chain reputation that persists across arenas.</li>
              <li>Arena entry fees are collected on-chain and configurable per arena.</li>
              <li>Auto-sign can compress repeat commits into a single session grant.</li>
            </ul>
          </aside>
        </section>

        <section className="panel arena-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Arena slate</p>
              <h2>Choose the narrative battleground.</h2>
            </div>
            <span className="status-pill live">{arenas.length} active arenas</span>
          </div>

          <div className="arena-grid">
            {arenas.map((arena) => {
              const active = arena.id === selectedArena.id

              return (
                <button
                  key={arena.id}
                  className={`arena-card ${active ? 'active' : ''}`}
                  onClick={() =>
                    startTransition(() => {
                      setSelectedArenaId(arena.id)
                    })
                  }
                >
                  <div className="arena-card-top">
                    <span className="arena-track">{arena.track}</span>
                    <span className="arena-pool">{arena.rewardPool}</span>
                  </div>
                  <h3>{arena.title}</h3>
                  <p>{arena.summary}</p>
                  <div className="arena-card-meta">
                    <span>{arena.participants} contenders</span>
                    <span>{bootstrap.arenaFees[arena.id]?.amount ?? arena.entryFee} {bootstrap.arenaFees[arena.id]?.denom ?? 'INIT'} entry fee</span>
                  </div>
                  <div className="tag-row">
                    {arena.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="workspace">
          <div className="workspace-main">
            <article className="panel arena-detail">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Selected arena</p>
                  <h2>{selectedArena.title}</h2>
                </div>
                <span className="status-pill">{selectedArena.sponsor}</span>
              </div>

              <p className="arena-longform">{selectedArena.longform}</p>

              <div className="detail-grid">
                <div>
                  <span className="detail-label">Commit window</span>
                  <strong>{selectedArena.commitDeadline}</strong>
                </div>
                <div>
                  <span className="detail-label">Settlement</span>
                  <strong>{selectedArena.settlementRule}</strong>
                </div>
                <div>
                  <span className="detail-label">Entry fee</span>
                  <strong>{selectedArenaFee ? `${selectedArenaFee.amount} ${selectedArenaFee.denom}` : `${selectedArena.entryFee} INIT`} (on-chain)</strong>
                </div>
                <div>
                  <span className="detail-label">Execution rail</span>
                  <strong>Move execute JSON</strong>
                </div>
              </div>

              <div className="note-panel">
                <span className="detail-label">Initia edge</span>
                <p>{selectedArena.initiaHook}</p>
              </div>
            </article>

            <article className="panel composer">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Signal composer</p>
                  <h2>Seal one call, reveal it later.</h2>
                </div>
                <span className={`status-pill ${isConnected ? 'live' : ''}`}>
                  {isConnected ? 'Wallet live' : 'Connect required'}
                </span>
              </div>

              {notice ? <div className={`notice ${notice.tone}`}>{notice.text}</div> : null}

              <div className="composer-actions">
                <button
                  className="button secondary"
                  disabled={activeAction === 'commit' || !bootstrap.runtime.moduleAddress}
                  onClick={handleCreateCommitment}
                >
                  {activeAction === 'commit' ? 'Committing onchain...' : 'Seal and commit'}
                </button>
                <button className="button ghost" onClick={handleBridgeOpen}>
                  Fund through bridge
                </button>
              </div>

              <p className="composer-note">
                Veil stores your thesis, evidence, and a cryptographic hash on-chain. Reveal
                flips a flag on the module - everything is accessible from any device with your wallet.
                {selectedArenaFee ? ` Entry fee: ${selectedArenaFee.amount} ${selectedArenaFee.denom} (collected on-chain).` : ''}
              </p>

              <div className="mode-switch">
                {(['human', 'hybrid', 'agent'] as RouteMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`mode-pill ${routeMode === mode ? 'active' : ''}`}
                    onClick={() => setRouteMode(mode)}
                  >
                    {ROUTE_LABELS[mode]}
                  </button>
                ))}
              </div>

              <label className="field">
                <span>Headline thesis</span>
                <input
                  ref={thesisInputRef}
                  value={draft.thesis}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, thesis: event.target.value }))
                  }
                  placeholder="Write the call you want to hide until settlement."
                />
              </label>

              <label className="field">
                <span>Reveal evidence</span>
                <textarea
                  ref={evidenceInputRef}
                  rows={4}
                  value={draft.evidence}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, evidence: event.target.value }))
                  }
                  placeholder="Add the reasoning that will be revealed later."
                />
              </label>

              <label className="field field-range">
                <div className="field-topline">
                  <span>Confidence</span>
                  <strong>{draft.confidence}%</strong>
                </div>
                <input
                  type="range"
                  min="40"
                  max="98"
                  value={draft.confidence}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      confidence: Number(event.target.value),
                    }))
                  }
                />
              </label>

              <div className="commit-card">
                <div>
                  <span className="detail-label">Preview hash</span>
                  <code>
                    {draftHash
                      ? truncateHash(draftHash)
                      : !isConnected
                        ? 'Connect wallet to preview'
                        : !draft.thesis.trim()
                          ? 'Enter a thesis to preview'
                          : 'Generating hash...'}
                  </code>
                </div>
                <div>
                  <span className="detail-label">Salt fragment</span>
                  <strong>{draftSalt.slice(0, 6)}</strong>
                </div>
                <div>
                  <span className="detail-label">Commits in arena</span>
                  <strong>{selectedCommitments.length}</strong>
                </div>
              </div>

              <div className="composer-actions final-actions">
                <button
                  className="button primary"
                  disabled={activeAction === 'commit' || !bootstrap.runtime.moduleAddress}
                  onClick={handleCreateCommitment}
                >
                  {activeAction === 'commit' ? 'Committing onchain...' : 'Generate commitment'}
                </button>
                <button
                  className="button secondary"
                  disabled={activeAction === 'session' || autoSign.isLoading}
                  onClick={handleSessionToggle}
                >
                  {autoSignEnabled ? 'Session armed' : 'Arm auto-sign'}
                </button>
              </div>

              <section className="vault-section">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Your commitments</p>
                    <h2>Pending and revealed entries</h2>
                  </div>
                </div>

                {commitmentCards.length === 0 ? (
                  <div className="empty-state">
                    No commitments for this arena yet. Seal one signal, wait for settlement, then
                    reveal it from any device.
                  </div>
                ) : (
                  <div className="vault-list">
                    {commitmentCards.map((commitment) => {
                      const primaryTxHash = commitment.revealTxHash || commitment.commitTxHash
                      const txUrl = primaryTxHash ? buildExplorerTxUrl(primaryTxHash) : null

                      return (
                        <article key={commitment.id} className="vault-card">
                          <div className="vault-top">
                            <div>
                              <strong>
                                {formatPublicHandle(commitment.username, commitment.initiaAddress)}
                              </strong>
                              <p className="status-copy">
                                {commitment.status === 'revealed'
                                  ? 'Reveal posted and scored'
                                  : 'Waiting to reveal after settlement'}
                              </p>
                            </div>
                            <span
                              className={`tone-pill ${
                                commitment.status === 'revealed' ? 'reveal' : 'commit'
                              }`}
                            >
                              {commitment.status}
                            </span>
                          </div>

                          <div className="vault-meta">
                            <span>{formatRelativeTime(commitment.createdAt)}</span>
                            <span>{ROUTE_LABELS[commitment.routeMode]}</span>
                            <span>{commitment.confidence}% confidence</span>
                          </div>

                          {commitment.status === 'revealed' ? (
                            <p>{commitment.thesis}</p>
                          ) : (
                            <p className="helper-copy">
                              Thesis is sealed on-chain. Reveal it after settlement to earn reputation.
                            </p>
                          )}

                          <div className="vault-actions">
                            {primaryTxHash && txUrl ? (
                              <a className="tx-chip" href={txUrl} rel="noreferrer" target="_blank">
                                {truncateHash(primaryTxHash)}
                              </a>
                            ) : primaryTxHash ? (
                              <span className="tx-chip">{truncateHash(primaryTxHash)}</span>
                            ) : (
                              <span className="tx-chip">On-chain record</span>
                            )}

                            {commitment.status === 'revealed' && commitment.score !== undefined ? (
                              <span className="tx-chip">{commitment.score} pts</span>
                            ) : (
                              <button
                                className="button secondary"
                                disabled={
                                  activeAction === 'reveal' ||
                                  !bootstrap.runtime.moduleAddress
                                }
                                onClick={() => handleRevealCommitment(commitment)}
                              >
                                {activeAction === 'reveal' ? 'Revealing onchain...' : 'Reveal now'}
                              </button>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            </article>
          </div>

          <aside className="workspace-side">
            <article className="panel stack-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Runtime stack</p>
                  <h2>What is actually live</h2>
                </div>
                <span className={`status-pill ${bootstrap.runtime.moduleReady ? 'live' : ''}`}>
                  {bootstrap.runtime.moduleReady ? 'Module ready' : 'Module pending'}
                </span>
              </div>

              <div className="status-list">
                <div>
                  <span>Module runtime</span>
                  <strong className={bootstrap.runtime.moduleReady ? 'live-copy' : ''}>
                    {bootstrap.runtime.moduleReady ? 'Live onchain' : 'Publish pending'}
                  </strong>
                </div>
                <div>
                  <span>.init reputation</span>
                  <strong className={username ? 'live-copy' : ''}>{currentIdentity}</strong>
                </div>
                <div>
                  <span>On-chain rep</span>
                  <strong className={userReputation ? 'live-copy' : ''}>
                    {userReputation ? `${userReputation.rank} · ${userReputation.score} pts` : 'No reveals'}
                  </strong>
                </div>
                <div>
                  <span>Auto-sign session</span>
                  <strong className={autoSignEnabled ? 'live-copy' : ''}>
                    {autoSignEnabled ? 'Armed' : 'Manual'}
                  </strong>
                </div>
                <div>
                  <span>Connected signalers</span>
                  <strong className="live-copy">{bootstrap.stats.connectedSignalers}</strong>
                </div>
                <div>
                  <span>Your commitments</span>
                  <strong className={selectedCommitments.length ? 'live-copy' : ''}>
                    {selectedCommitments.length} entries
                  </strong>
                </div>
              </div>

              {lastAnchor ? (
                <div className="notice neutral">
                  <strong>{lastAnchor.label}</strong>
                  <p className="helper-copy">
                    {anchorTxUrl ? (
                      <a href={anchorTxUrl} rel="noreferrer" target="_blank">
                        {truncateHash(lastAnchor.txHash)}
                      </a>
                    ) : (
                      truncateHash(lastAnchor.txHash)
                    )}
                  </p>
                </div>
              ) : null}
            </article>

            <article className="panel leaderboard-card">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Leaderboard</p>
                  <h2>Latest revealed signalers</h2>
                </div>
              </div>

              <div className="leaderboard-list">
                {(bootstrap.leaderboards[selectedArena.id] ?? []).map((entry, index) => (
                  <article key={`${entry.name}-${entry.note}-${index}`}>
                    <div>
                      <span className="leaderboard-rank">#{index + 1}</span>
                      <strong>{entry.name}</strong>
                      <small>{entry.badge}</small>
                    </div>
                    <div>
                      <span className="leaderboard-score">{entry.score}</span>
                      <small>{entry.delta}</small>
                    </div>
                    <p>{entry.note}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel activity-card">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Activity rail</p>
                  <h2>Recent on-chain moves</h2>
                </div>
              </div>

              <div className="activity-list">
                {bootstrap.activity.map((item) => (
                  <article key={item.id}>
                    <div className="activity-meta">
                      <span className={`tone-pill ${item.tone}`}>{item.tone}</span>
                      <small>{formatRelativeTime(item.createdAt)}</small>
                    </div>
                    <p>{item.message}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel leaderboard-card">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Reputation board</p>
                  <h2>On-chain signaler ranks</h2>
                </div>
              </div>

              <div className="leaderboard-list">
                {bootstrap.reputations.slice(0, 10).map((entry, index) => (
                  <article key={entry.initiaAddress}>
                    <div>
                      <span className="leaderboard-rank">#{index + 1}</span>
                      <strong>{formatPublicHandle(null, entry.initiaAddress)}</strong>
                      <small>{entry.rank}</small>
                    </div>
                    <div>
                      <span className="leaderboard-score">{entry.score}</span>
                      <small>{entry.reveals} reveal{entry.reveals !== 1 ? 's' : ''}</small>
                    </div>
                  </article>
                ))}
                {bootstrap.reputations.length === 0 ? (
                  <p className="helper-copy">No reputations yet. Reveal a commitment to earn on-chain reputation.</p>
                ) : null}
              </div>
            </article>

            <article className="panel agent-card-shell">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Agent roster</p>
                  <h2>Specialists in this arena</h2>
                </div>
              </div>

              <div className="agent-grid">
                {selectedAgents.map((agent) => (
                  <article key={agent.id} className="agent-card">
                    <div className="agent-card-top">
                      <strong>{agent.name}</strong>
                      <span className="status-pill">{agent.mode}</span>
                    </div>
                    <p>{agent.specialty}</p>
                    <div className="agent-card-meta">
                      <span>{agent.accuracy}</span>
                      <span>{agent.fee}</span>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </aside>
        </section>
      </main>
    </div>
  )
}

export default App