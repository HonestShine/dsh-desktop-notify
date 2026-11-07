# Changelog

本项目的所有重要变更都会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.1] - 2026-11-07

### 新增

- **交互提示音**：权限确认（`approval/request`）与提问/计划征询（`user-questions/request`）触发时播放
  独立提示音，与通知铃声分开配置（`bundled` / `custom` / `none`，可试听）。它**不检查窗口焦点**，
  窗口在前台、显示应用内审批面板时也会响；同一提示 800ms 内去重，并静音该次交互 toast 的自带提示音
  避免双响。内置 `assets/alert.wav` 为三连上行短音，与通知铃声（双音钟声）明显不同。
- 设置页新增「交互提示音」分组；新增 `POST /desktop-notify/preview-attention` 试听接口。

### 变更

- **通知服务生命周期**：插件加载/启用时注册 `dshnotify:` 协议（注册时写入每实例 nonce），
  禁用或卸载时自动注销协议并清理 `%LOCALAPPDATA%\dsh-desktop-notify` 轮询目录；插件重载时
  旧实例的注销因 nonce 不匹配而跳过，不会误删新实例的注册。设置页的「修复通知按钮协议」仍保留。
- 安装章节改为 DSH 生态的两种方式：本地目录 / 压缩包（`dsh plugin --profile web add link:...`、`file:...`，
  含 Release tarball），以及直接从 GitHub 安装（`dsh plugin --profile web add github:HonestShine/dsh-desktop-notify`）。

### 修复

- **Windows 通知身份**：通知头此前显示 AUMID 原文（`com.deepseek.dsh`）和默认图标，而不是应用名与图标。
  现在 `assets/resolve-aumid.ps1` 会读取开始菜单里已注册的 `DeepSeek Harness.lnk` 的 AppUserModelID，
  通知头显示 **DeepSeek Harness**；toast XML 同时带上安装目录 `resources/icon.png` 作为
  `appLogoOverride`，确保通知内显示鲸鱼图标。`windows.appId` 默认改为留空（自动识别），仅在自动
  识别失败时需要手工覆盖。
- `WinRtNotifier.close()` 现在使用解析后的 AUMID 关闭 toast（此前用配置里的 `windows.appId`，
  留空自动识别时无法关闭已显示的通知）。

## [0.1.0] - 2026-11-07

首个公开版本。适配 DeepSeek Harness `0.2.0-rc.2` / `0.2.1-rc.x` / `0.2.2-rc.1`。

### 新增

- **原生桌面通知**：Windows 使用 WinRT Toast（PowerShell），macOS 使用 terminal-notifier，Linux 使用 `notify-send`。
- **通知内审批按钮**：权限确认通知附带「拒绝」「允许一次」，通过 Windows 自定义协议 `dshnotify:` + VBS 回传
  rendezvous JSON，直接把结果交回 Host 的 `approval/request` waterfall。
- **前台回退**：窗口在前台、用户切回前台或通知超时后，自动退回 DSH 原生审批面板。
- **事件提醒**：提问（`user-questions/request`）、任务完成（根会话 `running → idle`）、会话错误
  （`agent/error`，2 秒去重），三类提醒可单独开关并可限制为仅后台。
- **离开判定**：窗口虽在前台但超过 `presence.idleSeconds`（默认 180 秒，0 关闭）无键鼠输入时按离开处理。
- **会话标题**：通知正文优先使用会话标题，回退到工作目录名。
- **设置页**：0.2.0/0.2.1 通过 DOM 补丁给「通知提醒」入口加铃铛图标，0.2.2+ 使用原生
  `settings.section.icon`，失败时静默回落到默认齿轮。
- **通知铃声**：`system` / `bundled` / `custom` / `none` 四种模式，支持试听；内置原创提示音
  `assets/notify.wav`。
- **可复用服务**：Host 注册 `ctx.desktopNotify`，其他插件可调用 `show()` 弹出带按钮的通知。
- **Windows 协议修复**：设置页可重新注册 `dshnotify:` 协议，并在确认后打开系统通知设置。

### 安全

- `dshnotify:` 协议回传的 `token` 与 `decision` 在 `assets/activate.vbs` 与 `lib/winrt.js` 两层校验：
  token 必须是本插件生成的 UUID，decision 必须匹配协议安全字符集，构造的 URI 无法借 token 路径穿越或覆盖
  rendezvous 目录外的文件。

### 兼容性

- peer 依赖放宽为 `@deepseek-ai/cordis ^4.0.0`、`@deepseek-ai/schemastery ^3.18.0`，同时兼容
  0.2.0 的 cordis `~4.0.4` / schemastery `~3.18.4` 与 0.2.2 的 cordis `~4.1.0` / schemastery `~3.19.0`。
- `displayReason` 按 0.2.x 的 `{ en, zh, ... }` 本地化对象处理，并随界面语言取值。
- `configForms` 改为可选注入：缺失时通知、审批、presence 仍工作，仅不显示设置页。

### 已知限制

- macOS 通知身份显示为 terminal-notifier（node-notifier 限制）。
- Windows 自定义音频仅支持 `.wav`；按钮回传依赖 Host 进程存活。
- Linux 通知内按钮需要 libnotify 0.7.10+ 且通知守护进程支持 actions。
- 关闭应用后不会补发通知。

[0.1.0]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.1.0
[0.1.1]: https://github.com/HonestShine/dsh-desktop-notify/releases/tag/v0.1.1
