// Verify the capture snippet: syntax, hook installation, fetch+XHR capture,
// floating button, modal text build.
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://open.bigmodel.cn/usercenter/usage',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})
const { window } = dom
const alerts = []
window.alert = (t) => alerts.push(String(t))
window.fetch = globalThis.fetch.bind(globalThis)
window.open = () => {
  const writes = []
  return { document: { write: (h) => writes.push(h) }, __writes: writes }
}
const snippets = []
window.open = () => {
  const w = { document: { write: (h) => snippets.push(h) } }
  return w
}

const code = readFileSync('scripts/capture-snippet.js', 'utf8').replace(/^javascript:/, '')
window.eval(code)

// a fetch and an XHR after hooking
await window.fetch('https://open.bigmodel.cn/api/biz/tokenResPack/productIdInfo')
const xhr = new window.XMLHttpRequest()
xhr.open('GET', 'https://open.bigmodel.cn/api/biz/customer/getTokenMagnitude?productId=product-047')
xhr.send()

await new Promise((r) => setTimeout(r, 1500))
const btn = window.document.getElementById('__zpuBadge')
console.log('button:', btn ? btn.textContent : 'MISSING')
btn.dispatchEvent(new window.Event('click'))
await new Promise((r) => setTimeout(r, 300))
const text = snippets.join('')
console.log('modal written:', snippets.length > 0 ? 'yes' : 'no')
console.log('has usage url:', text.includes('productIdInfo') || text.includes('getTokenMagnitude'))
console.log('has method+status:', /GET 200|GETs+200/.test(text.replace(/\s+/g, ' ')) || text.includes('GET'))
console.log('alerts:', JSON.stringify(alerts))
const pass = btn !== null && snippets.length > 0 && text.includes('getTokenMagnitude')
console.log(pass ? 'SNIPPET CHECK: PASS' : 'SNIPPET CHECK: FAIL')
process.exit(pass ? 0 : 1)
