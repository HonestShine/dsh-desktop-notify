/**
 * Normalize a validated plugin config into the shape the runtime uses. Kept in
 * its own module so unit tests can exercise it without loading schemastery
 * (which DSH provides at runtime but the plugin does not install itself).
 * @param {object} config - Config as resolved by the Loader.
 * @returns {object} Defensive copy with clamped values.
 */
export function normalizeConfig(config) {
  const value = config && typeof config === 'object' ? config : {}
  const approval = value.approval && typeof value.approval === 'object' ? value.approval : {}
  const events = value.events && typeof value.events === 'object' ? value.events : {}
  const sound = value.sound && typeof value.sound === 'object' ? value.sound : {}
  const windows = value.windows && typeof value.windows === 'object' ? value.windows : {}
  const macos = value.macos && typeof value.macos === 'object' ? value.macos : {}
  const presence = value.presence && typeof value.presence === 'object' ? value.presence : {}
  return {
    enabled: value.enabled !== false,
    approval: {
      enabled: approval.enabled !== false,
      onlyWhenHidden: approval.onlyWhenHidden !== false,
      timeoutSeconds: clampNumber(approval.timeoutSeconds, 5, 300, 30),
    },
    events: {
      question: events.question !== false,
      turnEnd: events.turnEnd !== false,
      errors: events.errors !== false,
      onlyWhenHidden: events.onlyWhenHidden !== false,
    },
    sound: {
      mode: ['system', 'bundled', 'custom', 'none'].includes(sound.mode) ? sound.mode : 'bundled',
      file: typeof sound.file === 'string' ? sound.file : '',
      systemName: typeof sound.systemName === 'string' ? sound.systemName : '',
    },
    windows: {
      appId: typeof windows.appId === 'string' ? windows.appId : 'com.deepseek.dsh',
      duration: windows.duration === 'short' ? 'short' : 'long',
    },
    macos: {
      customNotifierPath: typeof macos.customNotifierPath === 'string' ? macos.customNotifierPath : '',
    },
    presence: {
      staleSeconds: clampNumber(presence.staleSeconds, 30, 600, 120),
      idleSeconds: clampNumber(presence.idleSeconds, 0, 3600, 180),
    },
  }
}

/**
 * Clamp a numeric config value.
 * @param {unknown} value - Raw value.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @param {number} fallback - Value used when the input is not a finite number.
 * @returns {number}
 */
export function clampNumber(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}
