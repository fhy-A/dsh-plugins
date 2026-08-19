# dsh-session-bridge · DSH 跨会话信箱与界面增强插件

DSH（DeepSeek Harness）Web 的双会话协作插件：**开发会话与审批会话（或任意两会话）通过跨会话信箱互发消息**，消息推送进目标会话历史并自动唤醒对方 agent；同时提供用户消息长内容折叠与聊天区宽度自定义等界面增强。

## 功能

| 能力 | 说明 |
|---|---|
| 跨会话信箱 | `mailbox_send` / `mailbox_poll` / `mailbox_inspect` / `mailbox_board` / `mailbox_read` 五个模型工具（v1–v7.1 定稿） |
| 推送 + 自动唤醒 | 目标会话 live 时消息直接进入其历史（📬 气泡）并自动唤醒对方 agent 处理；非 live 目标与公告板走信箱拉取降级；防死循环边界（轮次只由真实新消息触发、无轮询无自动读取、board 永不唤醒） |
| 📬 消息渲染 | 用户侧气泡 + 「📬 来自会话 <id>」徽标 + 悬停时间戳 + 复制按钮（v3） |
| 长消息折叠 | 用户消息与 📬 消息超过 8 行自动折叠（6 行预览 + 渐隐 + 展开/收起），DOM 增强零接管 |
| 布局自定义 | 聊天内容列 1200px；用户/📬 消息 82%、助手消息 90% 百分比宽度 |

## 安装

```sh
cd <harness>
dsh plugin --profile web add C:/Users/Admin/Desktop/dsh-deep-whale/session-bridge
# 或从远端：dsh plugin --profile web add https://github.com/fhy-A/dsh-session-bridge
# 重启 dsh web 后生效
```

## 双会话协作工作流

开发会话与审批会话按 approval-relay 协议（本地副本 `code/docs/approval-relay-protocol.md`）协作：开发任务唯一写者、审批只读；审批请求/决定经信箱推送传递，用户在两会话间切换触发。

## 数据与安全

- 消息文件：`<DSH_HOME>/session-bridge/`（`mailbox/<会话id>.jsonl`、`board.jsonl`、`cursors/`、`delivered/`），append-only JSONL，损坏行容错
- 工具只读写信箱，不提升文件/命令/授权权限；禁止在消息中写入 API Key 或敏感凭据

## 开发

```sh
pnpm install && pnpm build   # 产出 lib/index.mjs（host）+ lib/store.mjs + lib/client.js（browser）
pnpm test                    # node --test 跑 store 单元测试
```

## 开发日志

完成事实与验证记录见 [`docs/development-log/`](docs/development-log/README.md)（DSH 生态开发日志，2026-08-19 起）。

## 许可

MIT。
