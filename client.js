window.__ModuleLoader__.load({
  id: 'dsh-desktop-notify',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'desktopNotify'
    const SECTION_ID = 'desktop-notify'
    const BASE = '/desktop-notify'
    const SOUND_MODES = ['system', 'bundled', 'custom', 'none']

    const zh = {
      sectionTitle: '通知提醒',
      sectionDesc: '在系统通知中直接处理权限请求，并为任务完成、提问与错误设置提醒。',
      statusTitle: '运行状态',
      platform: '平台',
      notifier: '通知组件',
      available: '可用',
      unavailable: '不可用',
      actions: '通知内按钮',
      actionsSupported: '支持',
      actionsUnsupported: '不支持',
      soundMode: '铃声模式',
      presence: '窗口状态',
      presenceFocused: '前台',
      presenceHidden: '后台',
      presenceUnknown: '未上报',
      windowsIdentity: 'Windows 通知身份',
      macosIdentity: 'macOS 通知身份',
      linuxIdentity: 'Linux 通知组件',
      sendTest: '发送测试通知',
      refresh: '刷新状态',
      testSent: '测试通知已发送，请在系统通知中点击按钮。',
      testWaiting: '等待你在系统通知中操作…',
      testReceived: '收到操作',
      testTimeout: '等待超时',
      testError: '测试失败',
      openSettings: '打开系统通知设置',
      registerWindows: '修复通知按钮协议',
      registerWindowsConfirm: '将重新注册 dshnotify: 协议，用于把系统通知中的按钮点击回传给 DeepSeek Harness。确认继续？',
      registerWindowsDone: '通知按钮协议已注册。',
      registerWindowsFailed: '协议注册失败',
      confirm: '确认注册',
      cancel: '取消',
      approvalGroup: '权限确认',
      approvalEnabled: '权限请求通知',
      approvalEnabledDesc: '当工具需要授权时弹出带“拒绝 / 允许一次”按钮的系统通知。',
      onlyWhenHidden: '仅在窗口不在前台时',
      onlyWhenHiddenDesc: '窗口在前台时继续使用应用内审批面板；切回前台或超时后退回面板。',
      timeout: '等待秒数',
      timeoutDesc: '超时后关闭通知并显示应用内审批面板。',
      eventsGroup: '提醒',
      question: '提问提醒',
      questionDesc: 'Agent 需要你回答问题时提醒。',
      turnEnd: '任务完成提醒',
      turnEndDesc: '一轮回复结束时提醒。',
      errors: '错误提醒',
      errorsDesc: '会话出错时提醒。',
      eventsHidden: '提醒仅在后台显示',
      eventsHiddenDesc: '窗口在前台时不弹出提醒通知。',
      idle: '离开判定（秒）',
      idleDesc: '窗口虽在前台但超过该秒数没有键鼠输入，也按离开处理；0 表示只看窗口焦点。',
      soundGroup: '通知铃声',
      soundEnabledMode: '铃声来源',
      soundSystem: '系统提示音',
      soundBundled: '内置铃声',
      soundCustom: '自定义音频文件',
      soundNone: '静音',
      soundFile: '自定义音频路径',
      soundFileDesc: '绝对路径。Windows 仅支持 .wav；macOS/Linux 支持播放器可解码的格式。',
      soundFileApply: '应用路径',
      soundFileSaved: '路径已保存',
      soundFileInvalid: '路径无效或格式不受支持',
      systemName: '系统声音名',
      systemNameDesc: '可选。Windows 使用 Notification.*，macOS 使用 Bottle、Ping 等系统声音名。',
      systemNameApply: '应用',
      preview: '试听',
      previewOk: '已播放试听',
      previewFailed: '试听失败',
      advancedGroup: '高级',
      collapse: '收起',
      windowsAppId: 'Windows AppUserModelID',
      windowsAppIdDesc: '默认与 DeepSeek Harness 安装包一致；仅在通知身份排查时修改。',
      macosHelper: 'macOS 定制 notifier 路径',
      macosHelperDesc: '可选：指向自行构建的 terminal-notifier；留空使用内置版本。',
      macosCaveat: 'macOS 通知身份显示为 terminal-notifier（系统限制），按钮、声音与点击回传均可正常使用。',
      linuxCaveat: 'Linux 需要 libnotify 0.7.10+ 且通知守护进程支持 actions；否则会退回应用内审批面板。',
      saved: '设置已保存',
      saveFailed: '保存失败',
      loading: '加载配置…',
      unavailableForm: '无法读取该插件的配置，请确认插件已启用。',
      readonly: '当前配置不可写。',
      noStatus: '尚未获取状态',
      soundDisabled: '通知铃声已关闭',
    }

    const en = {
      sectionTitle: 'Notification reminders',
      sectionDesc: 'Answer permission requests from native notifications and get reminders for finished turns, questions, and errors.',
      statusTitle: 'Runtime status',
      platform: 'Platform',
      notifier: 'Notifier',
      available: 'available',
      unavailable: 'unavailable',
      actions: 'Inline actions',
      actionsSupported: 'supported',
      actionsUnsupported: 'not supported',
      soundMode: 'Sound',
      presence: 'Window',
      presenceFocused: 'foreground',
      presenceHidden: 'background',
      presenceUnknown: 'not reported',
      windowsIdentity: 'Windows notification identity',
      macosIdentity: 'macOS notification identity',
      linuxIdentity: 'Linux notifier',
      sendTest: 'Send test notification',
      refresh: 'Refresh status',
      testSent: 'Test notification sent. Click a button in the system notification.',
      testWaiting: 'Waiting for your action in the system notification…',
      testReceived: 'Received action',
      testTimeout: 'Timed out',
      testError: 'Test failed',
      openSettings: 'Open system notification settings',
      registerWindows: 'Repair action protocol',
      registerWindowsConfirm: 'This registers the dshnotify: protocol so buttons in system notifications can reach DeepSeek Harness. Continue?',
      registerWindowsDone: 'Notification action protocol registered.',
      registerWindowsFailed: 'Protocol registration failed',
      confirm: 'Confirm',
      cancel: 'Cancel',
      approvalGroup: 'Approvals',
      approvalEnabled: 'Permission request notifications',
      approvalEnabledDesc: 'Show a native notification with Reject / Allow once buttons when a tool needs approval.',
      onlyWhenHidden: 'Only while the window is not focused',
      onlyWhenHiddenDesc: 'Keep the in-app approval panel while focused; return to it on focus or after the timeout.',
      timeout: 'Wait seconds',
      timeoutDesc: 'After the timeout the notification closes and the in-app panel takes over.',
      eventsGroup: 'Reminders',
      question: 'Question reminders',
      questionDesc: 'Notify when the agent asks you a question.',
      turnEnd: 'Turn finished reminders',
      turnEndDesc: 'Notify when a reply finishes.',
      errors: 'Error reminders',
      errorsDesc: 'Notify when a session errors.',
      eventsHidden: 'Reminders only in the background',
      eventsHiddenDesc: 'Do not show reminder notifications while the window is focused.',
      idle: 'Away threshold (seconds)',
      idleDesc: 'Treat a focused window as away after this many seconds without keyboard or pointer input; 0 uses focus only.',
      soundGroup: 'Notification sound',
      soundEnabledMode: 'Sound source',
      soundSystem: 'System sound',
      soundBundled: 'Built-in chime',
      soundCustom: 'Custom audio file',
      soundNone: 'Silent',
      soundFile: 'Custom audio path',
      soundFileDesc: 'Absolute path. Windows only supports .wav; macOS/Linux support formats the system player can decode.',
      soundFileApply: 'Apply path',
      soundFileSaved: 'Path saved',
      soundFileInvalid: 'The path is invalid or the format is unsupported',
      systemName: 'System sound name',
      systemNameDesc: 'Optional. Windows uses Notification.*; macOS uses names such as Bottle or Ping.',
      systemNameApply: 'Apply',
      preview: 'Preview',
      previewOk: 'Preview played',
      previewFailed: 'Preview failed',
      advancedGroup: 'Advanced',
      collapse: 'Collapse',
      windowsAppId: 'Windows AppUserModelID',
      windowsAppIdDesc: 'Matches the DeepSeek Harness installer; change only when diagnosing notification identity.',
      macosHelper: 'macOS custom notifier path',
      macosHelperDesc: 'Optional: a self-built terminal-notifier; leave empty to use the bundled one.',
      macosCaveat: 'macOS shows notifications as terminal-notifier (system limitation); buttons, sound, and click callbacks still work.',
      linuxCaveat: 'Linux needs libnotify 0.7.10+ and a notification daemon with actions; otherwise the in-app approval panel is used.',
      saved: 'Setting saved',
      saveFailed: 'Could not save setting',
      loading: 'Loading configuration…',
      unavailableForm: 'The plugin configuration is unavailable; make sure the plugin is enabled.',
      readonly: 'The configuration is read-only right now.',
      noStatus: 'Status has not been loaded yet',
      soundDisabled: 'Notification sound is off',
    }

    const inject = ['slots', 'locale']
    let nativeIconActive = false

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      nativeIconActive = false
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'desktop-notify: locale')
      ctx.effect(() => installStyles(), 'desktop-notify: styles')
      let idleSeconds = () => 180
      // Older compositions may not provide configForms. Notifications and the
      // presence reporter still work; only the settings page is absent.
      ctx.inject(['configForms'], (scope) => {
        const form = scope.configForms.get(SECTION_ID)
        // The settings namespace is the patch id in current builds; keep the
        // loader entry id as a fallback so a composition that keys the namespace
        // by entry id still exposes the page.
        const fallbackForm = scope.configForms.get(`include:${SECTION_ID}`)
        idleSeconds = () => {
          try {
            const primary = form.getSnapshot()?.value?.presence?.idleSeconds
            if (typeof primary === 'number') return primary
            const fallback = fallbackForm.getSnapshot()?.value?.presence?.idleSeconds
            return typeof fallback === 'number' ? fallback : 180
          } catch {
            return 180
          }
        }
        const face = () => ({
          hooks: { form, fallbackForm },
          form,
          fallbackForm,
          sendTest: () => fetchJson(`${BASE}/test`, { method: 'POST', body: {} }),
          fetchStatus: () => fetchJson(`${BASE}/status`, { method: 'GET' }),
          previewSound: (mode, file, systemName) => fetchJson(`${BASE}/preview-sound`, {
            method: 'POST',
            body: { mode, file, systemName },
          }),
          openSystemSettings: () => fetchJson(`${BASE}/open-notification-settings`, { method: 'POST', body: {} }),
          repairWindows: () => fetchJson(`${BASE}/repair-windows`, { method: 'POST', body: { confirm: true } }),
        })
        scope.slots.inject('settings.section', () => scope.slots.register({
          name: 'settings.section',
          id: SECTION_ID,
          order: 17,
          locale: NS,
          label: () => t('sectionTitle'),
          inject: face,
        }, NotificationsSection))
        installSectionIcon(scope)
      })
      installPresence(ctx, () => idleSeconds())
      ctx.effect(() => installNavIcon(() => t('sectionTitle')), 'desktop-notify: nav icon')
    }

    /* ------------------------------------------------------------------ */
    /* Presence reporting                                                  */
    /* ------------------------------------------------------------------ */

    function installPresence(ctx, idleSeconds) {
      const clientId = newClientId()
      let lastReported
      let lastActivity = Date.now()
      let idleTimer
      const threshold = () => {
        const value = Number(idleSeconds())
        return Number.isFinite(value) ? Math.max(0, value) : 180
      }
      const isActive = () => {
        if (document.hidden || !document.hasFocus()) return false
        const seconds = threshold()
        if (seconds === 0) return true
        return Date.now() - lastActivity < seconds * 1000
      }
      const send = (focused, keepalive = false) => {
        void fetchJson(`${BASE}/presence`, {
          method: 'POST',
          keepalive,
          body: {
            clientId,
            focused,
            locale: ctx.locale.getLocale().active,
          },
        }, true).catch(() => {})
      }
      const report = (force = false) => {
        const active = isActive()
        if (!force && active === lastReported) return
        lastReported = active
        send(active)
      }
      const scheduleIdle = () => {
        if (idleTimer !== undefined) window.clearTimeout(idleTimer)
        const seconds = threshold()
        if (seconds === 0) {
          idleTimer = undefined
          return
        }
        const remaining = Math.max(0, seconds * 1000 - (Date.now() - lastActivity))
        idleTimer = window.setTimeout(() => {
          idleTimer = undefined
          report()
        }, remaining + 50)
      }
      const markActivity = () => {
        lastActivity = Date.now()
        scheduleIdle()
        report()
      }
      report(true)
      scheduleIdle()
      ctx.effect(() => {
        const timer = window.setInterval(() => {
          scheduleIdle()
          report(true)
        }, 15_000)
        return () => window.clearInterval(timer)
      }, 'desktop-notify: presence heartbeat')
      ctx.effect(() => {
        const onChange = () => {
          if (!document.hidden) lastActivity = Date.now()
          scheduleIdle()
          report()
        }
        const onPageHide = () => send(false, true)
        const activity = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
        document.addEventListener('visibilitychange', onChange)
        window.addEventListener('focus', onChange)
        window.addEventListener('blur', onChange)
        window.addEventListener('pagehide', onPageHide)
        for (const event of activity) window.addEventListener(event, markActivity, { passive: true })
        return () => {
          document.removeEventListener('visibilitychange', onChange)
          window.removeEventListener('focus', onChange)
          window.removeEventListener('blur', onChange)
          window.removeEventListener('pagehide', onPageHide)
          for (const event of activity) window.removeEventListener(event, markActivity)
          if (idleTimer !== undefined) window.clearTimeout(idleTimer)
          send(false, true)
        }
      }, 'desktop-notify: presence events')
      ctx.effect(() => ctx.locale.subscribe(() => report(true)), 'desktop-notify: presence locale')
    }

    /** Bell glyph used by the page header and the settings nav patch. */
    const BELL_MARKUP = [
      '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>',
      '<path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
      '<circle cx="18.5" cy="5.5" r="2.5" fill="currentColor" stroke="none"/>',
    ].join('')

    function BellIcon(props) {
      const size = props.size ?? 18
      return h('svg', {
        key: props.iconKey,
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        className: props.className,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.active === true ? 2 : 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, [
        h('path', { key: 'body', d: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9' }),
        h('path', { key: 'clapper', d: 'M13.7 21a2 2 0 0 1-3.4 0' }),
        h('circle', { key: 'dot', cx: 18.5, cy: 5.5, r: 2.5, fill: 'currentColor', stroke: 'none' }),
      ])
    }

    /**
     * Native icon contribution for DSH 0.2.2+, where `settings.section.icon`
     * exists. Rendering it also disables the DOM fallback.
     * @param {{ size: number, active: boolean }} props - Shell-supplied geometry.
     * @returns {object} Bell SVG.
     */
    function SettingsBellIcon(props) {
      nativeIconActive = true
      return h(BellIcon, {
        size: props.size,
        active: props.active,
        className: props.active === true ? 'dtn-nav-bell-active' : 'dtn-nav-bell',
      })
    }

    /**
     * Register the native settings icon when the shell declares the slot.
     * Older shells (0.2.0/0.2.1) have no such slot and fall back to the DOM
     * patch installed by {@link installNavIcon}.
     * @param {object} scope - Injected Client context with `slots`.
     */
    function installSectionIcon(scope) {
      const register = () => {
        try {
          return scope.slots.register({
            name: 'settings.section.icon',
            id: SECTION_ID,
          }, SettingsBellIcon)
        } catch {
          return () => {}
        }
      }
      try {
        scope.slots.inject('settings.section.icon', register)
      } catch {
        // 0.2.0/0.2.1 have no native settings icon slot.
      }
    }

    /**
     * The settings shell hard-codes nav glyphs by section id and the
     * `settings.section` registration has no icon field. Patch the nav row for
     * our label after React renders it, and keep patching when React recreates
     * the row. Failure leaves the shell's default gear in place.
     * @param {() => string} getLabel - Current localized section label.
     * @returns {() => void} Observer disposer.
     */
    function installNavIcon(getLabel) {
      if (typeof document === 'undefined') return () => {}
      const labels = new Set([
        '通知提醒',
        '桌面通知',
        'Notification reminders',
        'Desktop notifications',
        'Notifications',
      ])
      const patch = () => {
        if (nativeIconActive) return
        const current = getLabel()
        if (typeof current === 'string' && current.length > 0) labels.add(current)
        const panel = document.querySelector('[data-shortcut-modal="settings"]')
        if (panel === null) return
        for (const button of panel.querySelectorAll('nav button')) {
          const label = button.querySelector('span')
          const text = label?.textContent?.trim() ?? ''
          if (!labels.has(text)) continue
          const icon = button.querySelector('svg')
          if (icon === null) continue
          if (icon.dataset.dtnBell !== 'true' || icon.querySelector('circle') === null) {
            icon.innerHTML = BELL_MARKUP
            icon.dataset.dtnBell = 'true'
          }
          icon.setAttribute('viewBox', '0 0 24 24')
          icon.setAttribute('fill', 'none')
          icon.setAttribute('stroke', 'currentColor')
          icon.setAttribute('stroke-width', '1.8')
          icon.setAttribute('stroke-linecap', 'round')
          icon.setAttribute('stroke-linejoin', 'round')
        }
      }
      let scheduled = false
      const schedule = () => {
        if (scheduled) return
        scheduled = true
        window.requestAnimationFrame(() => {
          scheduled = false
          patch()
        })
      }
      const observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })
      schedule()
      return () => observer.disconnect()
    }

    function newClientId() {
      try {
        return globalThis.crypto.randomUUID()
      } catch {
        return `dn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      }
    }

    /**
     * Fetch a JSON route from the Host.
     * @param {string} url - Relative route.
     * @param {{ method?: string, body?: object, keepalive?: boolean }} [options] - Fetch options.
     * @param {boolean} [quiet] - Do not throw on failure.
     * @returns {Promise<object>}
     */
    async function fetchJson(url, options = {}, quiet = false) {
      const method = options.method ?? 'GET'
      const response = await fetch(url, {
        method,
        keepalive: options.keepalive === true,
        headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) {
        if (quiet) return payload ?? { ok: false }
        throw new Error(payload?.message ?? `HTTP ${String(response.status)}`)
      }
      return payload ?? { ok: true }
    }

    /* ------------------------------------------------------------------ */
    /* Settings section                                                    */
    /* ------------------------------------------------------------------ */

    function NotificationsSection(props) {
      const { t, useForm, useFallbackForm } = props
      const primarySnapshot = useForm((value) => value)
      const fallbackSnapshot = useFallbackForm((value) => value)
      const useFallback = primarySnapshot?.status === 'unavailable'
      const snapshot = useFallback ? fallbackSnapshot : primarySnapshot
      const activeForm = useFallback ? props.fallbackForm : props.form
      const value = snapshot?.value ?? {}
      const writable = snapshot?.writable === true && snapshot?.status === 'ready'
      const formState = snapshot?.status ?? 'loading'
      const approval = value.approval ?? {}
      const events = value.events ?? {}
      const sound = value.sound ?? {}
      const windows = value.windows ?? {}
      const macos = value.macos ?? {}
      const presence = value.presence ?? {}
      const enabled = value.enabled !== false

      const [status, setStatus] = React.useState(null)
      const [statusError, setStatusError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [testState, setTestState] = React.useState('idle')
      const [testOutcome, setTestOutcome] = React.useState(null)
      const [windowsConfirm, setWindowsConfirm] = React.useState(false)
      const [advanced, setAdvanced] = React.useState(false)
      const [timeoutDraft, setTimeoutDraft] = React.useState(String(approval.timeoutSeconds ?? 30))
      const [fileDraft, setFileDraft] = React.useState(sound.file ?? '')
      const [systemNameDraft, setSystemNameDraft] = React.useState(sound.systemName ?? '')
      const [appIdDraft, setAppIdDraft] = React.useState(windows.appId ?? '')
      const [macosPathDraft, setMacosPathDraft] = React.useState(macos.customNotifierPath ?? '')
      const [idleDraft, setIdleDraft] = React.useState(String(presence.idleSeconds ?? 180))
      const pollRef = React.useRef(null)

      React.useEffect(() => () => {
        if (pollRef.current !== null) window.clearInterval(pollRef.current)
      }, [])

      React.useEffect(() => {
        setTimeoutDraft(String(approval.timeoutSeconds ?? 30))
      }, [approval.timeoutSeconds])
      React.useEffect(() => {
        setFileDraft(sound.file ?? '')
      }, [sound.file])
      React.useEffect(() => {
        setSystemNameDraft(sound.systemName ?? '')
      }, [sound.systemName])
      React.useEffect(() => {
        setAppIdDraft(windows.appId ?? '')
      }, [windows.appId])
      React.useEffect(() => {
        setMacosPathDraft(macos.customNotifierPath ?? '')
      }, [macos.customNotifierPath])
      React.useEffect(() => {
        setIdleDraft(String(presence.idleSeconds ?? 180))
      }, [presence.idleSeconds])

      const refreshStatus = React.useCallback(async () => {
        try {
          const next = await props.fetchStatus()
          setStatus(next)
          setStatusError(null)
          return next
        } catch (error) {
          setStatusError(error instanceof Error ? error.message : String(error))
          return null
        }
      }, [props.fetchStatus])

      React.useEffect(() => {
        void refreshStatus()
        // Mount-only probe; manual refreshes and test polling use the same callback.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      const flash = React.useCallback((message) => {
        setNotice(message)
        window.setTimeout(() => setNotice((current) => current === message ? null : current), 2600)
      }, [])

      const write = React.useCallback(async (path, nextValue) => {
        if (!writable) return false
        try {
          const accepted = await activeForm.mutate([{ op: 'set', path, value: nextValue }])
          flash(accepted ? t('saved') : t('saveFailed'))
          return accepted
        } catch {
          flash(t('saveFailed'))
          return false
        }
      }, [activeForm, writable, t, flash])

      const startTest = React.useCallback(async () => {
        setTestState('sending')
        setTestOutcome(null)
        try {
          await props.sendTest()
          setTestState('waiting')
          flash(t('testSent'))
        } catch (error) {
          setTestState('error')
          setTestOutcome(error instanceof Error ? error.message : String(error))
          return
        }
        if (pollRef.current !== null) window.clearInterval(pollRef.current)
        const started = Date.now()
        pollRef.current = window.setInterval(async () => {
          const next = await refreshStatus()
          if (next?.lastOutcome?.test === true && next.lastOutcome.at >= started - 2000) {
            setTestOutcome(next.lastOutcome)
            setTestState('done')
            window.clearInterval(pollRef.current)
            pollRef.current = null
          } else if (Date.now() - started > 30_000) {
            setTestState('timeout')
            window.clearInterval(pollRef.current)
            pollRef.current = null
          }
        }, 1000)
      }, [props.sendTest, refreshStatus, flash, t])

      const preview = React.useCallback(async (mode, file, systemName) => {
        try {
          const result = await props.previewSound(mode, file, systemName)
          flash(result.ok ? t('previewOk') : `${t('previewFailed')}: ${result.message ?? ''}`)
        } catch (error) {
          flash(`${t('previewFailed')}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }, [props.previewSound, flash, t])

      const repairWindows = React.useCallback(async () => {
        setWindowsConfirm(false)
        try {
          const result = await props.repairWindows()
          flash(result.ok ? t('registerWindowsDone') : `${t('registerWindowsFailed')}: ${result.error ?? ''}`)
          await refreshStatus()
        } catch (error) {
          flash(`${t('registerWindowsFailed')}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }, [props.repairWindows, flash, refreshStatus, t])

      if (snapshot === undefined) {
        return h('div', { className: 'dtn-root' }, h('p', { className: 'dtn-status' }, t('loading')))
      }

      return h('div', { className: 'dtn-root' }, [
        h('div', { className: 'dtn-header', key: 'header' }, [
          h('div', { className: 'dtn-title-row', key: 'title-row' }, [
            h(BellIcon, { key: 'bell', className: 'dtn-title-icon', size: 20 }),
            h('h2', { key: 'title' }, t('sectionTitle')),
          ]),
          h('p', { key: 'desc' }, t('sectionDesc')),
        ]),
        formState === 'loading' || formState === 'unavailable'
          ? h('p', {
              className: `dtn-status ${formState === 'unavailable' ? 'dtn-warn' : ''}`,
              key: 'form-state',
            }, formState === 'unavailable' ? t('unavailableForm') : t('loading'))
          : null,
        section(t('statusTitle'), 'status', [
          h('div', { className: 'dtn-row', key: 'platform' }, [
            h('div', { key: 'label' }, [
              h('div', { className: 'dtn-row-title', key: 't' }, `${t('platform')} · ${t('notifier')}`),
              h('div', { className: 'dtn-row-desc', key: 'd' }, status === null
                ? t('noStatus')
                : `${status.platform} · ${status.notifier?.available ? t('available') : `${t('unavailable')}: ${status.notifier?.error ?? ''}`}`),
            ]),
            h('div', { className: 'dtn-controls', key: 'controls' }, [
              h('button', { type: 'button', className: 'dtn-btn', onClick: () => { void refreshStatus() }, key: 'refresh' }, t('refresh')),
              h('button', { type: 'button', className: 'dtn-btn primary', onClick: () => { void startTest() }, key: 'test' }, t('sendTest')),
            ]),
          ]),
          h('div', { className: 'dtn-row', key: 'actions' }, [
            h('div', { key: 'label' }, [
              h('div', { className: 'dtn-row-title', key: 't' }, `${t('actions')} · ${t('soundMode')}`),
              h('div', { className: 'dtn-row-desc', key: 'd' }, `${status?.notifier?.actions ? t('actionsSupported') : t('actionsUnsupported')} · ${soundModeLabel(sound.mode, t)}`),
            ]),
            h('div', { className: 'dtn-controls', key: 'controls' }, [
              h('span', { className: `dtn-status ${status?.presence?.focused ? 'dtn-success' : ''}`, key: 'presence' },
                `${t('presence')}: ${status === null ? t('presenceUnknown') : status.presence?.focused ? t('presenceFocused') : t('presenceHidden')}`),
            ]),
          ]),
          status?.platform === 'win32'
            ? h('div', { className: 'dtn-row', key: 'windows' }, [
                h('div', { key: 'label' }, [
                  h('div', { className: 'dtn-row-title', key: 't' }, t('windowsIdentity')),
                  h('div', { className: 'dtn-row-desc dtn-mono', key: 'd' }, status?.windows?.appId ?? windows.appId ?? ''),
                ]),
                h('div', { className: 'dtn-controls', key: 'controls' }, windowsConfirm
                  ? [
                      h('button', { type: 'button', className: 'dtn-btn primary', key: 'yes', onClick: () => { void repairWindows() } }, t('confirm')),
                      h('button', { type: 'button', className: 'dtn-btn', key: 'no', onClick: () => setWindowsConfirm(false) }, t('cancel')),
                    ]
                  : [
                      h('button', { type: 'button', className: 'dtn-btn', key: 'open', onClick: () => { void props.openSystemSettings().catch(() => {}) } }, t('openSettings')),
                      h('button', { type: 'button', className: 'dtn-btn', key: 'fix', onClick: () => setWindowsConfirm(true) }, t('registerWindows')),
                    ]),
              ])
            : null,
          windowsConfirm
            ? h('div', { className: 'dtn-row', key: 'windows-warning' }, h('div', { className: 'dtn-status dtn-warn' }, t('registerWindowsConfirm')))
            : null,
          status?.platform === 'darwin'
            ? h('div', { className: 'dtn-row', key: 'macos' }, [
                h('div', { key: 'label' }, [
                  h('div', { className: 'dtn-row-title', key: 't' }, t('macosIdentity')),
                  h('div', { className: 'dtn-row-desc', key: 'd' }, t('macosCaveat')),
                ]),
                h('div', { className: 'dtn-controls', key: 'controls' }, h('button', {
                  type: 'button', className: 'dtn-btn', key: 'open',
                  onClick: () => { void props.openSystemSettings().catch(() => {}) },
                }, t('openSettings'))),
              ])
            : null,
          status?.platform === 'linux'
            ? h('div', { className: 'dtn-row', key: 'linux' }, [
                h('div', { key: 'label' }, [
                  h('div', { className: 'dtn-row-title', key: 't' }, t('linuxIdentity')),
                  h('div', { className: 'dtn-row-desc', key: 'd' }, status?.linux?.available
                    ? `notify-send ${status.linux.version ?? ''} · ${status.linux.actions ? t('actionsSupported') : t('actionsUnsupported')}`
                    : status?.linux?.error ?? t('linuxCaveat')),
                ]),
              ])
            : null,
          testState !== 'idle'
            ? h('div', { className: 'dtn-row', key: 'test-result' }, h('div', {
                className: `dtn-status ${testState === 'done' ? 'dtn-success' : testState === 'error' || testState === 'timeout' ? 'dtn-warn' : ''}`,
              }, testText(testState, testOutcome, t)))
            : null,
          statusError !== null
            ? h('div', { className: 'dtn-row', key: 'status-error' }, h('div', { className: 'dtn-status dtn-error' }, statusError))
            : null,
        ]),
        section(t('approvalGroup'), 'approval', [
          row(t('approvalEnabled'), t('approvalEnabledDesc'), h(Switch, {
            checked: approval.enabled !== false,
            disabled: !writable || !enabled,
            label: t('approvalEnabled'),
            onChange: (next) => { void write(['approval', 'enabled'], next) },
          })),
          row(t('onlyWhenHidden'), t('onlyWhenHiddenDesc'), h(Switch, {
            checked: approval.onlyWhenHidden !== false,
            disabled: !writable || !enabled,
            label: t('onlyWhenHidden'),
            onChange: (next) => { void write(['approval', 'onlyWhenHidden'], next) },
          })),
          row(t('timeout'), t('timeoutDesc'), h('input', {
            type: 'number',
            min: 5,
            max: 300,
            className: 'dtn-input',
            style: { width: '88px' },
            value: timeoutDraft,
            disabled: !writable || !enabled,
            onChange: (event) => setTimeoutDraft(event.target.value),
            onBlur: () => {
              const parsed = Number(timeoutDraft)
              const next = Number.isFinite(parsed) ? Math.min(300, Math.max(5, Math.round(parsed))) : 30
              setTimeoutDraft(String(next))
              if (next !== (approval.timeoutSeconds ?? 30)) void write(['approval', 'timeoutSeconds'], next)
            },
          })),
        ]),
        section(t('eventsGroup'), 'events', [
          row(t('question'), t('questionDesc'), h(Switch, {
            checked: events.question !== false,
            disabled: !writable || !enabled,
            label: t('question'),
            onChange: (next) => { void write(['events', 'question'], next) },
          })),
          row(t('turnEnd'), t('turnEndDesc'), h(Switch, {
            checked: events.turnEnd !== false,
            disabled: !writable || !enabled,
            label: t('turnEnd'),
            onChange: (next) => { void write(['events', 'turnEnd'], next) },
          })),
          row(t('errors'), t('errorsDesc'), h(Switch, {
            checked: events.errors !== false,
            disabled: !writable || !enabled,
            label: t('errors'),
            onChange: (next) => { void write(['events', 'errors'], next) },
          })),
          row(t('eventsHidden'), t('eventsHiddenDesc'), h(Switch, {
            checked: events.onlyWhenHidden !== false,
            disabled: !writable || !enabled,
            label: t('eventsHidden'),
            onChange: (next) => { void write(['events', 'onlyWhenHidden'], next) },
          })),
          row(t('idle'), t('idleDesc'), h('input', {
            type: 'number',
            min: 0,
            max: 3600,
            className: 'dtn-input',
            style: { width: '88px' },
            value: idleDraft,
            disabled: !writable || !enabled,
            onChange: (event) => setIdleDraft(event.target.value),
            onBlur: () => {
              const parsed = Number(idleDraft)
              const next = Number.isFinite(parsed) ? Math.min(3600, Math.max(0, Math.round(parsed))) : 180
              setIdleDraft(String(next))
              if (next !== (presence.idleSeconds ?? 180)) void write(['presence', 'idleSeconds'], next)
            },
          })),
        ]),
        section(t('soundGroup'), 'sound', [
          row(t('soundEnabledMode'), t('soundMode'), h('div', { className: 'dtn-controls' }, [
            h('select', {
              className: 'dtn-select',
              value: sound.mode ?? 'bundled',
              disabled: !writable || !enabled,
              key: 'select',
              onChange: (event) => {
                const mode = SOUND_MODES.includes(event.target.value) ? event.target.value : 'bundled'
                void write(['sound', 'mode'], mode)
              },
            }, [
              h('option', { value: 'system', key: 'system' }, t('soundSystem')),
              h('option', { value: 'bundled', key: 'bundled' }, t('soundBundled')),
              h('option', { value: 'custom', key: 'custom' }, t('soundCustom')),
              h('option', { value: 'none', key: 'none' }, t('soundNone')),
            ]),
            h('button', {
              type: 'button',
              className: 'dtn-btn',
              disabled: !writable,
              key: 'preview',
              onClick: () => { void preview(sound.mode ?? 'bundled', sound.file ?? '', sound.systemName ?? '') },
            }, t('preview')),
          ])),
          sound.mode === 'custom'
            ? row(t('soundFile'), t('soundFileDesc'), h('div', { className: 'dtn-controls' }, [
                h('input', {
                  type: 'text',
                  className: 'dtn-input',
                  style: { width: '300px' },
                  value: fileDraft,
                  disabled: !writable || !enabled,
                  placeholder: 'C:\\sounds\\notify.wav',
                  onChange: (event) => setFileDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') void write(['sound', 'file'], fileDraft.trim())
                  },
                }),
                h('button', {
                  type: 'button',
                  className: 'dtn-btn',
                  disabled: !writable || !enabled,
                  onClick: () => { void write(['sound', 'file'], fileDraft.trim()) },
                }, t('soundFileApply')),
              ]))
            : null,
          row(t('systemName'), t('systemNameDesc'), h('div', { className: 'dtn-controls' }, [
            h('input', {
              type: 'text',
              className: 'dtn-input',
              style: { width: '180px' },
              value: systemNameDraft,
              disabled: !writable || !enabled,
              placeholder: status?.platform === 'darwin' ? 'Bottle' : 'Notification.Default',
              onChange: (event) => setSystemNameDraft(event.target.value),
            }),
            h('button', {
              type: 'button',
              className: 'dtn-btn',
              disabled: !writable || !enabled,
              onClick: () => { void write(['sound', 'systemName'], systemNameDraft.trim()) },
            }, t('systemNameApply')),
          ])),
        ]),
        section(t('advancedGroup'), 'advanced', [
          h('div', { className: 'dtn-row', key: 'advanced-toggle' }, [
            h('div', { key: 'label' }, [
              h('div', { className: 'dtn-row-title', key: 't' }, t('advancedGroup')),
              h('div', { className: 'dtn-row-desc', key: 'd' }, t('windowsAppIdDesc')),
            ]),
            h('div', { className: 'dtn-controls', key: 'controls' }, h('button', {
              type: 'button', className: 'dtn-btn', onClick: () => setAdvanced((current) => !current),
            }, advanced ? t('collapse') : t('advancedGroup'))),
          ]),
          advanced
            ? row(t('windowsAppId'), t('windowsAppIdDesc'), h('div', { className: 'dtn-controls' }, [
                h('input', {
                  type: 'text',
                  className: 'dtn-input',
                  style: { width: '220px' },
                  value: appIdDraft,
                  disabled: !writable || !enabled,
                  onChange: (event) => setAppIdDraft(event.target.value),
                }),
                h('button', {
                  type: 'button', className: 'dtn-btn', disabled: !writable || !enabled,
                  onClick: () => { void write(['windows', 'appId'], appIdDraft.trim()) },
                }, t('systemNameApply')),
              ]))
            : null,
          advanced
            ? row(t('macosHelper'), t('macosHelperDesc'), h('div', { className: 'dtn-controls' }, [
                h('input', {
                  type: 'text',
                  className: 'dtn-input',
                  style: { width: '300px' },
                  value: macosPathDraft,
                  disabled: !writable || !enabled,
                  onChange: (event) => setMacosPathDraft(event.target.value),
                }),
                h('button', {
                  type: 'button', className: 'dtn-btn', disabled: !writable || !enabled,
                  onClick: () => { void write(['macos', 'customNotifierPath'], macosPathDraft.trim()) },
                }, t('systemNameApply')),
              ]))
            : null,
        ]),
        !writable
          ? h('p', { className: 'dtn-status dtn-warn', key: 'readonly' }, t('readonly'))
          : null,
        notice === null
          ? null
          : h('p', {
              className: `dtn-status ${notice === t('saveFailed') ? 'dtn-error' : 'dtn-success'}`,
              key: 'notice',
            }, notice),
      ].filter((node) => node !== null))
    }

    function section(title, key, children) {
      return h('section', { className: 'dtn-group', key }, [
        h('div', { className: 'dtn-group-title', key: 'title' }, title),
        ...children.filter((node) => node !== null),
      ])
    }

    function row(title, description, control) {
      return h('div', { className: 'dtn-row', key: title }, [
        h('div', { key: 'text' }, [
          h('div', { className: 'dtn-row-title', key: 'title' }, title),
          h('div', { className: 'dtn-row-desc', key: 'desc' }, description),
        ]),
        h('div', { className: 'dtn-controls', key: 'control' }, control),
      ])
    }

    function Switch({ checked, disabled, label, onChange }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': label,
        disabled,
        className: 'dtn-switch',
        onClick: () => onChange(checked !== true),
      }, h('span', { className: 'dtn-switch-thumb' }))
    }

    function soundModeLabel(mode, t) {
      if (mode === 'system') return t('soundSystem')
      if (mode === 'custom') return t('soundCustom')
      if (mode === 'none') return t('soundNone')
      return t('soundBundled')
    }

    function testText(state, outcome, t) {
      if (state === 'sending') return t('testWaiting')
      if (state === 'waiting') return t('testWaiting')
      if (state === 'timeout') return t('testTimeout')
      if (state === 'error') return `${t('testError')}: ${outcome ?? ''}`
      if (outcome === null || outcome === undefined) return t('testWaiting')
      if (outcome.reason === 'timeout') return t('testTimeout')
      if (outcome.reason === 'error') return `${t('testError')}: ${outcome.error ?? ''}`
      if (outcome.reason === 'action' || outcome.reason === 'click') {
        return `${t('testReceived')}: ${outcome.label ?? outcome.reason}`
      }
      return `${t('testReceived')}: ${outcome.reason}`
    }

    return { inject, apply }
  },
})

/** Inject the plugin's stylesheet once per page and return its disposer. */
function installStyles() {
  const tagId = 'dsh-desktop-notify/styles'
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-desktop-notify'
  style.dataset.pluginCss = tagId
  style.textContent = `
.dtn-root{display:flex;flex-direction:column;gap:20px;padding:4px 0 32px}
.dtn-header h2{margin:0;font-size:18px;line-height:26px;color:var(--dsw-alias-label-primary)}
.dtn-title-row{display:flex;align-items:center;gap:8px}
.dtn-title-icon{flex-shrink:0;color:var(--dsw-alias-brand-primary)}
.dtn-header p{margin:6px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dtn-group{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dtn-group-title{padding:12px 16px 4px;font-size:12px;line-height:18px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dtn-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 16px;border-top:1px solid var(--dsw-alias-border-l1)}
.dtn-group-title+.dtn-row{border-top:none}
.dtn-row-title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dtn-row-desc{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dtn-controls{display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.dtn-switch{position:relative;width:36px;height:20px;flex-shrink:0;border:none;border-radius:999px;background:var(--dsw-alias-border-l2);cursor:pointer;padding:0;transition:background .15s}
.dtn-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.dtn-switch:disabled{opacity:.5;cursor:not-allowed}
.dtn-switch-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.dtn-switch[aria-checked="true"] .dtn-switch-thumb{transform:translateX(16px)}
.dtn-input,.dtn-select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:6px 8px;font-size:13px;line-height:18px}
.dtn-input:focus,.dtn-select:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dtn-input:disabled,.dtn-select:disabled{opacity:.55}
.dtn-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);padding:6px 12px;font-size:13px;line-height:18px;cursor:pointer}
.dtn-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}
.dtn-btn.primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:#fff}
.dtn-btn:disabled{opacity:.5;cursor:not-allowed}
.dtn-status{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.dtn-error{color:var(--dsw-alias-state-error-primary)}
.dtn-success{color:var(--dsw-alias-state-success-primary)}
.dtn-warn{color:var(--dsw-alias-state-warn-primary)}
.dtn-mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}
`
  document.head.appendChild(style)
  return () => {
    style.remove()
  }
}
