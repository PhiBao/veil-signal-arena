const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
})

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function truncateMiddle(value: string, head = 10, tail = 6) {
  if (!value) {
    return 'unknown'
  }

  if (value.length <= head + tail + 3) {
    return value
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

export function formatRelativeTime(isoTimestamp: string) {
  const now = Date.now()
  const then = new Date(isoTimestamp).getTime()
  const diffInSeconds = Math.round((then - now) / 1000)
  const absoluteSeconds = Math.abs(diffInSeconds)

  if (absoluteSeconds < 45) {
    return 'just now'
  }

  if (absoluteSeconds < 60 * 60) {
    return relativeTimeFormatter.format(Math.round(diffInSeconds / 60), 'minute')
  }

  if (absoluteSeconds < 60 * 60 * 24) {
    return relativeTimeFormatter.format(Math.round(diffInSeconds / 3600), 'hour')
  }

  return relativeTimeFormatter.format(
    Math.round(diffInSeconds / (3600 * 24)),
    'day',
  )
}

export function formatUsd(value: number) {
  return usdFormatter.format(value)
}
