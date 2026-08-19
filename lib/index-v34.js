/**
 * dsh-zhipu-usage host half.
 *
 * Scans the local DSH session logs and serves the aggregated Zhipu GLM
 * Coding Plan usage state to the browser half over a loopback-only route.
 * Also registers a short system-prompt section so agents in future sessions
 * know what the plugin is when the user mentions usage stats.
 */
import { readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { scanSessions } from './scan-v2.mjs'

export const inject = ['webServer', 'systemPrompt']

export const API_PREFIX = '/api/dsh-zhipu-usage'

/** Official Zhipu coding-plan quota endpoint (same one dsh-quota-panel uses). */
export const QUOTA_ENDPOINT = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit'

const QUOTA_TTL_MS = 5 * 60_000

function quotaApiKey() {
  for (const name of ['ZHIPU_API_KEY', 'GLM_API_KEY']) {
    const value = process.env[name]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

// ---- console login capture (reverse-proxy through the host) -----------------
//
// The console's absolute usage numbers (e.g. the monthly token total) live
// behind login. SMS login carries a Tencent slider captcha, so headless
// login is out; instead the plugin reverse-proxies the real login page: the
// user logs in inside the proxied page (captcha and all), every response
// flows back through the host, and the console cookies are captured here
// and persisted for console API calls.

const CONSOLE_ORIGIN = 'https://open.bigmodel.cn'
const STATIC_ORIGIN = 'https://static.bigmodel.cn'
const PROXY_PREFIX = API_PREFIX + '/auth/proxy'
const ASSET_PREFIX = API_PREFIX + '/auth/asset'
const AUTH_STORE = join(homedir(), '.dsh', 'zhipu-usage-auth.json')
const PROXY_MAX_BODY = 1024 * 1024
const chr10 = String.fromCharCode(10)
const rewriteCache = new Map()

function emptyJar() {
  return { cookies: {}, savedAt: 0 }
}

function loadJar() {
  try {
    const parsed = JSON.parse(readFileSync(AUTH_STORE, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && parsed.cookies !== null && typeof parsed.cookies === 'object') {
      return parsed
    }
  } catch { /* fresh jar */ }
  return emptyJar()
}

function persistJar(jar) {
  jar.savedAt = Date.now()
  try {
    writeFileSync(AUTH_STORE + '.tmp', JSON.stringify(jar))
    renameSync(AUTH_STORE + '.tmp', AUTH_STORE)
    try { chmodSync(AUTH_STORE, 0o600) } catch { /* best effort */ }
  } catch { /* auth still works without persistence */ }
}

function jarCookieHeader(jar) {
  const now = Date.now()
  const parts = []
  for (const [name, cookie] of Object.entries(jar.cookies)) {
    if (cookie === null || typeof cookie !== 'object') continue
    if (typeof cookie.expires === 'number' && cookie.expires < now) continue
    parts.push(name + '=' + cookie.value)
  }
  return parts.join('; ')
}

function jarBound(jar) {
  return jarCookieHeader(jar) !== '' || (typeof jar.token === 'string' && jar.token !== '')
}

/** Rewrite a proxied response and capture cookies. Shared by proxy + asset. */
async function proxyUpstream(upstreamBase, req, res, subPath) {
  // The console SPA has several axios instances; rewriting both baseURLs and
  // call paths yields double-prefixed URLs (…/proxy/api/api/dsh-zhipu-usage/
  // auth/proxy/biz/…). Normalize: strip everything up to the LAST proxy
  // marker, then map bare /biz onto the /api gateway prefix.
  const marker = 'dsh-zhipu-usage/auth/proxy'
  if (subPath.includes(marker)) subPath = subPath.slice(subPath.lastIndexOf(marker) + marker.length)
  if (upstreamBase === CONSOLE_ORIGIN && (subPath === '/biz' || subPath.startsWith('/biz/'))) {
    subPath = '/api' + subPath
  }
  const url = upstreamBase + (subPath.startsWith('/') ? subPath : '/' + subPath)
  // traffic recorder: log every API-ish proxied call (path + auth shape) so
  // the real console endpoints reveal themselves while the user browses
  if (upstreamBase === CONSOLE_ORIGIN && (subPath.includes('/api/') || subPath.includes('/biz/'))) {
    try {
      const authKind = typeof req.headers.authorization === 'string' ? (req.headers.authorization.startsWith('Bearer ') ? 'bearer' : 'raw') : '-'
      const line = new Date().toISOString() + ' ' + req.method + ' ' + subPath + ' auth=' + authKind + chr10
      const fsMod = await import('node:fs')
      fsMod.appendFileSync(join(homedir(), '.dsh', 'zhipu-usage-proxy.log'), line)
    } catch { /* logging must never break the proxy */ }
  }
  const headers = {}
  for (const key of ['user-agent', 'accept', 'accept-language', 'content-type']) {
    const value = req.headers[key]
    if (value !== undefined) headers[key] = value
  }
  headers.referer = CONSOLE_ORIGIN + '/'
  headers.origin = CONSOLE_ORIGIN
  // the console SPA authenticates with an Authorization / X-Token header from
  // its own localStorage (not cookies): capture it as the real session token
  for (const tokenHeader of ['authorization', 'x-token']) {
    const value = req.headers[tokenHeader]
    if (typeof value === 'string' && value !== '' && authJar.token !== value) {
      authJar.token = value
      persistJar(authJar)
    }
  }
  if (typeof authJar.token === 'string' && authJar.token !== '' && upstreamBase === CONSOLE_ORIGIN) {
    headers.authorization = authJar.token
    headers['x-token'] = authJar.token
  }
  const jar = authJar
  const cookieHeader = jarCookieHeader(jar)
  if (cookieHeader !== '') headers.cookie = cookieHeader
  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > PROXY_MAX_BODY) { json(res, 413, { ok: false, error: 'body too large' }); return }
      chunks.push(chunk)
    }
    if (chunks.length > 0) body = Buffer.concat(chunks)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, 20_000)
  let upstream
  try {
    upstream = await fetch(url, { method: req.method, headers, body, redirect: 'manual', signal: controller.signal })
  } catch (error) {
    json(res, 502, { ok: false, error: 'upstream: ' + String(error?.message ?? error) })
    return
  } finally {
    clearTimeout(timer)
  }
  for (const raw of upstream.headers.getSetCookie?.() ?? []) {
    const segments = raw.split(';')
    const pair = segments[0] ?? ''
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const cookie = { value: pair.slice(eq + 1).trim() }
    for (const attr of segments.slice(1)) {
      const trimmed = attr.trim()
      const eqPos = trimmed.indexOf('=')
      const key = (eqPos === -1 ? trimmed : trimmed.slice(0, eqPos)).toLowerCase()
      const value = eqPos === -1 ? '' : trimmed.slice(eqPos + 1)
      if (key === 'path') cookie.path = value
      else if (key === 'domain') cookie.domain = value.replace(/^\./, '')
      else if (key === 'expires') {
        const ts = Date.parse(value)
        if (Number.isFinite(ts)) cookie.expires = ts
      } else if (key === 'max-age') {
        const secs = Number(value)
        if (Number.isFinite(secs)) cookie.expires = Date.now() + secs * 1000
      }
    }
    authJar.cookies[pair.slice(0, eq).trim()] = cookie
  }
  if (jar.cookies !== authJar.cookies && Object.keys(authJar.cookies).length > 0) persistJar(authJar)
  else persistJar(authJar)
  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
  const outHeaders = { 'content-type': contentType, 'cache-control': 'no-store' }
  const setCookies = (upstream.headers.getSetCookie?.() ?? []).map((raw) => raw.split(';').filter((attr) => !attr.trim().toLowerCase().startsWith('domain=')).join(';'))
  if (setCookies.length > 0) outHeaders['set-cookie'] = setCookies
  const location = upstream.headers.get('location')
  if (location !== null) {
    outHeaders.location = location.startsWith('/')
      ? PROXY_PREFIX + location
      : location.startsWith(CONSOLE_ORIGIN + '/')
        ? PROXY_PREFIX + location.slice(CONSOLE_ORIGIN.length)
        : location
  }
  const rewrite = contentType.includes('text/html') || contentType.includes('javascript') || contentType.includes('application/json') || subPath.endsWith('.js') || subPath.endsWith('.html')
  res.writeHead(upstream.status, outHeaders)
  if (rewrite) {
    // rewritten-text cache: repeat loads of the heavy console bundle skip
    // both the upstream fetch and the rewrite churn (phones struggle with
    // rewriting 1MB+ JS on every request)
    const cacheKey = upstreamBase + subPath
    const cached = rewriteCache.get(cacheKey)
    if (cached !== undefined) {
      res.end(cached)
      return
    }
    let text = await upstream.text()
    // Sentinel two-phase rewrite: mark first, substitute last, so the proxy
    // prefixes (which themselves contain '/api') never cascade onto each
    // other. Covers absolute origins AND the SPA's root-relative API base
    // (axios baseURL:'/api' would otherwise resolve against the DSH server
    // root instead of the proxy prefix and every console call would 404).
    text = text.split(STATIC_ORIGIN).join('@@A@@')
    text = text.split(CONSOLE_ORIGIN + '/').join('@@P@@/')
    text = text.split(CONSOLE_ORIGIN).join('@@P@@')
    // SPA router base must include the proxy prefix or every route misses
    // (blank page); targeted rewrites only — stray double prefixes are
    // normalized by the proxy itself
    if (contentType.includes('application/json')) {
      // runtime-discovered URLs (qiankun sub-app entries, etc.) arrive in
      // JSON bodies — rewrite origins only, no code patterns
      text = text.split(CONSOLE_ORIGIN + '/').join('@@P@@/')
      text = text.split(CONSOLE_ORIGIN).join('@@P@@')
      text = text.split(STATIC_ORIGIN).join('@@A@@')
    } else {
      text = text.split('mode:"history",base:"/"').join('mode:"history",base:"@@P@@/"')
      text = text.split('baseURL:"/api"').join('baseURL:"@@P@@/api"')
    }
    text = text.split('@@A@@').join(ASSET_PREFIX)
    text = text.split('@@P@@').join(PROXY_PREFIX)
    if (!contentType.includes('text/html') && text.length <= 4_000_000 && rewriteCache.size < 60) {
      rewriteCache.set(cacheKey, text)
    }
    if (contentType.includes('text/html')) {
      // surface real-browser JS errors as an on-page red banner so the user
      // can read back what actually failed on a blank page
      const banner = '<scr' + 'ipt>window.onerror=function(m,s,l,c){var d=document.createElement("div");d.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99999;background:#b00;color:#fff;font:12px monospace;padding:8px;white-space:pre-wrap;word-break:break-all";d.textContent="PAGE ERR "+m+" @ "+(s||"")+":"+l+":"+c;(document.body||document.documentElement).appendChild(d)};window.addEventListener("unhandledrejection",function(e){window.onerror("PROMISE "+((e.reason&&e.reason.message)||e.reason||"?"),"",0,0)})</scr' + 'ipt>'
      const headAt = text.indexOf('<head>')
      if (headAt >= 0) text = text.slice(0, headAt + 6) + banner + text.slice(headAt + 6)
    }
    res.end(text)
  } else {
    res.end(Buffer.from(await upstream.arrayBuffer()))
  }
}

let authJar = loadJar()

// ---- console usage (official, account-wide, no computation) ------------------

const USAGE_ENDPOINT = CONSOLE_ORIGIN + '/api/monitor/usage/model-usage'
const USAGE_TTL_MS = 5 * 60_000

function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

async function fetchUsageRange(start, end) {
  const url = USAGE_ENDPOINT + '?startTime=' + encodeURIComponent(fmtDateTime(start)) + '&endTime=' + encodeURIComponent(fmtDateTime(end))
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, 10_000)
  try {
    const response = await fetch(url, {
      headers: { authorization: authJar.token, referer: 'https://www.bigmodel.cn/coding-plan/personal/usage', accept: 'application/json' },
      signal: controller.signal,
    })
    if (response.status === 401) { throw Object.assign(new Error('token-expired'), { expired: true }) }
    const body = await response.json()
    if (body?.code !== 200) throw new Error(body?.msg ?? ('HTTP ' + response.status))
    const d = body.data ?? {}
    const total = d.totalUsage ?? {}
    return {
      tokens: Number(total.totalTokensUsage ?? 0),
      calls: Number(total.totalModelCallCount ?? 0),
      models: (total.modelSummaryList ?? []).map((m) => ({ name: m.modelName, tokens: Number(m.totalTokens ?? 0) })),
      series: (d.x_time ?? []).map((t, i) => ({
        label: String(t),
        tokens: Number((d.tokensUsage ?? [])[i] ?? 0),
        calls: Number((d.modelCallCount ?? [])[i] ?? 0),
      })),
    }
  } finally {
    clearTimeout(timer)
  }
}

