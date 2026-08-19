// Headless render verification of the client module: stub the module loader,
// run apply() against a minimal DOM, then assert the sidebar entry, the panel,
// and the data rows actually render from the REAL state API.
import { JSDOM, VirtualConsole } from 'jsdom'
import { readFileSync } from 'node:fs'

const dom = new JSDOM('<!doctype html><html><body><div data-pane="sidebar"><div><div class="logoRow-x"><button class="newSession-x">new</button></div><div class="workspaces">ws</div></div></div></body></html>', {
  url: 'http://127.0.0.1:3080/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})
const { window } = dom
const errors = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => errors.push(String(e?.message ?? e).slice(0, 160)))
window.addEventListener('error', (e) => errors.push(String(e?.message ?? e).slice(0, 160)))

window.__ModuleLoader__ = { load: (def) => { window.__zpuDef = def } }
window.fetch = globalThis.fetch.bind(globalThis)
window.AbortController = globalThis.AbortController
window.AbortSignal = globalThis.AbortSignal
window.open = () => ({ close() {} })
window.eval(readFileSync('lib/client.js', 'utf8'))

const effects = []
const ctx = { effect: (fn) => { fn(); return () => {} } }
window.__zpuDef.factory(() => ({}))
// apply with our ctx via direct export call
const mod = window.__zpuDef.factory(() => ({}))
mod.apply(ctx)

await new Promise((r) => setTimeout(r, 6000))

const doc = window.document
const entry = doc.querySelector('[data-dsh-zhipu-usage-entry]')
const pill = entry?.querySelector('.dsh-zpu-pill')
const overlay = doc.querySelector('.dsh-zpu-overlay')
const title = overlay?.querySelector('.dsh-zpu-title')?.textContent
const btns = [...(overlay?.querySelectorAll('.dsh-zpu-btn') ?? [])].map((b) => b.textContent)
const authChip = overlay?.querySelector('.dsh-zpu-chip')?.textContent

// open the panel and let it fetch+render
overlay.hidden = false
overlay.dispatchEvent(new window.Event('click'))
await new Promise((r) => setTimeout(r, 4000))
const cards = [...(overlay?.querySelectorAll('.dsh-zpu-cardName') ?? [])].map((c) => c.textContent)
const values = [...(overlay?.querySelectorAll('.dsh-zpu-cardValue') ?? [])].map((c) => c.textContent)
const quotaText = overlay?.querySelector('.dsh-zpu-quota')?.textContent.replace(/\s+/g, ' ').trim()
const sub = overlay?.querySelector('.dsh-zpu-sub')?.textContent

console.log('entry:', entry ? 'RENDERED' : 'MISSING', '| pill:', pill?.textContent)
console.log('panel:', title, '| buttons:', JSON.stringify(btns), '| auth:', authChip)
console.log('cards:', JSON.stringify(cards), '->', JSON.stringify(values))
console.log('quota:', quotaText)
console.log('sub:', sub)
console.log('errLine:', overlay?.querySelector('.dsh-zpu-err')?.textContent)
console.log('errors:', errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none')
const pass = entry !== null && title === '智谱 Coding Plan 用量' && cards.length >= 2 && values[0] !== null && quotaText != null && quotaText.includes('%')
console.log(pass ? 'RENDER CHECK: PASS' : 'RENDER CHECK: FAIL')
process.exit(pass ? 0 : 1)
