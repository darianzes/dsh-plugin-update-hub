// Smoke test for the Client half: runs client.js in a fake browser with a fake
// React and a fake `remote.pluginManager`, then drives the page like a person would.
// Run with: node test/smoke.mjs
import { readFileSync } from 'node:fs'

const failures = []
function must(label, condition, detail) {
  if (condition) return
  failures.push(label + (detail === undefined ? '' : ' — got ' + JSON.stringify(detail)))
}

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

// ---------- fake browser ----------
const styleTags = []
globalThis.window = { __ModuleLoader__: { load(entry) { captured = entry } } }
let captured = null
globalThis.document = {
  head: { appendChild(node) { styleTags.push(node) } },
  createElement() { return { attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v }, remove() {} } },
  querySelectorAll() { return [] },
  baseURI: 'http://127.0.0.1:53645/',
}
globalThis.location = { href: 'http://127.0.0.1:53645/' }
const storage = new Map()
globalThis.localStorage = {
  getItem(k) { return storage.has(k) ? storage.get(k) : null },
  setItem(k, v) { storage.set(k, String(v)) },
  removeItem(k) { storage.delete(k) },
}
const fetchCalls = []
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url))
  return { ok: true, json: async () => ({ installedAt: { 'dsh-meme': 1794186245313, 'billion-context': 1794185473927 }, info: { 'billion-context': { description: '超长上下文压缩', version: '0.1.209' }, 'my-git-plugin': { description: 'Git 安装的插件' } } }) }
}

// ---------- tiny React ----------
const hooks = []
let hookIndex = 0
let pendingEffects = []
const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false && c !== true) }
  },
  useState(init) {
    const index = hookIndex++
    if (hooks[index] === undefined) hooks[index] = { value: typeof init === 'function' ? init() : init }
    const set = (next) => {
      const slot = hooks[index]
      const value = typeof next === 'function' ? next(slot.value) : next
      if (value !== slot.value) { slot.value = value; rerenderNeeded = true }
    }
    return [hooks[index].value, set]
  },
  useEffect(fn, deps) {
    const index = hookIndex++
    const prev = hooks[index]
    const changed = prev === undefined || deps === undefined || !prev.deps || deps.some((d, i) => d !== prev.deps[i])
    if (prev === undefined) hooks[index] = { deps }
    else prev.deps = deps
    if (changed) pendingEffects.push(fn)
  },
}
let rerenderNeeded = false