let usageCache = { at: 0, value: null }
async function fetchConsoleUsage() {
  if (typeof authJar.token !== 'string' || authJar.token === '') return { ok: false, error: 'not-bound' }
  if (Date.now() - usageCache.at < USAGE_TTL_MS) return usageCache.value
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const [month, today] = await Promise.all([fetchUsageRange(monthStart, now), fetchUsageRange(dayStart, now)])
    usageCache = { at: Date.now(), value: { ok: true, month, today, fetchedAt: Date.now() } }
  } catch (error) {
    usageCache = { at: Date.now(), value: { ok: false, error: String(error?.message ?? error), expired: error?.expired === true } }
  }
  return usageCache.value
}

/** Minimal login page (a few KB): phone + Tencent slider + SMS code. */
const MINI_PAGE = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>智谱账号绑定</title><script src="https://t.captcha.qq.com/TCaptcha.js"></script><style>body{font:14px system-ui;max-width:340px;margin:40px auto;padding:0 16px;background:#14171f;color:#e7eaf0}h3{margin:0 0 16px}input{width:100%;box-sizing:border-box;padding:10px;margin:6px 0;border:1px solid #3a4250;border-radius:8px;background:#1b1f27;color:inherit;font-size:15px}button{width:100%;padding:11px;margin-top:10px;border:0;border-radius:8px;background:#4d8cff;color:#fff;font-size:15px}button:disabled{opacity:.5}#msg{min-height:20px;font-size:12px;color:#9aa3b2;margin-top:8px;word-break:break-all}</style></head><body><h3>绑定智谱账号</h3><input id="phone" placeholder="手机号" inputmode="numeric"><button id="send">获取短信验证码（需滑块）</button><input id="code" placeholder="短信验证码" inputmode="numeric"><button id="login">登录绑定</button><div id="msg"></div><script>var P="/api/dsh-zhipu-usage/auth/mini";var msg=document.getElementById("msg");function say(t){msg.textContent=t}document.getElementById("send").onclick=function(){var ph=document.getElementById("phone").value.trim();if(!/^1\\d{10}$/.test(ph)){say("请输入 11 位手机号");return}try{var c=new TencentCaptcha("196026326",function(r){if(r.ret!==0){say(r.ret===2?"已取消滑块":"滑块未通过");return}fetch(P+"/send",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone:ph,ticket:r.ticket,randstr:r.randstr})}).then(function(x){return x.json()}).then(function(d){say(d.ok?"验证码已发送，请查收短信":("发送失败: "+(d.error||"")))})},{mode:"bind",type:"popup"});c.show()}catch(e){say("滑块组件加载失败: "+e)}};document.getElementById("login").onclick=function(){var ph=document.getElementById("phone").value.trim();var cd=document.getElementById("code").value.trim();if(!ph||!cd){say("请填写手机号和验证码");return}fetch(P+"/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone:ph,code:cd})}).then(function(x){return x.json()}).then(function(d){say(d.ok?"绑定成功，可关闭本页":("登录失败: "+(d.error||"")))})};</script></body></html>'

async function miniSend(phone, ticket, randstr) {
  const response = await fetch(CONSOLE_ORIGIN + '/api/biz/code/smsCode/TencentVerifyCaptcha', {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: CONSOLE_ORIGIN + '/' },
    body: JSON.stringify({ phoneNumber: phone, countryCode: '86', ticket, randstr }),
  })
  return await response.json()
}

