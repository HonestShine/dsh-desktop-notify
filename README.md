# dsh-desktop-notify

[![Release](https://img.shields.io/github/v/release/HonestShine/dsh-desktop-notify)](https://github.com/HonestShine/dsh-desktop-notify/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DeepSeek Harness 桌面端的原生通知插件：在系统通知里直接处理权限请求（拒绝 / 允许一次），并为任务完成、提问与错误提供提醒；通知铃声支持系统提示音、内置铃声、自定义音频与静音。

## 功能

- **跨平台原生通知**：Windows（WinRT toast + `dshnotify:` 协议回传）、macOS（terminal-notifier）、Linux（notify-send）。
- **通知内按钮**：权限确认通知附带「拒绝」「允许一次」，点击后直接把结果交回 Host 的 `approval/request` waterfall。
- **前台回退**：默认只在窗口不在前台时接管；窗口在前台、用户切回前台或通知超时后，自动退回 DSH 原生审批面板。
- **其他提醒**：提问、任务完成、会话错误；均可单独开关，并可限制为仅后台提醒。
- **离开判定**：窗口虽在前台，但超过设定秒数没有键鼠输入也按离开处理（默认 180 秒，0 关闭）。
- **会话标题**：通知正文优先使用会话标题，退回到工作目录名。
- **铃铛入口**：设置左侧导航的「通知提醒」使用铃铛图标（0.2.2+ 走原生 `settings.section.icon`；0.2.0/0.2.1 走 DOM 补丁，结构变化时静默回落到默认齿轮）。
- **自定义铃声**：`system` / `bundled` / `custom` / `none` 四种模式，设置页可试听。
- **可复用服务**：Host 注册 `ctx.desktopNotify`，其他插件可调用 `show()` 弹出带按钮的通知。
- **Windows 协议修复**：设置页可重新注册 `dshnotify:` 协议，并在确认后打开系统通知设置。

## 平台支持

| 能力 | Windows | macOS | Linux |
|---|---|---|---|
| 通知显示 | WinRT Toast（PowerShell） | terminal-notifier | `notify-send` |
| 通知内按钮 | 支持（`dshnotify:` 协议 + VBS） | 支持 | 需要 libnotify 0.7.10+ 且守护进程支持 actions |
| 点击回传 | VBS 写入 rendezvous JSON | stdout | `notify-send -A` |
| 系统提示音 | toast `<audio ms-winsoundevent:...>` | 系统声音名（Bottle 等） | `canberra-gtk-play` 尽力而为 |
| 自定义音频 | **仅 .wav**（SoundPlayer） | `afplay` 支持的格式 | `paplay` / `canberra-gtk-play` / `aplay` |
| 通知身份 | `com.deepseek.dsh`（安装包快捷方式） | terminal-notifier（系统限制） | app-name + 图标 |

> macOS 上通知会显示为 **terminal-notifier**，不是 DeepSeek Harness。这是 node-notifier/terminal-notifier 3 的已知限制（无法设置 sender/图标）。按钮、声音与点击回传均正常。若需要完全品牌化，可自行构建 terminal-notifier（`make icon ICON=... APP_NAME=...`），并在设置页「高级 → macOS 定制 notifier 路径」中填写。

## DSH 兼容性

DSH 目前以 RC 形式发布（`0.2.0-rc.x`、`0.2.1-rc.x`、`0.2.2-rc.x`）；本插件按 **0.2.0-rc.2 / 0.2.1-rc.5 / 0.2.2-rc.1** 审计并适配，覆盖 0.2.0/0.2.1/0.2.2 各中间 RC。

| DSH | 设置导航图标 | 配置表单 | 通知/审批 |
|---|---|---|---|
| 0.2.2-rc.1 | 原生 `settings.section.icon` | `configForms` + `volatile` 字段 | 不变 |
| 0.2.1-rc.5 / 0.2.1-rc.4 | DOM 补丁 | `configForms` + `volatile` 字段 | 不变 |
| 0.2.0-rc.2 | DOM 补丁 | `configForms` + `volatile` 字段 | 不变 |

适配要点：

- peer 范围放宽为 `@deepseek-ai/cordis ^4.0.0`、`@deepseek-ai/schemastery ^3.18.0`，兼容 0.2.0 的 cordis `~4.0.4` / schemastery `~3.18.4` 与 0.2.2 的 cordis `~4.1.0` / schemastery `~3.19.0`。
- 已按三个版本核对 `approval/request` 与结果词表、`user-questions/request`、`agent/status|error|disposed`、`sessionTitle.get`、`connection.requestRejection`、`typertGateway.hasLiveClient`、`configForms.get/mutate/whileServed`、`settings.section` 与 volatile 表单过滤。
- `displayReason` 在 0.2.x 是 `{ en, zh, ... }` 本地化对象（不是字符串）；插件会按当前界面语言取值。
- 0.2.2 的 `settings.section.icon` 是新增 slot；0.2.0/0.2.1 没有该 slot，插件自动回落到 DOM 补丁，因此三个版本都能显示铃铛。
- `configForms` 改为可选注入：如果某个组合不提供它，通知、审批、presence 仍工作，只是不显示设置页。

## 安装

### 从源码安装

```powershell
git clone https://github.com/HonestShine/dsh-desktop-notify.git
cd dsh-desktop-notify
pnpm install          # 安装 node-notifier@12.1.0
```

需要 Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`（`node-notifier@12` 的引擎要求，已写入 `package.json` 的 `engines`）。

然后通过当前桌面端内置的 `plugin_manager` 安装本目录（绝对路径）：

- 首次安装通常返回 `application: applied`；若返回 `restart-required`，完全退出桌面端（含托盘）后重新打开。
- 安装后可在 **设置 → 通知提醒** 找到配置页。
- 如果设置页没有立即出现，刷新页面（Ctrl+R）或重启桌面端。

插件写入 profile，影响该 profile 的所有会话；禁用/卸载后恢复原生行为。

### 从 Release 安装

[v0.1.0 Release](https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.1.0) 附带
`dsh-desktop-notify-0.1.0.tgz`（由 `pnpm pack` 生成，内容为 `package.json` 中 `files` 列出的文件）。
如果你的 DSH 版本的 `plugin_manager` 接受本地 tarball 作为安装 spec，可直接安装该 tgz；
否则解包后按上面的「本地目录」方式安装。tarball 不含 `node_modules`，安装后仍需在解包目录执行 `pnpm install`。

## 使用

### 权限确认

1. 让窗口失去焦点（切到其他应用或最小化）。
2. 触发一次需要审批的工具操作。
3. 系统通知出现「拒绝 / 允许一次」；点击后工具立即继续或被拒。
4. 如果切回 DSH 窗口，通知会被关闭并改由应用内审批面板处理。

窗口在前台时不会弹通知，直接使用原生面板。

### 其他提醒

- **提问提醒**：Agent 调用 `ask_user_question` 时通知；通知不接管问答，点击正文聚焦应用。
- **任务完成**：根会话的 `running → idle` 转变触发。
- **错误提醒**：根会话的 `agent/error` 触发；相同错误 2 秒内去重。

### 铃声

在「设置 → 通知提醒 → 通知铃声」选择：

- **系统提示音**：Windows 使用 `Notification.Default`（可在「通知铃声」分组填写系统声音名覆盖）；macOS 使用 Bottle；Linux 尝试 `canberra-gtk-play`。
- **内置铃声**：`assets/notify.wav`，原创双音提示音，通过平台播放器播放。
- **自定义音频文件**：绝对路径。Windows 仅支持 `.wav`；macOS/Linux 取决于系统播放器。
- **静音**：不播放铃声。

「试听」按钮会按当前模式实际播放一次。

## 配置项

配置文件位于 profile 的 `cordis.patch.yml`（设置页写入），entry id 为 `desktop-notify`：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 插件总开关 |
| `approval.enabled` | `true` | 接管权限确认通知 |
| `approval.onlyWhenHidden` | `true` | 仅窗口不在前台时接管 |
| `approval.timeoutSeconds` | `30` | 通知等待上限（5–300） |
| `events.question` | `true` | 提问提醒 |
| `events.turnEnd` | `true` | 任务完成提醒 |
| `events.errors` | `true` | 错误提醒 |
| `events.onlyWhenHidden` | `true` | 三类提醒仅后台 |
| `sound.mode` | `bundled` | `system` / `bundled` / `custom` / `none` |
| `sound.file` | `""` | 自定义音频绝对路径 |
| `sound.systemName` | `""` | Windows/macOS 系统声音名覆盖 |
| `windows.appId` | `com.deepseek.dsh` | Windows AppUserModelID |
| `windows.duration` | `long` | Windows toast 展示时长（`short` / `long`）；Windows 对带按钮的 toast 可能忽略该值 |
| `macos.customNotifierPath` | `""` | 可选定制 terminal-notifier |
| `presence.staleSeconds` | `120` | 客户端在场状态过期时间 |
| `presence.idleSeconds` | `180` | 前台但无输入超过该秒数按离开处理；0 关闭 |

## 故障排查

### Windows 通知不出现或按钮无反应

1. 打开 **设置 → 系统 → 通知**，确认「通知」总开关与 DeepSeek Harness 的通知都开启，且专注助手/勿扰没有拦截。
2. 确认 Start Menu 中存在 `DeepSeek Harness.lnk` 且其 AppUserModelID 为 `com.deepseek.dsh`（安装包应已创建）。
3. 在插件设置页点击「修复通知按钮协议」，重新注册 `dshnotify:`；注册命令位于 `HKCU\Software\Classes\dshnotify`，指向插件的 `assets/activate.vbs`。
4. 按钮点击会启动 `wscript.exe` 写一个 JSON 到 `%LOCALAPPDATA%\dsh-desktop-notify\actions`，由 Host 轮询消费。若该目录没有新文件，检查 Windows 是否拦截了 `wscript.exe`，或安全软件是否阻止了自定义协议。
5. 系统提示音由 toast 的 `<audio ms-winsoundevent:...>` 播放；自定义/内置铃声由 `SoundPlayer` 播放。两者都不响时检查系统通知声音设置。

> Windows 的按钮回传依赖 Host 进程存活；应用退出后，历史通知中的按钮不会再被处理。协议注册写在当前用户注册表，不需要管理员权限。

### macOS

- 首次通知会请求系统权限；在 **系统设置 → 通知 → terminal-notifier** 中允许。
- 通知身份是 terminal-notifier（见上）。
- 自定义 notifier 路径必须是可执行的 terminal-notifier。

### Linux

- 需要 `notify-send`（`libnotify-bin`）与支持 actions 的守护进程；`notify-send --version` ≥ 0.7.10 才支持按钮。
- 无动作支持时，插件会退回应用内审批面板；状态页会标明。
- 自定义声音需要 `paplay`、`canberra-gtk-play` 或 `aplay` 中至少一个。

## 架构

- **Host 插件**（`index.js`）：注册 Cordis Service `desktopNotify`；监听 `approval/request`（`prepend + global`）、`user-questions/request`、`agent/status`、`agent/error`；Windows 走 `lib/winrt.js`（WinRT toast + 协议回传），macOS/Linux 走 `lib/notifier.js`（node-notifier），`lib/sound.js` 播放铃声，`lib/presence.js` 维护多窗口焦点。
- **Client 插件**（`client.js`）：始终上报窗口焦点、空闲时间与 locale；在 `settings.section` 注册配置页，通过 `ctx.configForms.get('desktop-notify')` 读写 Host 配置，通过同源 `/desktop-notify/*` 路由做测试、试听、状态查询与 Windows 协议修复；0.2.2+ 注册原生 `settings.section.icon`，0.2.0/0.2.1 用 DOM 补丁（`data-shortcut-modal="settings"` + 标签 `<span>`），失败时保留外壳默认齿轮。
- **HTTP 路由**：`/desktop-notify/status|presence|test|preview-sound|open-notification-settings|repair-windows`，全部经过 `ctx.connection.requestRejection(req)` 鉴权，JSON body 上限 16 KiB。
- **Windows 行动作**：`assets/winrt-toast.ps1` 显示 toast；`<action activationType="protocol" arguments="dshnotify:?token=...&decision=...">` 点击后由 `assets/activate.vbs` 写 rendezvous 文件；Host 每 300ms 轮询并解析，按 token 解析为审批结果。
- **审批协同**：只有存在活跃 Client 时才把未决审批委托回原生面板；无 Client 时依赖通知按钮完成，硬上限 2 分钟后以 `unavailable` 关闭。
- **无 DSH 核心改动**：不修改 `app.asar`、Electron main/preload，不新增 IPC。

## 开发

```powershell
pnpm install
node --check index.js
node --check client.js
node test/unit.test.js          # node:test 直接运行（沙箱下不要用 --test spawn）
node scripts/winrt-probe.mjs 300   # Windows：真实 WinRT toast + 协议按钮回传
node scripts/notify-probe.mjs 300  # macOS/Linux：node-notifier 探针
node scripts/make-chime.mjs        # 重新生成 assets/notify.wav
```

> 两个探针都会等待用户点击按钮；在 DSH 受限沙箱下，子进程/命名管道可能被拦截，需在普通终端或提权沙箱中运行。实际运行时 Host 进程不受该沙箱限制。运行 `winrt-probe.mjs` 前请先禁用插件，避免插件的 watcher 抢先消费回传文件。

## 灵感来源

设置页的铃铛图标、空闲离开判定、会话标题正文等交互参考了开源项目 [dsh-notify-me](https://github.com/chromoany/dsh-notify-me)（MIT）。本项目只借鉴交互与实现思路，代码为独立实现；两者的定位不同：

- dsh-notify-me 以浏览器层为主，桌面端审批通知不带按钮；本插件把审批与通知都放在 Host 层，Windows 通知直接带「拒绝 / 允许一次」并由自定义协议回传。
- 尚未纳入、但值得后续考虑的能力：按会话静音、外部推送（Discord / Bark / Gotify / 飞书 / Server酱 / WxPusher / Webhook）、页面关闭后的宿主兜底、通知标题标记（🔔 / ✅）。
- 设置导航图标：0.2.2+ 走原生 `settings.section.icon`；0.2.0/0.2.1 只能做 DOM 补丁，宿主结构变化时回落到默认齿轮。

## 已知限制

- macOS 通知身份无法显示为 DeepSeek Harness（第三方 notifier 限制）。
- Windows 使用 WinRT + 自定义协议；首次注册会写 `HKCU\Software\Classes\dshnotify`。若安全软件禁止 `wscript.exe`，按钮回传不可用。
- Windows 自定义音频只支持 WAV；系统声音名必须以 `Notification.` 开头。
- 动作标签会被清洗（去除 `,`/`;`、开头 `-`，上限 24 字符）；动作 id 只保留字母、数字、`_`、`-`；最多 3 个按钮。
- 多个审批同时到达时只接管一个，其余交给应用内面板。
- 设置导航的铃铛图标：0.2.2+ 使用原生 slot；0.2.0/0.2.1 是 DOM 补丁，DSH 改设置面板结构后会静默回落到默认齿轮，不影响通知功能。
- 空闲判定从页面加载时开始计时；页面刚加载、人已经离开的情况下，第一次提醒最多会晚一个阈值（默认 180 秒）。
- 设置变更会触发 Host 插件重新加载；正在进行中的通知会关闭，未决审批会委托回面板。
- 无通知中心/历史；关闭应用后不会补发。

## 版本与发布

- 版本历史见 [CHANGELOG.md](CHANGELOG.md)。
- 发布包：GitHub Releases（`v0.1.0` 起）；插件未发布到 npm，`package.json` 中保留 `"private": true` 以防误发布。

## 许可证

插件代码 MIT。运行时依赖：

- [node-notifier](https://github.com/mikaelbr/node-notifier) — MIT
- SnoreToast（node-notifier 内置）— LGPL-3
- terminal-notifier（node-notifier 内置）— MIT

`assets/notify.wav` 由 `scripts/make-chime.mjs` 合成，无第三方音频版权。
