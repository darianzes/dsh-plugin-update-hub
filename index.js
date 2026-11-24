import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-plugin-update-hub'
export const inject = ['webServer', 'connection']

const ROUTE = '/dsh-plugin-update-hub-api'
const SAFE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i

function moduleDir() {
  try {
    return dirname(fileURLToPath(import.meta.url))
  } catch (error) {
    return process.cwd()
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch (error) {
    return false
  }
}

/**
 * A DSH profile directory keeps its installed packages in node_modules and
 * always describes its own composition, so the marker file tells a real
 * profile apart from the read-only installation bundle directory.
 */
function isProfileDir(dir) {
  return isDirectory(join(dir, 'node_modules')) && existsSync(join(dir, 'cordis.patch.yml'))
}

function hasNodeModules(dir) {
  return isDirectory(join(dir, 'node_modules'))
}

function profileCandidates() {
  const candidates = []
  const envProfile = process.env.DSH_PROFILE_DIR
  if (envProfile) candidates.push(envProfile)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const envProfileName = process.env.DSH_PROFILE
  if (envProfileName) candidates.push(join(home, 'profiles', envProfileName))
  for (const arg of process.argv.slice(1)) {
    if (!arg || arg.charAt(0) === '-' || arg.charAt(0) !== '/') continue
    candidates.push(arg)
  }
  let dir = moduleDir()
  for (let step = 0; step < 8; step += 1) {
    candidates.push(dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const profilesRoot = join(home, 'profiles')
  try {
    for (const entry of readdirSync(profilesRoot)) {
      if (entry.charAt(0) !== '.') candidates.push(join(profilesRoot, entry))
    }
  } catch (error) { /* no profiles directory */ }
  const seen = new Set()
  return candidates.filter((candidate) => {
    if (seen.has(candidate)) return false
    seen.add(candidate)
    return true
  })
}

let resolvedProfileDir

function findProfileDir() {
  if (resolvedProfileDir !== undefined) return resolvedProfileDir
  const candidates = profileCandidates()
  const strict = candidates.find((candidate) => isProfileDir(candidate))
  if (strict !== undefined) {
    resolvedProfileDir = strict
    return resolvedProfileDir
  }
  const loose = candidates.find((candidate) => hasNodeModules(candidate))
  resolvedProfileDir = loose
  return resolvedProfileDir
}

/**
 * Installation time of one installed package: the moment its directory entry
 * appeared inside the profile's node_modules. The entry itself is usually a
 * pnpm symlink, so read the link's own timestamp first and only fall back to
 * the followed target when the entry is a real directory.
 */
function installedAtOf(profileDir, packageName) {
  const entry = join(profileDir, 'node_modules', packageName)
  try {
    return Math.round(lstatSync(entry).mtimeMs)
  } catch (error) {
    try {
      return Math.round(statSync(join(entry, 'package.json')).mtimeMs)
    } catch (inner) {
      return undefined
    }
  }
}

function listInstalled(profileDir) {
  try {
    return readdirSync(join(profileDir, 'node_modules')).filter((entry) => entry !== '.bin' && !entry.startsWith('.'))
  } catch (error) {
    return []
  }
}

/**
 * Package metadata the plugin manager does not surface: the short description
 * a publisher wrote in package.json, used as a fallback when the bundle meta
 * carries no localized description.
 */
function packageInfo(profileDir, packageName) {
  try {
    const raw = readFileSync(join(profileDir, 'node_modules', packageName, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw)
    const description = typeof parsed.description === 'string' ? parsed.description.slice(0, 400) : ''
    const version = typeof parsed.version === 'string' ? parsed.version : ''
    const info = {}
    if (description) info.description = description
    if (version) info.version = version
    return info
  } catch (error) {
    return undefined
  }
}

function collect(profileDir, requested) {
  const names = requested && requested.length
    ? requested.filter((entry) => SAFE_NAME.test(entry))
    : listInstalled(profileDir).flatMap((entry) => {
        if (!entry.startsWith('@')) return [entry]
        try {
          return readdirSync(join(profileDir, 'node_modules', entry))
            .filter((child) => !child.startsWith('.'))
            .map((child) => `${entry}/${child}`)
        } catch (error) {
          return []
        }
      })
  const installedAt = {}
  const info = {}
  for (const packageName of names) {
    const at = installedAtOf(profileDir, packageName)
    if (at !== undefined) installedAt[packageName] = at
    const meta = packageInfo(profileDir, packageName)
    if (meta !== undefined && (meta.description || meta.version)) info[packageName] = meta
  }
  return { installedAt, info }
}

/**
 * Host admission fence for the local route. Delegates to the runtime's own
 * `connection.requestRejection()` so the route inherits the browser auth the
 * app already enforces; when that service is missing or throws, the request is
 * rejected instead of falling through to a Host/Origin/loopback guess.
 * @returns 0 when the request may proceed, otherwise the status code to send.
 */
function refusalOf(ctx, req) {
  try {
    const connection = ctx.get('connection')
    if (connection === undefined || connection === null) return 403
    if (typeof connection.requestRejection !== 'function') return 403
    const rejection = connection.requestRejection(req)
    if (rejection === undefined || rejection === null || rejection === false) return 0
    return typeof rejection === 'number' ? rejection : 403
  } catch (error) {
    return 403
  }
}

function respond(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

export function apply(ctx) {
  const webServer = ctx.webServer ?? ctx.get('webServer')
  if (webServer === undefined) return
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTE,
    async handler(req, res) {
      const refusal = refusalOf(ctx, req)
      if (refusal !== 0) {
        respond(res, refusal, { error: 'unauthorized' })
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        respond(res, 405, { error: 'method-not-allowed' })
        return
      }
      const profileDir = findProfileDir()
      if (profileDir === undefined) {
        respond(res, 503, { error: 'profile-not-found' })
        return
      }
      let requested
      try {
        const url = new URL(req.url ?? ROUTE, 'http://localhost')
        const raw = url.searchParams.get('names')
        if (raw !== null) requested = raw.split(',').map((entry) => entry.trim()).filter(Boolean)
      } catch (error) {
        requested = undefined
      }
      const collected = collect(profileDir, requested)
      respond(res, 200, collected)
    },
  }))
}
