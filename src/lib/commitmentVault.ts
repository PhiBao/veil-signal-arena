import { useEffect, useState } from 'react'
import type { CommitPayload } from '../../shared/veil.ts'

export type LocalCommitmentVaultEntry = CommitPayload & {
  commitmentId: string
  commitmentHash: string
  commitTxHash: string
  createdAt: string
}

const STORAGE_KEY = 'veil:commitment-vault'

function readVaultFromStorage() {
  if (typeof window === 'undefined') {
    return {} as Record<string, LocalCommitmentVaultEntry>
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)
    return rawValue
      ? (JSON.parse(rawValue) as Record<string, LocalCommitmentVaultEntry>)
      : {}
  } catch {
    return {} as Record<string, LocalCommitmentVaultEntry>
  }
}

function persistVault(vault: Record<string, LocalCommitmentVaultEntry>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vault))
}

export function useCommitmentVault() {
  const [vault, setVault] = useState<Record<string, LocalCommitmentVaultEntry>>(() =>
    readVaultFromStorage(),
  )

  useEffect(() => {
    const syncVault = () => setVault(readVaultFromStorage())
    window.addEventListener('storage', syncVault)

    return () => window.removeEventListener('storage', syncVault)
  }, [])

  function upsertEntry(entry: LocalCommitmentVaultEntry) {
    setVault((current) => {
      const nextVault = {
        ...current,
        [entry.commitmentId]: entry,
      }
      persistVault(nextVault)
      return nextVault
    })
  }

  function removeEntry(commitmentId: string) {
    setVault((current) => {
      const nextVault = { ...current }
      delete nextVault[commitmentId]
      persistVault(nextVault)
      return nextVault
    })
  }

  return {
    vault,
    upsertEntry,
    removeEntry,
  }
}

export function generateSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashCommitmentPayload(payload: string) {
  const encoded = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', encoded)

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
