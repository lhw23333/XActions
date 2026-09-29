<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. -->
<!-- @author nich (@nichxbt) -->
# XActions 桌面工作台：功能地图与复用边界

本说明基于当前仓库静态代码检查。工具存在不等于已通过真实 X 账号验收；本次建设没有发布帖子、发送私信或操作真实平台账号。

## 功能地图

`src/mcp/server.js` 当前定义 **154 个核心工具、16 个非空分组**，其中 **35 个**登记为需审批的写操作。实际连接加载插件后，工具数可能增加。`desktop/src/data/catalog.json` 由引擎定义生成，保留原始参数 schema，不以手工数据模拟后端。

| 分组 | 工具数 | 主要能力 |
|---|---:|---|
| 内容与搜索 read | 28 | 资料、帖子、搜索、粉丝、媒体、趋势、通知、操作预算 |
| 发布与互动 write | 19 | 发帖、线程、回复、转发、关注、书签、资料更新 |
| 数据分析 analytics | 22 | 内容表现、增长、受众、历史快照、对比、情绪分析 |
| 批量操作 automation | 9 | 批量关注、取关、点赞、回复及互动任务 |
| 私信 dm | 3 | 会话读取、记录导出、消息发送 |
| Grok | 3 | 问答、摘要、图片分析 |
| 列表 lists | 2 | 账号列表和成员 |
| 语音空间 spaces | 6 | Space 信息、语音代理、状态与转录 |
| 监测与通知 monitoring | 15 | 数据流、关键词、声誉监测和通知 |
| 工作流与计划 workflows | 10 | 流程定义、执行、动作目录、计划与 RSS |
| 数据管理 data | 13 | 导入导出、联系人、数据集、团队 |
| AI 内容助手 ai | 8 | 风格分析、内容生成、改写与优化 |
| 关系网络 graph | 4 | 构图、分析和推荐 |
| 运营角色 persona | 7 | 角色配置、预设与运行 |
| 审批队列 drafts | 4 | 列表、详情、批准、丢弃 |
| 账号连接 auth | 1 | 当前浏览器会话登录 |

`tool-groups.js` 还有 x402 分类规则，当前核心目录中没有该组工具。分组表示用途，不能代替写操作判定；后者来自同一文件的 `isWriteTool()`。

## 桌面复用方式

- Electron 主进程通过 MCP SDK Client 和 stdio 子进程连接 `src/mcp/server.js`，启用 local 模式及写操作审批。Vue 渲染层通过受限 IPC 获取工具、执行记录、设置和审批队列。
- 保留 `createMcpServer()` 的过滤、审批和每日预算检查。不能将导出的 `executeTool()` 直接当作等价 API：它是裸执行器；后端初始化也是 `main()` 的职责。
- 输入表单来自 MCP `inputSchema`；中文标题和分组说明只属于显示层，不修改工具 ID、参数或结果。执行记录显示真实响应和错误，空队列、未登录和未连接都有明确状态。
- `scripts/catalog.mjs` 使用 TypeScript AST 读取 TOOLS 的字面量，不导入或执行 server。`npm run catalog` 更新目录，`node scripts/catalog.mjs --check` 验证目录与源代码一致。

## 运行与状态

MCP 后端是 Node ESM 程序。公共读取优先使用 HTTP scraper，部分能力回退或直接使用 Puppeteer；后端启动不会立即打开浏览器。AI 生成需要对应模型服务配置，语音代理等能力另有可选依赖。完整 Express API 还涉及 PostgreSQL/Prisma、Redis/Bull、JWT、Socket.io 和后台扫描；桌面本地模式无需启动这套 SaaS 服务。

审批草稿保存在 `mcp-drafts.json`，每日预算保存在 `action-ledger.json`，默认目录是 `~/.xactions`，这两个模块支持 `XACTIONS_HOME`。工作流可使用 JSON 文件后端，配置 `DATABASE_URL` 后选用 Prisma。部分旧模块（CLI 会话、插件、工作流文件目录）仍硬编码 `~/.xactions`，因此不能声称所有数据已统一由 `XACTIONS_HOME` 控制。

调研开始时，仓库 `data/` 仅有 `.gitkeep`，当前用户目录中没有 `.xactions`。这只是初始目录检查结果，工作台运行后会产生实际状态；不预置账号、执行记录或统计数据。

## 需要保留的边界

- MCP 的浏览器与 HTTP scraper 是进程级单例，认证主要来自 `XACTIONS_SESSION_COOKIE` 和 `XACTIONS_CSRF_TOKEN`。CLI 保存的 cookie jar 不会自动供全部 MCP 路径使用。`x_login` 只登录浏览器，不能冒充完整的持久账号管理；切换会话应重建子进程。
- 草稿批准会执行真实操作。四个审批工具始终可用；服务端没有独立的人类身份认证层，桌面应由用户明确点击批准。运行中的批准请求应防止重复提交。
- 每日预算是本地执行额度，不是 X 平台返回的实时限额。部分批量工具按整次调用计费，也有按参数数量计费的工具，不能将账本数字解释成所有实际动作的精确统计。
- `x_workflow_create` 保存非手动触发器时会注册触发器；工具分类没有把所有本地状态变化都列为写操作。首次使用应检查流程触发方式，不自动创建或运行示例任务。
- MCP 启动会加载已安装插件并运行其 `onLoad`；导入 server 虽不启动 transport，也会注册进程信号处理。子进程隔离可避免影响 Electron 的生命周期。
- 现有代码和网页选择器并未通过本次真实平台验收。工作台应保留原始错误、参数和执行结果，不能把请求成功、草稿入队或生成预览显示为发布成功。

关键源码：`src/mcp/server.js`、`local-tools.js`、`tool-groups.js`、`drafts.js`、`action-caps.js`、`src/workflows/index.js`、`src/workflows/store.js`、`src/cli/index.js`。
