# dsh-plugins · 个人 DSH 插件仓库

本人在 DeepSeek Harness（DSH）Web 上使用的自定义插件整合仓库（monorepo）。

## 插件清单

| 包 | 目录 | 说明 | 许可 |
|---|---|---|---|
| `@dsh-external/dsh-session-bridge` | [`packages/session-bridge/`](packages/session-bridge/README.md) | DSH 跨会话信箱 + 📬 渲染 + 长消息折叠 + 布局宽度自定义 | MIT |

## 安装

```sh
git clone https://github.com/fhy-A/dsh-plugins
cd <harness>
dsh plugin --profile web add C:/Users/Admin/Desktop/dsh-plugins/packages/session-bridge
# 重启 dsh web 后生效
```

## 开发日志

DSH 生态开发日志（所有包的完成事实与验证记录）见 [`docs/development-log/`](docs/development-log/README.md)。

## 皮肤

皮肤类插件（maid-atelier）保留在 [dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale) 协作仓库，不在此收编。
