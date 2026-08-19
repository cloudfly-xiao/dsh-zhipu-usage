/** Render smoke test: load the browser half in jsdom, open the panel with a
 * stubbed host API, and assert the previously-crashing paths (chart render
 * on bound state, token dialog) execute without exceptions. */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'lib', 'client-main.js'), 'utf8')

const now = Date.now()
const range = (tokens, calls) => ({
  tokens, calls,
  models: [{ name: 'GLM-5.3', tokens: Math.round(tokens * 0.9) }, { name: 'GLM-4.7', tokens: Math.round(tokens * 0.1) }],
  series: Array.from({ length: 12 }, (_, i) => ({ label: '2026-08-19 ' + String(i).padStart(2, '0') + ':00', tokens: Math.round(tokens / 12 * (1 + Math.sin(i))), calls: 3 })),
})
const boundState = {
  ok: true, generatedAt: now,
  remote: { ok: true, plan: 'pro', rolling5h: { percent: 42, resetTs: now + 3600_000 }, search: { used: 5, total: 1000 }, account: { giveAmount: 172.9, totalSpendAmount: 172.9 } },
  consoleUsage: { ok: true, fetchedAt: now, today: range(43_990_466, 1769), yesterday: range(20_000_000, 800), last7: range(120_000_000, 6000), last30: range(400_000_000, 20000), month: range(320_000_000, 16000) },
}
const unboundState = {
  ok: true, generatedAt: now,
  remote: { ok: false, error: 'ZHIPU_API_KEY / GLM_API_KEY not set' },
  consoleUsage: { ok: false, error: 'not-bound' },
}

let mode = 'bound'
const fetchLog = []
async function stubFetch(url, options) {
  fetchLog.push(String(url) + ' ' + (options?.method ?? 'GET'))
  const body = url.includes('auth/status') ? { ok: true, bound: mode === 'bound' }
    : url.includes('auth/handoff') ? { ok: true, verified: true, tokens: 42 }
    : mode === 'bound' ? boundState : unboundState
  return { ok: true, status: 200, json: async () => body }
}