async function miniLogin(phone, code) {
  const response = await fetch(CONSOLE_ORIGIN + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: CONSOLE_ORIGIN + '/' },
    body: JSON.stringify({
      phoneNumber: phone, countryCode: '86', username: phone, smsCode: code, password: '',
      loginType: 'sms', grantType: 'customer', userType: 'PERSONAL', userCode: '',
    }),
  })
  const body = await response.json()
  if (body?.code !== 200) return { ok: false, error: body?.msg ?? ('HTTP ' + response.status) }
  const data = body.data ?? {}
  const token = data.access_token ?? data.accessToken ?? data.token ?? null
  if (token !== null) {
    authJar.token = token.startsWith('Bearer ') ? token : 'Bearer ' + token
    persistJar(authJar)
    return { ok: true }
  }
  return { ok: false, error: 'login ok but no token in response' }
}

/** Probe console APIs with the captured cookie (whitelisted, read-only GETs). */
async function consoleProbe() {
  if (!jarBound(authJar)) return { ok: false, error: 'not bound' }
  const headers = { cookie: jarCookieHeader(authJar), referer: CONSOLE_ORIGIN + '/', accept: 'application/json' }
  if (typeof authJar.token === 'string' && authJar.token !== '') {
    headers.authorization = authJar.token
    headers['x-token'] = authJar.token
  }
  const candidates = [
    '/biz/tokenResPack/productIdInfo',
    '/api/biz/tokenResPack/productIdInfo',
    '/biz/tokenAccounts/query-order/1',
    '/api/biz/tokenAccounts/query-order/1',
    '/biz/customerService/authTokenForBootstrap',
    '/api/biz/customerService/authTokenForBootstrap',
    '/api/monitor/usage/quota/limit',
  ]
  const results = []
  for (const path of candidates) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => { controller.abort() }, 10_000)
      let response
      try {
        response = await fetch(CONSOLE_ORIGIN + path, { headers, signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
      const text = await response.text()
      results.push({ path, status: response.status, body: text.slice(0, 800) })
    } catch (error) {
      results.push({ path, error: String(error?.message ?? error) })
    }
  }
  return { ok: true, results }
}

