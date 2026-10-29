# AIPA — 你的个人智能体

[English](README.md) · **简体中文**

AIPA（Artificial Intelligence Personal Agent）让你的 AI 宿主拥有跨会话的记忆、个人规则、可复用技能和项目上下文。数据以文件保存，由你自行掌握。

**版本 1.0.2 · 本地优先 · Apache-2.0**

本仓库是公开基础模板。日常使用前，请在独立目录初始化你的私有实例，不要把个人资料提交到这个公开仓库。

## AIPA 能做什么

| 功能 | 适用场景 |
|---|---|
| 持久记忆 | 保存偏好、决策与有用经验，按项目检索相关记录并追溯来源。 |
| 个人规则与档案 | 设置智能体的工作方式、隐私边界和回答语言。 |
| 项目与会话延续 | 保存项目上下文、任务进度、检查点及下一步，重新进入会话时继续工作。 |
| 技能与导师 | 使用通用工作流和专业指导，并添加个人技能。 |
| 总结与提醒 | 通过宿主或已配置的 Hub 任务生成日、月、年回顾，跟踪待办并给出相关提醒。 |
| 可迁移的个人知识 | 以 Markdown、YAML、JSON 保存数据，可选用自己的私有 Git 仓库同步。 |
| 可选网页入口 | 通过 Hub 使用网页对话、随手记、图片、已授权的网络检索及定时工作流。 |

AIPA 提供规则和机械工具，由你配置的 AI 宿主进行模型推理并执行工作流。若需要在关闭编辑器后继续运行定时任务，可以部署可选的 Hub。

## 选择使用方式

