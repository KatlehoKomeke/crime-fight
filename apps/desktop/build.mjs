// Bundles the Electron main + preload scripts. The site URL is baked in at
// build time so each installer points at the right environment.
import { build } from 'esbuild'

const packaging = process.env.npm_lifecycle_event === 'dist'
const siteUrl = process.env.CIVIC_DESKTOP_URL ?? (packaging ? undefined : 'http://localhost:8081')
if (!siteUrl) {
  console.error('Set CIVIC_DESKTOP_URL to the environment this installer should load (e.g. the prod SiteUrl output).')
  process.exit(1)
}

await build({
  entryPoints: ['src/main.ts', 'src/preload.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  define: { __SITE_URL__: JSON.stringify(siteUrl) },
  sourcemap: true,
})
console.log(`✔ desktop bundle → ${siteUrl}`)
