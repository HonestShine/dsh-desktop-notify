import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { normalizeConfig } from '../lib/normalize.js'
import { Presence } from '../lib/presence.js'
import { isRootSession } from '../lib/session.js'
import { formatApproval, formatTurnEnd, localizedReason, resolveLocale, truncate } from '../lib/messages.js'
import {
  buildLinuxOptions,
  buildMacOptions,
  buildWindowsOptions,
  mapOutcome,
  sanitizeActions,
} from '../lib/notifier.js'
import {
  buildPlayerCandidates,
  toastSoundOptions,
  validateSoundFile,
} from '../lib/sound.js'
import { buildToastXml, escapeXml, isActionToken, normalizeWindowsSound, parseAumidLookup } from '../lib/winrt.js'

const ASSET = fileURLToPath(new URL('../assets/notify.wav', import.meta.url))
const ALERT_ASSET = fileURLToPath(new URL('../assets/alert.wav', import.meta.url))
const PS1 = fileURLToPath(new URL('../assets/play-wav.ps1', import.meta.url))
const ACTIVATE_VBS = fileURLToPath(new URL('../assets/activate.vbs', import.meta.url))

test('sanitizeActions strips platform separators and leading flags', () => {
  const actions = sanitizeActions([
    { id: 'a', label: '拒绝' },
    { id: 'b', label: '允许一次' },
    { id: 'c', label: '-delete, now; please' },
    { id: 'd', label: '拒绝' },
    { id: 'e', label: '' },
  ])
  assert.deepEqual(actions.map((entry) => entry.id), ['a', 'b', 'c'])
  assert.equal(actions[2].label, 'delete now please')
  assert.equal(actions.some((entry) => /[,;]/u.test(entry.label)), false)
})

test('sanitizeActions deduplicates labels case-insensitively', () => {
  const actions = sanitizeActions([
    { id: 'a', label: 'Allow' },
    { id: 'b', label: 'allow' },
    { id: 'c', label: 'Ignore' },
  ])
  assert.equal(actions.length, 3)
  assert.notEqual(actions[0].label.toLowerCase(), actions[1].label.toLowerCase())
})

test('sanitizeActions keeps protocol-safe action ids', () => {
  const actions = sanitizeActions([{ id: 'allow once&x=1', label: 'Allow' }])
  assert.equal(actions[0].id, 'allow-once-x-1')
})

test('buildToastXml escapes text and wires protocol actions', () => {
  const xml = buildToastXml({
    title: 'A & B',
    body: 'x < y > z',
    actions: [{ id: 'reject', label: '拒绝' }, { id: 'allow-once', label: '允许一次' }],
    token: 'token-1',
    soundMode: 'system',
    systemName: 'Notification.Mail',
  })
  assert.match(xml, /A &amp; B/u)
  assert.match(xml, /x &lt; y &gt; z/u)
  assert.match(xml, /activationType="protocol"/u)
  assert.match(xml, /ms-winsoundevent:Notification\.Mail/u)
  assert.match(xml, /token=token-1/u)
  assert.match(xml, /decision=allow-once/u)
  assert.match(xml, /&amp;decision=/u)
  assert.match(xml, /launch="dsh:\/\/open"/u)

  const silent = buildToastXml({
    title: 'Quiet',
    body: '',
    actions: [],
    token: 'token-2',
    soundMode: 'bundled',
  })
  assert.match(silent, /<audio silent="true"\/>/u)
  assert.doesNotMatch(silent, /<actions>/u)
  assert.equal(escapeXml('&<>"\''), '&amp;&lt;&gt;&quot;&apos;')
  assert.equal(normalizeWindowsSound('Notification.Ping'), 'Notification.Ping')
  assert.equal(normalizeWindowsSound('Bottle'), 'Notification.Default')
})

test('buildToastXml applies the configured duration', () => {
  const defaults = buildToastXml({ title: 'T', body: '', actions: [], token: 't', soundMode: 'none' })
  assert.match(defaults, /^<toast duration="long"/u)
  const short = buildToastXml({
    title: 'T',
    body: '',
    actions: [],
    token: 't',
    duration: 'short',
    soundMode: 'none',
  })
  assert.match(short, /^<toast duration="short"/u)
})

