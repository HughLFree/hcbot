# Hack.chat AI Robot

本项目是一个适用于 `hack.chat` 聊天室的 AI 机器人系统。  
目前模型调用为 **DeepSeek API**。

## 主要功能

- 连接 `hack.chat` WebSocket，接收/发送消息
- 根据 `replyMode`（提及回复/随机回复）触发机器人回复
- 支持 `setprofile` 指令，抽取用户画像并保存
- 使用 SQLite 保存用户身份、画像与记忆数据
- 回复时由后端自动注入 `profile_json + memory_digest + memories` 上下文
- 前端可手动触发“记忆整合”（`/api/memories/consolidate`）
- 前端 WebSocket 链路已拆分为连接层 / 协议分发层 / 回复策略层
- 前后端共享接口契约（`shared/contracts.ts`），降低接口漂移风险

## 目录结构（简要）

```txt
src/                    前端（React + Vite）
  components/           界面组件
  hooks/                连接、回复、画像同步逻辑
    socket/             socket 分层（connectionLayer / protocolDispatcher / replyStrategy）
  api/                  前端到后端 API 调用封装
  config/               前端兜底配置
  types/                前端类型（映射 shared 契约）

server/                 后端（Express + SQLite）
  routes/               路由层（config + business/*）
  services/             业务服务（llm client / reply / profile / digest）
  db/                   数据库层（core / profiles / memories）
  config.mjs            后端统一配置入口

shared/
  contracts.ts          前后端共享接口契约（SSOT）

data/
  chat_memory.sqlite3   本地数据库文件
  reply.log             模型回复日志
```

## 前端实时链路（当前实现）

`useHackChatSocket` 只负责状态编排，具体职责下沉到 `src/hooks/socket/`：

1. `connectionLayer.ts`：管理 WebSocket 生命周期、join/ping、发送聊天消息。
2. `protocolDispatcher.ts`：分发 `chat/info/warn/online*` 协议消息，更新消息与在线用户状态。
3. `replyStrategy.ts`：独立封装“是否触发回复”策略（`mention` / `all`）。

## 回复上下文注入（当前实现）

当前回复链路中，`profile_json` 不再由前端回传；前端只提交聊天触发信息，后端自行聚合上下文：

1. 前端调用 `/api/reply/deepseek`，提交 `history / personality / targetTrip / targetMessage / targetSender`。
2. 后端按 `targetTrip` 从数据库读取：
   - `user_profile.profile_json`
   - `user_profile.memory_digest_json`
   - `memories`（按重要度与数量阈值筛选）
3. 后端把以上上下文拼接后再调用模型。
4. 模型返回的 memory items 由后端按存储阈值判断是否入库。

## 数据库初始化与迁移（当前实现）

数据库 schema 初始化与迁移不再在 `import` 阶段自动执行，而是显式由 `initDb()` 触发：

1. 服务入口 `server/index.mjs` 启动时调用 `initDb()`。
2. `server/db/profiles.mjs` 与 `server/db/memories.mjs` 使用延迟 prepare，首次真实访问时确保 DB 已初始化。
3. `initDb()` 是幂等的，多次调用只会初始化一次。

## 配置说明

### 1) 环境变量（`.env.local`）

后端启动命令是 `npm run dev:api`，实际执行：
`node --env-file=.env.local server/index.mjs`  
也就是说，后端会从项目根目录 `.env.local` 读取环境变量。

当前代码中支持的环境变量如下：

| 变量名 | 用途 | 默认值 | 取值/范围 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（回复、画像抽取、记忆梗概都依赖它） | 无（必填） | 字符串 |
| `API_PORT` | 后端 API 端口 | `8787` | 数字 |
| `EMBEDDING_DIM` | 向量维度（仅向量模式相关） | `1536` | 数字 |
| `SQLITE_VECTOR_EXTENSION_PATH` | sqlite 向量扩展动态库路径 | 空 | 文件路径 |
| `MEMORY_PROMPT_MIN_IMPORTANCE` | 回复前注入 prompt 的记忆最低重要度 | `1` | 整数，最终夹紧到 `1..10` |
| `MEMORY_PROMPT_MAX_ITEMS` | 回复前注入 prompt 的记忆条数上限 | `10` | 整数，最终夹紧到 `1..30` |
| `MEMORY_STORE_MIN_IMPORTANCE` | 模型产出的记忆写库最低重要度 | `1` | 整数，最终夹紧到 `1..10` |
| `MEMORY_STORE_ENABLED` | 是否允许写入记忆库 | `true` | `true/false/1/0/yes/no/on/off` |
| `MEMORY_DIGEST_SOURCE_MIN_IMPORTANCE` | 记忆整合时，参与梗概的最低重要度 | `2` | 整数，最终夹紧到 `1..10` |
| `MEMORY_DIGEST_SOURCE_MAX_ITEMS_PER_USER` | 记忆整合时，每用户最多取多少条记忆给模型概括 | `60` | 整数，最终夹紧到 `1..200` |
| `MEMORY_DIGEST_PRUNE_BELOW_IMPORTANCE` | 记忆整合后，删除低于该重要度的记忆 | `3` | 整数，最终夹紧到 `1..10` |
| `REPLY_PIPELINE_MODE` | 回复流程模式（单次调用 or 两次调用） | `single` | `single` / `two_pass` |

示例：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
API_PORT=8787
EMBEDDING_DIM=1536
MEMORY_STORE_ENABLED=true
MEMORY_PROMPT_MIN_IMPORTANCE=6
MEMORY_PROMPT_MAX_ITEMS=10
MEMORY_STORE_MIN_IMPORTANCE=6
MEMORY_DIGEST_SOURCE_MIN_IMPORTANCE=3
MEMORY_DIGEST_SOURCE_MAX_ITEMS_PER_USER=60
MEMORY_DIGEST_PRUNE_BELOW_IMPORTANCE=3
REPLY_PIPELINE_MODE=two_pass
```

### 2) 机器人默认配置（推荐）

创建 `server/bot.defaults.local.json`（已在 `.gitignore` 中，不会提交）：

```json
{
  "defaults": {
    "channel": "bot",
    "botName": "bot",
    "provider": "deepseek",
    "personality": "你的默认人格提示词",
    "replyMode": "mention"
  },
  "providers": [
    {
      "id": "deepseek",
      "label": "DeepSeek",
      "subtitle": "V3 Chat",
      "enabled": true
    }
  ]
}
```

读取优先级：
`server/bot.defaults.local.json` -> `server/bot.defaults.example.json`

## 本地运行

前置条件：Node.js 18+

1. 安装依赖：`npm install`
2. 启动后端：`npm run dev:api`
3. 启动前端：`npm run dev`
4. 可选检查：
   - 类型检查：`npm run typecheck`
   - 构建：`npm run build`
   - 测试：`npm test`

## 部署方法（简要）

### 方案 A：单机部署（推荐起步）

1. 在服务器拉取代码并执行 `npm install`
2. 配置 `.env.local` 和 `server/bot.defaults.local.json`
3. 构建前端：`npm run build`
4. 启动后端：`npm run dev:api`（生产建议使用 `pm2`/`systemd` 守护）
5. 使用 Nginx/Caddy：
   - 静态资源指向 `dist/`
   - `/api/*` 反向代理到 Node 服务（默认 `8787`）

### 方案 B：仅本地自托管

保持 `npm run dev:api` + `npm run dev` 双进程运行即可。

## 当前模型支持

- `deepseek`（已实现）
- 其他 provider 可在后端配置和路由中扩展
