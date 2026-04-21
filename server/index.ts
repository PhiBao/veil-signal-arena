import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createCommitment, getBootstrap, revealCommitment } from './store.ts'

const API_PORT = Number.parseInt(process.env.VEIL_API_PORT ?? process.env.PORT ?? '8787', 10)

function sendJson(response: ServerResponse<IncomingMessage>, status: number, payload: unknown) {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

async function parseJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    })
    response.end()
    return
  }

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true, service: 'veil-api', port: API_PORT })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
      const initiaAddress = url.searchParams.get('initiaAddress') ?? undefined
      const payload = await getBootstrap(initiaAddress)
      sendJson(response, 200, payload)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/commit') {
      const body = await parseJsonBody(request)
      const payload = await createCommitment({
        id: String(body.id ?? ''),
        arenaId: String(body.arenaId ?? ''),
        routeMode: body.routeMode as 'human' | 'hybrid' | 'agent',
        confidence: Number(body.confidence ?? 0),
        commitmentHash: String(body.commitmentHash ?? ''),
        initiaAddress: String(body.initiaAddress ?? ''),
        evmAddress: body.evmAddress ? String(body.evmAddress) : null,
        username: body.username ? String(body.username) : null,
        commitTxHash: String(body.commitTxHash ?? ''),
      })
      sendJson(response, 201, payload)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/reveal') {
      const body = await parseJsonBody(request)
      const payload = await revealCommitment({
        commitmentId: String(body.commitmentId ?? ''),
        initiaAddress: String(body.initiaAddress ?? ''),
        thesis: String(body.thesis ?? ''),
        evidence: String(body.evidence ?? ''),
        salt: String(body.salt ?? ''),
        revealTxHash: String(body.revealTxHash ?? ''),
      })
      sendJson(response, 200, payload)
      return
    }

    sendJson(response, 404, { error: 'Route not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error'
    sendJson(response, 400, { error: message })
  }
})

server.listen(API_PORT, () => {
  console.log(`Veil API listening on http://127.0.0.1:${API_PORT}`)
})
