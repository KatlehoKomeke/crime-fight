// Bundles the SSR Lambda: server/lambda.ts → .lambda/index.js, plus the
// `expo export` server output copied to .lambda/server.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = `${root}.lambda`

if (!existsSync(`${root}dist/server`)) {
  console.error('dist/server missing — run `expo export --platform web` first')
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })
await build({
  entryPoints: [`${root}server/lambda.ts`],
  outfile: `${out}/index.js`,
  bundle: true,
  platform: 'node',
  target: 'node24',
  // expo-server loads route bundles with require(), so CommonJS it is.
  format: 'cjs',
  // The Node.js Lambda runtime ships AWS SDK v3.
  external: ['@aws-sdk/*'],
  sourcemap: 'linked',
  legalComments: 'none',
})
cpSync(`${root}dist/server`, `${out}/server`, { recursive: true })
console.log('✔ SSR Lambda packaged in .lambda/')
