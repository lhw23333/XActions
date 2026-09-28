# XActions 工作流与定时任务调研

> 调研日期：2026-09-28
>
> @author nich (@nichxbt)
> @license Apache-2.0

## 结论摘要

XActions 当前包含三套容易混淆的自动化机制：

1. **Workflow 工作流**：多步骤流水线，支持共享上下文、条件、错误策略和触发器。
2. **Local Scheduler 定时任务**：使用 `node-cron`，按 cron 执行一个 CLI 命令。
3. **Scheduled Post 定时发帖**：通过 API/MCP Job Queue 处理定时发帖，与通用 Scheduler 分开。

当前最可靠的是 Workflow 的手动执行和 Scheduler 类的 Node.js 直接调用。Workflow 的自动触发和 CLI/API Scheduler 仍存在生命周期、参数名和持久化接线问题，不能直接按所有旧文档示例部署为可靠的常驻任务服务。

## 代码入口

### Workflow

- 引擎：[src/workflows/engine.js](../src/workflows/engine.js)
- 高级 API：[src/workflows/index.js](../src/workflows/index.js)
- 内置动作：[src/workflows/actions.js](../src/workflows/actions.js)
- 条件求值：[src/workflows/conditions.js](../src/workflows/conditions.js)
- 触发器：[src/workflows/triggers.js](../src/workflows/triggers.js)
- 存储：[src/workflows/store.js](../src/workflows/store.js)
- CLI：[src/cli/index.js](../src/cli/index.js)
- API：[api/routes/workflows.js](../api/routes/workflows.js)

### Local Scheduler

- 调度器：[src/scheduler/scheduler.js](../src/scheduler/scheduler.js)
- CLI：[src/cli/index.js](../src/cli/index.js)
- API：[api/routes/schedule.js](../api/routes/schedule.js)
- MCP 工具：[src/mcp/server.js](../src/mcp/server.js)
- 相关文档：[scheduler.md](scheduler.md)、[scheduling.md](scheduling.md)

### 定时发帖队列

- AI Scheduler API：[api/routes/ai/scheduler.js](../api/routes/ai/scheduler.js)
- MCP 工具：`x_schedule_post`
- 队列服务：`api/services/jobQueue.js`

## Workflow 工作流

### 定义结构

工作流由名称、触发器和顺序执行的步骤组成：

```json
{
  "name": "web3-monitor",
  "description": "Monitor Web3 topics",
  "trigger": {
    "type": "manual"
  },
  "steps": [
    {
      "action": "searchTweets",
      "params": {
        "query": "web3 founder",
        "limit": 20
      },
      "output": "tweets"
    },
    {
      "condition": "tweets not_empty"
    },
    {
      "action": "exportJSON",
      "params": {
        "input": "tweets",
        "filepath": "./web3-tweets.json"
      }
    }
  ]
}
```

每个动作可以通过 `output` 将结果写入上下文。后续步骤使用 `{{tweets.0.url}}`、`{{profile.followers}}` 等路径读取上下文。

一个步骤只能是 `action` 或 `condition`。条件步骤支持 `onFail: "skip"`，动作步骤支持 `onError: "continue"`。

### 内置动作分类

当前 CLI 实际列出的动作包括：

- 抓取：`scrapeProfile`、`scrapeFollowers`、`scrapeFollowing`、`scrapeTweets`、`searchTweets`、`scrapeHashtag`、`scrapeTrending`、`scrapeThread`、`scrapeMedia`、`scrapeBookmarks`、`scrapeNotifications`、`scrapeListMembers`、`scrapeLikes`
- 自动化：`follow`、`unfollow`、`postTweet`、`like`、`retweet`、`reply`、`getNonFollowers`
- 转换：`filter`、`count`、`pick`、`slice`
- AI：`summarize`、`generateText`
- 工具：`log`、`delay`、`exportJSON`、`exportCSV`、`template`

AI 动作需要相应的 OpenRouter 或本地 LLM 配置。写操作动作通过浏览器自动化执行，需要有效的认证会话。

### 条件

支持字符串条件、结构化条件以及 `all` / `any` 组合：

```json
{ "condition": "tweets.length > 10" }
```

```json
{
  "condition": {
    "left": "profile.followers",
    "operator": ">",
    "right": 10000
  }
}
```

可用运算符：

```text
==  !=  >  >=  <  <=
contains  not_contains  matches
exists  empty  not_empty
```

右值支持上下文路径、字符串、数字、布尔值、`null` 和时长字面量，例如 `30m`、`1h`、`2d`。

### CLI 用法

```bash
node src/cli/index.js workflow actions
node src/cli/index.js workflow create --file workflow.json
node src/cli/index.js workflow list
node src/cli/index.js workflow run web3-monitor --auth "$XACTIONS_SESSION_COOKIE"
node src/cli/index.js workflow runs <workflow-id> --limit 10
node src/cli/index.js workflow delete <workflow-id>
```

Windows PowerShell 中可以使用：

```powershell
node src/cli/index.js workflow run web3-monitor --auth $env:XACTIONS_SESSION_COOKIE
```

### 持久化

没有设置 `DATABASE_URL` 时，默认使用 JSON 文件：

```text
~/.xactions/workflows/<workflow-id>.json
~/.xactions/workflow-runs/<workflow-id>/<run-id>.json
```

设置 `DATABASE_URL` 且 Prisma 可用时，工作流定义和运行记录写入 PostgreSQL 的 `Operation` 模型。

运行记录会保存步骤状态、错误、触发来源和清理后的上下文。`authToken` 和以下划线开头的内部字段不会写入运行记录。

## Workflow 触发器现状

源码声明支持：

