/**
 * dsh-zhipu-usage session scanner (pure Node, no cordis imports so tests can
 * exercise it directly).
 *
 * Data source: "~/.dsh/sessions/<workspace>/session-<id>/session.jsonl[.zstd]"
 * logs. One record per billed LLM call: the "usage" assistant chunk, with
 * tokens from the chunk and provider/model attributed in priority order:
 *   1. the replayState of the matching "finish" chunk (same turn/step),
 *   2. the provider/model snapshot taken from the last "request/header"
 *      record seen before the usage chunk (live sessions write usage before
 *      any finish; error-finished calls never write replayState).
 *
 * Session files are concatenated zstd frames (node:zlib only returns the
 * first frame), so files are decoded with the zstdcat binary when available
 * (native speed) and the pure-JS fzstd decoder otherwise.
 *
 * DSH rotates and may eventually prune old session logs, so every scan
 * merges the freshly parsed per-file aggregates into a persistent ledger
 * (~/.dsh/zhipu-usage-ledger.json): aggregates of files that no longer exist
 * are retained, keeping usage history stable across log pruning.
 */
import { spawn } from 'node:child_process'
import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { decompress as zstdDecompressFrames } from 'fzstd'

const DAY_MS = 86_400_000
const BY_DAY_WINDOW = 45

