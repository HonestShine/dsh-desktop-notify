# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Chinese translation: [docs/CHANGELOG.zh-CN.md](docs/CHANGELOG.zh-CN.md).

## [0.2.4] - 2026-11-25

### Removed

- **Unread badge and message counts**: removed the Host-side unread set, the `unread` / `badge` fields from `/status`, unread bookkeeping for approvals and reminders, client-side `setAppBadge` / `clearAppBadge` synchronization, and the "Unread badge" group in the settings page.
- **Tray integration scaffolding**: removed the `window.dshDesktop.setAttention` branch; the plugin no longer attempts to control the DSH core tray or blink it.

### Changed

- Notifications, the approval waterfall, `dshnotify:` callback, sounds, presence, diagnostics, and platform logic are unchanged.
- README / Chinese README no longer advertise badges, tray status, or message counts.

## [0.2.3] - 2026-11-21

### Added

- **Turn-end reasons and reply summary**: listens to `session/event` `turn/end` and `assistant/message`; completion reminders distinguish `completed` / `blocked` / `max-tokens` / `aborted` / `interrupted` / `error`; completion reminders include a flattened summary of the last reply (≤110 characters) and the elapsed time. Falls back to the generic 0.2.1 copy when `session/event` is unavailable.
- **Diagnostics surface**: bounded 40-entry decision ring; `GET /desktop-notify/debug` returns status, decisions, turn cache, unread set, and active sound count; `POST /desktop-notify/report` for client reports; `POST /desktop-notify/silence` stops active sounds immediately.
- **Sound governance**: `SoundPlayer` tracks playing child processes with an 8-second cap; stops immediately on window refocus, disable, or mute; cleans up on plugin unload.
- **Click grace period**: a 400 ms grace window after approval timeout so button clicks at the timeout boundary are still accepted instead of dropped.
- **Windows identity prewarm**: resolves the AUMID and protocol in the background 1.5 seconds after startup, reducing cold-start latency for the first approval notification.

### Changed

- **Session-level unread**: the badge number means "number of sessions with pending reminders"; multiple reminders in one session count once; test notifications from the settings page no longer count toward the badge.
- **Question dedupe**: changed from a 2-second global slot to a 5-second window keyed by "session + first 40 characters of the question summary"; concurrent questions in two sessions no longer swallow each other, and a single question from both waterfall/PTC sources still notifies only once.
- **Window-return race**: approvals always participate in the `whenPresent()` race, with a new cancellable waiter; notifications can now be withdrawn even when the window opens without a live client.
- **On-demand polling**: the Windows rendezvous directory is polled every 300 ms only while pending buttons exist, and stops when idle; the badge syncs every 5 seconds only while the window is hidden/unfocused, and clears locally and stops requesting when focused.
- **Copy budget**: title 48 characters, body 120 characters, reducing Windows toast truncation on the system side.

### Fixed

- **Duplicate completion after error**: `idle` within 5 seconds after `agent/error` no longer appends a "reply complete" reminder; `agentErrorAt` is now actually used for gating instead of being write-only.
- **Test notifications polluting the badge**: test notifications no longer increase the unread count; the settings page still shows results via `lastOutcome.test`.
- **Session disposal cleanup**: `agent/disposed` now also clears the turn cache, timers, and unread entries.

### Compatibility

- **Platform convergence**: only Windows and macOS are supported for the DeepSeek Harness desktop app; removed Linux `notify-send` / `paplay` / `canberra-gtk-play` / `aplay` code paths and docs; non-Windows/macOS platforms return "unsupported". DSH Web is not a target.
- Versions before 0.2.3 included a Linux branch; it is no longer maintained since 0.2.3.
- No new runtime dependencies; still pure ESM JavaScript; Node range unchanged.
- If the Host does not forward `session/event` to plugins, the turn-end reason cache stays empty and reminders fall back to 0.2.1 copy and behavior.
- Config changes still reload the Host plugin (see "Known limitations" in the README); if an approval is in progress while changing settings, the notification is closed and the panel is restored.

## [0.2.2] - 2026-11-21

### Added

- Declared the host version requirement in `package.json` as `engines.dsh: >=0.2.0-rc.2 <0.3.0-0`; the plugin market now displays the DSH version requirement (previously "host requirement not declared").

### Documentation

- README / Chinese README document the `engines.dsh` declaration.

## [0.2.1] - 2026-11-19

### Compatibility

