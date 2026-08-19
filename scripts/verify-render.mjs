// Render the proxied Zhipu console login page in jsdom and report what the
// SPA actually mounts. Catches rewrite-induced JS errors a static check
// cannot see. Usage: node scripts/verify-render.mjs [path]
import { JSDOM, VirtualConsole } from 'jsdom'

const path = process.argv[2] ?? '/login'
const url = 'http://127.0.0.1:3080/api/dsh-zhipu-usage/auth/proxy' + path

const errors = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + String(e?.message ?? e).slice(0, 200)))
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)))

const dom = await JSDOM.fromURL(url, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // jsdom lacks some modern browser APIs the app expects; polyfill from
    // Node so verification failures reflect the PAGE, not the sandbox
    const web = globalThis[Symbol.for('nodejs.webstreams')] ?? {}
    void web
    import('node:stream/web').then((m) => {
      window.TransformStream = m.TransformStream
      window.ReadableStream = window.ReadableStream ?? m.ReadableStream
      window.WritableStream = window.WritableStream ?? m.WritableStream
    })
    window.fetch = globalThis.fetch.bind(globalThis)
    window.Request = globalThis.Request
    window.Response = globalThis.Response
    window.Headers = globalThis.Headers
    window.IntersectionObserver = window.IntersectionObserver ?? class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    }
    window.MutationObserver = window.MutationObserver ?? class {
      observe() {}
      disconnect() {}
      takeRecords() { return [] }
    }
    window.ResizeObserver = window.ResizeObserver ?? class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.matchMedia = window.matchMedia ?? ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
  },
})

await new Promise((r) => setTimeout(r, 20000))
const doc = dom.window.document
const app = doc.querySelector('#app') ?? doc.querySelector('#app1')
const ws = new dom.window.RegExp('\\s+', 'g')
const text = (app?.textContent ?? doc.body?.textContent ?? '').replace(ws, ' ').trim()
const inputs = doc.querySelectorAll('input').length
const buttons = [...doc.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 8)
console.log('URL:', url)
console.log('app node:', app ? app.tagName + '#' + app.id : 'MISSING')
console.log('app innerHTML bytes:', app ? app.innerHTML.length : 0)
console.log('rendered text (' + text.length + '):', text.slice(0, 300))
console.log('inputs:', inputs, '| buttons:', JSON.stringify(buttons))
const real = errors.filter((e) => !e.includes('Could not parse CSS'))
console.log('non-CSS errors (' + real.length + '):')
for (const e of real.slice(0, 10)) console.log('  -', e)
process.exit(0)
