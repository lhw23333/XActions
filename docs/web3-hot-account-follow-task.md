# Web3 热点账号间隔关注任务

> @author nich (@nichxbt)
> @license Apache-2.0

## 目的

这个任务使用 XActions 的新版 HTTP 客户端完成以下流程：

1. 搜索近期 Web3、Crypto、DeFi、链上数据、交易员和行业媒体相关的 Top 内容。
2. 提取内容作者并读取 Profile。
3. 按粉丝量、简介相关性、认证状态和近期内容热度排序。
4. 将候选账号写入本地持久化队列。
5. 每个周期只关注少量账号，并设置周期和每日上限。

默认参数是每 10 分钟最多关注 1 个账号，滚动 24 小时内最多 100 个账号。任务默认是 dry-run，只有显式传入 `--execute` 才会执行关注写操作。

## 启动方式

先验证 Cookie 文件存在并包含 `auth_token`、`ct0`，然后运行一次 dry-run：

```bash
node scripts/web3HotAccountFollow.js --once
```

确认候选队列后，启动实际间隔任务：

```bash
node scripts/web3HotAccountFollow.js \
  --interval-minutes 10 \
  --per-cycle 1 \
  --max-per-day 100 \
  --min-followers 10000 \
  --execute
```

PowerShell：

```powershell
node scripts/web3HotAccountFollow.js `
  --interval-minutes 10 `
  --per-cycle 1 `
  --max-per-day 100 `
  --min-followers 10000 `
  --execute
```

任务进程必须保持运行。可以使用 Windows Task Scheduler、PM2、Docker 或其他进程管理器保持它常驻。

## 状态文件

默认状态文件：

```text
~/.xactions/web3-hot-account-follow.json
```

其中记录：

- 待关注候选队列
- 已关注账号和时间
- 失败账号及错误
- 最近 24 小时内已经执行的关注时间戳
- 账号的粉丝量、来源搜索和评分

可以使用 `--state-file` 指定其他位置。

## 限速策略

- 默认每个周期最多 1 个关注。
- 默认周期为 10 分钟，最小强制为 5 分钟。
- 默认滚动 24 小时内最多 100 个关注，代码上限为 100。
- 同一个周期设置多个关注时，默认间隔 5 分钟。
- 连续运行不会重复关注已记录账号。
- 搜索和 Profile 读取不会执行写操作。
- 不传 `--execute` 时只发现并展示候选，不会关注账号。

这些限制只能降低频率，不能保证 X 永远不会限流。任务检测到错误会记录到状态文件，不会无限重试同一个账号。

## 调整参数

```bash
# 更保守：每小时一个，每天五个
node scripts/web3HotAccountFollow.js --interval-minutes 60 --max-per-day 5 --execute

# 提高筛选门槛，只看粉丝超过 100k 的账号
node scripts/web3HotAccountFollow.js --once --min-followers 100000

# 更换 Cookie 和状态文件
node scripts/web3HotAccountFollow.js \
  --cookie-file C:\\path\\cookies.json \
  --state-file C:\\path\\web3-follow-state.json \
  --once
```

## 注意事项

- 账号发现来自搜索结果，不等同于官方认证或投资建议。
- Profile 的 `verified` 字段不是唯一的权重判断标准，付费认证和组织账号可能有不同表现。
- 任务不会自动取消已有关注，也不会自动处理关注失败账号。
- Cookie 只从本机文件读取，不会写入状态文件；不要把 Cookie 提交到 Git。
- 该任务使用 `src/scrapers/twitter/http/engagement.js` 的 `followByUsername`，因此需要有效登录会话才能执行 `--execute`。
