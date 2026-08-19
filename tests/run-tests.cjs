// dsh-zhipu-usage scanner tests: node tests/run-tests.cjs
const { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const zlib = require('node:zlib')

let failures = 0
function check(name, condition, detail) {
  if (condition) console.log('ok - ' + name)
  else { failures += 1; console.error('FAIL - ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const line = (obj) => JSON.stringify(obj) + '\n'
const sessionHeader = (id, at) => ({ type: 'session', version: 0, id, createdAt: at, cwd: '/tmp/x', delegationDepth: 0 })
const requestHeader = (seq, time, provider, model) => ({
  type: 'request/header', seq, time, data: { header: { config: { provider, model, maxTokens: 1024 } } },
})
const usageChunk = (seq, time, turn, step, usage) => ({
  type: 'assistant/chunk', seq, time, data: { turn, step, chunk: { type: 'usage', usage } },
})
const finishChunk = (seq, time, turn, step, provider, model) => ({
  type: 'assistant/chunk', seq, time,
  data: { turn, step, chunk: { type: 'finish', reason: { kind: 'stop' }, replayState: { kind: 'pi-ai', version: 1, api: 'anthropic-messages', provider, model, stopReason: 'stop', blocks: [] } } },
})
const errorFinishChunk = (seq, time, turn, step) => ({
  type: 'assistant/chunk', seq, time,
  data: { turn, step, chunk: { type: 'finish', reason: { kind: 'error', failure: { message: 'Connection error.', code: 'TRANSPORT' } } } },
})

async function main() {
  const { parseSessionText, scanSessions } = await import(
    pathToFileURL(join(__dirname, '..', 'lib', 'scan.mjs')).href
  )

  // ---- parseSessionText: attribution priority + unknown token fields ----
  const tNow = Date.now()
  const text1 = [
    line(sessionHeader('session-x', tNow)),
    line(requestHeader(1, tNow, 'zhipu', 'glm-5.3')),
    line(usageChunk(2, tNow, 1, 1, { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000 })),
    line(finishChunk(3, tNow + 5, 1, 1, 'zhipu', 'glm-5.3')),
    line(usageChunk(4, tNow + 10, 1, 2, { inputTokens: 300, outputTokens: 50 })),
    line(finishChunk(5, tNow + 15, 1, 2, 'zhipu', 'glm-4.7')),
    line(requestHeader(6, tNow + 18, 'zhipu', 'glm-4.7-flash')),
    line(usageChunk(7, tNow + 20, 1, 3, { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 7 })),
    line(usageChunk(8, tNow + 22, 2, 1, { inputTokens: 40, outputTokens: 4 })),
    line(errorFinishChunk(9, tNow + 23, 2, 1)),
    'this line is not json',
  ].join('')
  const parsed1 = parseSessionText(text1)
  check('parse: 4 records', parsed1.records.length === 4, parsed1.records)
  check('parse: header captured', parsed1.header?.id === 'session-x')
  const [r0, r1, r2, r3] = parsed1.records
  check('parse: finish attribution', r0.provider === 'zhipu' && r0.model === 'glm-5.3' && r0.input === 1000, r0)
  check('parse: second model via finish', r1.model === 'glm-4.7' && r1.input === 300, r1)
  check('parse: error finish falls back to header snapshot', r2.model === 'glm-4.7-flash' && r2.input === 40, r2)
  check('parse: torn usage uses request header snapshot', r3.model === 'glm-4.7-flash' && r3.other === 7, r3)

  // ---- scanSessions: fixtures incl. agent dir, .bak skip, ledger, window ----
  const root = mkdtempSync(join(homedir(), '.zpu-test-'))
  const ledgerPath = join(root, 'ledger.json')
  try {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const tToday = midnight.getTime() + 10 * 3600e3
    const tYesterday = tToday - 86400e3
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const tPrevMonth = monthStart.getTime() - 5 * 86400e3 + 3600e3
    const tRecent = Date.now() - 3600e3 // inside the 5h quota window for any run time
    const ws = join(root, '--tmp-fixture--')
    const s1 = join(ws, 'session-a')
    const s2 = join(ws, 'session-b')
    const agent = join(ws, 'agent-9f2c') // delegated agent dir: NO session- prefix
    mkdirSync(s1, { recursive: true })
    mkdirSync(s2, { recursive: true })
    mkdirSync(agent, { recursive: true })

    const textA = [
      line(sessionHeader('session-a', tYesterday)),
      line(requestHeader(1, tPrevMonth, 'zhipu', 'glm-5.3')),
      line(usageChunk(2, tPrevMonth, 0, 1, { inputTokens: 500, outputTokens: 50, cacheReadTokens: 500 })),
      line(finishChunk(3, tPrevMonth + 5, 0, 1, 'zhipu', 'glm-5.3')),
      line(requestHeader(4, tYesterday, 'zhipu', 'glm-5.3')),
      line(usageChunk(5, tYesterday, 1, 1, { inputTokens: 900, outputTokens: 90, cacheReadTokens: 900 })),
      line(finishChunk(6, tYesterday + 5, 1, 1, 'zhipu', 'glm-5.3')),
      line(usageChunk(7, tToday, 1, 2, { inputTokens: 4000, outputTokens: 600, cacheReadTokens: 30000 })),
      line(finishChunk(8, tToday + 5, 1, 2, 'zhipu', 'glm-5.3')),
      line(requestHeader(9, tToday + 6, 'zhipu', 'glm-4.7')),
      line(usageChunk(10, tToday + 10, 1, 3, { inputTokens: 700, outputTokens: 80 })),
    ].join('')
    writeFileSync(join(s1, 'session.jsonl.zstd'), zlib.zstdCompressSync(Buffer.from(textA, 'utf8')))
    // rotation backup next to the live log: must be ignored
    writeFileSync(join(s1, 'session.jsonl.zstd.bak-p9'), zlib.zstdCompressSync(Buffer.from(
      line(usageChunk(1, tToday, 9, 9, { inputTokens: 999999, outputTokens: 9 })) + line(finishChunk(2, tToday + 1, 9, 9, 'zhipu', 'glm-5.3')), 'utf8')))
    const textB = [
      line(sessionHeader('session-b', tToday)),
      line(requestHeader(1, tToday, 'zhipu', 'glm-5.3')),
      line(usageChunk(2, tToday, 1, 1, { inputTokens: 50, outputTokens: 5, cacheReadTokens: 10 })),
      line(finishChunk(3, tToday + 5, 1, 1, 'zhipu', 'glm-5.3')),
    ].join('')
    writeFileSync(join(s2, 'session.jsonl'), Buffer.from(textB, 'utf8'))
    const textAgent = [
      line(sessionHeader('agent-9f2c', tRecent)),
      line(requestHeader(1, tRecent, 'zhipu', 'glm-5.3')),
      line(usageChunk(2, tRecent, 1, 1, { inputTokens: 2000, outputTokens: 300, cacheReadTokens: 8000 })),
      line(finishChunk(3, tRecent + 5, 1, 1, 'zhipu', 'glm-5.3')),
    ].join('')
    writeFileSync(join(agent, 'session.jsonl.zstd'), zlib.zstdCompressSync(Buffer.from(textAgent, 'utf8')))

    const cache = new Map()
    const state1 = await scanSessions(root, cache, { ledgerPath, quota5h: 100 })
    check('scan: ok', state1.ok === true, state1)
    check('scan: 3 log files scanned+parsed', state1.files.scanned === 3 && state1.files.parsed === 3, state1.files)
    check('scan: 6 calls total', state1.totals.all.requests === 6, state1.totals.all)
    check('scan: today 4 calls (incl agent)', state1.totals.today.requests === 4, state1.totals.today)
    check('scan: yesterday 1 call', state1.totals.yesterday.requests === 1, state1.totals.yesterday)
    const expectedMonth = [tYesterday, tToday, tToday, tToday, tRecent].filter((ts) => ts >= monthStart.getTime()).length
    check('scan: month-to-date ' + expectedMonth + ' calls', state1.totals.month.requests === expectedMonth, state1.totals.month)
    const m53 = state1.byModel.find((m) => m.model === 'glm-5.3')
    const m47 = state1.byModel.find((m) => m.model === 'glm-4.7')
    check('scan: glm-5.3 5 calls', m53?.requests === 5, state1.byModel)
    check('scan: glm-4.7 1 call via header', m47?.requests === 1, state1.byModel)
    check('scan: byDay today 4 calls', state1.byDay[state1.byDay.length - 1].requests === 4)
    const hourTotal = state1.byHour.reduce((sum, h) => sum + h.requests, 0)
    check('scan: byHour today hour 10 has 3 calls', state1.byHour[10].requests === 3 && hourTotal === 4, state1.byHour.filter((h) => h.requests > 0))
    // 5h window: the agent call is 1h old; tToday calls count only when they
    // fall inside the trailing 5 hours (depends on the run time)
    const windowExpected = [tToday, tToday, tToday, tRecent].filter((ts) => ts >= Date.now() - 5 * 3600e3).length
    check('scan: window5h requests=' + windowExpected, state1.window5h.requests === windowExpected, state1.window5h)
    if (windowExpected > 0) {
      const oldest = Math.min(...[tToday, tToday, tToday, tRecent].filter((ts) => ts >= Date.now() - 5 * 3600e3))
      check('scan: window5h resetTs = oldest + 5h', state1.window5h.resetTs === oldest + 5 * 3600e3, state1.window5h)
    } else {
      check('scan: window5h resetTs null when empty', state1.window5h.resetTs === null, state1.window5h)
    }
    check('scan: window5h quota passthrough', state1.window5h.quota === 100, state1.window5h)
    check('scan: ledger file written', existsSync(ledgerPath))

    const state2 = await scanSessions(root, cache, { ledgerPath, quota5h: 100 })
    check('scan: cache reuse', state2.files.cached === 3 && state2.files.parsed === 0, state2.files)
    check('scan: cache gives same totals', state2.totals.all.requests === 6)

    // prune one session log: its history must survive via the ledger
    rmSync(join(s2, 'session.jsonl'))
    const state3 = await scanSessions(root, cache, { ledgerPath, quota5h: 100 })
    check('scan: pruned file retained', state3.files.retained === 1 && state3.sessions === 3, state3.files)
    check('scan: totals survive pruning', state3.totals.all.requests === 6, state3.totals.all)

    const state4 = await scanSessions(join(root, 'missing'), undefined, { ledgerPath: null })
    check('scan: missing root reports error', state4.ok === false && typeof state4.error === 'string', state4)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  if (failures > 0) { console.error('\n' + failures + ' check(s) failed'); process.exit(1) }
  console.log('\nall checks passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
