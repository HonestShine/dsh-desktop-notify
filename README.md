# dsh-desktop-notify

English | [中文](docs/README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/HonestShine/dsh-desktop-notify)](https://github.com/HonestShine/dsh-desktop-notify/releases)
[![npm](https://img.shields.io/npm/v/@honorshine/dsh-desktop-notify)](https://www.npmjs.com/package/@honorshine/dsh-desktop-notify)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Native desktop notifications for DeepSeek Harness: permission requests can be answered directly from the system notification (Reject / Allow once), and turn completion, questions and errors can raise reminders; notification sounds support system sounds, a built-in chime, custom audio and silence.

## Features

- **Cross-platform native notifications**: Windows (WinRT toast + `dshnotify:` protocol callback), macOS (terminal-notifier), Linux (`notify-send`).
- **Inline notification buttons**: permission notifications carry Reject and Allow once; clicking returns the decision to the Host's `approval/request` waterfall.
- **Foreground fallback**: by default the plugin takes over only while the window is not focused; when the window is focused, the user returns, or the notification times out, the request falls back to DSH's native approval panel.
- **Other reminders**: questions, turn completion and session errors; each switchable and optionally limited to the background.
- **Away detection**: a focused window with no keyboard or pointer input for the configured number of seconds counts as away (default 180 s, 0 disables).
- **Session titles**: notification bodies prefer the session title and fall back to the working directory name.
- **Bell entry**: the Notifications settings section uses a bell icon (0.2.2+ uses the native `settings.section.icon`; 0.2.0/0.2.1 use a DOM patch that silently falls back to the default gear if the structure changes).
- **Custom notification sound**: `system` / `bundled` / `custom` / `none`, previewable in settings.
- **Interaction cue**: approvals and questions (including plan prompts) play a separate cue, **configured independently from the notification sound** and **regardless of window focus** — it plays even while the window is focused; also supports `bundled` / `custom` / `none` and preview.
- **Reusable service**: the Host registers `ctx.desktopNotify`; other plugins can call `show()` to display a notification with buttons.
- **Windows notification identity**: automatically reads the AppUserModelID of the installed `DeepSeek Harness.lnk`, so the toast header shows "DeepSeek Harness" and the application icon; falls back to a manually configured AUMID only when detection fails.
- **Windows protocol repair**: the settings page can re-register the `dshnotify:` protocol and open the system notification settings after confirmation.

## Platform support

| Capability | Windows | macOS | Linux |
|---|---|---|---|
| Notification display | WinRT toast (PowerShell) | terminal-notifier | `notify-send` |
| Inline buttons | Yes (`dshnotify:` protocol + VBS) | Yes | needs libnotify 0.7.10+ and a daemon with actions |
| Click callback | VBS writes a rendezvous JSON | stdout | `notify-send -A` |
| System sound | toast `<audio ms-winsoundevent:...>` | system sound names (Bottle, etc.) | `canberra-gtk-play`, best effort |
| Custom audio | **WAV only** (`SoundPlayer`) | formats supported by `afplay` | `paplay` / `canberra-gtk-play` / `aplay` |
| Notification identity | `DeepSeek Harness` (reuses the installer shortcut) + app icon | terminal-notifier (platform limitation) | app-name + icon |
| Interaction cue | Yes (`SoundPlayer` plays a built-in/custom WAV) | `afplay` | `paplay` / `canberra-gtk-play` / `aplay` |

> On macOS notifications appear as **terminal-notifier**, not DeepSeek Harness. This is a known limitation of node-notifier/terminal-notifier 3 (sender/icon cannot be set). Buttons, sounds and click callbacks still work. For full branding you can build your own terminal-notifier (`make icon ICON=... APP_NAME=...`) and set it under Settings → Advanced → macOS custom notifier path.

## DSH compatibility

DSH currently ships as release candidates (`0.2.0-rc.x`, `0.2.1-rc.x`, `0.2.2-rc.x`); this plugin was audited and adapted against **0.2.0-rc.2 / 0.2.1-rc.5 / 0.2.2-rc.1**, covering the intermediate RCs of 0.2.0/0.2.1/0.2.2.

| DSH | Settings nav icon | Config form | Notifications/approvals |
|---|---|---|---|
| 0.2.2-rc.1 | native `settings.section.icon` | `configForms` + `volatile` fields | unchanged |
| 0.2.1-rc.5 / 0.2.1-rc.4 | DOM patch | `configForms` + `volatile` fields | unchanged |
| 0.2.0-rc.2 | DOM patch | `configForms` + `volatile` fields | unchanged |

Adaptation notes:

- Peer ranges were widened to `@deepseek-ai/cordis ^4.0.0` and `@deepseek-ai/schemastery ^3.18.0`, covering cordis `~4.0.4` / schemastery `~3.18.4` in 0.2.0 and cordis `~4.1.0` / schemastery `~3.19.0` in 0.2.2.
- `approval/request` and its result vocabulary, `user-questions/request`, `agent/status|error|disposed`, `sessionTitle.get`, `connection.requestRejection`, `typertGateway.hasLiveClient`, `configForms.get/mutate/whileServed`, `settings.section` and volatile form filtering were checked against all three versions.
- `displayReason` is a localized `{ en, zh, ... }` object in 0.2.x (not a string); the plugin picks the value for the current UI language.
- 0.2.2 adds the `settings.section.icon` slot; 0.2.0/0.2.1 do not have it, so the plugin falls back to its DOM patch and all three versions show the bell.
- `configForms` is injected optionally: when a composition does not provide it, notifications, approvals and presence keep working; only the settings page is absent.

## Install

Two options; pick one. Afterwards restart `dsh web` (or fully quit and reopen the desktop app), then press F5 in the browser; the configuration page appears under **Settings → Notifications**.

### Option A: a complete resource bundle (local directory / archive) (recommended)

Use this when someone handed you a zip, or you already have an extracted plugin directory (it should contain `package.json`, `cordis.patch.yml`, `lib/`, `assets/`, `README.md`).

```powershell
# 1) Extract to a stable directory you will not move or delete afterwards
#    (never a temp/download directory). Example: D:\Plugins\dsh-desktop-notify
#    Install the layer that contains package.json; do not nest another
#    same-named directory.

# 2) Make sure the key files are present (missing assets/ means no icon/sound)
Test-Path "D:\Plugins\dsh-desktop-notify\package.json",
          "D:\Plugins\dsh-desktop-notify\cordis.patch.yml",
          "D:\Plugins\dsh-desktop-notify\lib\winrt.js",
          "D:\Plugins\dsh-desktop-notify\assets\notify.wav"

# 3) Remove a previous installation of the same plugin to avoid version conflicts
dsh plugin --profile web remove dsh-desktop-notify

# 4) Install using the absolute path (quote paths that contain spaces)
dsh plugin --profile web add link:D:\Plugins\dsh-desktop-notify
```

Notes:

- `link:` is a symlink install: edits in the source directory take effect immediately, but the directory must not be moved or renamed afterwards; if it is, run `add` again.
- If the local directory has no `node_modules`, run `pnpm install` in it before a `link:` install (macOS/Linux need `node-notifier` for terminal-notifier / notify-send; Windows uses WinRT and usually works without it).
- To install a copy instead: `dsh plugin --profile web add file:D:\Plugins\dsh-desktop-notify` (pnpm installs dependencies too; later changes in the source directory are not picked up and require another `add`).
- The `dsh-desktop-notify-<version>.tgz` from the Releases page can also be installed directly: `dsh plugin --profile web add file:D:\Downloads\dsh-desktop-notify-<version>.tgz`.

### Option B: install straight from GitHub

No local clone required, one command:

```powershell
dsh plugin --profile web add github:HonestShine/dsh-desktop-notify
```

- To pin a release: `dsh plugin --profile web add github:HonestShine/dsh-desktop-notify#v0.1.1`
- pnpm records the dependency as `github:HonestShine/dsh-desktop-notify#<commit sha>`; `dsh plugin` automatically adds packages that declare `dsh.bundle` to the profile's `dsh.profile.bundles`, so `cordis.patch.yml` does not need manual edits.
- The plugin has no build scripts; pnpm's `prepare` only installs dependencies (`node-notifier`), so the `allowBuilds` prompt normally does not appear.
- Requires Node.js `^22.22.2 || ^24.15.0 || >=26.0.0` (the `node-notifier@12` engine requirement, declared under `engines` in `package.json`).

### Option C: install from npm

The package is published as `@honorshine/dsh-desktop-notify`; a prebuilt install skips the build-approval step:

```powershell
dsh plugin --profile web add @honorshine/dsh-desktop-notify
```

- To pin a version: `dsh plugin --profile web add @honorshine/dsh-desktop-notify@0.1.1`
- The npm package's `repository` field points back at this repository, so storefronts can link the two automatically.

### Notes

- The commands above use the `web` profile (the one `dsh web` boots). The desktop (Electron) `desktop` profile is managed by the application itself; the CLI rejects `--profile desktop`, so use the app's built-in `plugin_manager` to install the same directory or tarball.
- **Notification service lifecycle**: on load/enable the plugin registers the `dshnotify:` protocol (registry `HKCU\Software\Classes\dshnotify`, with a per-instance nonce); on disable or uninstall it unregisters the protocol and cleans the `%LOCALAPPDATA%\dsh-desktop-notify` polling directory. A plugin reload skips the unregistration of the old instance (nonce mismatch), so a fresh registration is never deleted.
- Uninstall: `dsh plugin --profile web remove dsh-desktop-notify` (the protocol is unregistered on disable/uninstall; no manual registry cleanup).
- The plugin writes into a profile and affects every session in it; disabling/uninstalling restores the native behavior.
- If the settings page does not appear after the first install, restart `dsh web` and press F5 again.

## Usage

### Permission approvals

1. Move focus away from the window (switch to another app or minimize it).
2. Trigger a tool action that needs approval.
3. The system notification shows Reject / Allow once; clicking either continues or rejects the tool immediately.
4. If you switch back to the DSH window, the notification is closed and the in-app approval panel takes over.

While the window is focused no notification appears and the native panel is used; the **interaction cue still plays** (see Sound below).

### Other reminders

- **Question reminder**: fires when the agent calls `ask_user_question`; the notification does not take over the Q&A, and clicking the body focuses the app.
- **Turn completion**: fires on the root session's `running → idle` transition.
- **Error reminder**: fires on the root session's `agent/error`; identical errors are deduplicated within 2 seconds.

### Sound

The plugin has two kinds of sound, configured separately.

**Notification sound** (turn completion / error reminders / notifications with callback buttons) is selected under Settings → Notifications → Notification sound:

- **System sound**: Windows uses `Notification.Default` (a system sound name can be set in the Notification sound group); macOS uses Bottle; Linux tries `canberra-gtk-play`.
- **Built-in chime**: `assets/notify.wav`, an original two-tone chime played through the platform player.
- **Custom audio file**: an absolute path. Windows only supports `.wav`; macOS/Linux depend on the system player.
- **Silent**: no sound.

**Interaction cue** (approvals, questions/plan prompts and other interactions that need your reply) is configured separately in the Interaction cue group:

- By default plays the built-in `assets/alert.wav` (three rising short notes), clearly different from the notification chime;
- `custom` accepts a custom `.wav`; `none` silences it;
- **Not limited by window focus**: it also plays while the window is focused and the in-app approval panel is shown (the key difference from the notification sound);
- The same prompt rings at most once per 800 ms, so an approval and a question arriving together do not stack; on Windows the interaction toast is muted at the same time to avoid a double sound.

The Preview button plays the current mode once.

## Configuration

The configuration lives in the profile's `cordis.patch.yml` (written by the settings page), with entry id `desktop-notify`:

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Plugin master switch |
| `approval.enabled` | `true` | Take over permission approval notifications |
| `approval.onlyWhenHidden` | `true` | Take over only while the window is not focused |
| `approval.timeoutSeconds` | `30` | Notification wait limit (5–300) |
| `events.question` | `true` | Question reminder |
| `events.turnEnd` | `true` | Turn-completion reminder |
| `events.errors` | `true` | Error reminder |
| `events.onlyWhenHidden` | `true` | Reminders only in the background |
| `sound.mode` | `bundled` | `system` / `bundled` / `custom` / `none` |
| `sound.file` | `""` | Absolute path to custom audio |
| `sound.systemName` | `""` | Windows/macOS system sound name override |
| `attention.enabled` | `true` | Play the interaction cue on approvals/questions (also while focused) |
| `attention.mode` | `bundled` | Interaction cue source: `bundled` / `custom` / `none` |
| `attention.file` | `""` | Absolute path to a custom interaction cue |
| `windows.appId` | `""` | Optional manual Windows AppUserModelID; empty auto-reads the registered `DeepSeek Harness.lnk` |
| `windows.duration` | `long` | Windows toast display time (`short` / `long`); Windows may ignore it for toasts with buttons |
| `macos.customNotifierPath` | `""` | Optional custom terminal-notifier |
| `presence.staleSeconds` | `120` | Presence report expiry |
| `presence.idleSeconds` | `180` | Treat a focused window without input as away after this many seconds; 0 disables |

## Troubleshooting

### Windows notifications missing or buttons unresponsive

1. Open **Settings → System → Notifications** and make sure both the notification master switch and DeepSeek Harness notifications are on, and that Focus assist / Do not disturb is not blocking them.
2. The notification header should show **DeepSeek Harness** and the app icon. The plugin automatically reads the AppUserModelID of `DeepSeek Harness.lnk` in the Start Menu (created by the installer); if it shows the raw AUMID or the wrong icon, verify that shortcut exists, or set an AppUserModelID override under **Settings → Notifications → Advanced → Windows notification identity**.
3. Normally the plugin registers `dshnotify:` on load (and unregisters it on disable/uninstall); if buttons stop working, use "Repair notification button protocol" in the plugin settings to re-register. The registration lives under `HKCU\Software\Classes\dshnotify` and points at the plugin's `assets/activate.vbs`.
4. Clicking a button starts `wscript.exe`, which writes a JSON file into `%LOCALAPPDATA%\dsh-desktop-notify\actions`; the Host polls that directory. If no new file appears, check whether Windows blocks `wscript.exe` or security software blocks the custom protocol.
5. System sounds are played by the toast's `<audio ms-winsoundevent:...>`; built-in/custom sounds are played by `SoundPlayer`. If neither plays, check the system notification sound settings.

> Windows button callbacks depend on the Host process being alive; after the app quits, buttons in historical notifications are no longer processed. The protocol registration is written to the current-user registry and needs no administrator rights.

### macOS

- The first notification asks for system permission; allow it under **System Settings → Notifications → terminal-notifier**.
- The notification identity is terminal-notifier (see above).
- A custom notifier path must point to an executable terminal-notifier.

### Linux

- Requires `notify-send` (`libnotify-bin`) and a notification daemon with action support; buttons need `notify-send --version` ≥ 0.7.10.
- Without action support the plugin falls back to the in-app approval panel; the status page says so.
- A custom sound needs at least one of `paplay`, `canberra-gtk-play` or `aplay`.

## Architecture

- **Host plugin** (`index.js`): registers the Cordis Service `desktopNotify`; listens for `approval/request` (`prepend + global`), `user-questions/request`, `agent/status` and `agent/error`; Windows uses `lib/winrt.js` (WinRT toast + protocol callback + `assets/resolve-aumid.ps1` for the notification identity), macOS/Linux use `lib/notifier.js` (node-notifier); `lib/sound.js` plays the notification sound and the interaction cue (two independent `SoundPlayer` instances); `lib/presence.js` tracks multi-window focus. The interaction cue plays when `approval/request` and `user-questions/request` arrive, without checking focus.
- **Client plugin** (`client.js`): always reports window focus, idle time and locale; registers the settings page under `settings.section`, reads and writes Host configuration through `ctx.configForms.get('desktop-notify')`, and uses same-origin `/desktop-notify/*` routes for testing, preview, status and Windows protocol repair. 0.2.2+ registers the native `settings.section.icon`; 0.2.0/0.2.1 use a DOM patch (`data-shortcut-modal="settings"` + a label `<span>`) and keep the shell's default gear if it fails.
- **HTTP routes**: `/desktop-notify/status|presence|test|preview-sound|preview-attention|open-notification-settings|repair-windows`, all gated by `ctx.connection.requestRejection(req)`, JSON body limited to 16 KiB.
- **Windows action flow**: `assets/winrt-toast.ps1` shows the toast; clicking `<action activationType="protocol" arguments="dshnotify:?token=...&decision=...">` makes `assets/activate.vbs` write a rendezvous file; the Host polls every 300 ms and resolves the approval by token.
- **Approval coordination**: pending approvals are delegated back to the native panel only while an active Client exists; without a Client the notification buttons are required, with a hard 2-minute cap that closes them as `unavailable`.
- **No DSH core changes**: `app.asar`, Electron main/preload are untouched and no IPC is added.

## Development

```powershell
pnpm install
node --check index.js
node --check client.js
node test/unit.test.js          # run node:test directly (do not use --test spawn under a sandbox)
node scripts/winrt-probe.mjs 300   # Windows: real WinRT toast + protocol button callback
node scripts/notify-probe.mjs 300  # macOS/Linux: node-notifier probe
node scripts/make-chime.mjs        # regenerate assets/notify.wav and assets/alert.wav
```

> Both probes wait for you to click a button; under the restricted DSH sandbox child processes / named pipes may be blocked, so run them in a normal terminal or an elevated sandbox. The Host process is not affected by that sandbox at runtime. Disable the plugin before running `winrt-probe.mjs` so its watcher does not consume the callback file first.

## Inspiration

The bell icon, idle-away detection and session-title body are interactions inspired by the open-source project [dsh-notify-me](https://github.com/chromoany/dsh-notify-me) (MIT). This project borrows interaction and implementation ideas only; the code is an independent implementation, and the two have different positioning:

- dsh-notify-me is mostly browser-layer and its desktop approval notifications carry no buttons; this plugin keeps both approvals and notifications in the Host, so Windows notifications carry Reject / Allow once and return the result through a custom protocol.
- Not yet included but worth considering: per-session mute, external push (Discord / Bark / Gotify / Feishu / ServerChan / WxPusher / Webhook), host-side fallback when the page is closed, notification title markers (🔔 / ✅).
- Navigation icon: 0.2.2+ uses the native `settings.section.icon`; 0.2.0/0.2.1 can only use a DOM patch and fall back to the default gear if the host structure changes.

## Known limitations

- macOS notifications cannot be branded as DeepSeek Harness (third-party notifier limitation).
- Windows uses WinRT plus a custom protocol; the first registration writes `HKCU\Software\Classes\dshnotify`. If security software blocks `wscript.exe`, button callbacks are unavailable.
- Windows custom audio only supports WAV; system sound names must start with `Notification.`.
- Action labels are sanitized (`,`, `;` and a leading `-` are removed; max 24 characters); action ids keep only letters, digits, `_` and `-`; at most 3 buttons.
- Concurrent approvals: only one is taken over; the rest go to the in-app panel.
- Bell icon: 0.2.2+ uses the native slot; 0.2.0/0.2.1 use a DOM patch and silently fall back to the default gear if DSH changes the settings structure; notifications are unaffected.
- Idle detection starts when the page loads; if the page just loaded and the user is already away, the first reminder can be up to one threshold (default 180 s) late.
- Configuration changes reload the Host plugin; in-flight notifications are closed and pending approvals are delegated back to the panel.
- No notification center/history; nothing is re-sent after the app quits.

## Versioning & releases

- Version history: [CHANGELOG.md](CHANGELOG.md).
- Releases: GitHub Releases (since `v0.1.0`); the package is also published to npm as `@honorshine/dsh-desktop-notify`.

## Documentation

- English introduction: this file (`README.md`).
- Chinese introduction: [docs/README.zh-CN.md](docs/README.zh-CN.md).

## License

Plugin code is MIT. Runtime dependencies:

- [node-notifier](https://github.com/mikaelbr/node-notifier) — MIT
- SnoreToast (bundled with node-notifier) — LGPL-3
- terminal-notifier (bundled with node-notifier) — MIT

`assets/notify.wav` and `assets/alert.wav` are synthesized by `scripts/make-chime.mjs`; no third-party audio copyright applies.
