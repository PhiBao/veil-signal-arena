import type { CommitRequest, RevealRequest, VeilBootstrap } from '../../shared/veil.ts'

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const payload = (await response.json()) as T | { error?: string }

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? payload.error
        : 'Request failed'
    throw new Error(errorMessage ?? 'Request failed')
  }

  return payload as T
}

export function fetchBootstrap(initiaAddress?: string) {
  const url = initiaAddress
    ? `/api/bootstrap?initiaAddress=${encodeURIComponent(initiaAddress)}`
    : '/api/bootstrap'

  return requestJson<VeilBootstrap>(url)
}

export function postCommit(payload: CommitRequest) {
  return requestJson('/api/commit', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function postReveal(payload: RevealRequest) {
  return requestJson('/api/reveal', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