const PROMPT_ORDER = 220

const GUIDANCE = '本机已安装 dsh-zhipu-usage 插件（智谱 GLM Coding Plan 用量统计）：侧边栏「智谱用量」入口位于工作区菜单上方，点开可见今日/近7天/近30天/累计调用量与 token 明细（输入/输出/缓存读）、每日趋势与按模型统计，入口行实时显示今日 token 胶囊。数据源为本机 DSH 会话日志（~/.dsh/sessions，按会话内 usage/finish 记录聚合并按 provider/model 归类），仅统计本机 DSH 会话，不含 Claude Code 等其他客户端或其他设备的用量。用户提到「智谱用量 / coding plan 用量 / GLM 用量 / token 用量统计」时即指本插件，请据此协作。'

function isIPv4Loopback(v4) {
  const parts = v4.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isLoopbackAddress(address) {
  if (address === undefined) return false
  const value = address.toLowerCase()
  if (value === '::1') return true
  if (value.startsWith('::ffff:')) return isIPv4Loopback(value.slice('::ffff:'.length))
  return isIPv4Loopback(value)
}

/** Loopback fence: loopback socket AND (loopback Host header OR same-origin browser markers). */
function isLoopbackRequest(req) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase()
  if (host === 'localhost' || host === '::1' || host === '[::1]' || isIPv4Loopback(host)) return true
  const site = req.headers['sec-fetch-site']
  return site === 'same-origin' || site === 'none'
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req, maxBytes = 4096) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new Error('body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function apply(ctx, config = {}) {
  const root = typeof config.sessionRoot === 'string' && config.sessionRoot.trim() !== ''
    ? config.sessionRoot
    : join(homedir(), '.dsh', 'sessions')
  const cache = new Map()
  let inflight = null

  // Single-flight: concurrent state requests share one scan; the mtime+size
  // cache makes steady-state scans nearly free. quota5h: the plan's 5-hour
  // prompt quota shown as the window denominator (Lite ~120; set via config).
  const scanOptions = { quota5h: typeof config.quota5h === 'number' && config.quota5h > 0 ? config.quota5h : 600 }

  // Official quota (5h window percent + reset, search lane, plan level),
  // fetched with the same key the harness itself uses, cached for 5 min.
  let quotaCache = { at: 0, value: { ok: false, error: 'not fetched yet' } }
  const fetchRemoteQuota = async () => {
    if (Date.now() - quotaCache.at < QUOTA_TTL_MS) return quotaCache.value
    const key = quotaApiKey()
    if (key === undefined) {
      quotaCache = { at: Date.now(), value: { ok: false, error: 'ZHIPU_API_KEY / GLM_API_KEY not set' } }
      return quotaCache.value
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => { controller.abort() }, 8_000)
      let body
      try {
        const response = await fetch(QUOTA_ENDPOINT, { headers: { authorization: 'Bearer ' + key }, signal: controller.signal })
        body = await response.json()
      } finally {
        clearTimeout(timer)
      }
      if (body?.code !== 200) throw new Error('upstream code ' + body?.code + ': ' + (body?.msg ?? 'unknown'))
      const limits = Array.isArray(body?.data?.limits) ? body.data.limits : []
      const tokens = limits.filter((l) => l.type === 'TOKENS_LIMIT')
        .sort((a, b) => (Number(a.unit) || 0) * (Number(a.number) || 1) - (Number(b.unit) || 0) * (Number(b.number) || 1))
      const time = limits.find((l) => l.type === 'TIME_LIMIT')
      const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
      const rolling5h = tokens.length > 0
        ? { percent: num(tokens[0].percentage), resetTs: num(tokens[0].nextResetTime) }
        : undefined
      const search = time !== undefined
        ? { used: num(time.currentValue), total: num(time.usage), percent: num(time.percentage), resetTs: num(time.nextResetTime) }
        : undefined
      if (rolling5h === undefined && search === undefined) throw new Error('no TOKENS_LIMIT / TIME_LIMIT entries')
      // account report (the API key authenticates console endpoints too)
      let account
      try {
        const accResponse = await fetch('https://open.bigmodel.cn/api/biz/account/query-customer-account-report', { headers: { authorization: 'Bearer ' + key } })
        const accBody = await accResponse.json()
        if (accBody?.code === 200) {
          const d = accBody.data ?? {}
          account = {
            balance: Number(d.balance),
            giveAmount: Number(d.giveAmount),
            totalSpendAmount: Number(d.totalSpendAmount),
            todaySpendAmount: d.todaySpendAmount === null ? null : Number(d.todaySpendAmount),
          }
        }
      } catch { /* quota still works without the account report */ }
      quotaCache = { at: Date.now(), value: { ok: true, plan: body?.data?.level ?? undefined, rolling5h, search, account, fetchedAt: Date.now() } }
    } catch (error) {
      quotaCache = { at: Date.now(), value: { ok: false, error: String(error?.message ?? error) } }
    }
    return quotaCache.value
  }
  const computeState = () => {
    if (inflight === null) {
      inflight = scanSessions(root, cache, scanOptions)
        .catch((error) => ({ ok: false, error: String(error?.message ?? error) }))
        .then((state) => { inflight = null; return state })
    }
    return inflight
  }

  ctx.effect(() => {
    const disposers = []
    // duplicate-tolerant registration: leaked routes from earlier hot-mounts
    // must never kill this effect's remaining routes
    const reg = (route) => {
      try { disposers.push(ctx.webServer.register(route)) } catch (error) {
        if (!String(error?.message ?? error).includes('duplicate')) throw error
      }
    }
    const handler = async (req, res) => {
      if (req.method !== 'GET') { json(res, 405, { ok: false, error: 'method-not-allowed' }); return }
      if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
      const state = await computeState()
      const remote = await fetchRemoteQuota()
      json(res, state.ok ? 200 : 500, state.ok ? { ...state, remote } : state)
    }
    // Failed hot-mounts in this host leaked route registrations (/state,
    // /state2, ...); register the first free path instead of failing. After
    // a dsh web restart there are no leaks and the first path wins. The
    // browser probes the same candidate order.
    let registered = false
    for (const path of [API_PREFIX + '/state-v13', API_PREFIX + '/state-v9', API_PREFIX + '/state-v6', API_PREFIX + '/state-v5', API_PREFIX + '/state']) {
      try {
        reg({ kind: 'exact', path, handler })
        registered = true
        break
      } catch (error) {
        if (!String(error?.message ?? error).includes('duplicate')) throw error
      }
    }
    // hot-mount iterations leak state routes in long-running hosts; an older
    // instance keeps serving them (scan code is shared) — never let this
    // kill the proxy/auth routes below
    void registered

    // remote-only state (server APIs only); versioned path + duplicate
    // tolerance so hot-mount iterations never wedge the whole effect
    for (const statePath of [API_PREFIX + '/state-r2', API_PREFIX + '/state-r1']) {
      try {
        reg({
          kind: 'exact',
          path: statePath,
          handler: async (req, res) => {
            if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
            const remote = await fetchRemoteQuota()
            const consoleUsage = await fetchConsoleUsage()
            json(res, 200, {
              ok: true,
              generatedAt: Date.now(),
              remote,
              consoleUsage,
              consoleBound: jarBound(authJar),
            })
          },
        })
        break
      } catch { /* taken by an older leaked instance; try next */ }
    }

    // console login capture + status + probe (loopback fenced)
    reg({
      kind: 'prefix',
      path: PROXY_PREFIX,
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        const idx = (req.url ?? '').indexOf(PROXY_PREFIX)
        const sub = idx >= 0 ? (req.url ?? '').slice(idx + PROXY_PREFIX.length) : ''
        void proxyUpstream(CONSOLE_ORIGIN, req, res, sub)
      },
    })
    // double-prefixed calls (/api/api/dsh-zhipu-usage/auth/proxy/…) never
    // match the main prefix route — catch them here and normalize
    reg({
      kind: 'prefix',
      path: '/api/api',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        const url = req.url ?? ''
        const marker = 'dsh-zhipu-usage/auth/proxy'
        const idx = url.lastIndexOf(marker)
        if (idx < 0) { json(res, 404, { ok: false, error: 'not found' }); return }
        void proxyUpstream(CONSOLE_ORIGIN, req, res, url.slice(idx + marker.length))
      },
    })
    reg({
      kind: 'prefix',
      path: ASSET_PREFIX,
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        const idx = (req.url ?? '').indexOf(ASSET_PREFIX)
        const sub = idx >= 0 ? (req.url ?? '').slice(idx + ASSET_PREFIX.length) : ''
        void proxyUpstream(STATIC_ORIGIN, req, res, sub)
      },
    })
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/status',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        json(res, 200, { ok: true, bound: jarBound(authJar), token: typeof authJar.token === 'string' && authJar.token !== '', cookies: Object.keys(authJar.cookies).length, savedAt: authJar.savedAt })
      },
    })
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/logout',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        authJar = emptyJar()
        try { unlinkSync(AUTH_STORE) } catch { /* already gone */ }
        json(res, 200, { ok: true, bound: false })
      },
    })
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/probe',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        json(res, 200, await consoleProbe())
      },
    })

    // token paste receiver (panel same-origin POST {l:{access_token}})
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/handoff',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        try {
          const body = await readBody(req, 8192)
          const value = String(body?.l?.access_token ?? body?.token ?? '')
          if (value.length < 30) { json(res, 400, { ok: false, error: 'token too short' }); return }
          authJar.token = /^Bearer /i.test(value) ? value : 'Bearer ' + value
          persistJar(authJar)
          json(res, 200, { ok: true })
        } catch (error) {
          json(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      },
    })
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/capture',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        let body = null
        if (req.method === 'GET') {
          // cross-origin navigation delivery: window.open(...?d=<urlencoded json>)
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const raw = url.searchParams.get('d')
          if (raw !== null) {
            try { body = JSON.parse(raw) } catch { body = null }
          }
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        try {
          if (body === null) body = await readBody(req, 256 * 1024)
          const capture = {
            at: new Date().toISOString(),
            page: body?.page ?? body?.href ?? '',
            apis: typeof body?.apis === 'string' ? body.apis.split('\n').filter(Boolean).slice(0, 200) : [],
            text: typeof body?.text === 'string' ? body.text.slice(0, 8000) : '',
            tokenHandoff: body?.l ?? null,
          }
          const fsMod = await import('node:fs')
          fsMod.appendFileSync(join(homedir(), '.dsh', 'zhipu-usage-capture.jsonl'), JSON.stringify(capture) + chr10)
          res.end('<!doctype html><meta charset=utf-8><body style="font:14px system-ui;padding:24px">已捕获 ' + capture.apis.length + ' 条 API 调用记录，可关闭本页</body>')
        } catch (error) {
          res.end('<!doctype html><meta charset=utf-8><body style="font:14px system-ui;padding:24px">capture error: ' + String(error?.message ?? error) + '</body>')
        }
      },
    })
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/mini',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(MINI_PAGE)
      },
    })
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/mini/send',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        try {
          const body = await readBody(req)
          const result = await miniSend(String(body.phone ?? ''), String(body.ticket ?? ''), String(body.randstr ?? ''))
          json(res, result?.code === 200 ? 200 : 400, result?.code === 200 ? { ok: true } : { ok: false, error: result?.msg ?? 'upstream error' })
        } catch (error) {
          json(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      },
    })
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/mini/login',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        try {
          const body = await readBody(req)
          json(res, 200, await miniLogin(String(body.phone ?? ''), String(body.code ?? '')))
        } catch (error) {
          json(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      },
    })

    if ((config.announceToAgent ?? true) !== false) {
      // a boot-loaded instance may already hold this section name; one
      // announcement is enough, so a duplicate registration is skipped
      try {
        const dispose = ctx.systemPrompt.section({ name: 'plugin:zhipu-usage', order: PROMPT_ORDER, text: GUIDANCE })
        if (typeof dispose === 'function') disposers.push(dispose)
      } catch { /* already announced by another instance */ }
    }
    return () => {
      for (const dispose of disposers) { try { dispose?.() } catch { /* best effort */ } }
    }
  }, 'zhipu-usage: state route + agent guidance')
}
