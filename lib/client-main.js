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
    // candidate order matches the host's registration order: after a failed
    // hot-mount an older leaked instance can keep holding state-r2, so the
    // client falls back to state-r1 instead of talking to stale code forever
    const STATE_PATHS = [BASE + '/api/dsh-zhipu-usage/state-r2', BASE + '/api/dsh-zhipu-usage/state-r1']
    let statePathIndex = 0
    const AUTH_STATUS = BASE + '/api/dsh-zhipu-usage/auth/status'
    const ENTRY_SELECTOR = '[data-dsh-zhipu-usage-entry]'
    const FAMILY_SELECTOR = '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-zhipu-usage-entry]'
    const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
    const POLL_MS = 60_000
    const REQUEST_TIMEOUT_MS = 10_000
    const ICON = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8 L4 3.5 L7.5 6" fill="#f5c56b"/><path d="M12 6 L15 3.5 L14.5 8" fill="#f5c56b"/><path d="M4 11.5 a6 5 0 0 1 12 0 q0 4.5 -6 4.5 q-6 0 -6 -4.5" fill="#f5c56b"/><circle cx="8" cy="11" r="0.8" fill="#2f2f2f" stroke="none"/><circle cx="12" cy="11" r="0.8" fill="#2f2f2f" stroke="none"/><path d="M9.4 13.2 q0.6 0.6 1.2 0"/></svg>'

    const CSS = [
      '.dsh-zpu-panel{--zpu-ink:#2f2f2f;--zpu-ink-soft:#6b6b6b;--zpu-ink-faint:#a8a8a8;--zpu-paper:#ffffff;--zpu-paper-raised:#fbfbfa;--zpu-track:rgba(130,145,165,.14);--zpu-cat:#f5c56b;--zpu-cat-deep:#e8a94e;--zpu-blue:#a9c3d8;--zpu-blue-faint:#dbe7f0;--zpu-accent:#e8a94e;--zpu-mark:rgba(245,197,107,.3);--zpu-ok:#a9c3d8}',
      '.dsh-zpu-entry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;font-family:inherit;line-height:1;display:flex;text-align:left;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:background-color .12s,color .12s}',
      '.dsh-zpu-entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
      '.dsh-zpu-entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}.dsh-zpu-entry[data-active]:hover{background:var(--dsw-specific-sidebar-nav-item-active)}.dsh-zpu-entry:active{transform:translateY(1px)}.dsh-zpu-entry:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.dsh-zpu-entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex;width:16px;height:16px}',
      '.dsh-zpu-entryLabel{overflow:hidden;text-overflow:ellipsis}',
      '.dsh-zpu-pill{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:0 0 auto;font-weight:600}',
      '[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-entry{justify-content:center;padding:0;gap:0}',
      '[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-entryLabel,[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-pill{display:none}',
      '.dsh-zpu-overlay{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-start;justify-content:center;background:var(--dsw-alias-bg-mask-drop,rgba(9,11,16,.45));padding:max(24px,env(safe-area-inset-top)) 16px 24px}',
      '.dsh-zpu-overlay[hidden]{display:none}',
      '.dsh-zpu-panel{width:min(580px,100%);max-height:calc(100vh - 48px);max-height:calc(100dvh - 48px);overflow-y:auto;background:#ffffff;color:#2f2f2f;border:1.5px solid #2f2f2f;border-radius:10px;box-shadow:0 10px 32px rgba(50,50,50,.14);padding:20px 20px 34px;font-size:13px;overscroll-behavior:contain;position:relative;font-family:ui-rounded,"Segoe UI Rounded",system-ui,sans-serif}',
            '.dsh-zpu-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}',
      '.dsh-zpu-title{font-size:17px;font-weight:800;color:var(--zpu-ink);letter-spacing:.01em}',
      '.dsh-zpu-sub{font-size:11px;color:var(--zpu-ink-soft);font-variant-numeric:tabular-nums}',
      '.dsh-zpu-actions{margin-left:auto;display:flex;gap:6px}',
      '.dsh-zpu-btn{font-size:12px;padding:6px 15px;border-radius:7px;border:1.2px solid var(--zpu-ink);background:var(--zpu-paper);color:var(--zpu-ink);cursor:pointer;font-family:inherit;font-weight:600;transition:background .12s',
      '.dsh-zpu-btn:hover{background:var(--zpu-blue-faint)}',
      '.dsh-zpu-btn:active{transform:translate(2px,2px);box-shadow:0 0 0 rgba(61,56,51,.8)}',
      '.dsh-zpu-err{margin:10px 0 0;font-size:12px;color:var(--dsw-alias-state-error-primary,#c0392b);word-break:break-all;background:rgba(192,57,43,.07);border:1.5px dashed #c0392b;border-radius:8px;padding:6px 10px}',
      '.dsh-zpu-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0 6px}',
      '@media (max-width:480px){.dsh-zpu-cards{gap:6px;margin:14px 0 6px}.dsh-zpu-card{padding:9px 7px;border-radius:8px;border-width:1.2px;background:#fbfbfa}.dsh-zpu-cardName{font-size:9.5px}.dsh-zpu-cardValue{font-size:17px}.dsh-zpu-cardMeta{font-size:9px;line-height:1.45}}',
      '.dsh-zpu-card{border:1.2px solid #2f2f2f;border-radius:8px;padding:12px 14px;background:#fbfbfa;transition:border-color .15s,background .15s;cursor:pointer;position:relative}',
      '.dsh-zpu-card:hover{border-color:var(--zpu-cat-deep)}',
      '.dsh-zpu-card[data-active]{background:#dbe7f0;border-color:#2f2f2f}',
      '.dsh-zpu-card[data-active]::after{content:"";position:absolute;top:-5px;right:-5px;width:11px;height:11px;border-radius:50%;background:var(--zpu-cat);border:1.5px solid var(--zpu-ink)}',
      '.dsh-zpu-cardName{font-size:10px;color:var(--zpu-ink-faint);letter-spacing:.1em;white-space:nowrap;font-weight:600}',
      '.dsh-zpu-cardValue{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;margin:5px 0 4px;color:var(--zpu-ink);letter-spacing:-.01em}',
      '.dsh-zpu-card[data-active] .dsh-zpu-cardValue{color:#e8a94e}',
      '.dsh-zpu-cardMeta{font-size:10.5px;color:var(--zpu-ink-soft);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-zpu-quota{display:flex;align-items:center;gap:10px;margin:14px 0 2px;font-size:13px;color:var(--zpu-ink);font-variant-numeric:tabular-nums;flex-wrap:wrap;font-weight:600}',
      '.dsh-zpu-quotaName{font-weight:800;color:var(--zpu-ink)}',
      '.dsh-zpu-quotaBar{flex:1 1 80px;min-width:60px;height:8px;border-radius:4px;background:var(--zpu-track);border:1px solid var(--zpu-ink);overflow:hidden;position:relative}',
      '.dsh-zpu-quotaFill{height:100%;background:var(--zpu-blue)}',
      '.dsh-zpu-quotaFill[data-hot]{background:var(--zpu-cat)}',
      '.dsh-zpu-quotaFill[data-crit]{background:#cf8b84}',
      '.dsh-zpu-auth{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:11px;color:#9a968e}',
      '.dsh-zpu-chip{font-size:11px;padding:4px 12px;border-radius:999px;border:1.2px solid var(--zpu-ink);background:var(--zpu-paper);color:var(--zpu-ink-soft);cursor:pointer;font-family:inherit;font-weight:600;transition:all .12s',
      '.dsh-zpu-chip:hover{border-color:var(--zpu-cat-deep);color:var(--zpu-ink)}',
      '.dsh-zpu-chip[data-active]{background:var(--zpu-cat);border-color:var(--zpu-ink);color:var(--zpu-ink);font-weight:700}',
      '.dsh-zpu-chip[data-warn]{border-color:#c0392b;color:#c0392b}',
      '.dsh-zpu-foot{margin-top:12px;font-size:10.5px;color:#9a968e;line-height:1.6}',
      '.dsh-zpu-panel table thead th{letter-spacing:.04em;border-bottom:1.5px solid var(--zpu-ink) !important;background:var(--zpu-blue-faint)}',
      '.dsh-zpu-panel table{background:transparent;border:1.2px solid var(--zpu-ink);border-radius:8px;overflow:hidden}',
      '.dsh-zpu-panel table tbody tr:hover{background:rgba(169,195,216,.16)}',
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

    /** Read DSW theme variables with fallbacks (dark/light aware). */
    function themeColors() {
      const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null
      const v = (name, fallback) => {
        const value = cs !== null ? cs.getPropertyValue(name).trim() : ''
        return value !== '' ? value : fallback
      }
      return {
        ink: v('--dsw-alias-label-primary', '#2f2f2f'),
        inkSoft: v('--dsw-alias-label-secondary', '#6b6b6b'),
        paper: v('--dsw-alias-bg-layer-1', '#ffffff'),
        paperRaised: v('--dsw-alias-bg-layer-2', '#fbfbfa'),
        line: v('--dsw-alias-border-l1', '#c9cdd4'),
      }
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
        let state = null
        let lastErr = null
        for (let i = 0; i < STATE_PATHS.length; i += 1) {
          const idx = (statePathIndex + i) % STATE_PATHS.length
          try { state = await fetchJson(STATE_PATHS[idx]); statePathIndex = idx; break } catch (error) { lastErr = error }
        }
        if (state === null) throw lastErr
        lastState = state
        lastError = null
      } catch (error) {
        lastError = /abort/i.test(String(error?.message ?? error)) ? '请求超时（10s）' : String(error?.message ?? error)
      } finally {
        fetching = false
        updatePill()
        renderBody()
      }
    }

    async function refreshAuth() {
      renderAuth()
      if (authBtn === null) return
      try {
        const status = await fetchJson(AUTH_STATUS)
        authBtn.title = status.bound === true ? '控制台令牌已绑定' : '未绑定控制台令牌（点击更新）'
        if (status.bound !== true) authBtn.setAttribute('data-warn', '')
      } catch { /* cosmetic only */ }
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
      badge.style.cssText = 'font-size:9px;padding:2px 8px;letter-spacing:.12em;font-weight:800;background:var(--zpu-mark);border-color:var(--zpu-ink);color:var(--zpu-ink);box-shadow:1.5px 1.5px 0 rgba(74,74,72,.4)'
      titleRow.appendChild(badge)
      titleRow.appendChild(el('span', 'dsh-zpu-title', '智谱 Coding Plan 用量'))
      // 橘猫线稿：简笔插画（圆脸+耳+尾），唯一暖色元素
      const cat = el('span')
      cat.innerHTML = '<svg viewBox="0 0 40 26" width="34" height="22" fill="none" stroke="#2f2f2f" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M8 10 L6 3 L12 7" fill="#f5c56b"/><path d="M20 10 L22 3 L16 6" fill="#f5c56b"/><ellipse cx="14" cy="14" rx="11" ry="8.5" fill="#f5c56b"/><circle cx="10.5" cy="13" r="0.9" fill="#2f2f2f"/><circle cx="17.5" cy="13" r="0.9" fill="#2f2f2f"/><path d="M13 16.5 q1.2 1.2 2.4 0"/><path d="M25 12 q7 -4 9 2 q1.5 4 -3 6" fill="#f5c56b"/></svg>'
      cat.style.cssText = 'display:inline-flex;align-items:flex-end;margin-left:auto;opacity:.95'
      titleRow.appendChild(cat)
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

      cardsBox = el('div')
      cardsBox.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0 6px'
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
      const metaEl = el('div', 'dsh-zpu-cardMeta')
      for (const [i, seg] of String(meta).split('\n').entries()) {
        if (i > 0) { const br = el('div'); br.style.height = '1px'; metaEl.appendChild(br) }
        metaEl.appendChild(el('div', '', seg))
      }
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
      const fmtCalls = (n) => n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(n)
      const rangeMeta = (key, title) => {
        const r = cu?.[key]
        if (!ok) return { text: cu?.expired === true ? '令牌过期' : '待绑定', meta: '—' }
        if (r == null) return { text: '获取失败', meta: '—' }
        const days = key === 'today' ? 1 : key === 'last7' ? 7 : null
        const avg = days && days > 1 ? '\n日均 ' + fmtTokens(Math.round(r.tokens / days)) : ''
        return { text: fmtTokens(r.tokens), meta: fmtCalls(r.calls) + ' 调用 · ' + (r.models ?? []).length + ' 模型' + avg }
      }
      cardsBox.replaceChildren()
      for (const [title, key] of [['今日', 'today'], ['近7天', 'last7'], ['本月', 'month']]) {
        const info = rangeMeta(key, title)
        const c = card(title, info.text, info.meta)
        if (usageRange === key) {
          c.style.background = '#dbe7f0'
          c.style.borderColor = '#2f2f2f'
          c.style.boxShadow = 'inset 0 0 0 1.2px #2f2f2f, 0 2px 6px rgba(47,47,47,.12)'
          const dot = el('div')
          dot.style.cssText = 'position:absolute;top:-5px;right:-5px;width:11px;height:11px;border-radius:50%;background:#f5c56b;border:1.5px solid #2f2f2f'
          c.appendChild(dot)
          const v = c.children[1]
          if (v) v.style.color = '#e8a94e'
        }
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
        quotaText.textContent = pct + '% · ' + countdownText(w.resetTs)
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
      } else if (quotaFill !== null) {
        quotaFill.style.width = '0%'
        quotaFill.removeAttribute('data-hot')
        quotaFill.removeAttribute('data-crit')
        quotaText.textContent = rem.ok === false
          ? (String(rem.error ?? '').includes('API_KEY') ? '未配置 API Key' : '配额获取失败')
          : '暂无数据'
      }
    }

    let usageDetailBox = null
    let usageRange = 'today'
    let chartBubble = null

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
        ln.setAttribute('stroke', 'var(--zpu-ink-faint)'); ln.setAttribute('opacity', '.4'); ln.setAttribute('stroke-dasharray', '3 4')
        svg.appendChild(ln)
      }
      const defs = svgEl('defs')
      const gradArea = svgEl('linearGradient')
      gradArea.setAttribute('id', 'zpu-area-' + Math.random().toString(36).slice(2, 7))
      gradArea.setAttribute('x1', '0'); gradArea.setAttribute('y1', '0'); gradArea.setAttribute('x2', '0'); gradArea.setAttribute('y2', '1')
      const gs1 = svgEl('stop'); gs1.setAttribute('offset', '0'); gs1.setAttribute('stop-color', '#a9c3d8'); gs1.setAttribute('stop-opacity', '.35')
      const gs2 = svgEl('stop'); gs2.setAttribute('offset', '1'); gs2.setAttribute('stop-color', '#a9c3d8'); gs2.setAttribute('stop-opacity', '.02')
      gradArea.appendChild(gs1); gradArea.appendChild(gs2); defs.appendChild(gradArea); svg.appendChild(defs)
      const area = svgEl('path')
      area.setAttribute('d', 'M' + pts.join(' L') + ' L' + xOf(n - 1).toFixed(1) + ',' + (padT + innerH) + ' L' + padL + ',' + (padT + innerH) + ' Z')
      area.setAttribute('fill', 'url(#' + gradArea.id + ')')
      svg.appendChild(area)
      const lineEl = svgEl('polyline')
      lineEl.setAttribute('points', pts.join(' '))
      lineEl.setAttribute('fill', 'none'); lineEl.setAttribute('stroke', '#2f2f2f')
      lineEl.setAttribute('stroke-width', '1.8'); lineEl.setAttribute('stroke-linejoin', 'round')
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
        t.setAttribute('font-size', '8.5'); t.setAttribute('fill', i === peak ? '#c8551b' : '#9a968e')
        t.textContent = fmtTokens(p.tokens)
        svg.appendChild(t)
        placed.push({ x1: tx - labelW / 2, x2: tx + labelW / 2 })
      }
      for (let i = 0; i < n; i++) {
        const dot = svgEl('circle')
        dot.setAttribute('cx', xOf(i)); dot.setAttribute('cy', yOf(series[i].tokens))
        dot.setAttribute('r', i === peak ? '3.4' : '1.8')
        dot.setAttribute('fill', i === peak ? '#f5c56b' : '#2f2f2f')
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
        t.setAttribute('font-size', '8.5'); t.setAttribute('fill', '#6b6b6b')
        t.textContent = xTickFull(series[i].label)
        svg.appendChild(t)
        const tick = svgEl('line')
        tick.setAttribute('x1', xOf(i)); tick.setAttribute('x2', xOf(i))
        tick.setAttribute('y1', padT + innerH); tick.setAttribute('y2', padT + innerH + 3)
        tick.setAttribute('stroke', 'var(--zpu-ink-faint)')
        svg.appendChild(tick)
      }
      // 悬停/触屏指示线 + 气泡
      const cursorLine = svgEl('line')
      cursorLine.setAttribute('y1', padT); cursorLine.setAttribute('y2', padT + innerH)
      cursorLine.setAttribute('stroke', 'var(--zpu-ink)'); cursorLine.setAttribute('opacity', '.5'); cursorLine.setAttribute('stroke-dasharray', '2 3')
      cursorLine.setAttribute('opacity', '0')
      svg.appendChild(cursorLine)
      const bubble = el('div')
      bubble.style.cssText = '--zpu-ink:var(--dsw-alias-label-primary,#3a3a3a);--zpu-ink-soft:var(--dsw-alias-label-secondary,#6e6e6e);--zpu-ink-faint:var(--dsw-alias-label-tertiary,#9a9a9a);--zpu-paper-raised:var(--dsw-alias-bg-layer-1,#fff);position:fixed;z-index:100001;pointer-events:none;background:var(--zpu-paper-raised,var(--zpu-paper,#fff));border:1.2px solid #2f2f2f;border-radius:7px;padding:6px 10px;font-size:11px;line-height:1.6;color:var(--zpu-ink,#2f2f2f);box-shadow:1.5px 1.5px 0 rgba(74,74,72,.4);white-space:nowrap;display:none'
      if (chartBubble !== null) chartBubble.remove()
      chartBubble = bubble
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
      const select = el('select')
      const TS = themeColors()
      select.setAttribute('aria-label', '选择时间范围')
      select.style.cssText = 'font-size:12px;padding:4px 26px 4px 10px;border:1.2px solid ' + TS.line + ';border-radius:7px;background:' + TS.paper + ';color:' + TS.ink + ';font-family:inherit;font-weight:600;cursor:pointer;-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent;background-image:url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%232f2f2f" stroke-width="1.6" stroke-linecap="round"/></svg>\');background-repeat:no-repeat;background-position:right 9px center'
      for (const [label, key] of RANGE_KEYS) {
        const opt = el('option', '', label)
        opt.value = key
        if (usageRange === key) opt.selected = true
        select.appendChild(opt)
      }
      select.addEventListener('change', () => {
        usageRange = select.value
        renderUsageDetail(cu)
      })
      const head = el('div', '', '')
      head.style.cssText = 'display:flex;align-items:center;margin:12px 0 0;font-size:13px;font-weight:800;color:var(--zpu-ink)'
      head.appendChild(el('span', '', '用量趋势'))
      const spacer = el('span')
      spacer.style.flex = '1'
      head.appendChild(spacer)
      head.appendChild(select)

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
        s.style.cssText = 'font-variant-numeric:tabular-nums' + (i > 0 ? ';color:#6b6b6b;font-weight:500' : ';color:#e8a94e;font-weight:800')
        return s
      })
      sumRow.style.cssText = 'display:flex;gap:14px;align-items:baseline;margin:10px 0 0;font-size:13px;flex-wrap:wrap'
      sumRow.replaceChildren(...sumSpans.flatMap((s, i) => i > 0 ? [sepDot(), s] : [s]))
      function sepDot() { const d = el('span', '', '·'); d.style.color = 'var(--zpu-ink-faint)'; return d }

      // 模型表：全量数据，默认展示前 6 行 + 展开按钮
      const table = el('table')
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;margin-top:8px'
      const thead = el('thead')
      const hr = el('tr')
      for (const [t, left] of [['模型', true], ['合计 tok', false], ['占比', false]]) {
        const th = el('th', '', t)
        th.style.cssText = left ? 'text-align:left' : 'text-align:right'
        th.style.cssText += ';font-weight:700;color:#6e6a62;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,#2a303c)'
        hr.appendChild(th)
      }
      thead.appendChild(hr)
      table.appendChild(thead)
      const tbody = el('tbody')
      const allModels = [...(range?.models ?? [])].sort((a, b) => b.tokens - a.tokens)
      const totalTokens = range?.tokens ?? 0
      const makeRow = (m) => {
        const row = el('tr')
        const td1 = el('td', '', m.name)
        td1.style.cssText = 'padding:6px 8px;border-bottom:1px dashed var(--zpu-ink-faint);color:var(--zpu-ink);font-weight:600'
        const td2 = el('td', '', fmtTokens(m.tokens))
        td2.style.cssText = 'padding:6px 8px;text-align:right;border-bottom:1px dashed var(--zpu-ink-faint);white-space:nowrap;color:var(--zpu-ink);font-weight:700'
        const td3 = el('td')
        td3.style.cssText = 'padding:6px 8px;text-align:right;border-bottom:1px dashed var(--zpu-ink-faint);width:34%;color:var(--zpu-ink-soft)'
        const ratio = totalTokens > 0 ? m.tokens / totalTokens : 0
        const barBox = el('div')
        barBox.style.cssText = 'display:flex;align-items:center;gap:6px;justify-content:flex-end'
        const barTrack = el('div')
        barTrack.style.cssText = 'flex:1;max-width:70px;height:7px;border-radius:4px;background:var(--zpu-track);border:1px solid var(--zpu-ink-faint);overflow:hidden'
        const barFill = el('div')
        barFill.style.cssText = 'height:100%;border-radius:4px;background:#81b29a;box-shadow:inset 0 0 0 1px rgba(74,74,72,.22);width:' + Math.round(ratio * 100) + '%'
        barTrack.appendChild(barFill)
        barBox.appendChild(barTrack)
        const ratioSpan = el('span', '', (ratio * 100 >= 1 ? Math.round(ratio * 100) + '%' : '<1%'))
        ratioSpan.style.color = 'var(--zpu-ink-soft)'
        barBox.appendChild(ratioSpan)
        td3.appendChild(barBox)
        row.appendChild(td1); row.appendChild(td2); row.appendChild(td3)
        return row
      }
      for (const m of allModels) tbody.appendChild(makeRow(m))
      table.appendChild(tbody)

      detail.replaceChildren(head, chart, sumRow, table)
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
      tokOverlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(8,10,14,.6);display:flex;align-items:center;justify-content:center;padding:20px;padding-bottom:max(40px, env(safe-area-inset-bottom, 0px) + 28px)'
      const box = el('div')
      const TD = themeColors()
      box.style.cssText = 'width:min(420px,92vw);background:' + TD.paper + ';border:1.5px solid ' + TD.line + ';border-radius:10px;padding:16px;padding-bottom:24px;box-shadow:0 12px 36px rgba(0,0,0,.28)'
      const title = el('div', '', '更新令牌')
      title.style.cssText = 'font-size:15px;font-weight:800;margin-bottom:6px;color:' + TD.ink
      const desc = el('div', '', '粘贴 bigmodel_token_production 的 cookie 值（浏览器登录智谱官网后 F12 复制），可含多行，自动提取。')
      desc.style.cssText = 'font-size:11px;color:var(--dsw-alias-label-tertiary,#9daabd);margin-bottom:10px;line-height:1.5'
      const ta = el('textarea')
      ta.rows = 5
      ta.placeholder = 'bigmodel_token_production=eyJhbGciOiJI...\n（直接整段复制 cookie 串也行）'
      ta.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1.2px solid ' + TD.line + ';border-radius:7px;background:' + TD.paperRaised + ';color:' + TD.ink + ';font-size:12px;font-family:ui-monospace,monospace;resize:vertical;line-height:1.5'
      const msg = el('div')
      msg.style.cssText = 'min-height:16px;font-size:11px;color:#e06c75;margin:6px 0 0'
      const btnRow = el('div')
      btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px'
      const cancelBtn = el('button', 'dsh-zpu-chip', '取消')
      cancelBtn.type = 'button'
      const okBtn = el('button', 'dsh-zpu-chip', '确认更新')
      okBtn.type = 'button'
      okBtn.setAttribute('data-active', '')
      okBtn.style.cssText += ';font-weight:800'
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
        msg.style.color = 'var(--zpu-ink-soft)'
        msg.textContent = '校验中…'
        const token = m[0]
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
      disposers.push(() => { if (chartBubble !== null) { chartBubble.remove(); chartBubble = null } })

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
/* build 2026-08-19-v9-theme */
