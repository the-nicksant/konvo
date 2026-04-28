import { startBridge } from './bridge.js'

const args = process.argv.slice(2)
const port = getArg(args, '--port', 4000)
const adapterPort = getArg(args, '--adapter-port', 4001)
const konvoPort = getArg(args, '--konvo-port', 3000)

console.log('[konvo/playground] Starting...')

void startBridge({ port, adapterPort, konvoPort }).catch((err: unknown) => {
  console.error('[konvo/playground] Fatal error:', (err as Error).message)
  process.exit(1)
})

function getArg(args: string[], flag: string, defaultValue: number): number {
  const idx = args.indexOf(flag)
  if (idx !== -1 && args[idx + 1]) return Number(args[idx + 1])
  return defaultValue
}