- Adapted to DSH `0.2.2-rc.5`: this release only optimizes search behavior (DeepSeek models use server-side search with no per-search charge); the plugin-facing settings/approval/question/typert/connection interface files were compared item by item and are identical to rc.4, so no plugin code changes were required.
- `0.2.2-rc.5` still ships `@deepseek-ai/cordis 4.1.0` and `@deepseek-ai/schemastery 3.19.0`, covered by the existing peer ranges `^4.0.0` / `^3.18.0`.

## [0.2.0] - 2026-11-19

### Added

- **Unread badge**: each reminder increments an unread counter; the client syncs it to the app badge every 5 seconds (Windows taskbar / macOS Dock) and clears it when the window returns to the foreground; automatically skipped when the renderer lacks `navigator.setAppBadge`. The status API adds an `unread` field.
- **Programmatic question reminders**: `ask_user_question` called inside `run_code` does not emit `user-questions/request` (verified); added listeners for `tool/ptc-dispatch-start` / `tool/ptc-dispatch` to cover these reminders. Both paths share a 2-second dedupe slot to avoid duplicate notifications.
- **Multiple Windows notification identity candidates**: `windows.appId` accepts semicolon-separated candidates and adds the `DSH_NOTIFY_AUMIDS` environment variable; candidates are tried in the order "config → environment variable → shortcut → built-in fallback" and validated via `CreateToastNotifier(id).Setting` to check whether the system has registered them. The status API adds `appIdValidated` and the candidate list.

### Fixed

- **PowerShell absolute path**: `lib/winrt.js` used the bare name `powershell.exe` (PATH-dependent); when PATH was trimmed or hijacked, toasts failed silently with exit code 0. It now prefers `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`, consistent with `wscript.exe` in the same file.
- **Delivery failures are no longer silent**: transport failures resolve `{ reason: 'error' }` instead of rejecting, but the reminder path only handled rejections, so failures were swallowed. They now record `lastOutcome` and log.
- **Test notifications counted as unread**: the settings page's "Send test notification" now increments the unread counter like other reminders, keeping badge statistics consistent.

### Documentation

- README / Chinese README document the unread badge, programmatic question reminders, the notification identity candidate chain, and the platform support table.
- Added `docs/research/competitor-notify-plugins.md`: benchmarking of two similar plugins and an inspiration list.

## [0.1.3] - 2026-11-18

### Compatibility

- Adapted to DSH `0.2.2-rc.4`: a bugfix release (model abnormal-response handling, LiveShare desktop sharing creation); the plugin-facing interface files (settings/approval/question/typert/connection) are identical to rc.3, so no plugin code changes were required.
- `0.2.2-rc.4` still ships `@deepseek-ai/cordis 4.1.0` and `@deepseek-ai/schemastery 3.19.0`, covered by the existing peer ranges `^4.0.0` / `^3.18.0`.

## [0.1.2] - 2026-11-16

### Compatibility

