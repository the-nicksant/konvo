import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { adapter: 'src/adapter.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    target: 'node20',
    external: ['ws', 'konvo'],
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    target: 'node20',
    external: ['ws'],
    banner: { js: '#!/usr/bin/env node' },
  },
])
