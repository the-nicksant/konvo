import { createServer as createHttpServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const UI_DIR = join(__dirname, 'ui')

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

interface BridgeOptions {
  /** Port for the browser-facing HTTP+WS server. Default: 4000 */
  port?: number
  /** Port the SimulatorAdapter WS server is listening on. Default: 4001 */
  adapterPort?: number
  /** Port the konvo HTTP server is running on. Default: 3000 */
  konvoPort?: number
}

export async function startBridge({
  port = 4000,
  adapterPort = 4001,
  konvoPort = 3000,
}: BridgeOptions = {}): Promise<void> {
  const browserClients = new Set<WebSocket>()

  const httpServer = createHttpServer((req, res) => {
    if (req.method === 'POST' && req.url === '/send') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        fetch(`http://localhost:${konvoPort}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }).catch((err: unknown) => console.error('[bridge] Failed to forward to konvo:', err))
        res.writeHead(200)
        res.end()
      })
      return
    }

    // Serve static UI files
    let urlPath = req.url ?? '/'
    if (urlPath === '/') urlPath = '/index.html'
    const filePath = join(UI_DIR, urlPath)

    if (!existsSync(filePath)) {
      const index = join(UI_DIR, 'index.html')
      if (!existsSync(index)) {
        res.writeHead(404)
        res.end('UI not built. Run: pnpm build:ui')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(readFileSync(index))
      return
    }

    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
    res.end(readFileSync(filePath))
  })

  // Browser WebSocket server — attached to same HTTP server
  const browserWss = new WebSocketServer({ server: httpServer })
  browserWss.on('connection', (ws: WebSocket) => {
    browserClients.add(ws)
    ws.on('close', () => browserClients.delete(ws))
  })

  // Connect to SimulatorAdapter WS and relay events to browser
  await connectToAdapter(adapterPort, browserClients)

  await new Promise<void>((resolve) => httpServer.listen(port, resolve))
  console.log(`[konvo/playground] UI available at http://localhost:${port}`)
  console.log(`[konvo/playground] Forwarding messages to konvo at http://localhost:${konvoPort}`)
}

async function connectToAdapter(
  adapterPort: number,
  browserClients: Set<WebSocket>,
  retries = 10,
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${adapterPort}`)
        ws.on('open', () => {
          console.log(`[konvo/playground] Connected to SimulatorAdapter on port ${adapterPort}`)
          ws.on('message', (data: Buffer) => {
            const msg = data.toString()
            for (const client of browserClients) {
              if (client.readyState === WebSocket.OPEN) client.send(msg)
            }
          })
          resolve()
        })
        ws.on('error', reject)
      })
      return
    } catch {
      if (attempt === retries) {
        throw new Error(
          `[konvo/playground] Could not connect to SimulatorAdapter on port ${adapterPort}. ` +
          `Is your konvo server running with SimulatorAdapter?`
        )
      }
      console.log(`[konvo/playground] Waiting for SimulatorAdapter... (${attempt}/${retries})`)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}