test('buildToastXml carries the app logo override when one is resolved', () => {
  const xml = buildToastXml({
    title: 'T',
    body: '',
    actions: [],
    token: 't',
    appLogo: 'file:///C:/Program%20Files/App/resources/icon.png',
    soundMode: 'none',
  })
  assert.ok(xml.includes('placement="appLogoOverride"'))
  assert.ok(xml.includes('src="file:///C:/Program%20Files/App/resources/icon.png"'))
  assert.ok(xml.includes('hint-crop="circle"'))
  const plain = buildToastXml({ title: 'T', body: '', actions: [], token: 't', soundMode: 'none' })
  assert.equal(plain.includes('appLogoOverride'), false)
})

test('parseAumidLookup reads the shortcut lookup result', () => {
  const parsed = parseAumidLookup('{"aumid":"electron.app.DeepSeek Harness","shortcut":"C:\\\\x.lnk","target":"C:\\\\app.exe"}')
  assert.deepEqual(parsed, {
    appId: 'electron.app.DeepSeek Harness',
    shortcut: 'C:\\x.lnk',
    target: 'C:\\app.exe',
  })
  assert.equal(parseAumidLookup('{}'), undefined)
  assert.equal(parseAumidLookup('not json'), undefined)
  assert.equal(parseAumidLookup('{"aumid":"   "}'), undefined)
})

test('isActionToken accepts only the UUID tokens this transport mints', () => {
  assert.equal(isActionToken('2f9d4a10-6c3b-4f8e-9a7d-1b2c3d4e5f60'), true)
  assert.equal(isActionToken('2F9D4A10-6C3B-4F8E-9A7D-1B2C3D4E5F60'), true)
  assert.equal(isActionToken('..\\..\\evil'), false)
  assert.equal(isActionToken('2f9d4a10-6c3b-4f8e-9a7d-1b2c3d4e5f60/../x'), false)
  assert.equal(isActionToken('2f9d4a10-6c3b-4f8e-9a7d-1b2c3d4e5f6'), false)
  assert.equal(isActionToken(''), false)
  assert.equal(isActionToken(undefined), false)
})

