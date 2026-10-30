// Production-like local server for the exported web app: static assets from
// dist/client, everything else through Expo's SSR handler (same code path as
// the Lambda). Usage: pnpm --filter @civic/app serve
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

// expo-server's ESM build uses extensionless imports (meant for bundlers); load the CJS build.
const { createRequestHandler } = createRequire(import.meta.url)('expo-server/adapter/http')

const root = fileURLToPath(new URL('..', import.meta.url))
const client = join(root, 'dist/client')
const port = Number(process.env.PORT ?? 8081)
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.txt': 'text/plain', '.ico': 'image/x-icon', '.map': 'application/json' }

const ssr = createRequestHandler({ build: join(root, 'dist/server') })

createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]))
  const file = join(client, path)
  if (file.startsWith(client) && path !== '/' && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' })
    createReadStream(file).pipe(res)
    return
  }
  ssr(req, res, (error) => {
    res.statusCode = 500
    res.end(String(error?.stack ?? error))
  })
}).listen(port, () => console.log(`▲ CIVIC/ONE web (SSR) on http://localhost:${port}`))