- **IDE 或 CLI：** 使用能遵循仓库指令、执行本地 Node.js 命令的 AI 宿主，无须部署 Hub。
- **网页和后台任务：** 先初始化私有实例，再部署 [AIPA Hub](https://github.com/StriveJ/artificial-intelligence-personal-agent-hub)。
- **开发框架：** 在 [Origin](https://github.com/StriveJ/artificial-intelligence-origin-agent) 修改源码；Personal 由其 `product/` 生成。

Core 框架、Hub 程序、个人实例数据分别更新。

## 安装

### 1. 准备环境

安装 **Node.js 24** 和 **Git 2.31 或更新版本**。发行基线覆盖 Windows x64 和 Linux x64。Core 使用 Node 内置模块，没有第三方运行时包依赖。

在所选 IDE 或 CLI 宿主中配置模型。AIPA 不附带模型账号、API 订阅或凭据。Hub 的依赖和执行器需单独配置。

### 2. 获取基础模板

```bash
git clone --branch v1.0.2 https://github.com/StriveJ/artificial-intelligence-personal-agent.git
cd artificial-intelligence-personal-agent
```

使用正式公布的发行标签，核对完整提交和公布的版本包摘要。安装其他版本时，替换为对应标签。

### 3. 初始化私有实例

```bash
node scripts/aipa-init.mjs --root /absolute/path/to/my-aipa --owner "你的名字"
```

Windows 示例：

```powershell
node scripts/aipa-init.mjs --root D:/agents/my-aipa --owner "你的名字"
```

目标必须是基础模板目录之外的新目录，不要对已有实例重新初始化。

初始化后会生成实例清单、框架、空白个人区和本地 Git 基线：

```text
my-aipa/
  AIPA-MANIFEST.yaml
  AGENTS.md
  core-space/       框架规则、技能和工具
  user-space/       个人档案、偏好、记忆及项目
  state/            本地运行状态
```

还可指定 `--industry`、`--tech "Python,TypeScript"` 和 `--role`。

### 4. 激活 AIPA

在 AI 宿主中打开**私有实例目录**。Claude Code 中使用 `/aipa`；其他支持的宿主中，明确要求激活 AIPA，并遵循 `AGENTS.md` 和[激活协议](core-space/activation.md)。

检查 `user-space/profile.yaml` 中的档案、`user-space/privacy.yaml` 中的隐私规则，以及 `user-space/overrides.yaml` 中的个人偏好。

日常请求示例：

- “记住当前项目的这项决策。”
- “接着上次的进度继续，列出下一步任务。”
- “总结今天的工作，并提炼可复用的经验。”
- “找到之前讨论过的偏好的原始来源。”

记录和报告需要宿主实际执行工作流；仅打开文件不会启动后台服务。

## 模型回答语言

界面、CLI 和框架指令统一为英文，模型回答及生成报告可以使用你的语言。在 `user-space/overrides.yaml` 配置：

```yaml
display:
  language: auto
```

`auto` 跟随当前输入语言，无法判断时使用英文。也可指定 `en`、`zh-CN`、`ja` 或 `es` 等标签。当前消息中明确提出的语言要求优先。已有笔记和个人记录保持原文。

## 部署可选 Hub

Hub 提供网页入口和独立于编辑器运行的服务。

1. 按上文初始化私有实例。
2. 阅读 [Hub 安装指南](https://github.com/StriveJ/artificial-intelligence-personal-agent-hub#installation)。
3. 将配置和运行状态保存在公开源码仓库之外。
4. 配置实例路径、模型执行器及凭据；Main 提供网页入口，其他设备可按需运行 Sub。
5. 远程使用网页前配置 HTTPS 和配对认证。

网页对话不提供任意命令执行。模型、图片和网络功能取决于你显式配置的执行器及服务。

## 更新个人实例

**通过可信基础模板更新框架，个人数据保留在实例中。**

先停止相关 Hub 写入、定时任务和活动中的 AIPA 会话，保存工作并备份。

在基础模板仓库中选择目标发行版：

```bash
git fetch --tags origin
git checkout v1.0.2
```

将 `v1.0.2` 替换为准备安装的较新发行版本；重复安装当前版本会被拒绝。先预览：

```bash
node scripts/aipa-update.mjs --root /absolute/path/to/my-aipa --artifact . --framework-only
```

核对目标版本、来源、兼容性和受管文件改动，再显式应用：

```bash
node scripts/aipa-update.mjs --root /absolute/path/to/my-aipa --artifact . --framework-only --apply
```

受控更新器替换框架受管文件，并保留 `user-space/`。遇到未知基线、本地框架改动、格式不兼容或活动锁时可能拒绝更新。应先处理具体原因，不要通过直接覆盖文件绕过检查。

完成后重启 Hub，并让宿主重新加载 AIPA 指令。Hub 程序需单独更新。中断恢复、Git／版本包来源与兼容规则见[发行和更新指南](RELEASE.md)。

## 多设备使用

初始化后的实例拥有独立 Git 仓库，可连接你自己的**私有**远端：

```bash
git -C /absolute/path/to/my-aipa remote add origin <your-private-repository-url>
```

推送前检查跟踪文件和忽略规则，避免提交凭据、设备配置和本地运行状态。其他设备应恢复或克隆已有私有实例，不要在其目录上重新初始化。参见[设备恢复指南](RELEASE.md#restore-on-another-device)。

## 三仓库分工

| 仓库 | 职责 |
|---|---|
| [Origin](https://github.com/StriveJ/artificial-intelligence-origin-agent) | Core 权威源码、模板、构建工具及测试 |
| Personal（本仓库） | 生成的公开基础模板、安装器及完整性清单 |
| [Hub](https://github.com/StriveJ/artificial-intelligence-personal-agent-hub) | 网页入口、主从服务、调度及 Hub 受管更新 |
| 私有实例 | 你的档案、隐私规则、记忆、技能和项目记录 |

通用框架改进提交到 Origin，Hub 改进提交到 Hub。不要直接修改生成的 Personal 来替代源文件修改。

## 联系我

如果你有什么建议与想法，可以发邮箱联系我：

- [1905212905@qq.com](mailto:1905212905@qq.com)
- [strivejun@gmail.com](mailto:strivejun@gmail.com)

## 隐私和许可证

外部模型、检索和同步遵循你的授权与实例隐私规则。配置密钥不代表允许发送全部文件。不要把真实实例、对话、凭据和运行配置提交到公开仓库。

原创代码和文档采用 [Apache License 2.0](LICENSE)，包含其明确的专利授权条款；第三方组件保留各自许可证。你的个人实例数据由你自行掌握。
