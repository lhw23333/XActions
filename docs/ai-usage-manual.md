# XActions AI 使用说明书

> 面向 Claude、Cursor、GPT、Codex 及其他 MCP Agent。本文档描述如何让 AI 在单个 X 账号上进行读取、分析、内容生产和受控执行。

## 1. AI 应遵循的总流程

所有账号操作都按下面的顺序执行：

```text
确认目标
  -> 读取上下文
  -> 分析和筛选
  -> 生成行动计划
  -> 对写操作生成草稿
  -> 人工批准
  -> 执行一小批动作
  -> 验证结果
  -> 记录和汇报
```

AI 不应在没有读取上下文、没有确认目标的情况下直接点赞、关注、回复、发帖或发送私信。

## 2. 使用哪个入口

### CLI：一次性读取或简单任务

适合一两个读取任务、脚本化任务和 PowerShell 管道：

```powershell
cd D:\AI\XProject\XActions
npm run cli -- profile USERNAME --json
npm run cli -- tweets USERNAME --limit 20 --json
npm run cli -- search "关键字" --limit 20 --json
npm run cli -- analyze USERNAME --json
```

### MCP：长期会话、写操作和 Agent 工作流

适合需要保留上下文、连续调用多个工具、创建草稿或执行工作流的 AI Agent。

当前 MCP 有 154 个工具，按以下分组启用：

| 分组 | 用途 |
|---|---|
| `read` | 账号、推文、搜索、时间线、媒体和通知 |
| `analytics` | 账号、受众、互动、情感、声誉和内容分析 |
| `ai` | 语气分析、生成、改写、优化和预测 |
| `write` | 发帖、回复、点赞、转发、关注、资料设置 |
| `dm` | 私信读取、发送和导出 |
| `automation` | 批量互动、自动点赞、自动评论和关系管理 |
| `monitoring` | 账号、关键词、品牌、实时流和通知 |
| `workflows` | 工作流、定时任务和 RSS 草稿 |
| `persona` | Persona 创建、运行、编辑和状态 |
| `data` | 导出、导入、CRM、数据集、团队和迁移 |
| `drafts` | 写操作草稿的查看、批准和丢弃 |

推荐先使用最小工具集：

```powershell
$env:XACTIONS_MCP_TOOLS = "read,analytics,ai,drafts"
```

只有在确认需要写操作时，再加入 `write`、`dm` 或 `automation`。

## 3. 本地启动

### API 和 Dashboard

第一个 PowerShell 窗口保持运行：

```powershell
cd D:\AI\XProject\XActions
npm run dev
```

访问：

```text
Dashboard: http://127.0.0.1:3001/
Health:    http://127.0.0.1:3001/api/health
```

### MCP HTTP

第二个 PowerShell 窗口执行：

```powershell
cd D:\AI\XProject\XActions

$cookies = Get-Content "$HOME\.xactions\cookies.json" -Raw | ConvertFrom-Json
$env:XACTIONS_SESSION_COOKIE = ($cookies | Where-Object { $_.name -eq "auth_token" }).value
$env:XACTIONS_CSRF_TOKEN = ($cookies | Where-Object { $_.name -eq "ct0" }).value
$env:XACTIONS_MCP_HOST = "127.0.0.1"
$env:XACTIONS_MCP_REQUIRE_APPROVAL = "1"
$env:XACTIONS_MCP_TOOLS = "read,analytics,ai,write,dm,drafts"

npm run mcp -- --http --port 8787
```

MCP 地址：

```text
http://127.0.0.1:8787/mcp
```

直接用浏览器 GET 访问 `/mcp` 返回 `400` 不代表服务失败；Streamable HTTP MCP 端点需要 MCP 客户端发送协议请求。

## 4. 登录态

推荐先使用 CLI 导入完整 Cookie：

```powershell
npm run cli -- login --cookies-file "C:\path\x-cookies.json"
npm run cli -- doctor
```

登录态保存位置：

```text
C:\Users\<用户>\.xactions\cookies.json
```

有效会话至少需要：

```text
auth_token
ct0
```

AI 不得要求用户把 Cookie 粘贴到聊天窗口，也不得把 Cookie 写入代码、Git、日志、工作流 JSON 或模型上下文。

## 5. 工具选择规则

### 读取账号

```text
用户资料       -> x_get_profile
用户推文       -> x_get_tweets
搜索           -> x_search_tweets
粉丝           -> x_get_followers
关注列表       -> x_get_following
未回关         -> x_get_non_followers
推文线程       -> x_get_thread
主页时间线     -> x_get_home_timeline
通知           -> x_get_notifications
书签           -> x_get_bookmarks
媒体           -> x_get_media / x_download_media
```

### 分析账号和内容

```text
账号报告       -> x_account_report
互动分析       -> x_engagement_report / x_get_post_analytics
账号对比       -> x_compare_accounts
受众重叠       -> x_audience_overlap
情感分析       -> x_analyze_sentiment
发布时间       -> x_best_time_to_post
账号声誉       -> x_reputation_report
内容语气       -> x_analyze_voice
高表现内容     -> x_evergreen_analyze
```

### 生成内容

```text
生成推文       -> x_generate_tweet
改写推文       -> x_rewrite_tweet
优化推文       -> x_optimize_tweet
生成线程       -> x_generate_variations 或 x_post_thread
推荐标签       -> x_suggest_hashtags
预测表现       -> x_predict_performance
```

### 修改账号

