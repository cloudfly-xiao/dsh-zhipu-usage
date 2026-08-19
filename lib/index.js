/**
 * dsh-zhipu-usage host half.
 *
 * Serves the Zhipu GLM Coding Plan usage state (official APIs) to the
 * browser half over loopback-fenced routes, and registers a short
 * system-prompt section so agents in future sessions know what the plugin
 * is when the user mentions usage stats.
 *
 * 0.2.1: the experimental console reverse-proxy / mini-login / capture /
 * probe endpoint group was removed (paste-token is the only supported
 * binding path), and the loopback fence now requires loopback socket AND
 * loopback Host AND same-origin/none sec-fetch-site (DNS-rebinding and
 * local-CSRF hardening).
 */
import { readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { scanSessions } from './scan-v1.mjs'

export const inject = ['webServer', 'systemPrompt']

export const API_PREFIX = '/api/dsh-zhipu-usage'

/** Official Zhipu coding-plan quota endpoint. */
export const QUOTA_ENDPOINT = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit'

const CONSOLE_ORIGIN = 'https://open.bigmodel.cn'
const QUOTA_TTL_MS = 5 * 60_000
const ERROR_TTL_MS = 30_000
const FETCH_TIMEOUT_MS = 8_000

function quotaApiKey() {
  for (const name of ['ZHIPU_API_KEY', 'GLM_API_KEY']) {
    const value = process.env[name]
    if (typeof value === 'string' && value !== '') return value
  }
  // File fallback so the remote report does not depend on how dsh was
  // launched (boot scripts / manual restarts often skip the login shell).
  try {
    const fromFile = readFileSync(join(homedir(), '.dsh', 'zhipu-usage-key'), 'utf8').trim()
    if (fromFile !== '') return fromFile
  } catch { /* no key file */ }
  return undefined
}

// ---- console token jar --------------------------------------------------------

const AUTH_STORE = join(homedir(), '.dsh', 'zhipu-usage-auth.json')

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

function jarBound(jar) {
  // 0.2.1: token-only. Cookies were only ever captured by the removed
  // reverse proxy; jars written by older versions may still carry some.
  return typeof jar.token === 'string' && jar.token !== ''
}

// ---- console usage (official, account-wide) -----------------------------------

const USAGE_ENDPOINT = CONSOLE_ORIGIN + '/api/monitor/usage/model-usage'
const USAGE_TTL_MS = 5 * 60_000

function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

async function fetchUsageRange(start, end, tokenOverride) {
  const url = USAGE_ENDPOINT + '?startTime=' + encodeURIComponent(fmtDateTime(start)) + '&endTime=' + encodeURIComponent(fmtDateTime(end))
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, 10_000)
  try {
    const response = await fetch(url, {
      headers: { authorization: tokenOverride ?? authJar.token, referer: 'https://www.bigmodel.cn/coding-plan/personal/usage', accept: 'application/json' },
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
  // success caches for the full TTL; failures only briefly (a transient
  // upstream blip used to blank the panel for a full five minutes)
  if (usageCache.value !== null && Date.now() - usageCache.at < (usageCache.value.ok ? USAGE_TTL_MS : ERROR_TTL_MS)) return usageCache.value
  try {
    const now = new Date()
    const day = (offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const ranges = {
      today: [day(0), now],
      yesterday: [day(-1), day(0)],
      last7: [day(-6), now],
      last30: [day(-29), now],
      month: [new Date(now.getFullYear(), now.getMonth(), 1), now],
    }
    const keys = Object.keys(ranges)
    // per-range tolerance: one flaky range degrades to null instead of
    // killing the whole report; an expired token still fails everything
    const settled = await Promise.allSettled(keys.map((k) => fetchUsageRange(ranges[k][0], ranges[k][1])))
    const value = { ok: true, fetchedAt: Date.now() }
    let anyOk = false
    for (let i = 0; i < keys.length; i += 1) {
      const result = settled[i]
      if (result.status === 'fulfilled') { value[keys[i]] = result.value; anyOk = true }
      else if (result.reason?.expired === true) throw result.reason
      else value[keys[i]] = null
    }
    if (!anyOk) throw settled[0].reason ?? new Error('all usage ranges failed')
    usageCache = { at: Date.now(), value }
  } catch (error) {
    usageCache = { at: Date.now(), value: { ok: false, error: String(error?.message ?? error), expired: error?.expired === true } }
  }
  return usageCache.value
}

let authJar = loadJar()

const PROMPT_ORDER = 220

const GUIDANCE = '本机已安装 dsh-zhipu-usage 插件（智谱 GLM Coding Plan 用量统计）：侧边栏「智谱用量」入口位于工作区菜单上方，数据来自智谱官方接口、全账号口径（覆盖账号下所有设备）。API key 通道（env ZHIPU_API_KEY/GLM_API_KEY 或 ~/.dsh/zhipu-usage-key 文件）提供 plan 等级、5 小时滚动额度（入口行胶囊显示其百分比）、搜索配额与账户金额；控制台令牌通道（面板「更新令牌」弹窗粘贴 bigmodel_token_production）提供今日/昨日/近7天/近30天/本月的 tokens、调用数、按模型拆分与趋势图。用户提到「智谱用量 / coding plan 用量 / GLM 用量 / token 用量统计」时即指本插件，请据此协作。'

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

/**
 * Loopback fence. ALL of the following must hold (AND, not OR — the old
 * OR between the Host check and sec-fetch-site let a DNS-rebinding page
 * pass with sec-fetch-site: same-origin against its own rebound origin,
 * and let any website CSRF loopback URLs that carry a literal 127.0.0.1
 * Host header):
 *   1. loopback socket,
 *   2. localhost/loopback Host header,
 *   3. sec-fetch-site is same-origin or none — or absent (curl etc.).
 */
function isLoopbackRequest(req) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase()
  if (!(host === 'localhost' || host === '::1' || host === '[::1]' || isIPv4Loopback(host))) return false
  const site = req.headers['sec-fetch-site']
  return site === undefined || site === 'same-origin' || site === 'none'
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
  // cache makes steady-state scans nearly free.
  const scanOptions = { quota5h: typeof config.quota5h === 'number' && config.quota5h > 0 ? config.quota5h : 600 }

  // Official quota (5h window percent + reset, search lane, plan level),
  // fetched with the same key the harness itself uses. Success caches for
  // 5 minutes; errors only 30s so a fixed key or network recovers fast.
  let quotaCache = { at: 0, value: { ok: false, error: 'not fetched yet' } }
  const fetchRemoteQuota = async () => {
    if (quotaCache.value.ok && Date.now() - quotaCache.at < QUOTA_TTL_MS) return quotaCache.value
    if (!quotaCache.value.ok && quotaCache.value.error !== 'not fetched yet' && Date.now() - quotaCache.at < ERROR_TTL_MS) return quotaCache.value
    const key = quotaApiKey()
    if (key === undefined) {
      quotaCache = { at: Date.now(), value: { ok: false, error: 'ZHIPU_API_KEY / GLM_API_KEY not set' } }
      return quotaCache.value
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => { controller.abort() }, FETCH_TIMEOUT_MS)
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
      // account report (the API key authenticates console endpoints too).
      // 0.2.1: same 8s timeout as the quota call — it used to hang unbounded.
      let account
      try {
        const accController = new AbortController()
        const accTimer = setTimeout(() => { accController.abort() }, FETCH_TIMEOUT_MS)
        let accResponse
        try {
          accResponse = await fetch('https://open.bigmodel.cn/api/biz/account/query-customer-account-report', { headers: { authorization: 'Bearer ' + key }, signal: accController.signal })
        } finally {
          clearTimeout(accTimer)
        }
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
    // Versioned paths + duplicate tolerance keep this effect alive across
    // hot-mounts when an older instance leaked its route registrations.
    // The browser probes the same candidate order.
    for (const path of [API_PREFIX + '/state-v13', API_PREFIX + '/state-v9', API_PREFIX + '/state-v6', API_PREFIX + '/state-v5', API_PREFIX + '/state']) {
      try {
        reg({ kind: 'exact', path, handler })
        break
      } catch (error) {
        if (!String(error?.message ?? error).includes('duplicate')) throw error
      }
    }

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

    // console-token lifecycle (loopback fenced)
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/status',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        json(res, 200, { ok: true, bound: jarBound(authJar), token: typeof authJar.token === 'string' && authJar.token !== '', cookies: Object.keys(authJar.cookies ?? {}).length, savedAt: authJar.savedAt })
      },
    })
    reg({
      kind: 'exact',
      path: API_PREFIX + '/auth/logout',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'forbidden' }); return }
        authJar = emptyJar()
        try { unlinkSync(AUTH_STORE) } catch { /* already gone */ }
        usageCache = { at: 0, value: null }
        json(res, 200, { ok: true, bound: false })
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
          const normalized = /^Bearer /i.test(value) ? value : 'Bearer ' + value
          // validate before persisting: a garbage token would otherwise mask
          // the working one for the next TTL window
          const now = new Date()
          const probe = await fetchUsageRange(new Date(now.getFullYear(), now.getMonth(), now.getDate()), now, normalized)
          authJar.token = normalized
          persistJar(authJar)
          usageCache = { at: 0, value: null }
          json(res, 200, { ok: true, verified: true, tokens: probe.tokens })
        } catch (error) {
          json(res, 401, { ok: false, error: String(error?.message ?? error), expired: error?.expired === true })
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
