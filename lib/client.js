/**
 * dsh-zhipu-usage browser half (server-API edition).
 * Data comes exclusively from the host's remote-API state route; the login
 * button opens the lightweight mini login page (absolute path). Every fetch
 * has a 10s timeout and renders an error line on failure — never a blank or
 * frozen panel.
 */
window.__ModuleLoader__.load({
  id: "dsh-zhipu-usage",
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    // absolute paths only (spec rule); also lets headless harnesses fetch
    const BASE = window.location.origin
    const API_STATE = BASE + '/api/dsh-zhipu-usage/state-r2'
    const AUTH_STATUS = BASE + '/api/dsh-zhipu-usage/auth/status'
    const MINI_LOGIN = BASE + '/api/dsh-zhipu-usage/auth/mini'
    const ENTRY_SELECTOR = '[data-dsh-zhipu-usage-entry]'
    const FAMILY_SELECTOR = '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-zhipu-usage-entry]'
    const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
    const POLL_MS = 60_000
    const REQUEST_TIMEOUT_MS = 10_000
    const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 13V9" stroke="currentColor" opacity=".55"/><path d="M8 13V3" stroke="currentColor"/><path d="M13 13V6" stroke="currentColor" opacity=".8"/></svg>'

    const CSS = [
      '.dsh-zpu-entry{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 12px;background:transparent;border:none;border-radius:8px;color:var(--dsw-alias-label-secondary,#9aa3b2);cursor:pointer;font-size:13px;white-space:nowrap;font-family:inherit;line-height:1;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
      '.dsh-zpu-entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover,rgba(125,140,170,.14));color:var(--dsw-alias-label-primary,#e7eaf0)}',
      '.dsh-zpu-entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active,rgba(125,140,170,.22));color:var(--dsw-alias-label-primary,#e7eaf0);font-weight:600}',
      '.dsh-zpu-entryIcon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:0 0 auto;color:#5eead4}',
      '.dsh-zpu-entryLabel{overflow:hidden;text-overflow:ellipsis}',
      '.dsh-zpu-pill{margin-left:auto;font-size:11px;color:#5eead4;font-variant-numeric:tabular-nums;flex:0 0 auto;font-weight:600}',
      '[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-entry{justify-content:center;padding:0;gap:0}',
      '[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-entryLabel,[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-pill{display:none}',
      '.dsh-zpu-overlay{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-start;justify-content:center;background:rgba(4,7,14,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:max(24px,env(safe-area-inset-top)) 16px 24px}',
      '.dsh-zpu-overlay[hidden]{display:none}',
      '.dsh-zpu-panel{width:min(580px,100%);max-height:calc(100vh - 48px);max-height:calc(100dvh - 48px);overflow-y:auto;background:linear-gradient(160deg,rgba(15,23,42,.92),rgba(9,13,24,.94));color:var(--dsw-alias-label-primary,#e7eaf0);border:1px solid rgba(94,234,212,.14);border-radius:16px;box-shadow:0 0 0 1px rgba(2,6,17,.6),0 24px 64px rgba(0,0,0,.55),inset 0 1px 0 rgba(148,163,184,.07);padding:20px 20px 34px;font-size:13px;overscroll-behavior:contain;position:relative}',
      '.dsh-zpu-panel::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,rgba(94,234,212,.5),rgba(79,140,255,.5),transparent);border-radius:16px 16px 0 0;pointer-events:none}',
      '.dsh-zpu-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}',
      '.dsh-zpu-title{font-size:16px;font-weight:700;letter-spacing:.02em;background:linear-gradient(90deg,#e7eaf0,#9fd0ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
      '.dsh-zpu-sub{font-size:11px;color:var(--dsw-alias-label-tertiary,#9daabd);font-variant-numeric:tabular-nums}',
      '.dsh-zpu-actions{margin-left:auto;display:flex;gap:6px}',
      '.dsh-zpu-btn{font-size:12px;padding:7px 16px;border-radius:8px;border:1px solid rgba(94,234,212,.2);background:rgba(94,234,212,.04);color:#cde8ff;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:border-color .15s,background .15s}',
      '.dsh-zpu-btn:hover{background:rgba(94,234,212,.1);border-color:rgba(94,234,212,.4)}',
      '.dsh-zpu-err{margin:10px 0 0;font-size:12px;color:var(--dsw-alias-state-error-primary,#ff9a9a);word-break:break-all}',
      '.dsh-zpu-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0 6px}',
      '@media (max-width:420px){.dsh-zpu-cards{grid-template-columns:repeat(1,1fr)}}',
      '.dsh-zpu-card{border:1px solid rgba(94,234,212,.1);border-radius:12px;padding:12px 14px;background:linear-gradient(155deg,rgba(94,234,212,.045),rgba(79,140,255,.02) 55%,transparent);transition:border-color .18s,box-shadow .18s,transform .18s;cursor:pointer}',
      '.dsh-zpu-card:hover{border-color:rgba(94,234,212,.28)}',
      '.dsh-zpu-card[data-active]{border-color:rgba(94,234,212,.5);box-shadow:0 0 18px rgba(94,234,212,.09),inset 0 0 24px rgba(94,234,212,.04)}',
      '.dsh-zpu-cardName{font-size:10.5px;color:#a8b8cc;letter-spacing:.08em;text-transform:uppercase}',
      '.dsh-zpu-cardValue{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;margin:5px 0 3px;color:#d9f4ff;text-shadow:0 0 22px rgba(94,234,212,.25)}',
      '.dsh-zpu-cardMeta{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#9daabd);line-height:1.55}',
      '.dsh-zpu-quota{display:flex;align-items:center;gap:10px;margin:14px 0 2px;font-size:13px;color:var(--dsw-alias-label-secondary,#d5deeb);font-variant-numeric:tabular-nums;flex-wrap:wrap}',
      '.dsh-zpu-quotaName{font-weight:700;color:#eef3fa;letter-spacing:.04em}',
      '.dsh-zpu-quotaBar{flex:1 1 80px;min-width:60px;height:6px;border-radius:3px;background:rgba(127,140,170,.14);overflow:hidden;position:relative}',
      '.dsh-zpu-quotaFill{height:100%;border-radius:3px;background:linear-gradient(90deg,#22d3ee,#4f8cff);box-shadow:0 0 10px rgba(56,189,248,.5)}',
      '.dsh-zpu-quotaFill[data-hot]{background:linear-gradient(90deg,#fbbf24,#f59e0b);box-shadow:0 0 10px rgba(245,158,11,.5)}',
      '.dsh-zpu-quotaFill[data-crit]{background:linear-gradient(90deg,#f87171,#ef4444);box-shadow:0 0 12px rgba(239,68,68,.6)}',
      '.dsh-zpu-auth{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--dsw-alias-label-tertiary,#9daabd)}',
      '.dsh-zpu-chip{font-size:11px;padding:4px 12px;border-radius:999px;border:1px solid rgba(94,234,212,.16);background:rgba(14,22,38,.5);color:#a7b7cc;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:all .15s}',
      '.dsh-zpu-chip:hover{background:rgba(94,234,212,.08);border-color:rgba(94,234,212,.35);color:#d9f4ff}',
      '.dsh-zpu-chip[data-active]{background:linear-gradient(120deg,rgba(34,211,238,.18),rgba(79,140,255,.2));border-color:rgba(94,234,212,.55);color:#e8fbff;font-weight:600;box-shadow:0 0 12px rgba(94,234,212,.18)}',
      '.dsh-zpu-chip[data-warn]{border-color:#e06c75;color:#e06c75}',
      '.dsh-zpu-foot{margin-top:12px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#9daabd);line-height:1.6}',
      '.dsh-zpu-panel table thead th{letter-spacing:.05em}',
      '.dsh-zpu-panel table tbody tr:hover{background:rgba(94,234,212,.03)}',
      '@keyframes dsh-zpu-sheet{from{transform:translateY(16px);opacity:.55}to{transform:none;opacity:1}}',
      '@media (max-width:640px){.dsh-zpu-overlay{padding:0;align-items:stretch;overflow:hidden}.dsh-zpu-panel{width:100%;max-height:100svh;border-radius:0;border-left:none;border-right:none;padding:calc(env(safe-area-inset-top,0px) + 12px) 14px calc(env(safe-area-inset-bottom,0px) + 16px);animation:dsh-zpu-sheet .22s ease}}',
      '@media (prefers-reduced-motion: reduce){.dsh-zpu-panel{animation:none}}',
    ].join('\n')

    function ensureStyles() {
      if (document.getElementById('dsh-zpu-style') !== null) return
      const style = document.createElement('style')
      style.id = 'dsh-zpu-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /** Chinese token units: 万 (1e4) and 亿 (1e8); below 万 the raw number. */
    function fmtTokens(n) {
      if (!Number.isFinite(n)) return '-'
      if (n >= 1e8) return ((n / 1e8).toFixed(2).replace(/\.?0+$/, '') || '0') + '亿'
      if (n >= 1e4) return ((n / 1e4).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, '') || '0') + '万'
      return String(Math.round(n))
    }

    function el(tag, className, text) {
      const node = document.createElement(tag)
      if (className !== undefined && className !== '') node.className = className
      if (text !== undefined) node.textContent = text
      return node
    }

    async function fetchJson(url, options) {
      const controller = new AbortController()
      const timer = setTimeout(() => { controller.abort() }, REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal, ...options })
        const body = await response.json()
        if (!response.ok || body.ok === false) throw new Error(body.error ?? ('HTTP ' + response.status))
        return body
      } finally {
        clearTimeout(timer)
      }
    }

    // ---- state -----------------------------------------------------------------

    let lastState = null
    let lastError = null
    let fetching = false

    async function refresh() {
      if (fetching) return
      fetching = true
      try {
        lastState = await fetchJson(API_STATE)
        lastError = null
      } catch (error) {
        lastError = /abort/i.test(String(error?.message ?? error)) ? '请求超时（10s）' : String(error?.message ?? error)
      } finally {
        fetching = false
        updatePill()
        renderBody()
      }
    }

    function refreshAuth() {
      renderAuth()
    }

    // ---- sidebar entry ----------------------------------------------------------

    function sidebarRoot() {
      const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
      if (column === null) return undefined
      const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement
      return logoOwner ?? (column.firstElementChild ?? undefined)
    }

    function newSessionButton(root) {
      const nested = root.querySelector('button[class*="newSession"]')
      if (nested !== null) return nested
      for (const child of root.children) {
        if (child.tagName === 'BUTTON') return child
      }
      return undefined
    }

    function placeEntry(root, entry) {
      const button = newSessionButton(root)
      if (button === undefined) return false
      if (entry.parentElement !== root) {
        const row = button.closest('[class*="logoRow"]')
        const base = (row !== null && row.parentElement === root) ? row : button
        const family = Array.from(root.children).filter(
          (node) => node instanceof HTMLElement && node.matches(FAMILY_SELECTOR),
        )
        const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
        if (anchor !== null) root.insertBefore(entry, anchor)
        else root.appendChild(entry)
      }
      return true
    }

    function mountSidebarEntry(onToggle) {
      const entry = document.createElement('button')
      entry.type = 'button'
      entry.dataset.dshZhipuUsageEntry = ''
      entry.className = 'dsh-zpu-entry'
      entry.setAttribute('aria-label', '智谱用量')
      const icon = el('span', 'dsh-zpu-entryIcon')
      icon.innerHTML = ICON
      entry.appendChild(icon)
      entry.appendChild(el('span', 'dsh-zpu-entryLabel', '智谱用量'))
      const pill = el('span', 'dsh-zpu-pill', '…')
      entry.appendChild(pill)
      entry.addEventListener('click', () => { onToggle() })

      let root
      let placed = false
      const tryPlace = () => {
        if (root !== undefined && !root.isConnected) { rootObserver.disconnect(); root = undefined; placed = false }
        if (placed) {
          if (document.body.contains(entry)) return
          rootObserver.disconnect(); root = undefined; placed = false
        }
        root ??= sidebarRoot()
        if (root === undefined) return
        placed = placeEntry(root, entry)
        if (placed) rootObserver.observe(root, { childList: true, subtree: true })
      }
      const waitObserver = new MutationObserver(() => { tryPlace() })
      waitObserver.observe(document.body, { childList: true, subtree: true })
      const rootObserver = new MutationObserver(() => {
        if (root === undefined || !root.isConnected) { placed = false; tryPlace(); return }
        if (!root.contains(entry)) placed = placeEntry(root, entry)
      })
      return () => {
        waitObserver.disconnect()
        rootObserver.disconnect()
        entry.remove()
      }
    }

    function updatePill() {
      const pill = document.querySelector(ENTRY_SELECTOR + ' .dsh-zpu-pill')
      if (pill === null) return
      if (lastError !== null) { pill.textContent = '-'; pill.title = '获取失败：' + lastError; return }
      const w = lastState?.remote?.rolling5h
      if (w === undefined || w === null) return
      pill.textContent = (w.percent ?? 0) + '%'
    }

    // ---- panel ------------------------------------------------------------------

    let overlay = null
    let errLine = null
    let cardsBox = null
    let quotaFill = null
    let quotaText = null
    let quotaRow = null
    let panelFootLine = null
    let authBtn = null
    let subLine = null

    function buildPanel() {
      overlay = el('div', 'dsh-zpu-overlay')
      overlay.hidden = true
      const panel = el('div', 'dsh-zpu-panel')
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
      panel.setAttribute('aria-label', '智谱 Coding Plan 用量')

      const head = el('div', 'dsh-zpu-head')
      const titleRow = el('div')
      titleRow.style.cssText = 'display:flex;align-items:center;gap:7px'
      const badge = el('span', 'dsh-zpu-chip', 'GLM')
      badge.style.cssText = 'font-size:9px;padding:2px 7px;letter-spacing:.14em;font-weight:700;background:linear-gradient(120deg,rgba(34,211,238,.22),rgba(79,140,255,.25));border-color:rgba(94,234,212,.5);color:#bff7ff;text-shadow:0 0 8px rgba(94,234,212,.5)'
      titleRow.appendChild(badge)
      titleRow.appendChild(el('span', 'dsh-zpu-title', '智谱 Coding Plan 用量'))
      head.appendChild(titleRow)
      subLine = el('span', 'dsh-zpu-sub', '')
      head.appendChild(subLine)
      const actions = el('div', 'dsh-zpu-actions')
      authBtn = el('button', 'dsh-zpu-chip', '更新令牌')
      authBtn.type = 'button'
      authBtn.addEventListener('click', () => { openTokenDialog() })
      const refreshBtn = el('button', 'dsh-zpu-btn', '刷新')
      refreshBtn.type = 'button'
      refreshBtn.addEventListener('click', () => { void refresh(); void refreshAuth() })
      const closeBtn = el('button', 'dsh-zpu-btn', '关闭')
      closeBtn.type = 'button'
      closeBtn.addEventListener('click', () => { closePanel() })
      actions.appendChild(authBtn)
      actions.appendChild(refreshBtn)
      actions.appendChild(closeBtn)
      head.appendChild(actions)
      panel.appendChild(head)

      errLine = el('div', 'dsh-zpu-err')
      errLine.hidden = true
      panel.appendChild(errLine)

      cardsBox = el('div', 'dsh-zpu-cards')
      panel.appendChild(cardsBox)

      quotaRow = el('div', 'dsh-zpu-quota')
      quotaRow.appendChild(el('span', 'dsh-zpu-quotaName', '5小时额度'))
      const quotaBar = el('div', 'dsh-zpu-quotaBar')
      quotaFill = el('div', 'dsh-zpu-quotaFill')
      quotaBar.appendChild(quotaFill)
      quotaRow.appendChild(quotaBar)
      quotaText = el('span', '', '…')
      quotaRow.appendChild(quotaText)
      panel.appendChild(quotaRow)

      const foot = el('div', 'dsh-zpu-foot', '')
      panel.appendChild(foot)

      overlay.appendChild(panel)
      overlay.addEventListener('click', (event) => { if (event.target === overlay) closePanel() })
      document.body.appendChild(overlay)
      return () => { overlay.remove() }
    }

    function card(name, value, meta) {
      const cardBox = el('div', 'dsh-zpu-card')
      cardBox.appendChild(el('div', 'dsh-zpu-cardName', name))
      cardBox.appendChild(el('div', 'dsh-zpu-cardValue', value))
      cardBox.appendChild(el('div', 'dsh-zpu-cardMeta', meta))
      return cardBox
    }

    function countdownText(resetTs) {
      if (resetTs === null || resetTs === undefined) return '重置时间未知'
      const remain = Math.max(0, resetTs - Date.now())
      const hours = Math.floor(remain / 3_600_000)
      const minutes = Math.floor((remain % 3_600_000) / 60_000)
      return (hours > 0 ? hours + '小时' : '') + minutes + '分后重置'
    }

    function renderBody() {
      if (overlay === null) return
      if (lastError !== null && lastState === null) {
        errLine.hidden = false
        errLine.textContent = '数据获取失败：' + lastError + '（每 60 秒自动重试）'
        return
      }
      errLine.hidden = true
      const state = lastState
      if (state === null) {
        subLine.textContent = '加载中…'
        return
      }
      const rem = state.remote ?? {}
      subLine.textContent = '更新于 ' + new Date(state.generatedAt).toLocaleTimeString()

      const cu = state.consoleUsage
      const ok = cu?.ok === true && cu.month != null && cu.today != null
      const rangeMeta = (key, title) => {
        const r = cu?.[key]
        if (!ok || r == null) return { text: cu?.expired === true ? '令牌过期' : '待绑定', meta: '—' }
        const days = key === 'today' ? 1 : key === 'last7' ? 7 : null
        const avg = days && days > 1 ? ' · 日均 ' + fmtTokens(Math.round(r.tokens / days)) : ''
        return { text: fmtTokens(r.tokens) + ' tok', meta: r.calls + ' 次调用 · ' + (r.models ?? []).length + ' 个模型' + avg }
      }
      cardsBox.replaceChildren()
      for (const [title, key] of [['今日', 'today'], ['近7天', 'last7'], ['本月', 'month']]) {
        const info = rangeMeta(key, title)
        const c = card(title, info.text, info.meta)
        c.style.cursor = 'pointer'
        if (usageRange === key) c.setAttribute('data-active', '')
        c.addEventListener('click', () => { usageRange = key; renderBody() })
        cardsBox.appendChild(c)
      }
      renderUsageDetail(cu)

      const w = rem.rolling5h
      if (w != null && quotaFill !== null) {
        const pct = Math.max(0, Math.min(100, w.percent ?? 0))
        quotaFill.style.width = pct + '%'
        if (pct >= 95) { quotaFill.setAttribute('data-crit', ''); quotaFill.removeAttribute('data-hot') }
        else if (pct >= 80) { quotaFill.setAttribute('data-hot', ''); quotaFill.removeAttribute('data-crit') }
        else quotaFill.removeAttribute('data-hot'), quotaFill.removeAttribute('data-crit')
        const plan = typeof rem.plan === 'string' && rem.plan !== '' ? rem.plan.toUpperCase() + ' · ' : ''
        quotaText.textContent = plan + pct + '% · ' + countdownText(w.resetTs)
        const s = rem.search
        const a = rem.account
        let title = ''
        if (s != null && s.used !== null && s.total !== null) title += ' · 搜索 ' + s.used + '/' + s.total
        quotaRow.title = title
        const parts = []
        if (a != null) {
          if (typeof a.giveAmount === 'number') parts.push('赠送 ¥' + a.giveAmount.toFixed(2))
          if (typeof a.totalSpendAmount === 'number') parts.push('累计消费 ¥' + a.totalSpendAmount.toFixed(2))
        }
        if (s != null && s.used !== null && s.total !== null) parts.push('搜索 ' + s.used + '/' + s.total)
        const old = panelFootLine
        if (parts.length > 0) {
          panelFootLine = el('div', '', parts.join(' · '))
          panelFootLine.style.cssText = 'margin:4px 0 0;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#9daabd);font-variant-numeric:tabular-nums'
        } else panelFootLine = null
        if (old !== null && old.isConnected) old.remove()
        if (panelFootLine !== null) quotaRow.after(panelFootLine)
      }
    }

    let usageDetailBox = null
    let usageRange = 'month'

    function ensureDetailBox() {
      if (usageDetailBox === null && overlay !== null) {
        usageDetailBox = el('div')
        overlay.querySelector('.dsh-zpu-panel').insertBefore(usageDetailBox, overlay.querySelector('.dsh-zpu-auth'))
      }
      return usageDetailBox
    }

    /** compact SVG trend chart + per-model table from official series data */
    function buildChart(series) {
      const W = 560
      const H = 168
      const padL = 46
      const padR = 10
      const padT = 14
      const padB = 30
      const innerW = W - padL - padR
      const innerH = H - padT - padB
      let max = 1
      let peak = 0
      for (let i = 0; i < series.length; i++) if (series[i].tokens > max) { max = series[i].tokens; peak = i }
      const n = series.length
      const xOf = (i) => padL + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1))
      const yOf = (v) => padT + innerH * (1 - v / max)
      const pts = series.map((p, i) => xOf(i).toFixed(1) + ',' + yOf(p.tokens).toFixed(1))
      const box = el('div')
      box.style.margin = '10px 0 0'
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H)
      svg.style.width = '100%'
      svg.style.height = 'auto'
      svg.style.touchAction = 'pan-y'
      const svgEl = (tag) => document.createElementNS('http://www.w3.org/2000/svg', tag)
      // y 网格
      for (const frac of [1, 0.5, 0]) {
        const ln = svgEl('line')
        ln.setAttribute('x1', padL); ln.setAttribute('x2', W - padR)
        ln.setAttribute('y1', padT + innerH * (1 - frac)); ln.setAttribute('y2', padT + innerH * (1 - frac))
        ln.setAttribute('stroke', 'rgba(94,234,212,.1)'); ln.setAttribute('stroke-dasharray', '3 4')
        svg.appendChild(ln)
      }
      const defs = svgEl('defs')
      const gradArea = svgEl('linearGradient')
      gradArea.setAttribute('id', 'zpu-area-' + Math.random().toString(36).slice(2, 7))
      gradArea.setAttribute('x1', '0'); gradArea.setAttribute('y1', '0'); gradArea.setAttribute('x2', '0'); gradArea.setAttribute('y2', '1')
      const gs1 = svgEl('stop'); gs1.setAttribute('offset', '0'); gs1.setAttribute('stop-color', '#22d3ee'); gs1.setAttribute('stop-opacity', '.28')
      const gs2 = svgEl('stop'); gs2.setAttribute('offset', '1'); gs2.setAttribute('stop-color', '#4f8cff'); gs2.setAttribute('stop-opacity', '.02')
      gradArea.appendChild(gs1); gradArea.appendChild(gs2); defs.appendChild(gradArea); svg.appendChild(defs)
      const area = svgEl('path')
      area.setAttribute('d', 'M' + pts.join(' L') + ' L' + xOf(n - 1).toFixed(1) + ',' + (padT + innerH) + ' L' + padL + ',' + (padT + innerH) + ' Z')
      area.setAttribute('fill', 'url(#' + gradArea.id + ')')
      svg.appendChild(area)
      const lineEl = svgEl('polyline')
      lineEl.setAttribute('points', pts.join(' '))
      lineEl.setAttribute('fill', 'none'); lineEl.setAttribute('stroke', '#38bdf8')
      lineEl.setAttribute('stroke-width', '2'); lineEl.setAttribute('stroke-linejoin', 'round')
      svg.appendChild(lineEl)
      // 每个数据点：小圆点 + 数值标签（碰撞避让：局部尖峰优先标注）
      const placed = [] // {x1,x2} 已占标签区间（svg 坐标）
      const overlap = (x1, x2) => placed.some(p => x1 < p.x2 + 2 && x2 > p.x1 - 2)
      // 标注优先级：远离 0 的局部极值先放，普通点后放
      const order = series.map((p, i) => i).sort((a, b) => series[b].tokens - series[a].tokens)
      const labelW = 34 // 约 4 字符 @9px
      for (const i of order) {
        const p = series[i]
        const cx = xOf(i)
        const tx = Math.max(padL + labelW / 2, Math.min(W - padR - labelW / 2, cx))
        if (overlap(tx - labelW / 2, tx + labelW / 2)) continue
        if (n > 24 && p.tokens < max * 0.06) continue // 密集时只隐没量级太小的标签
        const t = svgEl('text')
        t.setAttribute('x', tx.toFixed(1)); t.setAttribute('y', Math.max(padT + 8, yOf(p.tokens) - 5))
        t.setAttribute('text-anchor', 'middle')
        t.setAttribute('font-size', '8.5'); t.setAttribute('fill', i === peak ? '#7ff0dc' : '#a9b8ca')
        t.textContent = fmtTokens(p.tokens)
        svg.appendChild(t)
        placed.push({ x1: tx - labelW / 2, x2: tx + labelW / 2 })
      }
      for (let i = 0; i < n; i++) {
        const dot = svgEl('circle')
        dot.setAttribute('cx', xOf(i)); dot.setAttribute('cy', yOf(series[i].tokens))
        dot.setAttribute('r', i === peak ? '3.2' : '2')
        dot.setAttribute('fill', i === peak ? '#5eead4' : '#38bdf8')
        if (i === peak) dot.setAttribute('filter', 'drop-shadow(0 0 3px rgba(94,234,212,.8))')
        svg.appendChild(dot)
      }
      // x 轴刻度：按密度自动抽稀，首尾必显
      const xTickFull = (l) => {
        const s = String(l)
        return s.includes(':') ? s.slice(11) : s.slice(5) // 今日=HH:mm，多日=MM-DD
      }
      const tickW = 30 // 刻度文本宽（约5字符@8.5px）
      const maxTicks = Math.max(2, Math.floor(innerW / (tickW + 4)))
      const step = Math.max(1, Math.ceil((n - 1) / (maxTicks - 1)))
      const tickIdx = new Set()
      for (let i = 0; i < n; i += step) tickIdx.add(i)
      tickIdx.add(n - 1)
      // 首尾可能过近时去掉次尾
      const sorted = [...tickIdx].sort((a, b) => a - b)
      if (sorted.length > 1 && sorted[sorted.length - 1] - sorted[sorted.length - 2] < Math.ceil(step / 2)) sorted.splice(sorted.length - 2, 1)
      for (const i of sorted) {
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
        const t = svgEl('text')
        t.setAttribute('x', xOf(i).toFixed(1)); t.setAttribute('y', H - 8)
        t.setAttribute('text-anchor', anchor)
        t.setAttribute('font-size', '8.5'); t.setAttribute('fill', '#a9b8ca')
        t.textContent = xTickFull(series[i].label)
        svg.appendChild(t)
        const tick = svgEl('line')
        tick.setAttribute('x1', xOf(i)); tick.setAttribute('x2', xOf(i))
        tick.setAttribute('y1', padT + innerH); tick.setAttribute('y2', padT + innerH + 3)
        tick.setAttribute('stroke', 'rgba(127,140,170,.4)')
        svg.appendChild(tick)
      }
      // 悬停/触屏指示线 + 气泡
      const cursorLine = svgEl('line')
      cursorLine.setAttribute('y1', padT); cursorLine.setAttribute('y2', padT + innerH)
      cursorLine.setAttribute('stroke', 'rgba(127,140,170,.5)'); cursorLine.setAttribute('stroke-dasharray', '2 3')
      cursorLine.setAttribute('opacity', '0')
      svg.appendChild(cursorLine)
      const bubble = el('div')
      bubble.style.cssText = 'position:fixed;z-index:100001;pointer-events:none;background:var(--dsw-alias-bg-layer-3,#1b1f27);border:1px solid var(--dsw-alias-border-l1,#2a303c);border-radius:8px;padding:6px 9px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-primary,#e7eaf0);box-shadow:0 4px 16px rgba(0,0,0,.4);white-space:nowrap;display:none'
      document.body.appendChild(bubble)
      const pickAt = (clientX) => {
        const rect = svg.getBoundingClientRect()
        const rel = (clientX - rect.left) / rect.width * W
        if (rel < padL - 4 || rel > W - padR + 4) return -1
        let best = 0, bestDist = Infinity
        for (let i = 0; i < n; i++) { const dist = Math.abs(xOf(i) - rel); if (dist < bestDist) { bestDist = dist; best = i } }
        return best
      }
      const show = (clientX) => {
        const i = pickAt(clientX)
        if (i < 0) { hide(); return }
        cursorLine.setAttribute('x1', xOf(i)); cursorLine.setAttribute('x2', xOf(i))
        cursorLine.setAttribute('opacity', '1')
        const p = series[i]
        bubble.textContent = ''
        const t1 = el('div', '', String(p.label))
        t1.style.color = 'var(--dsw-alias-label-tertiary,#8b93a1)'
        const t2 = el('div', '', fmtTokens(p.tokens) + ' tok' + (p.calls > 0 ? ' · ' + p.calls + ' 次' : ''))
        t2.style.fontVariantNumeric = 'tabular-nums'
        bubble.appendChild(t1); bubble.appendChild(t2)
        bubble.style.display = 'block'
        const bw = bubble.offsetWidth, bh = bubble.offsetHeight
        let bx = clientX + 12
        if (bx + bw > window.innerWidth - 8) bx = clientX - bw - 12
        bubble.style.left = bx + 'px'
        bubble.style.top = Math.max(8, (svg.getBoundingClientRect().top + yOf(p.tokens) * svg.getBoundingClientRect().height / H - bh - 10)) + 'px'
      }
      const hide = () => { cursorLine.setAttribute('opacity', '0'); bubble.style.display = 'none' }
      svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(e.clientX); else hide() })
      svg.addEventListener('pointerdown', (e) => { show(e.clientX); if (svg.setPointerCapture) { try { svg.setPointerCapture(e.pointerId) } catch { } } })
      svg.addEventListener('pointerleave', hide)
      svg.addEventListener('pointerup', () => { if (window.matchMedia('(hover: none)').matches) setTimeout(hide, 1400) })
      box.appendChild(svg)
      const labels = el('div')
      labels.style.cssText = 'display:flex;justify-content:flex-end;font-size:10px;color:var(--dsw-alias-label-tertiary,#9daabd)'
      labels.appendChild(el('span', '', '纵轴峰值 ' + fmtTokens(max)))
      box.appendChild(labels)
      return box
    }

    function renderUsageDetail(cu) {
      const detail = ensureDetailBox()
      if (detail === null) return
      if (cu?.ok !== true || cu.month == null) {
        detail.replaceChildren()
        return
      }
      const RANGE_KEYS = [['今日', 'today'], ['昨日', 'yesterday'], ['近7天', 'last7'], ['近30天', 'last30'], ['本月', 'month']]
      const RANGE_DAYS = { today: 1, yesterday: 1, last7: 7, last30: 30, month: null }
      const range = cu[usageRange]
      const series = range?.series ?? []
      const chart = buildChart(series.length > 0 ? series : [{ label: '-', tokens: 0, calls: 0 }])
      const chips = el('div')
      chips.style.cssText = 'display:flex;gap:6px;margin:12px 0 0;flex-wrap:wrap'
      for (const [label, key] of RANGE_KEYS) {
        const chip = el('button', 'dsh-zpu-chip', label)
        chip.type = 'button'
        if (usageRange === key) chip.setAttribute('data-active', '')
        chip.addEventListener('click', () => {
          usageRange = key
          renderUsageDetail(cu)
        })
        chips.appendChild(chip)
      }
      const head = el('div', '', '')
      head.style.cssText = 'display:flex;align-items:center;margin:12px 0 0;font-size:13px;font-weight:700;color:#d5deeb'
      head.appendChild(el('span', '', '用量趋势'))
      const spacer = el('span')
      spacer.style.flex = '1'
      head.appendChild(spacer)
      head.appendChild(chips)

      // 区间汇总行：合计 + 调用 + 日均（多日区间）
      const sumRow = el('div')
      const days = RANGE_DAYS[usageRange]
      const activeLabel = (RANGE_KEYS.find(([, k]) => k === usageRange) ?? ['', ''])[0]
      const sumParts = [
        activeLabel + '合计 ' + fmtTokens(range?.tokens ?? 0) + ' tok',
        (range?.calls ?? 0) + ' 次调用',
      ]
      const dayCount = usageRange === 'month' ? new Date().getDate() : days
      if (dayCount && dayCount > 1) {
        sumParts.push('日均 ' + fmtTokens(Math.round((range?.tokens ?? 0) / dayCount)) + ' tok')
      }
      const sumSpans = sumParts.map((t, i) => {
        const s = el('span', '', t)
        s.style.cssText = 'font-variant-numeric:tabular-nums' + (i > 0 ? ';color:#a8b8cc;font-weight:400' : ';color:#d9f4ff;font-weight:600')
        return s
      })
      sumRow.style.cssText = 'display:flex;gap:14px;align-items:baseline;margin:10px 0 0;font-size:13px;flex-wrap:wrap'
      sumRow.style.cssText = 'display:flex;gap:14px;align-items:baseline;margin:10px 0 0;font-size:13px;flex-wrap:wrap'
      sumRow.replaceChildren(...sumSpans.flatMap((s, i) => i > 0 ? [sepDot(), s] : [s]))
      function sepDot() { const d = el('span', '', '·'); d.style.color = '#6b7a8f'; return d }

      // 模型表：全量数据，默认展示前 6 行 + 展开按钮
      const table = el('table')
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;margin-top:8px'
      const thead = el('thead')
      const hr = el('tr')
      for (const [t, left] of [['模型', true], ['合计 tok', false], ['占比', false]]) {
        const th = el('th', '', t)
        th.style.cssText = left ? 'text-align:left' : 'text-align:right'
        th.style.cssText += ';font-weight:600;color:#aebccd;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,#2a303c)'
        hr.appendChild(th)
      }
      thead.appendChild(hr)
      table.appendChild(thead)
      const tbody = el('tbody')
      const allModels = [...(range?.models ?? [])].sort((a, b) => b.tokens - a.tokens)
      const totalTokens = range?.tokens ?? 0
      const FOLD = 6
      const makeRow = (m) => {
        const row = el('tr')
        const td1 = el('td', '', m.name)
        td1.style.cssText = 'padding:6px 8px;border-bottom:1px solid rgba(127,140,170,.12);color:#d5deeb;font-weight:500'
        const td2 = el('td', '', fmtTokens(m.tokens))
        td2.style.cssText = 'padding:6px 8px;text-align:right;border-bottom:1px solid rgba(127,140,170,.12);white-space:nowrap;color:#e8eef7'
        const td3 = el('td')
        td3.style.cssText = 'padding:6px 8px;text-align:right;border-bottom:1px solid rgba(127,140,170,.12);width:34%;color:#c2cede'
        const ratio = totalTokens > 0 ? m.tokens / totalTokens : 0
        const barBox = el('div')
        barBox.style.cssText = 'display:flex;align-items:center;gap:6px;justify-content:flex-end'
        const barTrack = el('div')
        barTrack.style.cssText = 'flex:1;max-width:70px;height:4px;border-radius:2px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,140,170,.16));overflow:hidden'
        const barFill = el('div')
        barFill.style.cssText = 'height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary,#4f8cff);width:' + Math.round(ratio * 100) + '%'
        barTrack.appendChild(barFill)
        barBox.appendChild(barTrack)
        const ratioSpan = el('span', '', (ratio * 100 >= 1 ? Math.round(ratio * 100) + '%' : '<1%'))
        ratioSpan.style.color = '#c2cede'
        barBox.appendChild(ratioSpan)
        td3.appendChild(barBox)
        row.appendChild(td1); row.appendChild(td2); row.appendChild(td3)
        return row
      }
      for (const m of allModels.slice(0, FOLD)) tbody.appendChild(makeRow(m))
      table.appendChild(tbody)

      let moreBtn = null
      if (allModels.length > FOLD) {
        moreBtn = el('button', 'dsh-zpu-chip', '展开全部 ' + allModels.length + ' 个模型 ▾')
        moreBtn.type = 'button'
        moreBtn.style.cssText = 'display:block;width:100%;margin-top:10px;margin-bottom:6px;text-align:center;color:#cde8ff'
        moreBtn.addEventListener('click', () => {
          if (moreBtn.getAttribute('data-open') === '1') {
            tbody.replaceChildren(...allModels.slice(0, FOLD).map(makeRow))
            moreBtn.removeAttribute('data-open')
            moreBtn.textContent = '展开全部 ' + allModels.length + ' 个模型 ▾'
          } else {
            tbody.replaceChildren(...allModels.map(makeRow))
            moreBtn.setAttribute('data-open', '1')
            moreBtn.textContent = '收起 ▴'
          }
        })
      }
      detail.replaceChildren(head, chart, sumRow, table)
      if (moreBtn !== null) detail.appendChild(moreBtn)
      const tailPad = el('div')
      const isPhone = window.matchMedia('(max-width:640px)').matches
      tailPad.style.height = isPhone ? 'max(42px, env(safe-area-inset-bottom, 0px) + 42px)' : '14px'
      detail.appendChild(tailPad)
    }

    function renderAuth() {
      if (authBtn === null) return
      const cu = lastState?.consoleUsage
      if (cu?.ok === true) authBtn.removeAttribute('data-warn')
      else if (cu?.expired === true) authBtn.setAttribute('data-warn', '')
    }

    function openTokenDialog() {
      document.querySelector('.dsh-zpu-token-overlay')?.remove()
      const tokOverlay = el('div', 'dsh-zpu-token-overlay')
      tokOverlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(8,10,14,.6);display:flex;align-items:center;justify-content:center;padding:20px'
      const box = el('div')
      box.style.cssText = 'width:min(420px,92vw);background:var(--dsw-alias-bg-layer-2,#1a1e27);border:1px solid var(--dsw-alias-border-l1,#2a303c);border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.45)'
      const title = el('div', '', '更新令牌')
      title.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:6px'
      const desc = el('div', '', '粘贴 bigmodel_token_production 的 cookie 值（浏览器登录智谱官网后 F12 复制），可含多行，自动提取。')
      desc.style.cssText = 'font-size:11px;color:var(--dsw-alias-label-tertiary,#9daabd);margin-bottom:10px;line-height:1.5'
      const ta = el('textarea')
      ta.rows = 5
      ta.placeholder = 'bigmodel_token_production=eyJhbGciOiJI...\n（直接整段复制 cookie 串也行）'
      ta.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,#2a303c);border-radius:8px;background:var(--dsw-alias-bg-layer-1,transparent);color:inherit;font-size:12px;font-family:ui-monospace,monospace;resize:vertical;line-height:1.5'
      const msg = el('div')
      msg.style.cssText = 'min-height:16px;font-size:11px;color:#e06c75;margin:6px 0 0'
      const btnRow = el('div')
      btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px'
      const cancelBtn = el('button', 'dsh-zpu-chip', '取消')
      cancelBtn.type = 'button'
      const okBtn = el('button', 'dsh-zpu-chip', '确认更新')
      okBtn.type = 'button'
      if (usageRange !== '__never__') okBtn.setAttribute('data-active', '')
      okBtn.style.cssText += ';font-weight:600'
      btnRow.appendChild(cancelBtn)
      btnRow.appendChild(okBtn)
      box.appendChild(title); box.appendChild(desc); box.appendChild(ta); box.appendChild(msg); box.appendChild(btnRow)
      tokOverlay.appendChild(box)
      const close = () => tokOverlay.remove()
      tokOverlay.addEventListener('click', (e) => { if (e.target === tokOverlay) close() })
      cancelBtn.addEventListener('click', close)
      okBtn.addEventListener('click', () => {
        const raw = ta.value
        // 从任意粘贴格式里提取 token：裸 JWT、cookie 串、多行混合
        const m = raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)
        if (m === null) { msg.textContent = '未找到有效令牌（应形如 eyJ... 的 JWT）'; return }
        okBtn.disabled = true
        msg.style.color = 'var(--dsw-alias-label-tertiary,#8b93a1)'
        msg.textContent = '校验中…'
        const token = m[0]
        okBtn.disabled = true
        msg.style.color = 'var(--dsw-alias-label-tertiary,#8b93a1)'
        msg.textContent = '校验中…'
        fetch(BASE + '/api/dsh-zhipu-usage/auth/handoff', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ l: { access_token: token } }),
        }).then((r) => r.json().then((j) => ({ r, j })))
          .then(({ r, j }) => {
            if (r.ok && j?.ok === true) {
              void refreshAuth()
              close()
              void refresh()
            } else {
              msg.style.color = '#e06c75'
              msg.textContent = '校验失败：' + (j?.error ?? r.status) + (j?.expired === true ? '（令牌已过期/无效）' : '')
              okBtn.disabled = false
            }
          })
          .catch((e) => { msg.style.color = '#e06c75'; msg.textContent = '请求失败：' + e; okBtn.disabled = false })
      })
      document.body.appendChild(tokOverlay)
      ta.focus()
    }

    function syncActive() {
      const entry = document.querySelector(ENTRY_SELECTOR)
      if (entry === null) return
      if (overlay !== null && !overlay.hidden) entry.setAttribute('data-active', '')
      else entry.removeAttribute('data-active')
    }

    function openPanel() {
      if (overlay === null) return
      overlay.hidden = false
      renderBody()
      renderAuth()
      syncActive()
      void refresh()
      void refreshAuth()
    }

    function closePanel() {
      if (overlay === null) return
      overlay.hidden = true
      syncActive()
    }

    function togglePanel() {
      if (overlay === null) return
      if (overlay.hidden) openPanel()
      else closePanel()
    }

    // ---- lifecycle ----------------------------------------------------------------

    function apply(ctx) {
      if (typeof document === 'undefined') return
      if (document.querySelector(ENTRY_SELECTOR) !== null) return
      ensureStyles()
      const disposers = []
      disposers.push(mountSidebarEntry(togglePanel))
      disposers.push(buildPanel())

      const onKeydown = (event) => { if (event.key === 'Escape') closePanel() }
      document.addEventListener('keydown', onKeydown)
      disposers.push(() => { document.removeEventListener('keydown', onKeydown) })

      const onSidebarRowClick = (event) => {
        if (event.target instanceof Element && event.target.closest(SIDEBAR_ROW_SELECTOR) !== null) closePanel()
      }
      document.addEventListener('click', onSidebarRowClick, true)
      disposers.push(() => { document.removeEventListener('click', onSidebarRowClick, true) })

      const poll = setInterval(() => {
        if (document.hidden) return
        void refresh()
        void refreshAuth()
      }, POLL_MS)
      disposers.push(() => { clearInterval(poll) })

      const onVisibility = () => { if (!document.hidden) { void refresh(); void refreshAuth() } }
      document.addEventListener('visibilitychange', onVisibility)
      disposers.push(() => { document.removeEventListener('visibilitychange', onVisibility) })

      void refresh()
      void refreshAuth()

      ctx.effect(() => () => {
        for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* best effort */ } }
      }, 'dsh-zhipu-usage: teardown')
    }

    exports.apply = apply
    return module.exports
  },
});
