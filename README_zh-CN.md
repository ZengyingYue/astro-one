<div align="center">
  <h1>🛰️ astro-one：航天智能助手框架</h1>
  <p>
    <img src="https://img.shields.io/badge/python-≥3.11-blue" alt="Python">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
    <img src="https://img.shields.io/badge/version-0.2.0-orange" alt="Version">
  </p>
  <p><em>超轻量级航天 AI 助手框架</em></p>
</div>

---

**astro-one** 是一个超轻量级的航天 AI 助手框架，基于 [nanobot](https://github.com/HKUDS/nanobot) 构建。它在保留 nanobot 核心代理功能的基础上，集成了多种航天专用机器学习工具，提供卫星机动检测、初轨确定和轨道预测等能力。

> 📖 [English Documentation](./README.md)

## ✨ 核心特性

| 特性 | 描述 |
|------|------|
| 🪶 **超轻量** | 基于 nanobot，99% 更少的代码量，启动快、资源占用低 |
| 🛰️ **航天专用工具** | 内置 MLF（机动检测）、IOD（初轨确定）、Orbin（轨道预测）三大 ML 工具 |
| 🔍 **自动巡天** | Auto Space Scan 后台服务，自动监控并处理卫星数据文件 |
| 🤖 **多模型支持** | 支持 OpenAI、Claude、Ollama、Gemini、DeepSeek 等数十种 LLM 提供商 |
| 💬 **多通道接入** | Telegram、Discord、飞书、钉钉、微信、Slack 等 15+ 聊天平台 |
| 🔧 **MCP 协议** | 支持 Model Context Protocol，可连接外部工具服务器 |
| 🧠 **持久记忆** | 内置记忆系统，支持长期上下文保持 |
| ⏰ **定时任务** | Cron 定时任务 + 心跳唤醒机制 |

## 📋 目录

- [安装](#-安装)
- [快速开始](#-快速开始)
- [航天工具](#-航天工具)
  - [MLF 机动检测](#mlf-机动检测)
  - [IOD 初轨确定](#iod-初轨确定)
  - [Orbin 轨道预测](#orbin-轨道预测)
  - [Auto Space Scan 自动巡天](#auto-space-scan-自动巡天)
- [配置](#️-配置)
- [聊天通道](#-聊天通道)
- [LLM 提供商](#llm-提供商)
- [CLI 命令](#-cli-命令)
- [Docker 部署](#-docker-部署)
- [项目结构](#-项目结构)
- [开发](#-开发)

## 📦 安装

**从源码安装**（推荐开发使用）

```bash
git clone https://github.com/ZengyingYue/astro-one.git
cd astro-one
pip install -e .
```

**安装开发依赖**

```bash
pip install -e ".[dev]"
```

## 🚀 快速开始

> [!TIP]
> 在 `~/.astro_one/config.json` 中设置你的 API 密钥。

**1. 初始化**

```bash
astroone onboard
```

**2. 配置** (`~/.astro_one/config.json`)

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-v1-xxx"
    }
  },
  "agents": {
    "defaults": {
      "model": "anthropic/claude-sonnet-4-6",
      "provider": "openrouter"
    }
  }
}
```

**3. 开始对话**

```bash
astroone agent
```

或者使用航天专用命令模式：

```bash
astroone agent -m "检测卫星 NORAD 25544 是否有机动行为"
```

## 🛰️ 航天工具

astro-one 内置了三种基于机器学习的航天分析工具，可通过 Agent 对话自然调用。

### MLF 机动检测

基于 **Liquid State Machine（液体状态机）** 模型的卫星机动检测工具。

**功能：**
- 从轨道参数预测卫星机动状态
- 输出机动概率和预测机动时间
- 包含高置信度目标的军事/战略分析
- 支持 23 维轨道特征（倾角、RAAN、偏心率等）

**使用方式：**

通过 Agent 对话自然调用：

```
> 分析卫星 TLE 数据中的机动行为
> 检测以下轨道根数是否表明卫星进行了机动
```

**输入参数：**
- 轨道六根数（半长轴、偏心率、倾角、RAAN、近地点幅角、平近点角）
- 历史轨道数据（可选）

**输出：**
- 机动概率（0-1）
- 预测机动时间
- 置信度评级
- 战略分析报告（针对高置信度目标）

### IOD 初轨确定

基于 **Transformer** 模型的初始轨道确定工具。

**功能：**
- 从观测数据预测卫星方向矢量
- 可选的卫星位置和速度预测
- 支持多种观测数据格式

**使用方式：**

```
> 根据观测数据进行初轨确定
> 给定以下角度观测数据，确定卫星轨道
```

**输入参数：**
- 观测时间
- 观测站位置
- 方向矢量（赤经、赤纬）

**输出：**
- 卫星方向矢量预测
- 卫星位置 (x, y, z)（可选）
- 卫星速度 (vx, vy, vz)（可选）

### Orbin 轨道预测

基于 **Informer** 模型的轨道根数预测工具。

**功能：**
- 预测卫星六个轨道根数的变化趋势
- 三模型集成，提升预测精度
- 支持长期轨道演化分析

**使用方式：**

```
> 预测卫星未来轨道根数变化
> 基于 TLE 数据预测轨道演化
```

**输出：**
- 轨道根数时间序列预测
- 位置 (x, y, z) 预测
- 速度 (vx, vy, vz) 预测

### Auto Space Scan 自动巡天

后台自动巡天服务，持续监控热文件夹中的航天数据。

**功能：**
- 自动检测并处理新到达的卫星数据文件
- 支持 MLF、IOD、Orbin 全部三种分析工具
- 可配置轮询间隔
- 结果自动报告

**配置示例：**

```json
{
  "autoSpaceScan": {
    "enabled": true,
    "hotFolder": "/data/satellite/incoming",
    "pollInterval": 60,
    "tools": ["mlf", "iod", "orbin"]
  }
}
```

## ⚙️ 配置

配置文件路径：`~/.astro_one/config.json`

### 基础配置

```json
{
  "agents": {
    "defaults": {
      "model": "anthropic/claude-sonnet-4-6",
      "provider": "openrouter",
      "workspace": "~/.astro_one/workspace"
    }
  },
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-v1-xxx"
    }
  },
  "gateway": {
    "port": 18790
  }
}
```

### 本地 Ollama 配置

无需 API 密钥，本地运行大模型：

```json
{
  "agents": { "defaults": { "model": "qwen3.5:27b", "provider": "ollama" } },
  "providers": { "ollama": { "apiBase": "http://localhost:11434" } }
}
```

### MCP 工具服务器

配置与 Claude Desktop / Cursor 兼容，可直接复制 MCP 服务器的配置：

```json
{
  "tools": {
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
      }
    }
  }
}
```

### 安全配置

| 选项 | 默认值 | 描述 |
|------|--------|------|
| `tools.restrictToWorkspace` | `false` | 限制 Agent 仅在工作目录内操作 |
| `channels.*.allowFrom` | `[]` | 白名单用户 ID，空数组拒绝所有访问，`["*"]` 允许所有人 |

## 💬 聊天通道

支持多种聊天平台接入，无需公网 IP 即可使用（大部分通道使用 WebSocket 长连接）：

| 通道 | 所需凭证 | 连接方式 |
|------|----------|----------|
| **飞书 (Feishu)** | App ID + App Secret | WebSocket 长连接 |
| **钉钉 (DingTalk)** | Client ID + Client Secret | Stream 模式 |
| **微信企业 (WeCom)** | Bot ID + Bot Secret | WebSocket 长连接 |
| **QQ** | App ID + App Secret | WebSocket |
| **Telegram** | Bot Token（@BotFather 获取） | 轮询/Webhook |
| **Discord** | Bot Token + Message Content Intent | WebSocket |
| **Slack** | Bot Token + App-Level Token | Socket Mode |
| **WhatsApp** | QR 码扫码 | Bridge 桥接 |
| **Matrix** | Access Token | 长连接 |
| **Email** | IMAP/SMTP 凭证 | IMAP 轮询 |
| **Microsoft Teams** | App 凭证 | WebSocket |

### 飞书配置示例

1. 前往 [飞书开放平台](https://open.feishu.cn/app) 创建应用，启用**机器人**能力
2. 添加权限 `im:message` 和 `im:message.p2p_msg:readonly`
3. 添加事件 `im.message.receive_v1`，选择**长连接**模式
4. 配置：

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "allowFrom": ["*"],
      "groupPolicy": "mention"
    }
  }
}
```

5. 启动：

```bash
astroone gateway
```

> [!TIP]
> 飞书使用 WebSocket 接收消息，无需 Webhook 或公网 IP！

### 钉钉配置示例

1. 前往 [钉钉开放平台](https://open-dev.dingtalk.com/) 创建应用，添加**机器人**能力
2. 开启 **Stream 模式**
3. 配置：

```json
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "clientId": "YOUR_APP_KEY",
      "clientSecret": "YOUR_APP_SECRET",
      "allowFrom": ["YOUR_STAFF_ID"]
    }
  }
}
```

## 🤖 LLM 提供商

| 提供商 | 说明 | 获取密钥 |
|--------|------|----------|
| `openrouter` | 推荐，支持所有主流模型 | [openrouter.ai](https://openrouter.ai) |
| `openai` | GPT 系列 | [platform.openai.com](https://platform.openai.com) |
| `anthropic` | Claude 系列 | [console.anthropic.com](https://console.anthropic.com) |
| `deepseek` | DeepSeek | [platform.deepseek.com](https://platform.deepseek.com) |
| `gemini` | Google Gemini | [aistudio.google.com](https://aistudio.google.com) |
| `dashscope` | 通义千问 (Qwen) | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com) |
| `moonshot` | Moonshot / Kimi | [platform.moonshot.cn](https://platform.moonshot.cn) |
| `zhipu` | 智谱 GLM | [open.bigmodel.cn](https://open.bigmodel.cn) |
| `siliconflow` | 硅基流动 | [siliconflow.cn](https://siliconflow.cn) |
| `groq` | 高速推理 + 语音转录 | [console.groq.com](https://console.groq.com) |
| `azure_openai` | Azure OpenAI | [portal.azure.com](https://portal.azure.com) |
| `ollama` | 本地模型 | 无需密钥 |
| `vllm` | 本地/兼容 OpenAI 的服务器 | 无需密钥 |
| `custom` | 任意 OpenAI 兼容端点 | 按需 |

添加新提供商仅需 2 步，详见 `astro_one/providers/registry.py`。

## 💻 CLI 命令

```bash
astroone onboard                        # 初始化配置和工作空间
astroone agent -m "Hello"               # 发送消息
astroone agent                          # 交互式聊天
astroone agent --stream                 # 流式输出模式
astroone gateway                        # 启动网关（连接聊天平台）
astroone status                         # 查看状态
astroone channels login                 # 登录通道（如 WhatsApp）
astroone provider login openai-codex    # OAuth 登录提供商
astroone serve                          # 启动 OpenAI 兼容 API 服务
```

交互模式退出：`exit`、`quit`、`/exit`、`/quit`、`:q` 或 `Ctrl+D`。

## 🐳 Docker 部署

### Docker Compose（推荐）

```bash
docker compose run --rm astro-one-cli onboard   # 首次设置
vim ~/.astro-one/config.json                     # 配置 API 密钥
docker compose up -d astro-one-gateway           # 启动网关
```

### Docker 手动构建

```bash
# 构建镜像
docker build -t astro-one .

# 首次初始化
docker run -v ~/.astro-one:/root/.astro-one --rm astro-one onboard

# 编辑配置
vim ~/.astro-one/config.json

# 启动网关
docker run -v ~/.astro-one:/root/.astro-one -p 18790:18790 astro-one gateway

# 单次命令
docker run -v ~/.astro-one:/root/.astro-one --rm astro-one agent -m "Hello!"
```

### Linux 系统服务

```bash
# 创建 systemd 用户服务
cat > ~/.config/systemd/user/astro-one-gateway.service << 'EOF'
[Unit]
Description=astro-one Gateway
After=network.target

[Service]
Type=simple
ExecStart=%h/.local/bin/astroone gateway
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# 启用并启动
systemctl --user daemon-reload
systemctl --user enable --now astro-one-gateway
```

## 📁 项目结构

```
astro_one/
├── agent/               # 🧠 核心 Agent 逻辑
│   ├── loop.py          #    Agent 循环（LLM ↔ 工具执行）
│   ├── context.py       #    Prompt 构建器
│   ├── memory.py        #    持久记忆
│   ├── skills.py        #    技能加载器
│   ├── subagent.py      #    后台任务执行
│   ├── auto_space_scan.py #  🔭 自动巡天服务
│   └── tools/           #    内置工具
│       ├── mlf_tool.py  #      🛰️ 机动检测（LSM 模型）
│       ├── iod_tool.py  #      🛰️ 初轨确定（Transformer 模型）
│       ├── orbin_tool.py #     🛰️ 轨道预测（Informer 模型）
│       ├── shell.py     #      Shell 命令执行
│       ├── filesystem.py #     文件系统操作
│       ├── web.py       #      Web 搜索和抓取
│       ├── mcp.py       #      MCP 协议工具
│       └── ...          #      更多工具
├── channels/            # 📱 聊天平台集成（15+ 通道）
│   ├── feishu.py        #    飞书
│   ├── dingtalk.py      #    钉钉
│   ├── wecom.py         #    企业微信
│   ├── qq.py            #    QQ
│   ├── telegram.py      #    Telegram
│   ├── discord.py       #    Discord
│   ├── slack.py         #    Slack
│   └── ...              #    更多通道
├── providers/           # 🤖 LLM 提供商（10+ 提供商）
├── bus/                 # 🚌 消息路由（pub/sub）
├── cron/                # ⏰ 定时任务
├── heartbeat/           # 💓 周期唤醒
├── session/             # 💬 会话管理
├── config/              # ⚙️ 配置管理
├── cli/                 # 🖥️ CLI 命令
├── skills/              # 🎯 内置技能模块
├── templates/           # 📄 模板文件
├── api/                 # 🌐 API 服务
├── apps/                # 📱 应用层
└── security/            # 🛡️ 安全模块
```

## 🔧 开发

### 环境设置

```bash
pip install -e ".[dev]"
```

### 代码规范

```bash
ruff check astro_one/      # Lint 检查
ruff format astro_one/     # 自动格式化
```

- **行宽**：100 字符
- **Python**：3.11+
- **Lint 规则**：E, F, I, N, W（忽略 E501）

### 运行测试

```bash
pytest tests/                                # 运行全部测试
pytest tests/test_auto_space_scan.py         # 航天工具测试
pytest tests/test_agent_runner_iterations.py # Agent 迭代测试
pytest tests/ -k "test_name"                 # 按名称匹配
```

### 分支策略

| 分支 | 用途 | 稳定性 |
|------|------|--------|
| `main` | 稳定发布 | 生产就绪 |
| `nightly` | 实验性功能 | 可能存在 Bug |

- **新功能、重构、API 变更** → 目标分支：`nightly`
- **Bug 修复、文档、小幅调整** → 目标分支：`main`

## 📄 许可证

MIT License — 详见 [LICENSE](LICENSE)

---

<div align="center">
  <p><em>🛰️ astro-one — 让航天智能触手可及</em></p>
</div>