```text
发布推文       -> x_post_tweet
回复           -> x_reply
转发           -> x_retweet
引用转发       -> x_quote_tweet
点赞           -> x_like
书签           -> x_bookmark
关注           -> x_follow
取消关注       -> x_unfollow
静音           -> x_mute_user
取消静音       -> x_unmute_user
修改资料       -> x_update_profile
发送私信       -> x_send_dm
```

所有上述写操作都必须先经过“目标确认 -> 参数复核 -> 审批 -> 执行 -> 结果验证”。

## 6. 审批模式

启动 MCP 时保持：

```powershell
$env:XACTIONS_MCP_REQUIRE_APPROVAL = "1"
```

AI 执行写操作时，系统会返回草稿，而不是立即改变账号。批准流程：

```text
x_list_drafts       查看待审批操作
x_draft_status      查看单条草稿
x_approve_draft     批准并执行
x_discard_draft     丢弃
```

批准前检查：

- 目标用户名、推文 ID 或 URL 是否正确
- 文案、媒体和链接是否正确
- 是否会重复回复或重复互动
- 动作数量是否在本次任务额度内
- 是否涉及陌生人私信、批量关注或批量回复

## 7. 推荐的 AI 工作流

### 工作流 A：账号诊断

```text
1. x_get_profile
2. x_get_tweets
3. x_account_report
4. x_engagement_report
5. x_best_time_to_post
6. 输出问题、机会和下一步建议
```

此流程只读，不改变账号。

### 工作流 B：生成并审核一条内容

```text
1. 读取账号资料和最近高表现推文
2. x_analyze_voice
3. x_generate_tweet
4. x_rewrite_tweet 或 x_optimize_tweet
5. 展示候选文案、理由和预期目标
6. 用户确认后调用 x_post_tweet
7. 验证返回的推文 ID 和 URL
```

### 工作流 C：定向参与讨论

```text
1. x_search_tweets 搜索目标关键词
2. x_get_thread 读取上下文
3. x_analyze_sentiment 判断语境
4. 筛选少量高相关帖子
5. 生成回复草稿
6. 人工批准
7. x_reply 小批量执行
8. 保存已处理推文 ID，避免重复
```

### 工作流 D：定时内容计划

```text
1. x_account_report 和 x_best_time_to_post
2. x_generate_variations 生成候选内容
3. 人工选择和修改
4. x_schedule_add 创建计划
5. x_schedule_list 验证计划
6. 通过 monitoring 或通知工具观察结果
```

### 工作流 E：受控受众运营

```text
1. x_search_tweets 或 x_get_followers 获取候选集合
2. x_smart_target 或 x_graph_analyze 分析相关性
3. 去重、排除黑名单和已处理对象
4. 只生成少量 follow/reply 草稿
5. 审批后分批执行
6. x_action_budget 检查额度
```

## 8. 给 AI 的提示词模板

### 只读分析

```text
分析 @USERNAME 最近 50 条推文。
只使用读取和分析工具，不执行任何写操作。
输出：内容主题、发帖频率、互动率、表现最好的 5 条、3 条改进建议。
```

### 内容草稿

```text
根据 @USERNAME 最近的写作风格，为主题「TOPIC」生成 3 条中文 X 推文候选。
不要发布。每条给出文案、目标受众、使用的事实依据和潜在风险。
等待我确认后再创建发布草稿。
```

### 互动草稿

```text
搜索关键词「KEYWORD」最近的帖子。
只选择与账号主题高度相关且适合正常讨论的 5 条。
读取完整上下文，生成回复草稿，但不要点赞、关注、回复或私信。
先展示推文 URL、作者、选择理由和回复内容。
```

### 执行批准后的计划

```text
只执行我刚刚批准的草稿。
逐条执行，每条记录目标 ID、动作、返回状态和 URL。
遇到 401、403、429 或重复动作时立即停止并汇报，不要自动重试写操作。
```

## 9. 输出和审计要求

每次任务完成后，AI 应汇报：

```text
任务目标
使用的工具
读取对象数量
草稿数量
批准数量
成功数量
失败数量及原因
创建或修改的 URL/ID
剩余额度
下一步建议
```

对于批量任务，保存已处理对象的 ID，避免重复操作。对于失败动作，记录明确的 HTTP 状态或工具错误，不要把失败当成成功。

## 10. 风险控制

- 默认只读；没有明确授权时不执行写操作。
- 默认启用 MCP 草稿审批。
- 先小批量验证，再扩大任务范围。
- 不绕过限流，不使用多个账号制造虚假互动。
- 不批量发送陌生人私信，不重复发布相同内容。
- 不使用自动化手段骚扰、欺骗或操纵用户。
- 遵守 X 的平台规则、开发者条款和适用法律。
- Cookie、数据库密码、JWT 密钥和 AI API Key 只放在本地环境或密钥管理器中。

## 11. 诊断命令

```powershell
# 检查 Node、浏览器、MCP、登录态和查询 ID
npm run cli -- doctor

# 查看所有 CLI 命令
npm run cli -- --help

# 查看单个命令参数
npm run cli -- help search
npm run cli -- help engage
npm run cli -- help workflow

# 查看 MCP 分组和工具
node src/mcp/server.js --list-groups

# 查看 API 状态
Invoke-WebRequest http://127.0.0.1:3001/api/health
```

## 12. 相关文档

- [操作谱系图](xactions-operations-lineage.md)
- [MCP 配置](mcp-setup.md)
- [工作流](workflows.md)
- [自动化框架](automation.md)
- [AI 功能](ai-api.md)
- [CLI 参考](cli-reference.md)