test('activate.vbs validates the protocol token and decision before writing', () => {
  const source = readFileSync(ACTIVATE_VBS, 'utf8')
  assert.match(source, /tokenPattern = "\^\[0-9a-fA-F\]\{8\}-/u)
  assert.match(source, /decisionPattern = "\^\[A-Za-z0-9_-\]\{1,64\}\$"/u)
  assert.match(source, /If Not re\.Test\(token\) Then WScript\.Quit/u)
  assert.match(source, /If Not re\.Test\(decision\) Then WScript\.Quit/u)
})

test('mapOutcome resolves Windows button labels', () => {
  const actions = [{ id: 'reject', label: '拒绝' }, { id: 'allow-once', label: '允许一次' }]
  assert.deepEqual(mapOutcome(actions, '允许一次', { activationType: '允许一次' }), {
    reason: 'action',
    actionId: 'allow-once',
    label: '允许一次',
  })
  assert.equal(mapOutcome(actions, undefined, { activationType: '拒绝' }).actionId, 'reject')
})

test('mapOutcome resolves macOS action metadata', () => {
  const actions = [{ id: 'reject', label: 'Reject' }, { id: 'allow-once', label: 'Allow once' }]
  assert.equal(
    mapOutcome(actions, 'actionclicked', { activationType: 'actionClicked', activationValue: 'Allow once' }).actionId,
    'allow-once',
  )
  assert.equal(mapOutcome(actions, undefined, { activationType: 'contentsClicked' }).reason, 'click')
  assert.equal(mapOutcome(actions, undefined, { activationType: 'timeout' }).reason, 'timeout')
  assert.equal(mapOutcome(actions, undefined, { activationType: 'closed' }).reason, 'dismissed')
})

test('mapOutcome resolves Linux activation values', () => {
  const actions = [{ id: 'reject', label: '拒绝' }, { id: 'allow-once', label: '允许一次' }]
  assert.equal(mapOutcome(actions, '允许一次', { activationValue: '允许一次' }).actionId, 'allow-once')
  assert.equal(mapOutcome(actions, '拒绝', { activationType: 'click' }).actionId, 'reject')
  assert.equal(mapOutcome(actions, undefined, undefined).reason, 'sent')
})

test('platform option builders carry actions, sound, and identity', () => {
  const base = {
    title: 'Title',
    body: 'Body',
    actions: [{ id: 'a', label: 'Reject' }, { id: 'b', label: 'Allow once' }],
    id: 7,
    group: 'group-7',
    appId: 'com.deepseek.dsh',
    duration: 'long',
    iconPath: '/icon.svg',
    soundMode: 'bundled',
    systemName: '',
    timeoutSeconds: 30,
  }
  const windows = buildWindowsOptions(base)
  assert.equal(windows.appID, 'com.deepseek.dsh')
  assert.deepEqual(windows.actions, ['Reject', 'Allow once'])
  assert.equal(windows.silent, true)
  assert.equal(windows.message, 'Body')

  const mac = buildMacOptions(base)
  assert.equal(mac.sound, false)
  assert.equal(mac.timeout, 30)
  assert.deepEqual(mac.actions, ['Reject', 'Allow once'])

  const linux = buildLinuxOptions(base)
  assert.equal(linux['app-name'], 'DeepSeek Harness')
  assert.equal(linux.timeout, 30)
  assert.deepEqual(linux.actions, ['Reject', 'Allow once'])

  const windowsSystem = buildWindowsOptions({ ...base, soundMode: 'system' })
  assert.equal(windowsSystem.sound, 'Notification.Default')
  assert.equal(windowsSystem.silent, undefined)
})

test('toastSoundOptions honors platform sound rules', () => {
  assert.deepEqual(toastSoundOptions('win32', 'system', 'Notification.Mail'), { sound: 'Notification.Mail' })
  assert.deepEqual(toastSoundOptions('win32', 'system', 'Bottle'), { sound: 'Notification.Default' })
  assert.deepEqual(toastSoundOptions('win32', 'custom', ''), { silent: true })
  assert.deepEqual(toastSoundOptions('darwin', 'system', 'Ping'), { sound: 'Ping' })
  assert.deepEqual(toastSoundOptions('darwin', 'system', 'Unknown'), { sound: true })
  assert.deepEqual(toastSoundOptions('darwin', 'bundled', ''), { sound: false })
  assert.deepEqual(toastSoundOptions('linux', 'custom', ''), {})
})

test('validateSoundFile accepts the bundled wav and rejects missing paths', () => {
  const ok = validateSoundFile('win32', ASSET)
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(path.extname(ok.path), '.wav')

  assert.equal(validateSoundFile('win32', 'relative/file.wav').ok, false)
  assert.equal(validateSoundFile('win32', ASSET.replace(/\.wav$/u, '.mp3')).ok, false)
  assert.equal(validateSoundFile('darwin', ASSET).ok, true)
})

test('both bundled cues are valid RIFF/WAVE files', () => {
  for (const file of [ASSET, ALERT_ASSET]) {
    const head = readFileSync(file)
    assert.equal(head.toString('ascii', 0, 4), 'RIFF')
    assert.equal(head.toString('ascii', 8, 12), 'WAVE')
    assert.ok(head.length > 1000)
  }
})

test('buildPlayerCandidates follows platform players', () => {
  const windows = buildPlayerCandidates('win32', ASSET, PS1, 'powershell.exe')
  assert.equal(windows[0].command, 'powershell.exe')
  assert.ok(windows[0].args.includes(PS1))

  assert.equal(buildPlayerCandidates('darwin', ASSET, PS1)[0].command, 'afplay')
  assert.deepEqual(
    buildPlayerCandidates('linux', ASSET, PS1).map((candidate) => candidate.command),
    ['paplay', 'canberra-gtk-play', 'aplay'],
  )
})

test('normalizeConfig fills defaults and clamps ranges', () => {
  const defaults = normalizeConfig({})
  assert.equal(defaults.enabled, true)
  assert.equal(defaults.approval.timeoutSeconds, 30)
  assert.equal(defaults.sound.mode, 'bundled')
  assert.equal(defaults.windows.appId, '')
  assert.equal(defaults.windows.duration, 'long')
  assert.equal(defaults.attention.enabled, true)
  assert.equal(defaults.attention.mode, 'bundled')
  assert.equal(defaults.attention.file, '')
  assert.equal(defaults.presence.staleSeconds, 120)
  assert.equal(defaults.presence.idleSeconds, 180)

  const clamped = normalizeConfig({
    enabled: false,
    approval: { timeoutSeconds: 999, onlyWhenHidden: false },
    sound: { mode: 'nope' },
    attention: { enabled: false, mode: 'nope', file: 7 },
    presence: { staleSeconds: 5, idleSeconds: -3 },
  })
  assert.equal(clamped.enabled, false)
  assert.equal(clamped.approval.timeoutSeconds, 300)
  assert.equal(clamped.approval.onlyWhenHidden, false)
  assert.equal(clamped.sound.mode, 'bundled')
  assert.equal(clamped.attention.enabled, false)
  assert.equal(clamped.attention.mode, 'bundled')
  assert.equal(clamped.attention.file, '')
  assert.equal(clamped.presence.staleSeconds, 30)
  assert.equal(clamped.presence.idleSeconds, 0)
})

test('Presence aggregates clients and expires stale reports', async () => {
  const presence = new Presence(1000)
  assert.equal(presence.isPresent(1000), false)
  presence.update({ clientId: 'a', focused: false, locale: 'zh' }, 1000)
  presence.update({ clientId: 'b', focused: true, locale: 'en' }, 1000)
  assert.equal(presence.isPresent(1500), true)
  assert.equal(presence.locale(1500), 'en')
  assert.equal(presence.isPresent(2500), false)
  assert.equal(presence.snapshot(2500).clients, 0)

  let resolved = false
  const waiting = presence.whenPresent().then(() => {
    resolved = true
  })
  assert.equal(resolved, false)
  presence.update({ clientId: 'c', focused: true, locale: 'zh' }, 2600)
  await waiting
  assert.equal(resolved, true)
})

test('messages localize and truncate approval copy', () => {
  assert.equal(resolveLocale('zh-CN'), 'zh')
  assert.equal(resolveLocale('fr'), 'en')
  const zh = formatApproval({ toolName: 'bash', displayReason: '需要写入工作区' }, 'zh', '修复登录')
  assert.equal(zh.title, '需要审批')
  assert.match(zh.body, /修复登录/u)
  assert.match(zh.body, /bash/u)
  assert.equal(zh.actions.reject, '拒绝')
  assert.equal(zh.actions.allowOnce, '允许一次')
  const en = formatApproval({ toolName: 'bash', reason: 'needs network' }, 'en', 'Login fix')
  assert.equal(en.title, 'Approval required')
  assert.match(en.body, /Login fix/u)
  assert.match(en.body, /needs network/u)
  assert.equal(truncate('a'.repeat(20), 10).length, 10)
  assert.equal(truncate('a'.repeat(5), 10), 'aaaaa')
  const turn = formatTurnEnd({ session: { header: { cwd: 'C:/work/project' } } }, 'en', 'My session')
  assert.equal(turn.body, 'My session')
  assert.equal(formatTurnEnd({ session: { header: { cwd: 'C:/work/project' } } }, 'en').body, 'project')
})

test('messages resolve structured displayReason and session lineage', () => {
  const display = { en: 'Needs workspace access', zh: '需要访问工作区' }
  assert.equal(localizedReason(display, 'zh'), '需要访问工作区')
  assert.equal(localizedReason(display, 'en'), 'Needs workspace access')
  assert.equal(localizedReason('plain reason', 'en'), 'plain reason')
  assert.equal(localizedReason(undefined, 'en'), '')
  const copy = formatApproval({ toolName: 'bash', displayReason: display }, 'zh')
  assert.match(copy.body, /需要访问工作区/u)

  assert.equal(isRootSession({ session: { header: { origin: 'subagent', parentSession: 'p' } } }), false)
  assert.equal(isRootSession({ session: { header: { origin: 'user', parentSession: 'p' } } }), true)
  assert.equal(isRootSession({ session: { header: { parentSession: 'p' } } }), false)
  assert.equal(isRootSession({ session: { header: {} } }), true)
})