// ---------- fake remote ----------
const handlers = new Map()
const calls = []
const bundles = [
  { name: 'dsh-meme', official: false, availability: 'profile', version: '0.1.78', installed: true, enabled: true, update: 'registry', meta: { title: { 'zh-CN': '表情包' }, description: { 'zh-CN': '斗图插件' } } },
  { name: 'billion-context', official: false, availability: 'profile', version: '0.1.209', installed: true, enabled: true, update: 'registry' },
  { name: 'dsh-cost-meter', official: false, availability: 'profile', version: '1.9.84', installed: true, enabled: false, update: 'registry' },
  { name: 'dsh-plugin-guide', official: false, availability: 'profile', version: '0.5.10', installed: true, enabled: true, update: 'registry' },
  { name: '@deepseek-ai/dsh-base', official: true, availability: 'installation', version: '0.2.2-rc.5', installed: true, enabled: true },
  { name: 'dsh-claude-style', official: false, availability: 'profile', version: '0.20.1', installed: true, enabled: true, update: 'registry' },
  { name: 'dsh-synapse', official: false, availability: 'profile', version: '0.5.4', installed: true, enabled: true, update: 'registry' },
  { name: 'my-git-plugin', official: false, availability: 'profile', version: '1.0.0', installed: true, enabled: true, update: 'git' },
]
const stats = { listInFlight: 0, listMax: 0, listCalls: 0, updateInFlight: 0, updateMax: 0, updateOrder: [] }
const sleepLater = (ms) => new Promise((r) => setTimeout(r, ms))
const managerMock = {
  async listBundles() { calls.push(['listBundles']); return { ok: true, value: bundles } },
  async listVersions(name, options) {
    calls.push(['listVersions', name, options === undefined ? 'MISSING-OPTIONS' : 'ok'])
    if (options === undefined) throw new Error('pluginManager/listVersions expected 2 business argument(s)')
    stats.listCalls += 1
    stats.listInFlight += 1
    stats.listMax = Math.max(stats.listMax, stats.listInFlight)
    await sleepLater(180)
    stats.listInFlight -= 1
    if (name === 'dsh-meme') {
      return { ok: true, value: { status: 'listed', installed: '0.1.78', registry: 'r', attempts: [], omitted: 0, versions: [
        { version: '0.1.80', prerelease: false, tags: [], bundle: true },
        { version: '0.1.79', prerelease: false, tags: [], bundle: true },
      ] } }
    }
    if (name === 'dsh-claude-style' || name === 'dsh-synapse') {
      return { ok: true, value: { status: 'listed', installed: 'x', registry: 'r', attempts: [], omitted: 0, versions: [
        { version: '0.99.0', prerelease: false, tags: [], bundle: true },
      ] } }
    }
    if (name === 'dsh-plugin-guide') {
      return { ok: true, value: { status: 'listed', installed: '0.5.10', registry: 'r', attempts: [], omitted: 0, versions: [
        { version: '0.5.11', prerelease: false, tags: [], bundle: true },
      ] } }
    }
    return { ok: true, value: { status: 'listed', installed: 'x', registry: 'r', attempts: [], omitted: 0, versions: [] } }
  },
  async updateBundle(name, version, options) {
    calls.push(['updateBundle', name, version, options && options.requestId ? 'with-request-id' : 'no-request-id'])
    stats.updateInFlight += 1
    stats.updateMax = Math.max(stats.updateMax, stats.updateInFlight)
    stats.updateOrder.push(name)
    await sleepLater(120)
    const progress = handlers.get('plugin-manager/update-state')
    if (progress) {
      progress({ requestId: options.requestId, step: 'removing' })
      progress({ requestId: options.requestId, step: 'installing' })
    }
    stats.updateInFlight -= 1
    return { ok: true, value: { from: '0.1.78', to: version, step: 'install', result: { changed: true, application: 'applied', stage: 'install', target: name } } }
  },
}
const remoteMock = {
  pluginManager: managerMock,
  $on(event, listener) { handlers.set(event, listener); return () => handlers.delete(event) },
}

// ---------- fake client ctx ----------
const registrations = []
const services = new Map([
  ['remote', remoteMock],
  ['remote.pluginManager', managerMock],
  ['slots', { inject(owner, fn) { fn() }, register(options, render) { registrations.push({ options, render }); return () => {} } }],
])
const ctx = {
  get(name) { return services.get(name) },
  effect(fn) { const dispose = fn(); if (typeof dispose === 'function') dispose() },
}

// ---------- run ----------
const vm = await import('node:vm')
vm.runInThisContext(source, { filename: 'client.js' })
const client = captured
console.log('id:', client.id)
const module = client.factory((name) => { if (name === 'react') return React; throw new Error('unexpected require ' + name) })
client.factory.require = null
module.apply(ctx)
console.log('registered:', registrations.map((r) => r.options.id + '@' + r.options.order + '/' + r.options.label))
console.log('style tags:', styleTags.length, styleTags[0] && styleTags[0].attrs['data-plugin'])

const slot = registrations.find((r) => r.options.name === 'plugins.tab')

function renderTree() {
  for (let guard = 0; guard < 40; guard += 1) {
    hookIndex = 0
    pendingEffects = []
    rerenderNeeded = false
    const element = slot.render()
    const node = typeof element.type === 'function' ? element.type(element.props) : element
    for (const effect of pendingEffects) {
      const cleanup = effect()
      if (typeof cleanup === 'function' && pendingEffects.length > 1) { /* ignore */ }
    }
    if (!rerenderNeeded) return node
  }
  return null
}

