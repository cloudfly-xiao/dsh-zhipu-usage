/**
 * dsh-zhipu-usage browser half (server-API edition, DSW-native UI).
 * Data comes exclusively from the host's remote-API state route; the login
 * button opens the token paste dialog. Every fetch has a 10s timeout and
 * renders an error line on failure — never a blank or frozen panel.
 * Visuals ride the DSW alias design tokens, so the panel matches the GUI
 * in both light and dark themes.
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
    const ICON = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.2 13.2a6.6 6.6 0 1 1 11.6 0"/><path d="M10 13.2 12.6 8.7"/><circle cx="10" cy="13.2" r="1.25" fill="currentColor" stroke="none"/></svg>'
    const MARK = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="0.5" y="0.5" width="15" height="15" rx="4.5" fill="var(--dsw-alias-brand-primary,#3370ff)"/><path d="M9.3 2.6 4.9 8.9h2.7L6.7 13.4 11.1 7.1H8.4z" fill="var(--dsw-alias-label-primary-foreground,#fff)"/></svg>'

    const CSS = [
      '.dsh-zpu-panel{--zpu-ink:var(--dsw-alias-label-primary,#1f2329);--zpu-ink-soft:var(--dsw-alias-label-secondary,#575a60);--zpu-ink-faint:var(--dsw-alias-label-tertiary,#8a9099);--zpu-paper:var(--dsw-alias-bg-layer-2,#ffffff);--zpu-raised:var(--dsw-alias-bg-layer-3,#f5f6f7);--zpu-line:var(--dsw-alias-border-l2,#e3e5e8);--zpu-brand:var(--dsw-alias-brand-primary,#3370ff);--zpu-biz:var(--dsw-alias-state-business-primary,#3370ff);--zpu-warn:var(--dsw-alias-state-warn-primary,#ff8800);--zpu-err:var(--dsw-alias-state-error-primary,#f54a45);--zpu-track:var(--dsw-alias-bg-layer-3,#eef0f2);--zpu-fg:var(--dsw-alias-label-primary-foreground,#fff);--zpu-hover:var(--dsw-alias-interactive-bg-hover,rgba(51,112,255,.08))}',
      '.dsh-zpu-entry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;font-family:inherit;line-height:1;display:flex;text-align:left;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:background-color .12s,color .12s}',
      '.dsh-zpu-entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover,var(--zpu-hover));color:var(--dsw-alias-label-primary)}',
      '.dsh-zpu-entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active,var(--zpu-hover));color:var(--dsw-alias-label-primary);font-weight:600}.dsh-zpu-entry[data-active]:hover{background:var(--dsw-specific-sidebar-nav-item-active,var(--zpu-hover))}.dsh-zpu-entry:active{transform:translateY(1px)}.dsh-zpu-entry:focus-visible{outline:2px solid var(--zpu-brand);outline-offset:2px}',
      '.dsh-zpu-entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex;width:16px;height:16px;color:var(--zpu-brand)}',
      '.dsh-zpu-entryLabel{overflow:hidden;text-overflow:ellipsis}',
      '.dsh-zpu-pill{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.14));padding:1.5px 8px;border-radius:999px;font-variant-numeric:tabular-nums;flex:0 0 auto;font-weight:600}',
      '[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-entry{justify-content:center;padding:0;gap:0}',
      '[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-entryLabel,[data-dsh-frame][data-sidebar-collapsed] .dsh-zpu-pill{display:none}',
      '.dsh-zpu-overlay{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-start;justify-content:center;background:var(--dsw-alias-bg-mask-2,rgba(9,11,16,.45));padding:max(24px,env(safe-area-inset-top)) 16px 24px}',
      '.dsh-zpu-overlay[hidden]{display:none}',
      '.dsh-zpu-panel{width:min(600px,100%);max-height:calc(100vh - 48px);max-height:calc(100dvh - 48px);overflow-y:auto;overscroll-behavior:contain;background:var(--zpu-paper);color:var(--zpu-ink);border:1px solid var(--zpu-line);border-radius:14px;box-shadow:var(--dsw-shadow-lv3,0 12px 36px rgba(0,0,0,.18));padding:18px 18px 26px;font-size:13px;position:relative;font-family:var(--dsw-font-family,system-ui,sans-serif)}',
      '.dsh-zpu-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.dsh-zpu-headL{display:flex;align-items:center;gap:9px;min-width:0}',
      '.dsh-zpu-titleWrap{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dsh-zpu-title{font-size:15px;font-weight:700;color:var(--zpu-ink);letter-spacing:.01em;display:flex;align-items:center;gap:8px}',
      '.dsh-zpu-sub{font-size:11px;color:var(--zpu-ink-faint);font-variant-numeric:tabular-nums}',
      '.dsh-zpu-actions{margin-left:auto;display:flex;gap:6px}',
      '.dsh-zpu-btn{font-size:12px;padding:5px 12px;border-radius:8px;border:1px solid var(--zpu-line);background:transparent;color:var(--zpu-ink-soft);cursor:pointer;font-family:inherit;font-weight:500;transition:background-color .12s,border-color .12s,color .12s;-webkit-tap-highlight-color:transparent}',
      '.dsh-zpu-btn:hover{background:var(--zpu-hover);color:var(--zpu-ink);border-color:var(--dsw-alias-border-l3,var(--zpu-line))}',
      '.dsh-zpu-btn:active{transform:translateY(1px)}',
      '.dsh-zpu-btn:focus-visible{outline:2px solid var(--zpu-brand);outline-offset:1px}',
      '.dsh-zpu-err{margin:10px 0 0;font-size:12px;color:var(--zpu-err);word-break:break-all;background:color-mix(in srgb,var(--zpu-err) 7%,transparent);border:1px solid color-mix(in srgb,var(--zpu-err) 32%,transparent);border-radius:10px;padding:7px 11px}',
      '@supports not (color: color-mix(in srgb, red 10%, transparent)){.dsh-zpu-err{background:rgba(245,74,69,.07);border-color:rgba(245,74,69,.32)}}',
      '.dsh-zpu-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0 6px}',
      '.dsh-zpu-card{border:1px solid var(--zpu-line);border-radius:12px;padding:12px 13px;background:var(--zpu-raised);transition:border-color .15s,background-color .15s,transform .15s,box-shadow .15s;cursor:pointer;position:relative;text-align:left;font-family:inherit;-webkit-tap-highlight-color:transparent}',
      '.dsh-zpu-card:hover{border-color:var(--dsw-alias-border-l3,#c9cdd4);transform:translateY(-1px)}',
      '.dsh-zpu-card:active{transform:translateY(0)}',
      '.dsh-zpu-card[data-active]{border-color:var(--zpu-brand);box-shadow:inset 0 0 0 1.5px var(--zpu-brand);background:var(--zpu-hover)}',
      '.dsh-zpu-card[data-active]::after{content:"";position:absolute;top:9px;right:9px;width:6px;height:6px;border-radius:50%;background:var(--zpu-brand)}',
      '.dsh-zpu-cardName{font-size:10.5px;color:var(--zpu-ink-faint);letter-spacing:.08em;white-space:nowrap;font-weight:600}',
      '.dsh-zpu-cardValue{font-size:23px;font-weight:700;font-variant-numeric:tabular-nums;margin:5px 0 4px;color:var(--zpu-ink);letter-spacing:-.01em}',
      '.dsh-zpu-card[data-active] .dsh-zpu-cardValue{color:var(--zpu-brand)}',
      '.dsh-zpu-cardMeta{font-size:10.5px;color:var(--zpu-ink-soft);line-height:1.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-zpu-quota{display:flex;align-items:center;gap:10px;margin:15px 0 2px;font-size:12.5px;color:var(--zpu-ink-soft);font-variant-numeric:tabular-nums;flex-wrap:wrap}',
      '.dsh-zpu-quotaName{font-weight:600;color:var(--zpu-ink)}',
      '.dsh-zpu-quotaBar{flex:1 1 90px;min-width:64px;height:6px;border-radius:999px;background:var(--zpu-track);overflow:hidden;position:relative}',
      '.dsh-zpu-quotaFill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--zpu-biz),var(--zpu-brand));transition:width .4s ease}',
      '.dsh-zpu-quotaFill[data-hot]{background:var(--zpu-warn)}',
      '.dsh-zpu-quotaFill[data-crit]{background:var(--zpu-err)}',
      '.dsh-zpu-foot{margin-top:12px;font-size:10.5px;color:var(--zpu-ink-faint);line-height:1.6}',
      '.dsh-zpu-trendHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 0}',
      '.dsh-zpu-trendTitle{font-size:13px;font-weight:600;color:var(--zpu-ink)}',
      '.dsh-zpu-seg{display:inline-flex;gap:2px;padding:2px;border-radius:10px;background:var(--zpu-raised);border:1px solid var(--zpu-line);max-width:100%;overflow-x:auto;scrollbar-width:none}',
      '.dsh-zpu-seg::-webkit-scrollbar{display:none}',
      '.dsh-zpu-segBtn{border:none;background:transparent;color:var(--zpu-ink-faint);font-size:11.5px;font-weight:500;padding:4px 10px;border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:color .12s,background-color .12s,box-shadow .12s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
      '.dsh-zpu-segBtn:hover{color:var(--zpu-ink)}',
      '.dsh-zpu-segBtn[data-active]{background:var(--zpu-paper);color:var(--zpu-ink);font-weight:600;box-shadow:var(--dsw-shadow-lv1,0 1px 3px rgba(0,0,0,.12))}',
      '.dsh-zpu-segBtn:focus-visible{outline:2px solid var(--zpu-brand);outline-offset:1px}',
      '.dsh-zpu-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;font-variant-numeric:tabular-nums;margin-top:10px;border:1px solid var(--zpu-line);border-radius:10px;overflow:hidden}',
      '.dsh-zpu-table th{font-size:10.5px;font-weight:500;color:var(--zpu-ink-faint);padding:6px 10px;background:var(--zpu-raised);border-bottom:1px solid var(--zpu-line)}',
      '.dsh-zpu-table td{padding:7px 10px;border-bottom:1px solid var(--dsw-alias-separator-primary,var(--zpu-line))}',
      '.dsh-zpu-table tr:last-child td{border-bottom:none}',
      '.dsh-zpu-table tbody tr{transition:background-color .12s}',
      '.dsh-zpu-table tbody tr:hover{background:var(--zpu-hover)}',
      '.dsh-zpu-bubble{position:fixed;z-index:100001;pointer-events:none;background:var(--zpu-paper);border:1px solid var(--zpu-line);border-radius:9px;padding:6px 10px;font-size:11px;line-height:1.6;color:var(--zpu-ink);box-shadow:var(--dsw-shadow-lv2,0 6px 20px rgba(0,0,0,.16));white-space:nowrap;display:none}',
      '.dsh-zpu-dialog{position:fixed;inset:0;z-index:100000;background:var(--dsw-alias-bg-mask-2,rgba(8,10,14,.5));display:flex;align-items:center;justify-content:center;padding:20px;padding-bottom:max(40px, env(safe-area-inset-bottom, 0px) + 28px)}',
      '.dsh-zpu-dialogBox{width:min(420px,92vw);background:var(--zpu-paper);border:1px solid var(--zpu-line);border-radius:14px;padding:16px;box-shadow:var(--dsw-shadow-lv3,0 12px 36px rgba(0,0,0,.28))}',
      '.dsh-zpu-textarea{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--dsw-alias-border-l2,#d0d5dd);border-radius:9px;background:var(--dsw-specific-input-major,var(--zpu-raised));color:var(--zpu-ink);font-size:12px;font-family:var(--dsw-font-markdown-code-block-small,ui-monospace,monospace);resize:vertical;line-height:1.55}',
      '.dsh-zpu-textarea:focus{outline:none;border-color:var(--zpu-brand)}',
      '.dsh-zpu-primary{font-size:12px;padding:6px 16px;border-radius:8px;border:1px solid transparent;background:var(--zpu-brand);color:var(--zpu-fg);cursor:pointer;font-family:inherit;font-weight:600;transition:opacity .12s,transform .12s;-webkit-tap-highlight-color:transparent}',
      '.dsh-zpu-primary:hover{opacity:.9}.dsh-zpu-primary:active{transform:translateY(1px)}.dsh-zpu-primary:disabled{opacity:.55;cursor:default}',
      '.dsh-zpu-chip{font-size:12px;padding:5px 13px;border-radius:999px;border:1px solid var(--zpu-line);background:transparent;color:var(--zpu-ink-soft);cursor:pointer;font-family:inherit;font-weight:500;transition:background-color .12s,border-color .12s,color .12s;-webkit-tap-highlight-color:transparent}',
      '.dsh-zpu-chip:hover{border-color:var(--zpu-brand);color:var(--zpu-ink);background:var(--zpu-hover)}',
      '.dsh-zpu-chip[data-warn]{border-color:var(--zpu-warn);color:var(--zpu-warn)}',
      '@keyframes dsh-zpu-sheet{from{transform:translateY(22px);opacity:.5}to{transform:none;opacity:1}}',
      '@media (max-width:640px){.dsh-zpu-overlay{padding:0;align-items:flex-end;overflow:hidden}.dsh-zpu-panel{width:100%;max-height:92svh;border-radius:16px 16px 0 0;border-left:none;border-right:none;border-bottom:none;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px calc(env(safe-area-inset-bottom,0px) + 20px);animation:dsh-zpu-sheet .24s ease}.dsh-zpu-panel::before{content:"";position:absolute;top:6px;left:50%;transform:translateX(-50%);width:38px;height:4px;border-radius:999px;background:var(--dsw-alias-border-l3,var(--zpu-line))}}',
      '@media (max-width:480px){.dsh-zpu-cards{gap:8px;margin:14px 0 6px}.dsh-zpu-card{padding:10px 11px}.dsh-zpu-cardValue{font-size:19px}.dsh-zpu-cardMeta{font-size:9.5px}}',
      '@media (prefers-reduced-motion: reduce){.dsh-zpu-panel{animation:none}.dsh-zpu-quotaFill{transition:none}}',
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

    /** Read DSW theme tokens with fallbacks (dark/light aware). */
    function themeColors() {
      const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null
      const v = (name, fallback) => {
        const value = cs !== null ? cs.getPropertyValue(name).trim() : ''
        return value !== '' ? value : fallback
      }
      return {
        ink: v('--dsw-alias-label-primary', '#1f2329'),
        inkSoft: v('--dsw-alias-label-secondary', '#575a60'),
        inkFaint: v('--dsw-alias-label-tertiary', '#8a9099'),
        paper: v('--dsw-alias-bg-layer-2', '#ffffff'),
        paperRaised: v('--dsw-alias-bg-layer-3', '#f5f6f7'),
        line: v('--dsw-alias-border-l2', '#e3e5e8'),
        brand: v('--dsw-alias-brand-primary', '#3370ff'),
        biz: v('--dsw-alias-state-business-primary', '#3370ff'),
        warn: v('--dsw-alias-state-warn-primary', '#ff8800'),
        error: v('--dsw-alias-state-error-primary', '#f54a45'),
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
    let panelFoot = null

    function buildPanel() {
      overlay = el('div', 'dsh-zpu-overlay')
      overlay.hidden = true
      const panel = el('div', 'dsh-zpu-panel')
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
      panel.setAttribute('aria-label', '智谱 Coding Plan 用量')

      const head = el('div', 'dsh-zpu-head')
      const headL = el('div', 'dsh-zpu-headL')
      const mark = el('span')
      mark.innerHTML = MARK
      mark.style.cssText = 'display:inline-flex;flex:none'
      headL.appendChild(mark)
      const titleWrap = el('div', 'dsh-zpu-titleWrap')
      titleWrap.appendChild(el('span', 'dsh-zpu-title', '智谱 Coding Plan 用量'))
      subLine = el('span', 'dsh-zpu-sub', '')
      titleWrap.appendChild(subLine)
      headL.appendChild(titleWrap)
      head.appendChild(headL)
      const actions = el('div', 'dsh-zpu-actions')
      authBtn = el('button', 'dsh-zpu-chip', '更新令牌')
      authBtn.type = 'button'
      authBtn.title = '更新控制台令牌'
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

      panelFoot = el('div', 'dsh-zpu-foot', '数据来自智谱官方接口 · 全账号口径（覆盖所有设备） · API Key 配额与控制台令牌双通道')
      panel.appendChild(panelFoot)

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
      const rangeMeta = (key) => {
        const r = cu?.[key]
        if (!ok) return { text: cu?.expired === true ? '令牌过期' : '待绑定', meta: '—' }
        if (r == null) return { text: '获取失败', meta: '—' }
        const days = key === 'today' ? 1 : key === 'last7' ? 7 : null
        const avg = days && days > 1 ? '\n日均 ' + fmtTokens(Math.round(r.tokens / days)) : ''
        return { text: fmtTokens(r.tokens), meta: fmtCalls(r.calls) + ' 调用 · ' + (r.models ?? []).length + ' 模型' + avg }
      }
      cardsBox.replaceChildren()
      for (const [title, key] of [['今日', 'today'], ['近7天', 'last7'], ['本月', 'month']]) {
        const info = rangeMeta(key)
        const c = card(title, info.text, info.meta)
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
        else { quotaFill.removeAttribute('data-hot'); quotaFill.removeAttribute('data-crit') }
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
          panelFootLine.style.cssText = 'margin:6px 0 0;font-size:11px;color:var(--dsw-alias-label-tertiary,#9daabd);font-variant-numeric:tabular-nums'
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
        const panel = overlay.querySelector('.dsh-zpu-panel')
        panel.insertBefore(usageDetailBox, panelFoot)
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
      const TC = themeColors()
      let max = 1
      let peak = 0
      for (let i = 0; i < series.length; i++) if (series[i].tokens > max) { max = series[i].tokens; peak = i }
      const n = series.length
      const xOf = (i) => padL + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1))
      const yOf = (v) => padT + innerH * (1 - v / max)
      const box = el('div')
      box.style.margin = '10px 0 0'
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H)
      svg.style.width = '100%'
      svg.style.height = 'auto'
      svg.style.touchAction = 'pan-y'
      const svgEl = (tag) => document.createElementNS('http://www.w3.org/2000/svg', tag)
      // y grid
      for (const frac of [1, 0.5, 0]) {
        const ln = svgEl('line')
        ln.setAttribute('x1', padL); ln.setAttribute('x2', W - padR)
        ln.setAttribute('y1', padT + innerH * (1 - frac)); ln.setAttribute('y2', padT + innerH * (1 - frac))
        ln.setAttribute('stroke', TC.line); ln.setAttribute('opacity', '.6'); ln.setAttribute('stroke-dasharray', '3 5')
        svg.appendChild(ln)
      }
      const defs = svgEl('defs')
      const gradId = 'zpu-area-' + Math.random().toString(36).slice(2, 7)
      const gradArea = svgEl('linearGradient')
      gradArea.setAttribute('id', gradId)
      gradArea.setAttribute('x1', '0'); gradArea.setAttribute('y1', '0'); gradArea.setAttribute('x2', '0'); gradArea.setAttribute('y2', '1')
      const gs1 = svgEl('stop'); gs1.setAttribute('offset', '0'); gs1.setAttribute('stop-color', TC.brand); gs1.setAttribute('stop-opacity', '.22')
      const gs2 = svgEl('stop'); gs2.setAttribute('offset', '1'); gs2.setAttribute('stop-color', TC.brand); gs2.setAttribute('stop-opacity', '.02')
      gradArea.appendChild(gs1); gradArea.appendChild(gs2); defs.appendChild(gradArea); svg.appendChild(defs)
      // smooth curve: horizontal-tangent cubic segments between points
      const smoothPath = () => {
        let d = 'M' + xOf(0).toFixed(1) + ',' + yOf(series[0].tokens).toFixed(1)
        for (let i = 1; i < n; i++) {
          const x0 = xOf(i - 1), x1 = xOf(i), dx = x1 - x0
          const c1x = x0 + dx / 2.6, c2x = x1 - dx / 2.6
          d += ' C' + c1x.toFixed(1) + ',' + yOf(series[i - 1].tokens).toFixed(1) + ' ' + c2x.toFixed(1) + ',' + yOf(series[i].tokens).toFixed(1) + ' ' + x1.toFixed(1) + ',' + yOf(series[i].tokens).toFixed(1)
        }
        return d
      }
      const curve = smoothPath()
      const area = svgEl('path')
      area.setAttribute('d', curve + ' L' + xOf(n - 1).toFixed(1) + ',' + (padT + innerH) + ' L' + padL + ',' + (padT + innerH) + ' Z')
      area.setAttribute('fill', 'url(#' + gradId + ')')
      svg.appendChild(area)
      const lineEl = svgEl('path')
      lineEl.setAttribute('d', curve)
      lineEl.setAttribute('fill', 'none'); lineEl.setAttribute('stroke', TC.brand)
      lineEl.setAttribute('stroke-width', '2'); lineEl.setAttribute('stroke-linecap', 'round')
      svg.appendChild(lineEl)
      // per-point labels (collision-avoided; local peaks first)
      const placed = []
      const overlap = (x1, x2) => placed.some(p => x1 < p.x2 + 2 && x2 > p.x1 - 2)
      const order = series.map((p, i) => i).sort((a, b) => series[b].tokens - series[a].tokens)
      const labelW = 34
      for (const i of order) {
        const p = series[i]
        const cx = xOf(i)
        const tx = Math.max(padL + labelW / 2, Math.min(W - padR - labelW / 2, cx))
        if (overlap(tx - labelW / 2, tx + labelW / 2)) continue
        if (n > 24 && p.tokens < max * 0.06) continue
        const t = svgEl('text')
        t.setAttribute('x', tx.toFixed(1)); t.setAttribute('y', Math.max(padT + 8, yOf(p.tokens) - 5))
        t.setAttribute('text-anchor', 'middle')
        t.setAttribute('font-size', '8.5'); t.setAttribute('fill', i === peak ? TC.warn : TC.inkFaint)
        t.textContent = fmtTokens(p.tokens)
        svg.appendChild(t)
        placed.push({ x1: tx - labelW / 2, x2: tx + labelW / 2 })
      }
      for (let i = 0; i < n; i++) {
        const dot = svgEl('circle')
        dot.setAttribute('cx', xOf(i)); dot.setAttribute('cy', yOf(series[i].tokens))
        dot.setAttribute('r', i === peak ? '3.2' : '2')
        dot.setAttribute('fill', i === peak ? TC.warn : TC.paper)
        dot.setAttribute('stroke', i === peak ? TC.warn : TC.brand)
        dot.setAttribute('stroke-width', '1.5')
        svg.appendChild(dot)
      }
      // x ticks, thinned by density; first + last always shown
      const xTickFull = (l) => {
        const s = String(l)
        return s.includes(':') ? s.slice(11) : s.slice(5)
      }
      const tickW = 30
      const maxTicks = Math.max(2, Math.floor(innerW / (tickW + 4)))
      const step = Math.max(1, Math.ceil((n - 1) / (maxTicks - 1)))
      const tickIdx = new Set()
      for (let i = 0; i < n; i += step) tickIdx.add(i)
      tickIdx.add(n - 1)
      const sorted = [...tickIdx].sort((a, b) => a - b)
      if (sorted.length > 1 && sorted[sorted.length - 1] - sorted[sorted.length - 2] < Math.ceil(step / 2)) sorted.splice(sorted.length - 2, 1)
      for (const i of sorted) {
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
        const t = svgEl('text')
        t.setAttribute('x', xOf(i).toFixed(1)); t.setAttribute('y', H - 8)
        t.setAttribute('text-anchor', anchor)
        t.setAttribute('font-size', '8.5'); t.setAttribute('fill', TC.inkFaint)
        t.textContent = xTickFull(series[i].label)
        svg.appendChild(t)
        const tick = svgEl('line')
        tick.setAttribute('x1', xOf(i)); tick.setAttribute('x2', xOf(i))
        tick.setAttribute('y1', padT + innerH); tick.setAttribute('y2', padT + innerH + 3)
        tick.setAttribute('stroke', TC.inkFaint)
        svg.appendChild(tick)
      }
      // hover / touch indicator + bubble
      const cursorLine = svgEl('line')
      cursorLine.setAttribute('y1', padT); cursorLine.setAttribute('y2', padT + innerH)
      cursorLine.setAttribute('stroke', TC.inkSoft); cursorLine.setAttribute('opacity', '0'); cursorLine.setAttribute('stroke-dasharray', '2 3')
      svg.appendChild(cursorLine)
      if (chartBubble !== null) chartBubble.remove()
      const bubble = el('div', 'dsh-zpu-bubble')
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
      const seg = el('div', 'dsh-zpu-seg')
      seg.setAttribute('role', 'tablist')
      seg.setAttribute('aria-label', '选择时间范围')
      for (const [label, key] of RANGE_KEYS) {
        const btn = el('button', 'dsh-zpu-segBtn', label)
        btn.type = 'button'
        btn.setAttribute('role', 'tab')
        if (usageRange === key) btn.setAttribute('data-active', '')
        btn.addEventListener('click', () => {
          if (usageRange === key) return
          usageRange = key
          // full re-render so the summary cards' active state stays in sync
          // (the old select only refreshed the trend section)
          renderBody()
        })
        seg.appendChild(btn)
      }
      const head = el('div', 'dsh-zpu-trendHead')
      head.appendChild(el('span', 'dsh-zpu-trendTitle', '用量趋势'))
      const spacer = el('span')
      spacer.style.flex = '1'
      head.appendChild(spacer)
      head.appendChild(seg)

      // range summary: total + calls + daily average (multi-day ranges)
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
        s.style.cssText = 'font-variant-numeric:tabular-nums' + (i > 0 ? ';color:var(--zpu-ink-soft);font-weight:400' : ';color:var(--zpu-brand);font-weight:700')
        return s
      })
      sumRow.style.cssText = 'display:flex;gap:14px;align-items:baseline;margin:10px 0 0;font-size:13px;flex-wrap:wrap'
      function sepDot() { const d = el('span', '', '·'); d.style.color = 'var(--zpu-ink-faint)'; return d }
      sumRow.replaceChildren(...sumSpans.flatMap((s, i) => i > 0 ? [sepDot(), s] : [s]))

      // model table
      const table = el('table', 'dsh-zpu-table')
      const thead = el('thead')
      const hr = el('tr')
      for (const [t, left] of [['模型', true], ['合计 tok', false], ['占比', false]]) {
        const th = el('th', '', t)
        th.style.cssText = left ? 'text-align:left' : 'text-align:right'
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
        td1.style.cssText = 'color:var(--zpu-ink);font-weight:500'
        const td2 = el('td', '', fmtTokens(m.tokens))
        td2.style.cssText = 'text-align:right;white-space:nowrap;color:var(--zpu-ink);font-weight:600'
        const td3 = el('td')
        td3.style.cssText = 'text-align:right;width:34%'
        const ratio = totalTokens > 0 ? m.tokens / totalTokens : 0
        const barBox = el('div')
        barBox.style.cssText = 'display:flex;align-items:center;gap:6px;justify-content:flex-end'
        const barTrack = el('div')
        barTrack.style.cssText = 'flex:1;max-width:70px;height:5px;border-radius:999px;background:var(--zpu-track);overflow:hidden'
        const barFill = el('div')
        barFill.style.cssText = 'height:100%;border-radius:999px;background:var(--zpu-biz);width:' + Math.round(ratio * 100) + '%'
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
      document.querySelector('.dsh-zpu-dialog')?.remove()
      const tokOverlay = el('div', 'dsh-zpu-dialog')
      const box = el('div', 'dsh-zpu-dialogBox')
      const title = el('div', '', '更新令牌')
      title.style.cssText = 'font-size:15px;font-weight:700;margin-bottom:6px;color:var(--zpu-ink)'
      const desc = el('div', '', '粘贴 bigmodel_token_production 的 cookie 值（浏览器登录智谱官网后 F12 复制），可含多行，自动提取。')
      desc.style.cssText = 'font-size:11px;color:var(--dsw-alias-label-tertiary,#9daabd);margin-bottom:10px;line-height:1.5'
      const ta = el('textarea', 'dsh-zpu-textarea')
      ta.rows = 5
      ta.placeholder = 'bigmodel_token_production=eyJhbGciOiJI...\n（直接整段复制 cookie 串也行）'
      const msg = el('div')
      msg.style.cssText = 'min-height:16px;font-size:11px;color:var(--zpu-err);margin:6px 0 0'
      const btnRow = el('div')
      btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px'
      const cancelBtn = el('button', 'dsh-zpu-chip', '取消')
      cancelBtn.type = 'button'
      const okBtn = el('button', 'dsh-zpu-primary', '确认更新')
      okBtn.type = 'button'
      btnRow.appendChild(cancelBtn)
      btnRow.appendChild(okBtn)
      box.appendChild(title); box.appendChild(desc); box.appendChild(ta); box.appendChild(msg); box.appendChild(btnRow)
      tokOverlay.appendChild(box)
      const close = () => tokOverlay.remove()
      tokOverlay.addEventListener('click', (e) => { if (e.target === tokOverlay) close() })
      cancelBtn.addEventListener('click', close)
      okBtn.addEventListener('click', () => {
        const raw = ta.value
        // extract the token from any paste shape: bare JWT, cookie string, mixed lines
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
              msg.style.color = 'var(--zpu-err)'
              msg.textContent = '校验失败：' + (j?.error ?? r.status) + (j?.expired === true ? '（令牌已过期/无效）' : '')
              okBtn.disabled = false
            }
          })
          .catch((e) => { msg.style.color = 'var(--zpu-err)'; msg.textContent = '请求失败：' + e; okBtn.disabled = false })
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