window.__ModuleLoader__.load((() => {
  const strip = (value) => String(value || '').replace(/\/+$/, '')
  const fromPath = (path) => {
    const match = /^(.*?)\/plugins\//.exec(String(path || ''))
    return match ? strip(match[1]) : null
  }
  const detectAppBase = (doc, href) => {
    if (!doc) return ''
    try {
      const src = doc.currentScript && doc.currentScript.src
      if (src) {
        const base = fromPath(new URL(src, doc.baseURI || href).pathname)
        if (base !== null) return base
      }
    } catch (error) { /* ignore */ }
    try {
      for (const el of doc.querySelectorAll('script[src]')) {
        const base = fromPath(new URL(el.src, doc.baseURI || href).pathname)
        if (base !== null) return base
      }
    } catch (error) { /* ignore */ }
    try {
      const path = new URL(doc.baseURI).pathname
      if (path.endsWith('/')) return strip(path)
    } catch (error) { /* ignore */ }
    return ''
  }
  const APP_BASE = detectAppBase(typeof document === 'undefined' ? null : document, typeof location === 'undefined' ? '' : location.href)
  const absAppPath = (value) => {
    const path = String(value == null ? '' : value)
    if (!path || path[0] !== '/' || path[1] === '/') return path
    if (!APP_BASE || path === APP_BASE || path.indexOf(APP_BASE + '/') === 0) return path
    return APP_BASE + path
  }

  return {
    id: 'dsh-plugin-update-hub',
    factory: (require) => {
      var module = { exports: {} }
      var exports = module.exports
      Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

      const React = require('react')
      const h = React.createElement

      const STYLE_OWNER_ID = 'dsh-plugin-update-hub'
      const API = '/dsh-plugin-update-hub-api'
      const PREF_KEY = 'dsh-plugin-update-hub:prefs'
      const CHECK_KEY = 'dsh-plugin-update-hub:last-check'
      const AUTO_CHECK_AFTER = 6 * 60 * 60 * 1000
      const STEP_PERCENT = { checking: 12, removing: 38, installing: 72, restoring: 88, applied: 100, failed: 100 }
      const STEP_LABEL = { checking: '正在校验目标版本', removing: '正在移除当前版本', installing: '正在安装新版本', restoring: '目标版本不可用,正在回滚', applied: '更新完成', failed: '更新失败' }

      const CSS = `
.dpu-root { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 8px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.dpu-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.dpu-head-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dpu-head-title { font-size: 14px; font-weight: 600; }
.dpu-head-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dpu-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dpu-input { width: 200px; box-sizing: border-box; padding: 5px 9px; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; outline: none; }
.dpu-input::placeholder { color: var(--dsw-alias-label-secondary); }
.dpu-input:focus { border-color: var(--dsw-alias-brand-primary); }
.dpu-select { padding: 4px 6px; font-size: 12px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; outline: none; }
.dpu-check { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; user-select: none; }
.dpu-check input { margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.dpu-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; cursor: pointer; white-space: nowrap; }
.dpu-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
.dpu-btn:disabled { opacity: 0.5; cursor: default; }
.dpu-btn-primary { color: #ffffff; background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dpu-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); opacity: 0.92; }
.dpu-btn-ghost { background: transparent; }
.dpu-notice { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; font-size: 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.dpu-notice-error { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dpu-notice-text { flex: 1; min-width: 0; word-break: break-word; }
.dpu-empty { padding: 28px 12px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-secondary); border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px; }
.dpu-list { display: flex; flex-direction: column; gap: 8px; }
.dpu-row { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.dpu-row-outdated { border-color: var(--dsw-alias-state-warn-primary); }
.dpu-row-head { display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; }
.dpu-row-title { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }
.dpu-title { font-size: 13px; font-weight: 600; }
.dpu-row-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex: none; }
.dpu-name { font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-secondary); }
.dpu-desc { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dpu-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dpu-meta b { font-weight: 600; color: var(--dsw-alias-label-primary); }
.dpu-tag { padding: 0 7px; font-size: 11px; line-height: 18px; border-radius: 999px; border: 1px solid transparent; white-space: nowrap; }
.dpu-tag-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.dpu-tag-error { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dpu-tag-success { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.dpu-tag-muted { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l1); }
.dpu-progress { display: flex; flex-direction: column; gap: 4px; }
.dpu-progress-track { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.dpu-progress-bar { height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary); transition: width 0.35s ease; }
.dpu-progress-bar-failed { background: var(--dsw-alias-state-error-primary); }
.dpu-progress-bar-done { background: var(--dsw-alias-state-success-primary); }
.dpu-progress-text { display: flex; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dpu-error { font-size: 11px; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
.dpu-queue { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); }
.dpu-queue-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.dpu-queue-toggle { display: inline-flex; gap: 6px; align-items: center; padding: 0; font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer; }
.dpu-chevron { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.dpu-queue-title { font-size: 12px; font-weight: 600; }
.dpu-queue-percent { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dpu-queue-track { margin-top: 2px; }
.dpu-queue-actions { display: flex; gap: 6px; }
.dpu-task { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); }
.dpu-task-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dpu-task-title { font-size: 12px; font-weight: 600; }
.dpu-task-version { font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-secondary); }
.dpu-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; padding-top: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dpu-pager { display: flex; gap: 6px; align-items: center; }
`

      function createOwnedStyle(css) {
        const el = document.createElement('style')
        el.setAttribute('data-plugin', STYLE_OWNER_ID)
        el.textContent = css
        document.head.appendChild(el)
        return el
      }

      function readPrefs() {
        try {
          const raw = localStorage.getItem(PREF_KEY)
          const parsed = raw ? JSON.parse(raw) : null
          const pageSize = parsed && parsed.pageSize
          return {
            pageSize: pageSize === 10 || pageSize === 50 ? pageSize : 20,
            showOfficial: !!(parsed && parsed.showOfficial),
          }
        } catch (error) {
          return { pageSize: 20, showOfficial: false }
        }
      }

      function writePrefs(patch) {
        try {
          const next = Object.assign({}, readPrefs(), patch)
          localStorage.setItem(PREF_KEY, JSON.stringify(next))
        } catch (error) { /* ignore */ }
      }

      function messageOf(error) {
        if (error === null || error === undefined) return '未知错误'
        if (typeof error === 'string') return error
        const code = error.code
        const message = error.message
        if (message && code && String(message).indexOf(String(code)) === -1) return String(message) + ' (' + String(code) + ')'
        return String(message || code || error)
      }

      function localized(value) {
        if (value === null || value === undefined) return ''
        if (typeof value === 'string') return value
        if (typeof value !== 'object') return String(value)
        for (const key of ['zh-CN', 'zh', 'en', 'default']) {
          const text = value[key]
          if (typeof text === 'string' && text) return text
        }
        for (const key of Object.keys(value)) {
          if (typeof value[key] === 'string' && value[key]) return value[key]
        }
        return ''
      }

      const pad = (value) => String(value).padStart(2, '0')

      function formatTime(ms) {
        if (!ms) return '—'
        const date = new Date(ms)
        if (Number.isNaN(date.getTime())) return '—'
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
      }

      function elapsedText(startedAt) {
        const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
        return seconds < 60 ? String(seconds) + ' 秒' : Math.floor(seconds / 60) + ' 分 ' + (seconds % 60) + ' 秒'
      }

      function toRow(bundle, extra) {
        const meta = bundle.meta || {}
        const info = (extra && extra.info) || {}
        const name = String(bundle.name)
        const target = bundle.installTarget || {}
        return {
          name,
          title: localized(meta.title) || name,
          description: localized(meta.description) || info.description || localized(bundle.description) || '',
          version: bundle.version || target.version || info.version || '',
          installedAt: (extra && extra.installedAt) || 0,
          official: bundle.official === true,
          updatable: bundle.update === 'registry',
          git: bundle.update === 'git',
          enabled: bundle.enabled !== false,
          availability: bundle.availability,
          check: null,
        }
      }

      function statusOf(row) {
        if (row.official) return { tone: 'muted', text: '内置插件,随 DSH 发行' }
        if (row.git) return { tone: 'muted', text: 'Git 安装,不支持版本升级' }
        if (!row.updatable) return { tone: 'muted', text: '不可检查更新' }
        const check = row.check
        if (!check) return { tone: 'muted', text: '未检查' }
        if (check.state === 'checking') return { tone: 'muted', text: '检查中…' }
        if (check.state === 'waiting') return { tone: 'muted', text: '等待检查…' }
        if (check.state === 'error') return { tone: 'error', text: '检查失败' }
        if (check.state === 'missing') return { tone: 'muted', text: '市场未收录' }
        if (check.state === 'n/a') return { tone: 'muted', text: '不支持版本升级' }
        if (check.state === 'done') {
          if (check.versions.length > 0) return { tone: 'warn', text: '落后 ' + check.versions.length + ' 个版本' }
          return { tone: 'success', text: '已是最新' }
        }
        return { tone: 'muted', text: '未检查' }
      }

      function rankOf(row) {
        if (row.official) return 3
        const check = row.check
        if (check && check.state === 'done' && check.versions.length > 0) return 0
        if (!row.updatable) return 2
        return 1
      }

      const store = {
        phase: 'idle',
        error: '',
        rows: [],
        checking: false,
        checkProgress: null,
        checkedAt: 0,
        notice: '',
        /**
         * Updates run one at a time through this queue. Finished tasks keep a
         * terminal state so the panel can report what happened, and the queue
         * only ever lives in memory: when DSH goes away, every queued task goes
         * with it instead of resuming on the next launch.
         */
        queue: [],
      }

      let queueSeq = 0
      const concurrency = { limit: 0, ceiling: 0, latency: 0 }

      function coreLimit() {
        const cores = Number(typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
        const memory = Number(typeof navigator !== 'undefined' && navigator.deviceMemory) || 4
        const base = cores >= 8 && memory >= 8 ? 4 : cores >= 4 ? 3 : 2
        return Math.max(1, Math.min(4, base))
      }

      /** How many version checks may run at once, given what the last ones cost. */
      function checkLimit() {
        if (concurrency.limit === 0) {
          concurrency.ceiling = coreLimit()
          concurrency.limit = concurrency.ceiling
        }
        return concurrency.limit
      }

      function adaptConcurrency(latency) {
        concurrency.latency = concurrency.latency === 0 ? latency : Math.round(concurrency.latency * 0.6 + latency * 0.4)
        if (concurrency.latency > 1500) concurrency.limit = Math.max(1, concurrency.limit - 1)
        else if (concurrency.latency < 400 && concurrency.limit < concurrency.ceiling) concurrency.limit += 1
      }

      function runningTask() {
        for (const task of store.queue) if (task.status === 'running') return task
        return null
      }

      function isUpdating() {
        return runningTask() !== null
      }

      /** The queued or running task for one package, if any. */
      function taskOf(name) {
        for (const task of store.queue) {
          if (task.name === name && (task.status === 'running' || task.status === 'queued')) return task
        }
        return null
      }

      function taskStatusText(task) {
        if (task.status === 'queued') return '等待更新…'
        if (task.status === 'running') return STEP_LABEL[task.step] || '更新中…'
        if (task.status === 'done') return '已完成'
        if (task.status === 'cancelled') return '已取消'
        return '失败'
      }

      function taskTagTone(task) {
        if (task.status === 'done') return 'dpu-tag-success'
        if (task.status === 'failed' || task.status === 'cancelled') return 'dpu-tag-error'
        if (task.status === 'running') return 'dpu-tag-warn'
        return 'dpu-tag-muted'
      }

      function queueSummary() {
        const counts = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 }
        for (const task of store.queue) counts[task.status] = (counts[task.status] || 0) + 1
        const parts = []
        if (counts.running) parts.push(counts.running + ' 个更新中')
        if (counts.queued) parts.push(counts.queued + ' 个排队中')
        if (counts.done) parts.push(counts.done + ' 个已完成')
        if (counts.failed || counts.cancelled) parts.push((counts.failed + counts.cancelled) + ' 个失败')
        return parts.join(' · ')
      }

      let revision = 0
      const listeners = new Set()
      let appCtx = null
      let remote = null
      let booted = false
      let subscribed = false
      let retryTimer = null
      let waited = 0

      function emit() {
        revision += 1
        for (const listener of Array.from(listeners)) {
          try { listener() } catch (error) { /* ignore */ }
        }
      }

      /**
       * Remote invocations resolve to a result envelope, never to a rejection:
       * `{ok: true, value}` or `{ok: false, error}`. Turn a failure into a throw
       * so call sites can keep ordinary try/catch shape.
       */
      function unwrap(result) {
        if (result && typeof result === 'object' && typeof result.ok === 'boolean') {
          if (result.ok) return result.value
          const error = result.error || {}
          const failure = new Error(error.message || ('远程调用失败:' + (error.code || 'unknown')))
          failure.code = error.code
          failure.details = error.details
          throw failure
        }
        return result
      }

      function remoteService() {
        if (remote) return remote
        if (!appCtx) return null
        try {
          const found = appCtx.get('remote')
          if (found) { remote = found; return remote }
        } catch (error) { /* ignore */ }
        return null
      }

      function manager() {
        if (!appCtx) return null
        try {
          const scoped = appCtx.get('remote.pluginManager')
          if (scoped) return scoped
        } catch (error) { /* ignore */ }
        const service = remoteService()
        if (service && service.pluginManager && typeof service.pluginManager.listBundles === 'function') {
          return service.pluginManager
        }
        return null
      }

      async function fetchInventory(names) {
        const empty = { installedAt: {}, info: {} }
        if (!names.length) return empty
        try {
          const url = absAppPath(API) + '?names=' + encodeURIComponent(names.join(','))
          const response = await fetch(url, { headers: { accept: 'application/json' } })
          if (!response.ok) return empty
          const body = await response.json()
          if (!body || typeof body !== 'object') return empty
          return { installedAt: body.installedAt || {}, info: body.info || {} }
        } catch (error) {
          return empty
        }
      }

      async function loadBundles() {
        const pm = manager()
        if (!pm) throw new Error('插件管理器尚未加载')
        const bundles = unwrap(await pm.listBundles())
        const visible = (bundles || []).filter((bundle) => bundle && bundle.installed !== false && bundle.availability !== 'missing')
        const inventory = await fetchInventory(visible.filter((bundle) => !bundle.official).map((bundle) => String(bundle.name)))
        const previous = new Map(store.rows.map((row) => [row.name, row]))
        store.rows = visible.map((bundle) => {
          const name = String(bundle.name)
          const row = toRow(bundle, {
            installedAt: inventory.installedAt[name],
            info: inventory.info[name],
          })
          const old = previous.get(row.name)
          if (old && old.version === row.version && old.check) row.check = old.check
          return row
        })
      }

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

      function rememberCheck() {
        try { localStorage.setItem(CHECK_KEY, String(store.checkedAt)) } catch (error) { /* ignore */ }
      }

      /**
       * Check every updatable row at once, a few in parallel. Rows waiting for a
       * free slot say 等待检查…, running ones 检查中…; the fan-out follows the
       * machine's size and shrinks by itself when answers come back slowly.
       */
      async function checkAll(options) {
        const pm = manager()
        if (!pm || store.checking) return
        const force = !!(options && options.force)
        const queue = store.rows.filter((row) => {
          if (!row.updatable) return false
          if (force) return true
          return !(row.check && row.check.state === 'done' && row.check.installed === row.version)
        })
        if (!queue.length) {
          store.checkedAt = Date.now()
          rememberCheck()
          emit()
          return
        }
        store.checking = true
        store.error = ''
        store.checkProgress = { total: queue.length, done: 0 }
        for (const row of queue) row.check = { state: 'waiting', versions: [], installed: row.version }
        emit()

        let cursor = 0
        let active = 0
        await new Promise((resolve) => {
          const pump = () => {
            while (active < Math.min(checkLimit(), queue.length) && cursor < queue.length) {
              const row = queue[cursor]
              cursor += 1
              active += 1
              row.check = { state: 'checking', versions: [], installed: row.version }
              emit()
              const startedAt = Date.now()
              let pending
              try { pending = pm.listVersions(row.name, {}) } catch (error) { pending = Promise.reject(error) }
              Promise.resolve(pending).then((result) => {
                row.check = interpretVersions(unwrap(result), row.version)
              }, (error) => {
                row.check = { state: 'error', versions: [], error: messageOf(error) }
              }).then(() => {
                adaptConcurrency(Date.now() - startedAt)
                active -= 1
                store.checkProgress.done += 1
                emit()
                pump()
              })
            }
            if (active === 0 && cursor >= queue.length) resolve()
          }
          pump()
        })

        store.checking = false
        store.checkProgress = null
        store.checkedAt = Date.now()
        rememberCheck()
        emit()
      }

      function interpretVersions(answer, installed) {
        if (!answer) return { state: 'error', versions: [], error: '没有收到响应' }
        if (answer.status === 'refused') {
          const problem = answer.problem
          const state = problem === 'not-updatable' ? 'n/a' : problem === 'not-found' ? 'missing' : 'error'
          return { state, versions: [], error: answer.reason || problem || '' }
        }
        const versions = (answer.versions || []).map((entry) => ({
          version: entry.version,
          prerelease: entry.prerelease === true,
          deprecated: entry.deprecated ? localized(entry.deprecated) : '',
          incompatible: entry.incompatible ? (entry.incompatible.requirements || {}) : null,
        }))
        return { state: 'done', versions, installed: answer.installed || installed, omitted: answer.omitted || 0 }
      }

      /**
       * The plugin manager's remote namespace mounts independently of this
       * bundle, so on a fresh app start the list can be requested before it
       * exists. Wait for it quietly instead of latching a permanent error.
       */
      function retryLater() {
        if (retryTimer) return
        retryTimer = setTimeout(() => {
          retryTimer = null
          if (booted) return
          if (!manager()) {
            waited += 1
            if (waited > 40) {
              store.phase = 'error'
              store.error = '插件管理器尚未加载'
              emit()
              return
            }
            retryLater()
            return
          }
          waited = 0
          subscribe()
          bootstrap()
        }, 400)
      }

      /** Manual retry from the error notice: clear the latch and try again. */
      function retryBoot() {
        waited = 0
        booted = false
        store.error = ''
        store.phase = 'loading'
        emit()
        if (manager()) { subscribe(); bootstrap(); return }
        retryLater()
      }

      async function bootstrap() {
        if (booted) return
        booted = true
        store.phase = 'loading'
        emit()
        try {
          await loadBundles()
          store.phase = 'ready'
          store.error = ''
          emit()
        } catch (error) {
          booted = false
          if (!manager()) {
            store.phase = 'loading'
            store.error = ''
            emit()
            retryLater()
            return
          }
          store.phase = 'error'
          store.error = messageOf(error)
          emit()
          return
        }
        const last = Number((() => { try { return localStorage.getItem(CHECK_KEY) || '0' } catch (error) { return '0' } })())
        if (Date.now() - last > AUTO_CHECK_AFTER) {
          await sleep(1200)
          await checkAll()
        }
      }

      /**
       * Queue bundle updates. Each task captures the version the user picked now,
       * so a registry that moves on while the task waits cannot change it.
       */
      function enqueueUpdates(entries) {
        if (!entries || !entries.length) return
        const pending = new Set(store.queue
          .filter((task) => task.status === 'queued' || task.status === 'running')
          .map((task) => task.name))
        let added = 0
        for (const entry of entries) {
          if (!entry || !entry.name || !entry.version || pending.has(entry.name)) continue
          pending.add(entry.name)
          queueSeq += 1
          store.queue.push({
            id: 'task-' + queueSeq,
            requestId: 'updates-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
            name: entry.name,
            title: entry.title || entry.name,
            version: entry.version,
            status: 'queued',
            step: 'checking',
            percent: 0,
            startedAt: 0,
            finishedAt: 0,
            error: '',
            log: '',
          })
          added += 1
        }
        if (added) { store.notice = ''; emit() }
        pumpQueue()
      }

      /** Run the queue one task at a time: installs share the profile's store. */
      async function pumpQueue() {
        if (isUpdating()) return
        const task = store.queue.find((item) => item.status === 'queued')
        if (!task) return
        const pm = manager()
        if (!pm) {
          task.status = 'failed'
          task.step = 'failed'
          task.error = '插件管理器尚未加载'
          emit()
          return
        }
        task.status = 'running'
        task.step = 'checking'
        task.percent = STEP_PERCENT.checking
        task.startedAt = Date.now()
        emit()
        try {
          const result = unwrap(await pm.updateBundle(task.name, task.version, { requestId: task.requestId }))
          const change = (result && result.result) || {}
          const restore = result && result.restore
          if (change.application === 'failed') {
            task.status = 'failed'
            task.step = 'failed'
            task.error = describeFailure(change)
          } else {
            task.status = 'done'
            task.step = 'applied'
            task.percent = 100
            const suffix = change.application === 'restart-required' ? ',重启 DSH 后生效' : ''
            const rollback = restore && restore.application === 'failed' ? '(回滚未完成,请手动重装)' : ''
            store.notice = task.title + ' 已更新到 ' + task.version + suffix + rollback
            const stale = store.rows.find((row) => row.name === task.name)
            if (stale) stale.check = null
            await loadBundles()
          }
        } catch (error) {
          task.status = 'failed'
          task.step = 'failed'
          task.error = messageOf(error)
        }
        task.finishedAt = Date.now()
        emit()
        if (task.status === 'done') {
          const pm2 = manager()
          const target = store.rows.find((row) => row.name === task.name)
          if (pm2 && target) {
            try {
              target.check = interpretVersions(unwrap(await pm2.listVersions(target.name, {})), target.version)
            } catch (error) {
              target.check = null
            }
            emit()
          }
        }
        pumpQueue()
      }

      /** Drop every task, cancelling the one in flight as far as the Host allows. */
      function clearQueue() {
        if (!store.queue.length) return
        const running = runningTask()
        if (running) {
          const pm = manager()
          if (pm && typeof pm.cancelInstall === 'function') {
            try { Promise.resolve(pm.cancelInstall(running.requestId)).catch(() => {}) } catch (error) { /* ignore */ }
          }
          running.status = 'cancelled'
          running.step = 'failed'
          running.error = '已取消'
          running.finishedAt = Date.now()
          emit()
        }
        store.queue = []
        emit()
      }

      function dismissFinished() {
        store.queue = store.queue.filter((task) => task.status === 'queued' || task.status === 'running')
        emit()
      }

      function describeFailure(change) {
        const parts = []
        const error = change && change.error
        if (error) {
          const inner = error.diagnostic || error.reason
          parts.push(inner ? String(inner) : messageOf(error))
        }
        const pkg = change && change.packageResult
        if (pkg && pkg.output) {
          const lines = String(pkg.output).trim().split('\n').filter(Boolean)
          parts.push(lines.slice(-3).join(' ').slice(0, 400))
          if (pkg.logPath) parts.push('日志:' + pkg.logPath)
        }
        if (!parts.length) parts.push('更新未成功')
        return parts.join(' · ')
      }

      function onUpdateState(progress) {
        if (!progress) return
        for (const task of store.queue) {
          if (task.status !== 'running' || task.requestId !== progress.requestId) continue
          task.step = progress.step
          task.percent = STEP_PERCENT[progress.step] || task.percent
          emit()
        }
      }

      function onInstallLog(chunk) {
        if (!chunk) return
        const text = typeof chunk.text === 'string' ? chunk.text : typeof chunk.chunk === 'string' ? chunk.chunk : ''
        if (!text) return
        for (const task of store.queue) {
          if (task.status !== 'running') continue
          if (chunk.requestId && chunk.requestId !== task.requestId) continue
          task.log = ((task.log || '') + text).slice(-4000)
        }
        emit()
      }

      function subscribe() {
        if (subscribed) return
        const service = remoteService()
        if (!service || typeof service.$on !== 'function') return
        subscribed = true
        const disposers = []
        const bind = (event, handler) => {
          try {
            const off = service.$on(event, handler)
            if (off) disposers.push(off)
          } catch (error) { /* forwarded events unavailable */ }
        }
        bind('plugin-manager/update-state', onUpdateState)
        bind('plugin-manager/install-log', onInstallLog)
        bind('plugin-manager/changed', () => { if (!isUpdating()) { loadBundles().then(emit).catch(() => {}) } })
        if (appCtx) appCtx.effect(() => () => {
          for (const off of disposers) {
            try {
              if (typeof off === 'function') off()
              else if (typeof off.dispose === 'function') off.dispose()
            } catch (error) { /* ignore */ }
          }
        })
      }

      function useRevision() {
        const [, force] = React.useState(0)
        React.useEffect(() => {
          let active = true
          const listener = () => { if (active) force((value) => value + 1) }
          listeners.add(listener)
          return () => { active = false; listeners.delete(listener) }
        }, [])
        return revision
      }

      function PluginUpdatesTab() {
        useRevision()
        const [query, setQuery] = React.useState('')
        const [page, setPage] = React.useState(0)
        const [pageSize, setPageSize] = React.useState(() => readPrefs().pageSize)
        const [showOfficial, setShowOfficial] = React.useState(() => readPrefs().showOfficial)
        const [selection, setSelection] = React.useState({})
        const [queueExpanded, setQueueExpanded] = React.useState(false)
        const [, tick] = React.useState(0)

        const running = isUpdating()
        React.useEffect(() => {
          if (!running) return undefined
          const timer = setInterval(() => tick((value) => value + 1), 1000)
          return () => clearInterval(timer)
        }, [running])

        React.useEffect(() => { setPage(0) }, [query, pageSize, showOfficial])

        const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
        const view = store.rows.filter((row) => {
          if (!showOfficial && row.official) return false
          if (!tokens.length) return true
          const haystack = (row.title + ' ' + row.name + ' ' + row.description).toLowerCase()
          return tokens.every((token) => haystack.indexOf(token) !== -1)
        }).sort((left, right) => {
          const delta = rankOf(left) - rankOf(right)
          if (delta !== 0) return delta
          return left.title.localeCompare(right.title, 'zh-CN')
        })

        const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
        const current = Math.min(page, pageCount - 1)
        const start = current * pageSize
        const pageRows = view.slice(start, start + pageSize)
        const installedCount = store.rows.filter((row) => !row.official).length
        const outdatedCount = store.rows.filter((row) => {
          const check = row.check
          return !row.official && check && check.state === 'done' && check.versions.length > 0
        }).length

        const checkProgress = store.checkProgress
        const progressText = checkProgress ? '检查中 ' + checkProgress.done + '/' + checkProgress.total : '检查中…'
        const outdated = view.filter((row) => row.check && row.check.state === 'done' && row.check.versions.length > 0)
        const batch = outdated.map((row) => ({
          name: row.name,
          title: row.title,
          version: selection[row.name] || row.check.versions[0].version,
        }))
        const batchIdle = batch.filter((entry) => !taskOf(entry.name)).length
        const queueOpen = store.queue.length > 0

        const head = h('div', { className: 'dpu-head' },
          h('div', { className: 'dpu-head-main' },
            h('div', { className: 'dpu-head-title' }, '插件版本更新'),
            h('div', { className: 'dpu-head-sub' },
              '共 ' + installedCount + ' 个 · ' + (outdatedCount > 0 ? outdatedCount + ' 个可升级' : '暂无可用升级')
              + (store.checkedAt ? ' · 上次检查 ' + formatTime(store.checkedAt) : '')
              + (store.checking ? ' · ' + progressText : ''))),
          h('div', { className: 'dpu-toolbar' },
            h('input', {
              className: 'dpu-input',
              placeholder: '搜索插件名 / 包名',
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
            h('select', {
              className: 'dpu-select',
              value: String(pageSize),
              title: '每页条数',
              onChange: (event) => {
                const next = Number(event.target.value) || 20
                setPageSize(next)
                writePrefs({ pageSize: next })
              },
            },
            h('option', { value: '10' }, '每页 10'),
            h('option', { value: '20' }, '每页 20'),
            h('option', { value: '50' }, '每页 50')),
            h('label', { className: 'dpu-check', title: '内置插件随 DSH 发行,不能单独升级' },
              h('input', {
                type: 'checkbox',
                checked: showOfficial,
                onChange: (event) => {
                  const next = event.target.checked
                  setShowOfficial(next)
                  writePrefs({ showOfficial: next })
                },
              }),
              h('span', null, '显示内置')),
            batch.length > 0 ? h('button', {
              className: 'dpu-btn dpu-btn-primary',
              disabled: batchIdle === 0,
              title: '把当前筛选结果里所有可升级插件依次加入更新队列',
              onClick: () => { enqueueUpdates(batch) },
            }, '批量更新 (' + batch.length + ')') : null,
            h('button', {
              className: 'dpu-btn',
              disabled: store.checking || store.phase === 'loading' || !manager(),
              onClick: () => { checkAll() },
            }, store.checking ? progressText : '检查更新')))

        const notices = []
        if (store.error) notices.push(h('div', { className: 'dpu-notice dpu-notice-error', key: 'error' },
          h('div', { className: 'dpu-notice-text' }, '无法读取插件列表:' + store.error),
          h('button', { className: 'dpu-btn dpu-btn-ghost', onClick: () => retryBoot() }, '重试')))
        if (store.notice) notices.push(h('div', { className: 'dpu-notice', key: 'notice' },
          h('div', { className: 'dpu-notice-text' }, store.notice),
          h('button', { className: 'dpu-btn dpu-btn-ghost', onClick: () => { store.notice = ''; emit() } }, '知道了')))

        const activeTask = runningTask()
        const queuePanel = !queueOpen ? null : h('div', { className: 'dpu-queue' },
          h('div', { className: 'dpu-queue-head' },
            h('button', {
              className: 'dpu-queue-toggle',
              title: queueExpanded ? '收起更新队列' : '展开更新队列',
              onClick: () => setQueueExpanded(!queueExpanded),
            },
            h('span', { className: 'dpu-chevron' }, queueExpanded ? '▾' : '▸'),
            h('span', { className: 'dpu-queue-title' }, '更新队列 · ' + queueSummary()),
            activeTask ? h('span', { className: 'dpu-queue-percent' },
              (STEP_LABEL[activeTask.step] || '更新中') + ' ' + Math.max(2, Math.min(100, activeTask.percent || STEP_PERCENT[activeTask.step] || 12)) + '%') : null),
            queueExpanded ? h('div', { className: 'dpu-queue-actions' },
              h('button', {
                className: 'dpu-btn dpu-btn-ghost',
                disabled: !store.queue.some((task) => task.status !== 'queued' && task.status !== 'running'),
                onClick: () => dismissFinished(),
              }, '清空已完成'),
              h('button', { className: 'dpu-btn dpu-btn-ghost', onClick: () => clearQueue() }, '清空队列')) : null),
          queueExpanded ? store.queue.map((task) => h('div', { className: 'dpu-task', key: task.id },
            h('div', { className: 'dpu-task-head' },
              h('span', { className: 'dpu-task-title' }, task.title),
              h('span', { className: 'dpu-task-version' }, '→ ' + task.version),
              h('span', { className: 'dpu-tag ' + taskTagTone(task) }, taskStatusText(task))),
            task.status === 'running' ? h('div', { className: 'dpu-progress' },
              h('div', { className: 'dpu-progress-track' },
                h('div', {
                  className: 'dpu-progress-bar',
                  style: { width: Math.max(2, Math.min(100, task.percent || STEP_PERCENT[task.step] || 12)) + '%' },
                })),
              h('div', { className: 'dpu-progress-text' },
                h('span', null, (STEP_LABEL[task.step] || '准备中') + ' · ' + elapsedText(task.startedAt)))) : null,
            task.error ? h('div', { className: 'dpu-error' }, task.error) : null)) : null,
          queueOpen && !queueExpanded && activeTask ? h('div', { className: 'dpu-progress-track dpu-queue-track' },
            h('div', {
              className: 'dpu-progress-bar',
              style: { width: Math.max(2, Math.min(100, activeTask.percent || STEP_PERCENT[activeTask.step] || 12)) + '%' },
            })) : null)

        const rows = pageRows.map((row) => renderRow(row, selection, setSelection, running))

        const empty = view.length === 0
          ? h('div', { className: 'dpu-empty' }, store.phase === 'loading' ? '正在读取已安装插件…' : (query ? '没有匹配「' + query + '」的插件' : '没有已安装的插件'))
          : null

        const foot = h('div', { className: 'dpu-foot' },
          h('span', null, '第 ' + (view.length === 0 ? 0 : start + 1) + ' - ' + Math.min(start + pageSize, view.length) + ' 项 / 共 ' + view.length + ' 项'),
          h('div', { className: 'dpu-pager' },
            h('button', { className: 'dpu-btn', disabled: current <= 0, onClick: () => setPage(current - 1) }, '上一页'),
            h('span', null, (current + 1) + ' / ' + pageCount),
            h('button', { className: 'dpu-btn', disabled: current >= pageCount - 1, onClick: () => setPage(current + 1) }, '下一页')))

        return h('div', { className: 'dpu-root' }, head, notices, queuePanel, h('div', { className: 'dpu-list' }, rows), empty, foot)
      }

      function renderRow(row, selection, setSelection, running) {
        const status = statusOf(row)
        const check = row.check
        const versions = check && check.state === 'done' ? check.versions : []
        const outdated = versions.length > 0
        const task = taskOf(row.name)
        const chosen = selection[row.name] || (versions.length ? versions[0].version : '')

        const tagTone = status.tone === 'warn' ? 'dpu-tag-warn' : status.tone === 'error' ? 'dpu-tag-error' : status.tone === 'success' ? 'dpu-tag-success' : 'dpu-tag-muted'

        const actions = []
        if (outdated) {
          actions.push(h('select', {
            className: 'dpu-select',
            key: 'version',
            value: chosen,
            title: '选择要升级到的版本',
            onChange: (event) => setSelection(Object.assign({}, selection, { [row.name]: event.target.value })),
          }, versions.map((entry) => h('option', { key: entry.version, value: entry.version },
            entry.version + (entry.prerelease ? ' (预发布)' : '') + (entry.deprecated ? ' (已弃用)' : '') + (entry.incompatible ? ' (不兼容)' : '')))))
          actions.push(h('button', {
            className: 'dpu-btn dpu-btn-primary',
            key: 'update',
            disabled: !!task || !chosen,
            title: task ? '已加入更新队列' : '加入更新队列',
            onClick: () => { enqueueUpdates([{ name: row.name, title: row.title, version: chosen }]) },
          }, task ? (task.status === 'running' ? '更新中…' : '排队中…') : '更新'))
        }

        let progress = null
        if (task && task.status === 'running') {
          const percent = task.percent || STEP_PERCENT[task.step] || 12
          progress = h('div', { className: 'dpu-progress' },
            h('div', { className: 'dpu-progress-track' },
              h('div', {
                className: 'dpu-progress-bar',
                style: { width: Math.max(2, Math.min(100, percent)) + '%' },
              })),
            h('div', { className: 'dpu-progress-text' },
              h('span', null, (STEP_LABEL[task.step] || '准备中') + ' · ' + elapsedText(task.startedAt))))
        } else if (check && check.state === 'error' && check.error) {
          progress = h('div', { className: 'dpu-error' }, check.error)
        } else if (check && check.state === 'n/a' && check.error) {
          progress = h('div', { className: 'dpu-error' }, check.error)
        }

        return h('div', { className: 'dpu-row' + (outdated ? ' dpu-row-outdated' : ''), key: row.name },
          h('div', { className: 'dpu-row-head' },
            h('div', { className: 'dpu-row-title' },
              h('span', { className: 'dpu-title' }, row.title),
              h('span', { className: 'dpu-tag ' + tagTone }, status.text),
              !row.enabled ? h('span', { className: 'dpu-tag dpu-tag-muted' }, '已禁用') : null,
              row.official ? h('span', { className: 'dpu-tag dpu-tag-muted' }, '内置') : null,
              row.git ? h('span', { className: 'dpu-tag dpu-tag-muted' }, 'Git') : null),
            h('div', { className: 'dpu-row-actions' }, actions)),
          h('div', { className: 'dpu-name' }, row.name),
          row.description ? h('div', { className: 'dpu-desc' }, row.description) : null,
          h('div', { className: 'dpu-meta' },
            h('span', null, '当前版本 ', h('b', null, row.version || '—')),
            h('span', null, '安装时间 ', h('b', null, formatTime(row.installedAt))),
            outdated ? h('span', null, '最新版本 ', h('b', null, versions[0].version)) : null,
            outdated && check.omitted ? h('span', null, '另有 ' + check.omitted + ' 个版本未列出') : null),
          progress)
      }

      function apply(ctx) {
        appCtx = ctx
        const slots = ctx.get('slots')
        if (slots === undefined) return
        const style = createOwnedStyle(CSS)
        ctx.effect(() => () => { try { style.remove() } catch (error) { /* ignore */ } })

        slots.inject('plugins.tab', () => slots.register(
          { name: 'plugins.tab', id: 'updates', order: 10, label: '插件更新' },
          () => h(PluginUpdatesTab, {}),
        ))

        const start = () => {
          if (manager()) { subscribe(); bootstrap(); return }
          if (!remoteService()) { setTimeout(start, 300); return }
          retryLater()
        }
        start()
      }

      const inject = ['slots']
      exports.apply = apply
      exports.inject = inject
      return module.exports
    },
  }
})())
