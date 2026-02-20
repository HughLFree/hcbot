# Hack.chat AI Robot

本项目是一个适用于 `hack.chat` 聊天室的 AI 机器人系统。  
目前模型调用为 **DeepSeek API**。

## 主要功能

- 连接 `hack.chat` WebSocket，接收/发送消息
- 根据 `replyMode`（提及回复/随机回复）触发机器人回复
- 支持 `setprofile` 指令，抽取用户画像并保存
- 使用 SQLite 保存用户身份、画像与记忆数据
- 前后端共享接口契约（`shared/contracts.ts`），降低接口漂移风险

## 目录结构（简要）

```txt
src/                    前端（React + Vite）
  components/           界面组件
  hooks/                连接、回复、画像同步逻辑
  api/                  前端到后端 API 调用封装
  config/               前端兜底配置
  types/                前端类型（映射 shared 契约）

server/                 后端（Express + SQLite）
  routes/               路由层（配置路由 / 业务路由）
  services/             业务服务（回复生成、profile 抽取）
  db/                   数据库读写与清理逻辑
  config.mjs            后端统一配置入口

shared/
  contracts.ts          前后端共享接口契约（SSOT）

data/
  chat_memory.sqlite3   本地数据库文件
```

## 配置说明

### 1) 模型 Key

在 `.env.local` 中配置：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
API_PORT=8787
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
