# dsh-desktop-notify

[English](../README.md) | 中文

[![Release](https://img.shields.io/github/v/release/HonestShine/dsh-desktop-notify)](https://github.com/HonestShine/dsh-desktop-notify/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

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
- **交互提示音**：权限确认与提问（含计划征询）触发时播放独立提示音，**与通知铃声分开配置**，且**不受窗口焦点限制**——窗口在前台也响；同样支持 `bundled` / `custom` / `none` 与试听。
- **可复用服务**：Host 注册 `ctx.desktopNotify`，其他插件可调用 `show()` 弹出带按钮的通知。
- **Windows 通知身份**：自动读取安装包注册的 `DeepSeek Harness.lnk` 的 AppUserModelID，通知头显示「DeepSeek Harness」和应用图标；解析失败时才回退到手工配置的 AUMID。
- **Windows 协议修复**：设置页可重新注册 `dshnotify:` 协议，并在确认后打开系统通知设置。

## 平台支持

| 能力 | Windows | macOS | Linux |
|---|---|---|---|
| 通知显示 | WinRT Toast（PowerShell） | terminal-notifier | `notify-send` |
| 通知内按钮 | 支持（`dshnotify:` 协议 + VBS） | 支持 | 需要 libnotify 0.7.10+ 且守护进程支持 actions |
| 点击回传 | VBS 写入 rendezvous JSON | stdout | `notify-send -A` |
| 系统提示音 | toast `<audio ms-winsoundevent:...>` | 系统声音名（Bottle 等） | `canberra-gtk-play` 尽力而为 |
| 自定义音频 | **仅 .wav**（SoundPlayer） | `afplay` 支持的格式 | `paplay` / `canberra-gtk-play` / `aplay` |
| 通知身份 | `DeepSeek Harness`（自动复用安装包快捷方式）+ 应用图标 | terminal-notifier（系统限制） | app-name + 图标 |
| 交互提示音 | 支持（`SoundPlayer` 播放内置/自定义 .wav） | `afplay` | `paplay` / `canberra-gtk-play` / `aplay` |

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

两种方式，任选其一。装完重启 `dsh web`（桌面端则完全退出后重开），再 F5 刷新浏览器，即可在 **设置 → 通知提醒** 看到配置页。

### 方式 A：已有本插件的完整资源包（本地目录 / 压缩包）（推荐）

适用于别人直接发你一个 zip，或你手上已有一份解压好的插件目录（目录里应有 `package.json`、`cordis.patch.yml`、`lib/`、`assets/`、`README.md`）。

```powershell
# 1) 解压到一个固定、以后不会移动或删除的目录（不要放临时目录/下载目录）
#    例：D:\Plugins\dsh-desktop-notify
#    要安装的是「包含 package.json 的那一层」，不要多套一层同名目录

# 2) 确认关键文件都在（缺 assets/ 会导致没图、没声）
Test-Path "D:\Plugins\dsh-desktop-notify\package.json",
          "D:\Plugins\dsh-desktop-notify\cordis.patch.yml",
          "D:\Plugins\dsh-desktop-notify\lib\winrt.js",
          "D:\Plugins\dsh-desktop-notify\assets\notify.wav"

# 3) 如果之前装过同名插件，先卸载避免版本冲突
dsh plugin --profile web remove dsh-desktop-notify

# 4) 用绝对路径安装（路径含空格要加引号）
dsh plugin --profile web add link:D:\Plugins\dsh-desktop-notify
```

说明：

- `link:` 是软链安装：源目录里的文件改了立即生效；但安装后不能移动/重命名该目录，移动了要重新 `add` 一次。
- 本地目录没有 `node_modules` 时，`link:` 安装前先在插件目录执行 `pnpm install`（macOS/Linux 的 terminal-notifier / notify-send 适配需要 `node-notifier`；Windows 走 WinRT，通常不装也能弹通知）。
- 想用拷贝安装：`dsh plugin --profile web add file:D:\Plugins\dsh-desktop-notify`（pnpm 会把依赖一起装；此后源目录再改不会同步，需要重新 `add`）。
- Release 页的 `dsh-desktop-notify-<version>.tgz` 也可以直接装：`dsh plugin --profile web add file:D:\Downloads\dsh-desktop-notify-<version>.tgz`。

### 方式 B：直接从 GitHub 安装

无需本地克隆，一条命令：

```powershell
dsh plugin --profile web add github:HonestShine/dsh-desktop-notify
```

- 想固定某个版本：`dsh plugin --profile web add github:HonestShine/dsh-desktop-notify#v0.1.1`
- pnpm 会把依赖记录成 `github:HonestShine/dsh-desktop-notify#<commit sha>`；`dsh plugin` 会自动把带 `dsh.bundle` 的包加入该 profile 的 `dsh.profile.bundles`，不需要手工改 `cordis.patch.yml`。
- 本插件没有构建脚本，git 安装时 pnpm 的 `prepare` 只会安装依赖（`node-notifier`），通常不会触发 `allowBuilds` 提示。
- 需要 Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`（`node-notifier@12` 的引擎要求，已写入 `package.json` 的 `engines`）。

### 说明

- 上面命令里的 profile 是 `web`（`dsh web` 用的 profile）。桌面端（Electron）的 `desktop` profile 由应用自己管理，CLI 会拒绝 `--profile desktop`，请改用桌面端内置的 `plugin_manager` 安装同一目录或 tarball。
- **通知服务生命周期**：插件加载/启用时注册 `dshnotify:` 协议（注册表 `HKCU\Software\Classes\dshnotify`，带每实例 nonce）；禁用或卸载时自动注销该协议并清理 `%LOCALAPPDATA%\dsh-desktop-notify` 轮询目录。插件重载时旧实例的注销会因 nonce 不匹配而跳过，不会误删新实例的注册。
- 卸载：`dsh plugin --profile web remove dsh-desktop-notify`（卸载/禁用后协议会自动注销，无需手工清理注册表）。
- 插件写入 profile，影响该 profile 的所有会话；禁用/卸载后恢复原生行为。
- 首次安装后若设置页没有立即出现，重启 `dsh web` 再 F5 刷新。

## 使用

### 权限确认

1. 让窗口失去焦点（切到其他应用或最小化）。
2. 触发一次需要审批的工具操作。
3. 系统通知出现「拒绝 / 允许一次」；点击后工具立即继续或被拒。
4. 如果切回 DSH 窗口，通知会被关闭并改由应用内审批面板处理。

窗口在前台时不会弹通知，直接使用原生面板；但**交互提示音仍会响**（见下方「铃声」）。

### 其他提醒

- **提问提醒**：Agent 调用 `ask_user_question` 时通知；通知不接管问答，点击正文聚焦应用。
- **任务完成**：根会话的 `running → idle` 转变触发。
- **错误提醒**：根会话的 `agent/error` 触发；相同错误 2 秒内去重。

### 铃声

插件有两类声音，分开配置。

**通知铃声**（任务完成 / 错误提醒 / 带回传按钮的通知）在「设置 → 通知提醒 → 通知铃声」选择：

- **系统提示音**：Windows 使用 `Notification.Default`（可在「通知铃声」分组填写系统声音名覆盖）；macOS 使用 Bottle；Linux 尝试 `canberra-gtk-play`。
- **内置铃声**：`assets/notify.wav`，原创双音提示音，通过平台播放器播放。
- **自定义音频文件**：绝对路径。Windows 仅支持 `.wav`；macOS/Linux 取决于系统播放器。
- **静音**：不播放铃声。

**交互提示音**（权限确认、提问/计划征询等需要你回应的交互）在「交互提示音」分组单独配置：

- 默认播放内置 `assets/alert.wav`（三连上行短音），与通知铃声明显不同；
- `custom` 可选自定义 `.wav`，`none` 静音；
- **不受窗口焦点限制**：窗口在前台、显示的是应用内审批面板时也会响（这是与通知铃声的关键区别）；
- 同一提示 800ms 内只会响一次，避免审批/提问同时到达时叠音；Windows 上会同时静音该次交互 toast 的自带提示音，避免双响。

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
| `attention.enabled` | `true` | 权限确认 / 提问时播放交互提示音（窗口在前台也响） |
| `attention.mode` | `bundled` | 交互提示音来源：`bundled` / `custom` / `none` |
| `attention.file` | `""` | 自定义交互提示音的绝对路径 |
| `windows.appId` | `""` | 可选：手工指定 Windows AppUserModelID；留空自动读取已注册的 `DeepSeek Harness.lnk` |
| `windows.duration` | `long` | Windows toast 展示时长（`short` / `long`）；Windows 对带按钮的 toast 可能忽略该值 |
| `macos.customNotifierPath` | `""` | 可选定制 terminal-notifier |
| `presence.staleSeconds` | `120` | 客户端在场状态过期时间 |
| `presence.idleSeconds` | `180` | 前台但无输入超过该秒数按离开处理；0 关闭 |

## 故障排查

### Windows 通知不出现或按钮无反应

1. 打开 **设置 → 系统 → 通知**，确认「通知」总开关与 DeepSeek Harness 的通知都开启，且专注助手/勿扰没有拦截。
2. 通知头应显示 **DeepSeek Harness** 和应用图标。插件会自动读取开始菜单里 `DeepSeek Harness.lnk` 的 AppUserModelID（安装包已创建）；如果显示成了 AUMID 原文或图标不对，确认该快捷方式存在，或在 **设置 → 通知提醒 → 高级 → Windows 通知身份** 里手工填写 AppUserModelID 覆盖。
3. 正常情况下插件加载时会自动注册 `dshnotify:`（禁用/卸载时自动注销）；若按钮失效，可在插件设置页点击「修复通知按钮协议」重新注册；注册命令位于 `HKCU\Software\Classes\dshnotify`，指向插件的 `assets/activate.vbs`。
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

- **Host 插件**（`index.js`）：注册 Cordis Service `desktopNotify`；监听 `approval/request`（`prepend + global`）、`user-questions/request`、`agent/status`、`agent/error`；Windows 走 `lib/winrt.js`（WinRT toast + 协议回传 + `assets/resolve-aumid.ps1` 解析通知身份），macOS/Linux 走 `lib/notifier.js`（node-notifier），`lib/sound.js` 播放通知铃声与交互提示音（两个独立 `SoundPlayer`），`lib/presence.js` 维护多窗口焦点；交互提示音在 `approval/request` 与 `user-questions/request` 到达时播放，不检查焦点。
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
node scripts/make-chime.mjs        # 重新生成 assets/notify.wav 与 assets/alert.wav
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

- 版本历史见 [CHANGELOG.md](../CHANGELOG.md)。
- 发布包：GitHub Releases（`v0.1.0` 起）；插件未发布到 npm，`package.json` 中保留 `"private": true` 以防误发布。

## 文档

- 英文介绍：[README.md](../README.md)。
- 中文介绍：本文件（`docs/README.zh-CN.md`）。

## 许可证

插件代码 MIT。运行时依赖：

- [node-notifier](https://github.com/mikaelbr/node-notifier) — MIT
- SnoreToast（node-notifier 内置）— LGPL-3
- terminal-notifier（node-notifier 内置）— MIT

`assets/notify.wav` 与 `assets/alert.wav` 由 `scripts/make-chime.mjs` 合成，无第三方音频版权。