```text
manual
schedule / cron
interval
webhook
event
```

但当前自动触发存在以下限制：

1. `schedule` / `cron` 只有在外部调用 `triggerManager.setQueue(bullQueue)` 后才会创建 Bull 可重复任务。
2. 仓库内没有发现实际的 `setQueue()` 调用；没有 Bull Queue 时，schedule trigger 会被记录为 inactive。
3. `initTriggers()` 负责连接触发器和运行引擎，但当前 CLI/API 启动流程没有自动调用它。
4. `interval` 使用进程内 `setInterval`，Node 进程退出或重启后丢失。
5. webhook 映射保存在内存中，重启后需要重新注册。
6. event trigger 目前只保存 watcher 配置，没有完整的事件分发接线。

因此，当前推荐把 Workflow 当作**可持久化定义 + 手动执行引擎**使用。要做长期自动触发，需要补齐 Queue 初始化、触发器恢复和进程生命周期管理。

## Local Scheduler 定时任务

### 能力

`Scheduler` 使用 `node-cron` 管理本地 cron 任务，支持：

- 标准 cron 表达式
- 启用和禁用任务
- 手动立即执行
- 最大重试次数
- 单任务超时
- 执行历史
- `job:start`、`job:complete`、`job:error` 事件

任务配置和历史位置：

```text
~/.xactions/scheduler.json
~/.xactions/scheduler-history/
```

### Node.js 正确接入方式

```javascript
import { getScheduler } from './src/scheduler/scheduler.js';

const scheduler = getScheduler();
await scheduler.load();

scheduler.addJob({
  name: 'daily-profile',
  cron: '0 9 * * *',
  command: 'profile',
  args: ['NASA'],
  enabled: true,
  maxRetries: 2,
  timeout: 300000,
});

scheduler.start();
```

必须保持该 Node 进程持续运行，cron 任务才会触发。`_runCommand()` 当前通过 `node bin/unfollowx` 启动命令，并将 `command` 和 `args` 拼接为 CLI 参数。

### 当前 CLI/API 缺口

当前 CLI 定义为：

```bash
node src/cli/index.js schedule add <name> <cron> --command <cmd>
node src/cli/index.js schedule list
node src/cli/index.js schedule run <name>
node src/cli/index.js schedule remove <name>
```

源码中存在几个需要修复的接线问题：

- CLI `schedule add` 将命令放进了 `action` 字段，但 `Scheduler.addJob()` 要求字段名为 `command`。
- CLI 没有调用 `scheduler.load()`，新进程无法看到已保存的任务。
- CLI 没有调用 `scheduler.start()`，添加任务的命令退出后没有常驻调度进程。
- CLI 没有暴露文档中提到的 `history`、`enable`、`disable` 子命令。
- `/api/schedule` 路由也将 `action` 传给 Scheduler，而不是 `command`。
- API 路由没有自动调用 `load()` 和 `start()`。
- MCP 的 `x_schedule_add` 使用同样的 `action` 字段问题。

因此当前不应把 `xactions schedule add` 当作可靠的持久化定时服务入口。底层 `Scheduler` 类可以直接使用，但需要由宿主进程负责加载任务、启动调度器并保持进程常驻。

## 定时发帖队列

定时发帖是另一条路径，不等同于 Local Scheduler：

- MCP：`x_schedule_post`
- API：`POST /api/ai/schedule/add`
- 取消：`POST /api/ai/schedule/remove`
- 查询：`POST /api/ai/schedule/list`

API 接收：

```json
{
  "text": "Scheduled post",
  "scheduledAt": "2026-10-01T09:00:00.000Z",
  "timezone": "Asia/Shanghai",
  "repeat": false,
  "sessionCookie": "..."
}
```

也可以使用 `cron` 代替 `scheduledAt`。该路径将任务放入 API Job Queue，并通过 operation ID 查询状态；它不是 `~/.xactions/scheduler.json` 中的本地 cron 任务。

## API 与 MCP 入口

### Workflow API

Workflow API 路由统一使用 API 认证中间件：

```text
POST   /api/workflows
GET    /api/workflows
GET    /api/workflows/:id
PUT    /api/workflows/:id
DELETE /api/workflows/:id
POST   /api/workflows/:id/run
GET    /api/workflows/:id/runs
GET    /api/workflows/:id/runs/:runId
GET    /api/workflows/actions
POST   /api/workflows/webhook/:webhookId
```

### MCP

工作流相关工具：

```text
x_workflow_create
x_workflow_run
x_workflow_list
x_workflow_actions
```

Local Scheduler 相关工具：

```text
x_schedule_add
x_schedule_list
x_schedule_remove
```

MCP Server 的 `x_workflow_run` 使用服务端 `SESSION_COOKIE` 作为工作流认证上下文。写操作还受到 MCP approval gate 和 action caps 的约束。

## 建议的生产化修复顺序

1. 修复 CLI、API、MCP 中 `action` 与 `command` 的字段不一致。
2. 增加 Scheduler daemon 入口，启动时执行 `load()`，然后执行 `start()`。
3. 在 API 服务启动时初始化 Scheduler，并避免多进程重复运行同一 cron 任务。
4. 为 Workflow Trigger Manager 注入 Bull/Redis Queue，并在启动时恢复已保存的非手动触发器。
5. 持久化 webhook ID 和 interval/event watcher 配置，重启后自动恢复。
6. 统一 `docs/scheduling.md`、`docs/scheduler.md` 和当前 CLI 的参数与命令名。

## 参考文档

- [Workflow Engine](workflows.md)
- [Scheduler](scheduler.md)
- [Task Scheduling](scheduling.md)
- [MCP Setup](mcp-setup.md)