function findAll(node, predicate, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) { for (const child of node) findAll(child, predicate, out); return out }
  if (typeof node === 'object' && node.props) {
    if (predicate(node)) out.push(node)
    for (const child of node.children) findAll(child, predicate, out)
  }
  return out
}
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (node.props) return node.children.map(textOf).join(' ')
  return ''
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- concurrent checking: look mid-flight for 检查中 / 等待检查 ---
await sleep(1320)
let tree = renderTree()
let flat = textOf(tree)
console.log('\n--- checking, 30ms in ---')
console.log('running:', stats.listInFlight, 'max so far:', stats.listMax)
console.log('states:', ['检查中…', '等待检查…'].map((t) => t + '=' + (flat.split(t).length - 1)).join(' '))

// let the pool drain
await sleep(1800)
tree = renderTree()
flat = textOf(tree)
console.log('\n--- after auto check ---')
console.log(flat.replace(/\s+/g, ' ').slice(0, 600))
console.log('concurrency: maxInFlight=' + stats.listMax + ' calls=' + stats.listCalls)
console.log('fetch:', fetchCalls[0])

const selects = findAll(tree, (n) => n.type === 'select' && n.props.title === '选择要升级到的版本')
console.log('version selects:', selects.length, selects[0] ? selects[0].children.map((o) => o.props.value) : null)
must('offers a version picker for outdated rows', selects.length >= 1, selects.length)
must('lists newer versions first', selects[0] && selects[0].children.map((o) => o.props.value)[0] === '0.1.80')

// --- search filter ---
const search = findAll(tree, (n) => n.type === 'input')[0]
search.props.onChange({ target: { value: 'meme' } })
tree = renderTree()
flat = textOf(tree)
console.log('\n--- filtered by "meme" ---')
console.log(flat.replace(/\s+/g, ' ').slice(0, 400))

// clear filter
findAll(tree, (n) => n.type === 'input')[0].props.onChange({ target: { value: '' } })
tree = renderTree()

// --- single row goes into the queue ---
const updateButtons = findAll(tree, (n) => n.type === 'button' && textOf(n) === '更新')
console.log('\nupdate buttons:', updateButtons.length)
await updateButtons[0].props.onClick()
tree = renderTree()
flat = textOf(tree)
console.log('queued text:', (flat.match(/更新队列[^]*?已完成|更新队列 · [^ ]*/) || [flat.slice(0, 80)])[0])
console.log('queue summary:', (flat.match(/更新队列 ·[^表]*/) || [''])[0].trim())
await sleep(200)
tree = renderTree()
console.log('after run:', stats.updateOrder.slice(), 'maxConcurrentUpdates=' + stats.updateMax)

// --- batch update queues every outdated row, run one at a time ---
const batchButton = findAll(tree, (n) => n.type === 'button' && /批量更新/.test(textOf(n)))[0]
console.log('\nbatch button:', batchButton && textOf(batchButton), 'disabled:', batchButton && !!batchButton.props.disabled)
await batchButton.props.onClick()
tree = renderTree()
flat = textOf(tree)
console.log('queue header:', (flat.match(/更新队列 ·[^清]*/) || [''])[0].trim())
const queueToggle = findAll(tree, (n) => n.type === 'button' && /更新队列/.test(textOf(n)))[0]
console.log('collapsed by default:', !flat.includes('清空队列'), '| chevron:', queueToggle && textOf(queueToggle).includes('▸'))
must('queue starts collapsed', !flat.includes('清空队列') && textOf(queueToggle).includes('▸'))
await queueToggle.props.onClick()
tree = renderTree()
flat = textOf(tree)
console.log('expanded after click:', flat.includes('清空队列'), '| chevron:', textOf(findAll(tree, (n) => n.type === 'button' && /更新队列/.test(textOf(n)))[0] || {}).includes('▾'))
must('queue expands on click', flat.includes('清空队列'))
console.log('queue after batch:', (flat.match(/更新队列 ·[^清]*/) || [''])[0].trim())
console.log('waiting tags:', flat.split('等待更新…').length - 1, '| queued row buttons:', flat.split('排队中…').length - 1)
const queuedRowButton = findAll(tree, (n) => n.type === 'button' && textOf(n) === '排队中…')[0]
console.log('queued row button disabled:', queuedRowButton && !!queuedRowButton.props.disabled)
await sleep(900)
tree = renderTree()
flat = textOf(tree)
console.log('final queue:', (flat.match(/更新队列 ·[^表]*/) || [''])[0].trim())
console.log('update order:', stats.updateOrder.slice(), 'maxConcurrentUpdates=' + stats.updateMax)
must('updates run one at a time', stats.updateMax === 1, stats.updateMax)
must('every batched update ran', stats.updateOrder.length >= 3, stats.updateOrder.length)
console.log('all succeeded:', (flat.split('已完成').length - 1) + ' done tags')

