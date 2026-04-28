import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'channels/whatsapp': 'src/channels/whatsapp/adapter.ts',
    'channels/telegram': 'src/channels/telegram/adapter.ts',
    'stores/sqlite': 'src/session/stores/sqlite.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  target: 'node20',
  external: ['ai', 'zod', 'better-sqlite3'],
})
