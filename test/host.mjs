/** Host-half smoke test: route registration, admission fence, package collection. */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'update-hub-host-'))
const profile = join(root, 'profile')
mkdirSync(join(profile, 'node_modules', 'dsh-meme'), { recursive: true })
mkdirSync(join(profile, 'node_modules', '@scope', 'pkg'), { recursive: true })
writeFileSync(join(profile, 'cordis.patch.yml'), '- insert: []\n')
writeFileSync(join(profile, 'node_modules', 'dsh-meme', 'package.json'), JSON.stringify({ version: '1.2.3', description: 'a meme plugin' }))
writeFileSync(join(profile, 'node_modules', '@scope', 'pkg', 'package.json'), JSON.stringify({ version: '0.1.0' }))
process.env.DSH_PROFILE_DIR = profile

const entry = join(profile, 'node_modules', 'dsh-meme')
const when = new Date('2026-01-02T03:04:05Z')
utimesSync(entry, when, when)

const caught = []
const registrations = []
const ctx = {
  get(name) {
    if (name === 'webServer') return { register(route) { registrations.push(route); return () => {} } }
    if (name === 'connection') {
      const behaviour = ctx.__connection
      if (behaviour === 'missing') return undefined
      if (behaviour === 'throw') return { requestRejection() { throw new Error('boom') } }
      return { requestRejection(req) { return req.__refusal } }
    }
    return undefined
  },
  effect(fn) { caught.push(fn()) },
}

const host = await import('../index.js')
assert.deepEqual(host.inject, ['webServer', 'connection'], 'injects webServer and connection')
host.apply(ctx)
assert.equal(registrations.length, 1, 'registers one route')
const route = registrations[0]
assert.equal(route.kind, 'exact')
assert.equal(route.path, '/dsh-plugin-update-hub-api')

function call(request) {
  return new Promise((resolve) => {
    const res = {
      status: 0,
      headers: {},
      writeHead(status, headers) { this.status = status; this.headers = headers },
      end(body) { resolve({ status: this.status, headers: this.headers, body: body === undefined ? '' : JSON.parse(body) }) },
    }
    route.handler({ method: 'GET', url: route.path, __refusal: undefined, ...request }, res)
  })
}

// allowed by the host fence
let result = await call({ url: `${route.path}?names=dsh-meme,@scope/pkg,%2e%2e` })
assert.equal(result.status, 200)
assert.equal(result.body.installedAt['dsh-meme'], Math.round(when.getTime()), 'reads the install time')
assert.equal(result.body.info['dsh-meme'].description, 'a meme plugin')
assert.equal(result.body.info['@scope/pkg'].version, '0.1.0')
assert.ok(!('%2e%2e' in result.body.info), 'drops unsafe package names')

// refused by the host fence
result = await call({ url: route.path, __refusal: 401 })
assert.equal(result.status, 401)
assert.deepEqual(result.body, { error: 'unauthorized' })

// fence missing -> fail closed
ctx.__connection = 'missing'
result = await call({ url: route.path })
assert.equal(result.status, 403)

// fence throwing -> fail closed
ctx.__connection = 'throw'
result = await call({ url: route.path })
assert.equal(result.status, 403)
ctx.__connection = undefined

// method check runs after admission
result = await call({ method: 'POST', url: route.path })
assert.equal(result.status, 405)

rmSync(root, { recursive: true, force: true })
console.log('OK — host half: route fenced, names filtered, install times and package info returned')
