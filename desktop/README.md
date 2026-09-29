# XActions Desktop Workbench

<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->

本地桌面工作台，使用与 MatrixFlow 相同的核心应用技术栈：Electron 41、Vue 3、TypeScript、Pinia、Vue Router、Element Plus 和 SQLite。现有 XActions 功能经 MCP stdio 子进程接入，保留原引擎及其 Puppeteer/HTTP 执行方式。

## 已实现

- 概览：从实际工具目录和本地执行记录统计，不提供示例账号或虚构运营数据。
- 功能库：当前 154 个核心工具、16 个分组，中文名称、搜索、收藏和按 JSON Schema 生成的参数表单。
- 内容创作：帖子、线程、投票的编辑和预览；提交后进入 XActions 原生审批草稿。
- 审批队列：读取真实待审批操作，查看目标和参数，明确确认后批准执行或丢弃。
- 执行记录：真实状态、耗时、参数和结果，本地 SQLite 持久化，支持 JSON/CSV 导出。
- 设置：项目与 Node/Chrome 路径、会话和 OpenRouter 凭据、连接诊断。凭据使用 Electron safeStorage 加密，渲染进程只得到“已配置”状态。
- 页面快捷搜索：`Ctrl+K`；浏览器预览可浏览目录，执行与凭据设置只在 Electron 中可用。

数据分析、自动化、工作流、监控等通过功能库中的原生工具执行，结果保留原始结构。是否支持某个平台动作仍取决于 XActions 上游实现、账号会话和外部平台。MCP 的连接成功仅说明工具协议正常，不表示 X 账号登录有效。

## 安装和启动

建议使用 Node 24 LTS，并使用相同 Node 版本安装、运行根项目依赖。根项目和桌面包有不同的 SQLite 原生模块：根项目供系统 Node 使用，桌面包供 Electron 使用，不应混用。

在 XActions 根目录运行：

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
npm install --omit=dev --legacy-peer-deps --package-lock=false --no-audit --no-fund
cd desktop
npm install
npm run rebuild
npm run dev
```

当前上游锁文件缺少 `xspace-agent` 项，同时 Vitest 与 coverage 的 peer 版本不匹配，因此上述根项目安装命令使用既有 package.json 安装生产依赖，不改写上游锁文件。桌面包有自己的锁文件，后续可用 `npm ci` 安装。

开发模式在 `http://127.0.0.1:5180` 启动 Vite，并打开 Electron 窗口；关闭桌面窗口会关闭该开发会话。首次运行会连接本地 MCP 并读取工具列表，不会自动请求 X 或发布内容。

已安装后，也可从根目录执行：

```powershell
npm run desktop:dev
npm run desktop:build
npm run desktop:start
```

`desktop:start` 使用构建产物，先执行 `desktop:build`。更换 Node 运行时可在连接设置中指定可执行文件，或首次启动前设置 `XACTIONS_NODE_PATH`。Chrome 会自动检测常见安装位置，也可手动填写。部分功能直接调用 HTTP，无需启动浏览器。

如果 Electron 安装包下载较慢，可仅在安装命令所在终端设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后重试；不需要修改全局 npm 设置。

## 凭据与数据

- 工作台数据在 Electron `userData/workbench/workbench.sqlite`，包含配置和已脱敏的执行历史。
- `auth_token` 和 `ct0` 分别配置为会话凭据与 CSRF 凭据；不预填、不回显、不在日志中保存原文。公共读取是否需要会话由上游能力决定。
- 账号变更会重启 MCP 子进程，避免复用旧会话单例。
- `x_login` 是上游浏览器会话工具，不等价于保存工作台账号；持久连接使用设置页。
- 工作台以 `--require-approval` 运行上游 MCP。写操作先保存草稿，批准时仍经过上游每日动作预算。
- 上游的草稿、额度等遵循其 `XACTIONS_HOME` 规则；部分插件、工作流和 CLI 数据仍使用 `~/.xactions`。工作台没有迁移或删除这些既有数据。
- AI 工具需要相应提供商凭据；工作台不自动调用付费模型。

## 开发结构

```text
desktop/
  electron/          主进程、MCP 客户端、SQLite、凭据、preload
  shared/            主进程/渲染进程接口契约
  src/
    views/           概览、功能库、创作、审批、历史、设置
    components/      Schema 表单、工具执行、结果展示
    stores/          Pinia 工作台状态
    data/            从真实工具定义生成的目录、中文展示文案
  scripts/           目录生成、Electron 构建、开发与生产启动
  tests/             参数校验、脱敏、导出等测试
  RESEARCH.md        上游功能调研与集成边界
```

```powershell
npm run catalog        # 静态读取源码更新工具目录，不启动 MCP
npm run typecheck
npm test
npm run build
```

新增或修改上游工具后运行 `catalog`；连接成功后以实际服务提供的工具列表为准。浏览器脚本、CLI 专属能力和 SaaS 后台功能没有被误标为 MCP 已接入功能。工作台不启动 PostgreSQL/Redis/Express，也没有重写上游自动化引擎。