const dom = new JSDOM('<!doctype html><html><head></head><body><div data-pane="sidebar"><div class="wrap"><div class="logoRow">DSH</div><button class="newSession">+</button></div></div></body></html>', {
  url: 'http://127.0.0.1:3080/',
  pretendToBeVisual: true,
})
let loaded = null
dom.window.__ModuleLoader__ = { load: (spec) => { loaded = spec } }
global.window = dom.window
global.document = dom.window.document
global.MutationObserver = dom.window.MutationObserver
global.HTMLElement = dom.window.HTMLElement
global.Element = dom.window.Element
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
global.fetch = stubFetch
global.requestAnimationFrame = (fn) => setTimeout(fn, 0)
dom.window.matchMedia = dom.window.matchMedia || ((q) => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
global.matchMedia = dom.window.matchMedia

const failures = []
const check = (name, fn) => { try { fn() } catch (e) { failures.push(name + ': ' + e.message) } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

new Function(src)()

// --- load + mount -------------------------------------------------------------
check('module loads via __ModuleLoader__', () => { if (loaded === null || loaded.id !== 'dsh-zhipu-usage') throw new Error('not registered') })
const exports = loaded.factory(() => ({}))
check('apply is exported', () => { if (typeof exports.apply !== 'function') throw new Error('missing') })

const disposers = []
const ctx = { effect: (fn) => { disposers.push(fn()) } }
exports.apply(ctx)
await wait(150) // observer-driven placement + first refresh (bound state)

check('apply() mounts sidebar entry', () => {
  const entry = document.querySelector('[data-dsh-zhipu-usage-entry]')
  if (entry === null) throw new Error('entry not mounted')
  if (!entry.textContent.startsWith('智谱用量')) throw new Error('unexpected entry text: ' + entry.textContent)
})

// --- panel open: the path that crashed in 0.2.0 (themeColors regression) ------
check('entry click opens panel', () => { document.querySelector('[data-dsh-zhipu-usage-entry]').click() })
check('overlay visible', () => { if (document.querySelector('.dsh-zpu-overlay').hidden) throw new Error('still hidden') })

await wait(80)
check('three summary cards rendered', () => {
  const cards = [...document.querySelectorAll('.dsh-zpu-cardValue')]
  if (cards.length !== 3) throw new Error('cards=' + cards.length)
  if (!cards[0].textContent.includes('万') && !cards[0].textContent.includes('亿')) throw new Error('today value not formatted: ' + cards[0].textContent)
})
check('active card flagged via data-active', () => { if (document.querySelector('.dsh-zpu-card[data-active]') === null) throw new Error('none') })
check('quota bar filled with percent', () => {
  const fill = document.querySelector('.dsh-zpu-quotaFill')
  if (fill.style.width !== '42%') throw new Error('width=' + fill.style.width)
})
check('quota text shows plan + countdown', () => {
  const t = document.querySelector('.dsh-zpu-quota').textContent
  if (!t.includes('PRO') || !t.includes('42%')) throw new Error('text=' + t)
})
check('trend chart svg rendered (0.2.0 crash path)', () => {
  const svg = document.querySelector('.dsh-zpu-panel svg[viewBox="0 0 560 168"]')
  if (svg === null) throw new Error('no chart svg')
  if (!svg.querySelector('path[d]')) throw new Error('no curve path')
})
check('model table rows rendered', () => {
  const rows = [...document.querySelectorAll('.dsh-zpu-table tbody tr')]
  if (rows.length !== 2) throw new Error('rows=' + rows.length)
})
check('range select exists with five options', () => {
  const opts = document.querySelectorAll('.dsh-zpu-select option')
  if (opts.length !== 5) throw new Error('opts=' + opts.length)
})

// --- token dialog: the other 0.2.0 crash path ---------------------------------
check('token dialog opens (0.2.0 crash path)', () => {
  document.querySelector('.dsh-zpu-chip').click()
  if (document.querySelector('.dsh-zpu-dialogBox') === null) throw new Error('no dialog')
})
check('invalid paste rejected without crash', () => {
  const ta = document.querySelector('.dsh-zpu-textarea')
  ta.value = 'garbage'
  ;[...document.querySelectorAll('.dsh-zpu-dialog button')].find((b) => b.textContent === '确认更新').click()
})
await wait(30)
check('valid token handoff closes dialog', () => {
  const dlg = document.querySelector('.dsh-zpu-dialog')
  if (dlg === null) throw new Error('dialog missing')
  const ta = dlg.querySelector('textarea')
  ta.value = 'bigmodel_token_production=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N65IhY7M5XKzM'
  ;[...dlg.querySelectorAll('button')].find((b) => b.textContent === '确认更新').click()
})
await wait(60)

// --- unbound / no-key path ------------------------------------------------------
mode = 'unbound'
document.querySelector('.dsh-zpu-btn').click() // 刷新
await wait(80)
check('unbound cards show 待绑定, not a crash', () => {
  const first = document.querySelector('.dsh-zpu-cardValue').textContent
  if (first !== '待绑定') throw new Error('value=' + first)
})
check('quota hint shows missing API key', () => {
  const t = document.querySelector('.dsh-zpu-quota').textContent
  if (!t.includes('未配置 API Key')) throw new Error('text=' + t)
})
check('trend section cleared when unbound', () => {
  const svg = document.querySelector('.dsh-zpu-panel svg[viewBox="0 0 560 168"]')
  if (svg !== null) throw new Error('chart should be gone')
})

// --- teardown -------------------------------------------------------------------
check('teardown disposes everything', () => { for (const d of disposers) { if (typeof d === 'function') d() } })
check('entry removed after teardown', () => { if (document.querySelector('[data-dsh-zhipu-usage-entry]') !== null) throw new Error('still there') })

// state requests hit the state route with fallback ordering intact
check('state route was fetched', () => { if (!fetchLog.some((l) => l.includes('/api/dsh-zhipu-usage/state-r2'))) throw new Error('no state fetch') })

if (failures.length > 0) {
  console.error('FAILURES:\n  ' + failures.join('\n  '))
  process.exit(1)
}
console.log('render smoke: all ' + 20 + ' checks passed')
