// Copies the fonts and WebAssembly that link preview cards are drawn with next
// to the bundled Og handler, where src/og/render.ts reads them when deployed.
// Run by the Og function's bundling (infra/lib/stacks/api-stack.ts).
// Usage: node scripts/copy-og-assets.mjs <outputDir>
import { copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import assets from '../src/og/assets.json' with { type: 'json' }

const require = createRequire(import.meta.url)
const out = process.argv[2]
if (!out) throw new Error('usage: node scripts/copy-og-assets.mjs <outputDir>')
for (const specifier of Object.values(assets)) copyFileSync(require.resolve(specifier), join(out, basename(specifier)))