function num(value) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function pickText(value) {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function normalizeUsage(usage) {
  const out = { input: 0, output: 0, cacheRead: 0, other: 0 }
  if (usage === null || typeof usage !== 'object') return out
  for (const key of Object.keys(usage)) {
    const value = usage[key]
    if (key === 'inputTokens') out.input += num(value)
    else if (key === 'outputTokens') out.output += num(value)
    else if (key === 'cacheReadTokens') out.cacheRead += num(value)
    else if (key.endsWith('Tokens')) out.other += num(value)
  }
  return out
}

/** Parse one session log text into per-call records plus the session header. */
export function parseSessionText(text) {
  const records = []
  let header = null
  let current = { provider: 'unknown', model: 'unknown' }
  const pending = new Map() // turn/step -> { ts, usage, provider, model }

  for (const line of text.split('\n')) {
    if (line === '') continue
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    if (entry === null || typeof entry !== 'object') continue
    if (entry.type === 'session') { header = entry; continue }
    if (entry.data === null || typeof entry.data !== 'object') continue

    if (entry.type === 'request/header') {
      const config = entry.data.header?.config
      const provider = pickText(config?.provider)
      const model = pickText(config?.model)
      if (provider !== undefined || model !== undefined) {
        current = { provider: provider ?? current.provider, model: model ?? current.model }
      }
      continue
    }
    if (entry.type !== 'assistant/chunk') continue
    const chunk = entry.data.chunk
    if (chunk === null || typeof chunk !== 'object') continue
    const key = (entry.data.turn ?? '?') + ':' + (entry.data.step ?? '?')

    if (chunk.type === 'usage') {
      pending.set(key, {
        ts: num(entry.time),
        usage: normalizeUsage(chunk.usage),
        provider: current.provider,
        model: current.model,
      })
      continue
    }
    if (chunk.type === 'finish') {
      const replay = chunk.replayState !== null && typeof chunk.replayState === 'object' ? chunk.replayState : undefined
      const replayProvider = pickText(replay?.provider)
      const replayModel = pickText(replay?.model)
      if (replayProvider !== undefined || replayModel !== undefined) {
        current = { provider: replayProvider ?? current.provider, model: replayModel ?? current.model }
      }
      const match = pending.get(key)
      if (match !== undefined) {
        pending.delete(key)
        records.push({
          ts: match.ts || num(entry.time),
          provider: replayProvider ?? match.provider,
          model: replayModel ?? match.model,
          ...match.usage,
        })
      }
    }
  }
  for (const match of pending.values()) {
    records.push({ ts: match.ts, provider: match.provider, model: match.model, ...match.usage })
  }
  return { records, header }
}

// ---- decoding ---------------------------------------------------------------

let zstdBinaryState // undefined = unprobed, true = available, false = missing

function decodeViaZstdCat(path) {
  return new Promise((resolve, reject) => {
    const child = spawn('zstdcat', ['-c', path], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []
    let stderr = ''
    child.stdout.on('data', (chunk) => { chunks.push(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error('zstdcat exit ' + code + (stderr === '' ? '' : ': ' + stderr.slice(0, 120))))
    })
  })
}

/** Decode a multi-frame zstd session file: zstdcat when present, fzstd otherwise. */
async function decodeZstdFile(path, raw) {
  if (zstdBinaryState !== false) {
    try {
      const out = await decodeViaZstdCat(path)
      zstdBinaryState = true
      return out
    } catch (error) {
      // Only fall back while probing: once the binary proved itself, a
      // failure means this file is bad, not that the binary vanished.
      if (zstdBinaryState === true) throw error
      zstdBinaryState = false
    }
  }
  return Buffer.from(zstdDecompressFrames(new Uint8Array(raw)))
}

// ---- aggregation --------------------------------------------------------------

function dayKey(ts) {
  const d = new Date(ts)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function dayKeyToTs(date) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function localMidnight(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function zeroBuckets() {
  return { requests: 0, input: 0, output: 0, cacheRead: 0, other: 0, total: 0 }
}

function addInto(bucket, usage) {
  bucket.requests += 1
  bucket.input += usage.input
  bucket.output += usage.output
  bucket.cacheRead += usage.cacheRead
  bucket.other += usage.other
  bucket.total += usage.input + usage.output + usage.cacheRead + usage.other
}

/** Fold parsed records into the per-file ledger entry (day x model buckets). */
function recordsToEntry(records, mtimeMs, size) {
  const dayModel = new Map()
  const hours = new Map()
  const recentAll = []
  let firstTs = 0
  let lastTs = 0
  for (const record of records) {
    const date = record.ts > 0 ? dayKey(record.ts) : null
    const key = (date ?? 'nodate') + '|' + record.provider + '/' + record.model
    let bucket = dayModel.get(key)
    if (bucket === undefined) {
      bucket = { date, provider: record.provider, model: record.model, requests: 0, input: 0, output: 0, cacheRead: 0, other: 0 }
      dayModel.set(key, bucket)
    }
    addInto(bucket, record)
    if (record.ts > 0) {
      if (firstTs === 0 || record.ts < firstTs) firstTs = record.ts
      if (record.ts > lastTs) lastTs = record.ts
      recentAll.push(record.ts)
      const hd = new Date(record.ts)
      hd.setMinutes(0, 0, 0, 0)
      const hourTs = hd.getTime()
      let hb = hours.get(hourTs)
      if (hb === undefined) {
        hb = { ts: hourTs, requests: 0, input: 0, output: 0, cacheRead: 0, other: 0 }
        hours.set(hourTs, hb)
      }
      hb.requests += 1
      hb.input += record.input
      hb.output += record.output
      hb.cacheRead += record.cacheRead
      hb.other += record.other
    }
  }
  // keep only the trailing 48 hours of buckets so the ledger stays small
  const hourFloor = lastTs - 48 * 3_600_000
  const hourList = [...hours.values()].filter((hb) => hb.ts >= hourFloor)
  // exact per-request timestamps within the trailing 6h (drives the 5h quota
  // window and its reset time); capped to keep the ledger small
  const recentFloor = lastTs - 6 * 3_600_000
  const recent = recentAll.filter((ts) => ts >= recentFloor).slice(-2000)
  return { mtimeMs, size, firstTs, lastTs, dayModel: [...dayModel.values()], hours: hourList, recent }
}

/** Aggregate the union of ledger entries into the dashboard state. */
function aggregateEntries(entries, now = Date.now()) {
  const todayStart = localMidnight(now)
  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const windows = { today: todayStart, yesterday: todayStart - DAY_MS, month: monthStart.getTime(), d7: todayStart - 6 * DAY_MS, d30: todayStart - 29 * DAY_MS }
  const totals = { today: zeroBuckets(), yesterday: zeroBuckets(), month: zeroBuckets(), d7: zeroBuckets(), d30: zeroBuckets(), all: zeroBuckets() }
  const byDay = new Map()
  const byModel = new Map()
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, requests: 0, input: 0, output: 0, cacheRead: 0, other: 0, total: 0 }))
  const windowMs = 5 * 3_600_000
  const windowCutoff = now - windowMs
  let windowRequests = 0
  let windowOldest = 0
  let firstTs = 0
  let lastTs = 0

  for (const entry of entries) {
    if (entry.firstTs > 0 && (firstTs === 0 || entry.firstTs < firstTs)) firstTs = entry.firstTs
    if (entry.lastTs > lastTs) lastTs = entry.lastTs
    // rolling 5h quota window: exact request timestamps (recent lists are
    // pre-filtered to each file's trailing 6h)
    for (const ts of entry.recent ?? []) {
      if (ts < windowCutoff) continue
      windowRequests += 1
      if (windowOldest === 0 || ts < windowOldest) windowOldest = ts
    }
    for (const bucket of entry.dayModel ?? []) {
      const into = (target) => {
        target.requests += bucket.requests
        target.input += bucket.input
        target.output += bucket.output
        target.cacheRead += bucket.cacheRead
        target.other += bucket.other
        target.total += bucket.input + bucket.output + bucket.cacheRead + bucket.other
      }
      into(totals.all)
      if (bucket.date !== null) {
        const ts = dayKeyToTs(bucket.date)
        if (ts >= windows.today) into(totals.today)
        else if (ts >= windows.yesterday) into(totals.yesterday)
        if (ts >= windows.month) into(totals.month)
        if (ts >= windows.d7) into(totals.d7)
        if (ts >= windows.d30) into(totals.d30)
        let day = byDay.get(bucket.date)
        if (day === undefined) { day = { date: bucket.date, ...zeroBuckets() }; byDay.set(bucket.date, day) }
        into(day)
      }
      const modelKey = bucket.provider + '/' + bucket.model
      let model = byModel.get(modelKey)
      if (model === undefined) {
        model = { provider: bucket.provider, model: bucket.model, ...zeroBuckets(), lastTs: entry.lastTs }
        byModel.set(modelKey, model)
      }
      into(model)
      if (entry.lastTs > model.lastTs) model.lastTs = entry.lastTs
    }
    // today's intraday curve: hour buckets, merged across entries
    for (const hb of entry.hours ?? []) {
      if (hb.ts < windows.today) continue
      const target = byHour[new Date(hb.ts).getHours()]
      target.requests += hb.requests
      target.input += hb.input
      target.output += hb.output
      target.cacheRead += hb.cacheRead
      target.other += hb.other
      target.total += hb.input + hb.output + hb.cacheRead + hb.other
    }
  }

  const byDayList = []
  for (let i = BY_DAY_WINDOW - 1; i >= 0; i -= 1) {
    const key = dayKey(todayStart - i * DAY_MS)
    byDayList.push(byDay.get(key) ?? { date: key, ...zeroBuckets() })
  }
  const window5h = {
    windowMs,
    requests: windowRequests,
    // when the oldest call in the window ages out (the next slot frees)
    resetTs: windowOldest > 0 ? windowOldest + windowMs : null,
  }
  return { totals, byDay: byDayList, byHour, byModel: [...byModel.values()].sort((a, b) => b.total - a.total), window5h, firstTs, lastTs }
}

async function loadLedger(path) {
  if (path === null) return { version: 1, updatedAt: 0, files: {} }
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && parsed.files !== null && typeof parsed.files === 'object') {
      return { version: 1, updatedAt: num(parsed.updatedAt), files: parsed.files }
    }
  } catch { /* fresh ledger */ }
  return { version: 1, updatedAt: 0, files: {} }
}