// --- nothing about the queue is persisted: a restart starts empty ---
console.log('storage keys:', Array.from(Object.keys(Object.fromEntries(storage))).join(','))
must('the queue is never persisted', !Array.from(storage.keys()).some((k) => /queue|task/i.test(k)), Array.from(storage.keys()))
const clearBtn = findAll(tree, (n) => n.type === 'button' && textOf(n) === '清空队列')[0]
clearBtn.props.onClick()
tree = renderTree()
console.log('queue gone after clear:', !textOf(tree).includes('更新队列'))
must('clearing drops the queue panel', !textOf(tree).includes('更新队列'))

// --- official toggle ---// --- official toggle ---
const toggle = findAll(tree, (n) => n.type === 'input' && n.props.type === 'checkbox')[0]
console.log('\ncheckbox present:', !!toggle, toggle && toggle.props.checked)
toggle.props.onChange({ target: { checked: true } })
tree = renderTree()
console.log('with builtin includes dsh-base:', textOf(tree).includes('ds-base') || textOf(tree).includes('dsh-base'))
console.log('tail:', textOf(tree).replace(/\s+/g, ' ').slice(-160))
toggle.props.onChange({ target: { checked: false } })
tree = renderTree()

// --- page size switch ---
const sizeSelect = findAll(tree, (n) => n.type === 'select' && n.props.title === '每页条数')[0]
sizeSelect.props.onChange({ target: { value: '10' } })
tree = renderTree()
flat = textOf(tree)
console.log('\n--- page size 10 ---')
console.log(flat.replace(/\s+/g, ' ').slice(-260))
console.log('prefs:', localStorage.getItem('dsh-plugin-update-hub:prefs'))
must('page size is remembered', JSON.parse(localStorage.getItem('dsh-plugin-update-hub:prefs') || '{}').pageSize === 10)

// --- the manager's remote namespace mounts after us (fresh app start) ---
console.log('\n--- late manager ---')
const lateServices = new Map([
  ['remote', remoteMock],
  ['slots', services.get('slots')],
])
const lateCtx = {
  get(name) { return lateServices.get(name) },
  effect(fn) { const dispose = fn(); if (typeof dispose === 'function') dispose() },
}
const savedPluginManager = remoteMock.pluginManager
delete remoteMock.pluginManager
services.delete('remote.pluginManager')
vm.runInThisContext(source + '\n//# late', { filename: 'client-late.js' })
const lateClient = captured
const lateModule = lateClient.factory((name) => { if (name === 'react') return React; throw new Error('unexpected require ' + name) })
lateModule.apply(lateCtx)
let lateTree = null
for (let tick = 0; tick < 25; tick += 1) {
  await new Promise((resolve) => setTimeout(resolve, 100))
  const lateSlot = registrations[registrations.length - 1]
  if (!lateSlot) continue
  hookIndex = 0
  pendingEffects = []
  rerenderNeeded = false
  const element = lateSlot.render()
  lateTree = typeof element.type === 'function' ? element.type(element.props) : element
  if (textOf(lateTree).includes('dsh-meme')) break
  if (tick === 3) remoteMock.pluginManager = savedPluginManager
}
const lateText = textOf(lateTree || { type: 'div', props: {}, children: [] })
must('late manager does not latch an error', !lateText.includes('插件管理器尚未加载'))
must('late manager still lists rows', lateText.includes('dsh-meme'))

if (failures.length > 0) {
  console.error('\nFAILED (' + failures.length + '):')
  for (const line of failures) console.error('  ✗ ' + line)
  process.exit(1)
}
console.log('\nOK — client half renders, checks, queues and updates correctly')
process.exit(0)

