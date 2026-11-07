import { execFile, spawn } from 'node:child_process'

const BODY_LIMIT = 16 * 1024
const COMMAND_TIMEOUT = 10_000

/**
 * Register every `/desktop-notify` route on the Host web server.
 * @param {object} scope - A context with `webServer` and `connection` injected.
 * @param {object} service - Desktop notification service facade.
 * @returns {() => void} Disposer for all routes.
 */
export function installRoutes(scope, service) {
  const register = (kind, pathname, handler) => scope.webServer.register({ kind, path: pathname, handler: withErrors(handler) })
  const routes = [
    ['exact', '/desktop-notify/status', (req, res) => statusRoute(scope, service, req, res)],
    ['exact', '/desktop-notify/presence', (req, res) => presenceRoute(scope, service, req, res)],
    ['exact', '/desktop-notify/test', (req, res) => testRoute(scope, service, req, res)],
    ['exact', '/desktop-notify/preview-sound', (req, res) => previewSoundRoute(scope, service, req, res)],
    ['exact', '/desktop-notify/preview-attention', (req, res) => previewAttentionRoute(scope, service, req, res)],
    ['exact', '/desktop-notify/open-notification-settings', (req, res) => openSettingsRoute(scope, req, res)],
    ['exact', '/desktop-notify/repair-windows', (req, res) => repairWindowsRoute(scope, service, req, res)],
  ]
  const offs = routes.map(([kind, pathname, handler]) => register(kind, pathname, handler))
  return () => {
    for (const off of offs) off()
  }
}

function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: 'internal-error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/**
 * Apply the shared connection trust check.
 * @returns {boolean} true when the request was rejected and answered.
 */
function rejected(scope, req, res) {
  let rejection
  try {
    rejection = scope.connection.requestRejection(req)
  } catch {
    rejection = 403
  }
  if (rejection === undefined || rejection === null || rejection === false) return false
  res.statusCode = typeof rejection === 'number' ? rejection : 403
  res.end()
  return true
}

/** @returns {boolean} Whether the method matches, answering 405 otherwise. */
function method(req, res, expected) {
  if (req.method === expected) return true
  res.statusCode = 405
  res.setHeader('allow', expected)
  res.end()
  return false
}

/** @returns {Promise<object | null>} Parsed JSON body, or null after answering. */
async function jsonBody(req, res) {
  const type = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
  if (type !== 'application/json') {
    sendJson(res, 415, { ok: false, code: 'unsupported-media-type', message: 'content-type must be application/json' })
    return null
  }
  let size = 0
  const chunks = []
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > BODY_LIMIT) {
        sendJson(res, 413, { ok: false, code: 'payload-too-large', message: 'request body is too large' })
        return null
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
  } catch {
    sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body unreadable' })
    return null
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) return {}
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body must be a JSON object' })
      return null
    }
    return parsed
  } catch {
    sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body is not JSON' })
    return null
  }
}

function sendJson(res, status, value) {
  if (res.writableEnded) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

async function statusRoute(scope, service, req, res) {
  if (rejected(scope, req, res)) return
  if (!method(req, res, 'GET')) return
  const status = await service.status()
  sendJson(res, 200, { ok: true, ...status, linux: await linuxStatus() })
}

async function presenceRoute(scope, service, req, res) {
  if (rejected(scope, req, res)) return
  if (!method(req, res, 'POST')) return
  const body = await jsonBody(req, res)
  if (body === null) return
  const clientId = typeof body.clientId === 'string' ? body.clientId.slice(0, 128) : ''
  if (clientId.length === 0) {
    sendJson(res, 400, { ok: false, code: 'bad-request', message: 'clientId is required' })
    return
  }
  service.reportPresence({
    clientId,
    focused: body.focused === true,
    locale: typeof body.locale === 'string' ? body.locale : '',
  })
  sendJson(res, 200, { ok: true })
}

async function testRoute(scope, service, req, res) {
  if (rejected(scope, req, res)) return
  if (!method(req, res, 'POST')) return
  const body = await jsonBody(req, res)
  if (body === null) return
  const result = await service.sendTest()
  sendJson(res, 200, { ok: true, ...result })
}

async function previewSoundRoute(scope, service, req, res) {
  if (rejected(scope, req, res)) return
  if (!method(req, res, 'POST')) return
  const body = await jsonBody(req, res)
  if (body === null) return
  const result = await service.previewSound(body.mode, body.file, body.systemName)
  sendJson(res, result.ok ? 200 : 400, result)
}

async function previewAttentionRoute(scope, service, req, res) {
  if (rejected(scope, req, res)) return
  if (!method(req, res, 'POST')) return
  const body = await jsonBody(req, res)
  if (body === null) return
  const result = await service.previewAttention(body.mode, body.file)
  sendJson(res, result.ok ? 200 : 400, result)
}

async function openSettingsRoute(scope, req, res) {
  if (rejected(scope, req, res)) return
  if (!method(req, res, 'POST')) return
  if (process.platform === 'win32') {
    runDetached('cmd.exe', ['/c', 'start', '', 'ms-settings:notifications'])
    sendJson(res, 200, { ok: true })
    return
  }
  if (process.platform === 'darwin') {
    runDetached('open', ['x-apple.systempreferences:com.apple.Notifications-Settings.extension'])
    sendJson(res, 200, { ok: true })
    return
  }
  sendJson(res, 200, {
    ok: false,
    code: 'unsupported',
    message: 'Linux notification settings are owned by the desktop environment; open its notification settings manually.',
  })
}

async function repairWindowsRoute(scope, service, req, res) {
  if (rejected(scope, req, res)) return
  if (!method(req, res, 'POST')) return
  if (process.platform !== 'win32') {
    sendJson(res, 400, { ok: false, code: 'unsupported-platform', message: 'Windows action protocol can only be registered on Windows.' })
    return
  }
  const body = await jsonBody(req, res)
  if (body === null) return
  if (body.confirm !== true) {
    sendJson(res, 400, { ok: false, code: 'confirmation-required', message: 'Pass confirm: true after the user confirms the protocol registration.' })
    return
  }
  const result = await service.repairWindowsProtocol()
  sendJson(res, result.ok ? 200 : 500, result)
}

function runDetached(command, args) {
  try {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true, detached: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    // Opening system settings is best effort.
  }
}

function runFile(command, args) {
  return new Promise((resolve) => {
    const child = execFile(command, args, { windowsHide: true, timeout: COMMAND_TIMEOUT }, (error, stdout, stderr) => {
      resolve({
        code: error === null ? 0 : typeof error.code === 'number' ? error.code : 1,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
        error: error === null ? undefined : error.message,
      })
    })
    child.on('error', () => {})
  })
}

let cachedLinux
async function linuxStatus() {
  if (process.platform !== 'linux') return undefined
  cachedLinux ??= await detectNotifySend()
  return cachedLinux
}

async function detectNotifySend() {
  const result = await runFile('notify-send', ['--version'])
  if (result.code !== 0) {
    return { available: false, version: null, actions: false, error: result.error ?? 'notify-send is not installed' }
  }
  const match = /(\d+)\.(\d+)\.(\d+)/u.exec(result.stdout)
  const version = match === null ? result.stdout.trim() : `${match[1]}.${match[2]}.${match[3]}`
  const parts = match === null ? [0, 0, 0] : [Number(match[1]), Number(match[2]), Number(match[3])]
  const actions = parts[0] > 0 || parts[1] > 7 || (parts[1] === 7 && parts[2] >= 10)
  return { available: true, version, actions }
}