async function saveLedger(path, files) {
  if (path === null) return
  const tmp = path + '.tmp'
  try {
    await writeFile(tmp, JSON.stringify({ version: 1, updatedAt: Date.now(), files }))
    await rename(tmp, path)
  } catch { /* stats still work without persistence */ }
}

/**
 * Scan a sessions root and return the dashboard state.
 * @param root sessions directory (~/.dsh/sessions).
 * @param cache Map memoizing parsed ledger entries per file (mtime+size keyed).
 * @param options { ledgerPath, quota5h } - ledger location (null disables;
 *   defaults to "<sessions parent>/zhipu-usage-ledger.json") and the plan's
 *   5-hour prompt quota (shown as the denominator; default 120).
 */
export async function scanSessions(root, cache = new Map(), options = {}) {
  const startedAt = Date.now()
  const ledgerPath = 'ledgerPath' in options ? options.ledgerPath : join(dirname(root), 'zhipu-usage-ledger.json')
  const files = { scanned: 0, parsed: 0, cached: 0, errors: 0, retained: 0 }
  const ledger = await loadLedger(ledgerPath)
  const merged = { ...ledger.files }
  const seenThisScan = new Set()

  let workspaces = []
  try {
    workspaces = await readdir(root, { withFileTypes: true })
  } catch (error) {
    return { ok: false, error: 'cannot read sessions root ' + root + ': ' + (error?.message ?? error) }
  }

  // Session logs are NOT only session-*/session.jsonl.zstd: delegated agent
  // sessions live in unprefixed dirs (e.g. <subagent-id>/session.jsonl.zstd)
  // and consume the same plan quota. Scan every depth-1 subdir plus loose
  // files in the workspace for *.jsonl[.zstd], skipping .bak rotation copies.
  const isSessionLog = (name) =>
    (name === 'session.jsonl' || name === 'session.jsonl.zstd' || name.endsWith('.jsonl') || name.endsWith('.jsonl.zstd'))
    && !name.includes('.bak')

  const logFiles = []
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue
    let entries = []
    try {
      entries = await readdir(join(root, workspace.name), { withFileTypes: true })
    } catch { continue }
    const subdirs = []
    for (const item of entries) {
      if (item.isFile()) {
        if (isSessionLog(item.name)) logFiles.push(join(workspace.name, item.name))
      } else if (item.isDirectory()) {
        subdirs.push(item.name)
      }
    }
    for (const subdir of subdirs) {
      let inner = []
      try {
        inner = await readdir(join(root, workspace.name, subdir), { withFileTypes: true })
      } catch { continue }
      for (const item of inner) {
        if (item.isFile() && isSessionLog(item.name)) logFiles.push(join(workspace.name, subdir, item.name))
      }
    }
  }

  for (const rel of logFiles) {
    const file = join(root, rel)
    files.scanned += 1
    try {
      const st = await stat(file)
      const memo = cache.get(file)
      if (memo !== undefined && memo.mtimeMs === st.mtimeMs && memo.size === st.size) {
        merged[file] = memo.entry
        seenThisScan.add(file)
        files.cached += 1
        continue
      }
      const raw = await readFile(file)
      const text = file.endsWith('.zstd') ? (await decodeZstdFile(file, raw)).toString('utf8') : raw.toString('utf8')
      const parsed = parseSessionText(text)
      const entry = recordsToEntry(parsed.records, st.mtimeMs, st.size)
      cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, entry })
      merged[file] = entry
      seenThisScan.add(file)
      files.parsed += 1
    } catch { files.errors += 1 }
  }

  // Entries still in the ledger but not readable right now (rotated away
  // mid-scan or pruned by retention) keep their last known aggregates, so
  // history never shrinks when DSH prunes old session logs.
  for (const path of Object.keys(merged)) {
    if (!seenThisScan.has(path)) files.retained += 1
  }

  const sessions = Object.keys(merged).length
  const state = {
    ok: true,
    generatedAt: startedAt,
    scanMs: Date.now() - startedAt,
    sessions,
    files,
    ...aggregateEntries(Object.values(merged)),
  }
  state.window5h.quota = typeof options.quota5h === 'number' && options.quota5h > 0 ? options.quota5h : 120
  await saveLedger(ledgerPath, merged)
  return state
}