- Adapted to DSH `0.2.2-rc.2` / `0.2.2-rc.3`: reviewed the approval/question/settings/typert/connection interfaces; only backward-compatible changes (`settings.section`'s `openSettings` gains an optional `sectionId`, the `ui-approval` slot gains an optional `warning` field, user-questions relaxes historical fork questions), so no plugin code changes were required.
- Confirmed `0.2.2-rc.3` ships `@deepseek-ai/cordis 4.1.0` and `@deepseek-ai/schemastery 3.19.0`, covered by the existing peer ranges `^4.0.0` / `^3.18.0`.

### Changed

- Renamed the package to `@honorshine/dsh-desktop-notify` and published it to npm (scoped, public access); module ids in `cordis.patch.yml` and `client.js` were updated accordingly; `package.json` gains `main`, `publishConfig.access`, and drops `private`.

### Documentation

- README split into the English entry `README.md` and the Chinese introduction `docs/README.zh-CN.md`; introduction docs now live under `docs/`.
- Added plugin market images `screenshots.json` and `docs/screenshots/{toast,settings}.png`.

## [0.1.1] - 2026-11-07

### Added

- **Interaction cue**: permission confirmations (`approval/request`) and questions/plan inquiries (`user-questions/request`) play an independent cue sound, configured separately from the notification sound (`bundled` / `custom` / `none`, with preview). It **ignores window focus** and plays even when the window is in the foreground showing the in-app approval panel; identical cues are deduped within 800 ms and the notification sound for that interaction toast is muted to avoid double beeps. The bundled `assets/alert.wav` is a three-note rising chime, clearly different from the notification sound (two-note bell).
- Settings page gains an "Interaction cue" group; new `POST /desktop-notify/preview-attention` preview endpoint.

### Changed

- **Notification service lifecycle**: the plugin registers the `dshnotify:` protocol on load/enable (each instance's nonce is written at registration), and automatically unregisters it and cleans the `%LOCALAPPDATA%\dsh-desktop-notify` polling directory on disable or uninstall; when the plugin reloads, the old instance's unregistration is skipped due to the nonce mismatch, so it never deletes the new instance's registration. The settings page's "Repair notification button protocol" remains.
- The installation section now covers the two DSH ecosystem methods: local directory / archive (`dsh plugin --profile web add link:...`, `file:...`, including the Release tarball), and direct install from GitHub (`dsh plugin --profile web add github:HonestShine/dsh-desktop-notify`).

### Fixed

- **Windows notification identity**: the notification header previously showed the raw AUMID (`com.deepseek.dsh`) and the default icon instead of the app name and icon. `assets/resolve-aumid.ps1` now reads the AppUserModelID of the registered `DeepSeek Harness.lnk` from the Start Menu, so the header shows **DeepSeek Harness**; the toast XML also carries the install directory's `resources/icon.png` as `appLogoOverride`, ensuring the whale icon appears in the notification. `windows.appId` now defaults to empty (auto-detect) and only needs a manual override when auto-detection fails.
- `WinRtNotifier.close()` now closes toasts using the resolved AUMID (previously it used the configured `windows.appId`, which could not close displayed notifications when it was empty for auto-detect).

## [0.1.0] - 2026-11-07

First public release. Adapted to DeepSeek Harness `0.2.0-rc.2` / `0.2.1-rc.x` / `0.2.2-rc.1`. Linux support present in this historical release was removed in 0.2.3 (see the 0.2.3 compatibility notes).

### Added

- **Native desktop notifications**: Windows uses WinRT Toast (PowerShell), macOS uses terminal-notifier, Linux uses `notify-send`.
- **In-notification approval buttons**: permission notifications carry "Deny" / "Allow once", which feed the result back into the Host's `approval/request` waterfall via the Windows custom protocol `dshnotify:` + VBS rendezvous JSON.
- **Foreground fallback**: when the window is in the foreground, the user switches back to the foreground, or the notification times out, the DSH native approval panel is restored automatically.
- **Event reminders**: questions (`user-questions/request`), task completion (root session `running → idle`), and session errors (`agent/error`, 2-second dedupe); each of the three can be toggled separately and restricted to background only.
- **Away detection**: if the window is in the foreground but there is no keyboard/mouse input for longer than `presence.idleSeconds` (default 180 seconds, 0 disables), it is treated as away.
- **Session title**: the notification body prefers the session title, falling back to the working directory name.
- **Settings page**: 0.2.0/0.2.1 add a bell icon to the "Notification reminders" entry via a DOM patch; 0.2.2+ uses the native `settings.section.icon`, falling back silently to the default gear on failure.
- **Notification sounds**: `system` / `bundled` / `custom` / `none` modes with preview; bundled original chime `assets/notify.wav`.
- **Reusable service**: the Host registers `ctx.desktopNotify`; other plugins can call `show()` to display notifications with buttons.
- **Windows protocol repair**: the settings page can re-register the `dshnotify:` protocol and open system notification settings after confirmation.

### Security

- The `token` and `decision` returned by the `dshnotify:` protocol are validated in two layers, `assets/activate.vbs` and `lib/winrt.js`: the token must be a UUID generated by this plugin and the decision must match the protocol-safe charset, so constructed URIs cannot use the token path to traverse or overwrite files outside the rendezvous directory.

### Compatibility

- Peer dependencies relaxed to `@deepseek-ai/cordis ^4.0.0` and `@deepseek-ai/schemastery ^3.18.0`, compatible with both 0.2.0's cordis `~4.0.4` / schemastery `~3.18.4` and 0.2.2's cordis `~4.1.0` / schemastery `~3.19.0`.
- `displayReason` handles the 0.2.x `{ en, zh, ... }` localized object and follows the UI language.
- `configForms` is now an optional injection: without it, notifications, approvals, and presence still work; only the settings page is not shown.

### Known limitations

- macOS notification identity shows terminal-notifier (node-notifier limitation).
- Windows custom audio supports `.wav` only; button callbacks depend on the Host process staying alive.
- Linux in-notification buttons require libnotify 0.7.10+ and a notification daemon that supports actions.
- Notifications are not re-sent after the app is closed.

[0.1.0]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.1.0
[0.1.1]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.1.1
[0.1.2]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.1.2
[0.1.3]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.1.3
[0.2.0]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.2.0
[0.2.1]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.2.1
[0.2.2]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.2.2
[0.2.3]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.2.3
[0.2.4]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.2.4
