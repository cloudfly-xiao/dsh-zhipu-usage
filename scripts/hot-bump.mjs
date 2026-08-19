/**
 * Version-bump the scanner module.
 *
 * The running dsh web host re-composes the profile when the market writes
 * the user patch layer, and the re-composed instance re-reads lib/index.js
 * (content edits land) but keeps executing the CACHED lib/scan.mjs module.
 * The only reliable cache-bust for the scanner is a never-imported file
 * name: this script copies lib/scan.mjs to lib/scan-v<N>.mjs and rewrites
 * the import inside lib/index.js. Trigger a re-compose afterwards by any
 * market toggle write (the dsh-zhipu-usage-host2 toggle is harmless).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = dirname(here)

const indexPath = join(pkg, 'lib', 'index.js')
const index = readFileSync(indexPath, 'utf8')
const match = /from '\.\/scan-v([0-9]+)\.mjs'/.exec(index)
const next = match === null ? 1 : Number(match[1]) + 1

writeFileSync(join(pkg, 'lib', 'scan-v' + next + '.mjs'), readFileSync(join(pkg, 'lib', 'scan.mjs'), 'utf8'))

const updated = index.replace(
  /import \{ scanSessions \} from '\.\/scan(-v[0-9]+)?\.mjs'/,
  "import { scanSessions } from './scan-v" + next + ".mjs'",
)
if (!updated.includes("scan-v" + next + ".mjs'")) throw new Error('scan import rewrite failed')
writeFileSync(indexPath, updated)
console.log('hot-bump: scan-v' + next + '.mjs wired into lib/index.js')
