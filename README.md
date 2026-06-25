# 🤖 Digital VRM — 智能 3D 实时互动数字人

> **🎯 原始诉求**：基于 VRM 实现智能 3D 实时互动数字人，能说话、唇形同步、表情同步、有动作姿势。

基于 [zoan37/ChatVRM](https://github.com/zoan37/ChatVRM) 深度改造的 VRM 数字人，支持：

- 🗣️ **说话** — Edge TTS 免费语音合成（无需 API Key）
- 👄 **唇形同步** — Viseme 驱动的精准唇同步
- 😊 **表情同步** — 8 种情绪（开心/难过/生气/可爱/害怕/嫌弃/犯困/中性）
- 🏃 **动作姿势** — VRM 标准动画系统 + 空闲循环动画
- 🧠 **AI 对话** — OpenRouter 多模型切换（DeepSeek / GPT / Claude 等）
- 🎤 **语音输入** — Web Speech API 中文语音识别
- 🎮 **性格设定** — 可编辑 Prompt，自定义数字人性格
- 💃 **跳舞** — 规划中（下次迭代）

## 快速开始

### 在线访问

👉 **https://jakcm.github.io/digital-vrm/**

### 本地运行

```bash
git clone https://github.com/jakcm/digital-vrm.git
cd digital-vrm
npm install
npm run dev
# 浏览器打开 http://localhost:3000
```

### 配置

1. **OpenRouter API Key** — 点击 Settings，填入 OpenRouter Key（支持 DeepSeek / GPT / Claude 等模型）
2. **选择发音人** — Settings 中选择 Edge TTS 发音人（晓晓 / 云希 / Aria 等）
3. **性格设定** — Settings 中可编辑 System Prompt，自定义数字人性格
4. **VRM 模型** — 拖拽 .vrm 文件到页面即可更换模型

## 技术栈

| 组件 | 技术 |
|:----|:----|
| 3D 渲染 | Three.js + [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm) |
| 语音合成 | [Edge TTS](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/)（免费） |
| LLM 对话 | [OpenRouter](https://openrouter.ai/)（多模型） |
| 唇同步 | Viseme 驱动（词级别时间戳） |
| 语音输入 | [Web Speech API](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Speech_API) |
| 框架 | Next.js 13.2.4 (TypeScript, Pages Router, 静态导出) |
| 部署 | GitHub Pages (`gh-pages` 分支) |

## 项目架构

### 目录结构

```
src/
├── pages/
│   ├── index.tsx          # 主页面，管理所有状态（systemPrompt, openRouterKey, chatLog 等）
│   ├── _app.tsx           # Next.js App 包装
│   ├── _document.tsx      # HTML 文档模板
│   └── api/               # API Routes（静态导出模式下不可用，仅本地开发用）
│       ├── chat.ts         #   Chat API（未使用，已注释）
│       ├── tts.ts          #   TTS 代理（未使用）
│       └── refresh-token.ts#   Restream token 刷新
├── components/
│   ├── messageInput.tsx       # 底部消息输入栏（含麦克风、文本输入、发送按钮）
│   ├── messageInputContainer.tsx # 消息输入容器（管理语音识别 + 发送逻辑）
│   ├── settings.tsx           # Settings 面板（API Key、语音选择、系统提示词、背景图、版权信息）
│   ├── menu.tsx               # 顶部菜单（Settings / Conversation Log 按钮、VRM 文件上传）
│   ├── introduction.tsx       # 初始介绍弹窗
│   ├── vrmViewer.tsx          # VRM Canvas 渲染容器
│   ├── chatLog.tsx            # 对话历史展示
│   ├── assistantText.tsx      # AI 回复气泡
│   ├── githubLink.tsx         # GitHub 链接
│   ├── iconButton.tsx         # 通用图标按钮
│   ├── textButton.tsx         # 通用文本按钮
│   ├── link.tsx               # 通用链接
│   ├── meta.tsx               # SEO meta 标签
│   └── restreamTokens.tsx     # Restream 直播聊天集成
├── features/
│   ├── chat/
│   │   └── openAiChat.ts      # OpenRouter API 流式调用 + SSE 解析
│   ├── messages/
│   │   ├── messages.ts        # Message 类型定义 + Screenplay 类型 + 情绪解析
│   │   ├── speakCharacter.ts  # 语音合成协调（Edge TTS → 播放 → 唇同步）
│   │   └── messageMiddleOut.ts# 消息压缩中间件（超长对话截断）
│   ├── vrmViewer/
│   │   └── viewerContext.ts   # VRM Viewer Context + Three.js 场景管理
│   ├── edgeTts/
│   │   └── edgeTts.ts         # Edge TTS 语音列表 + SSML 生成 + 音频请求
│   ├── emoteController/        # 表情控制器
│   ├── lipSync/                # 唇同步（Viseme 映射）
│   ├── speech/                 # 语音识别（Web Speech API）
│   └── constants/
│       └── systemPromptConstants.ts # 默认系统提示词（数字人性格设定）
├── services/
│   └── websocketService.ts    # Restream WebSocket 服务
├── lib/                        # 工具库
├── styles/                     # 全局样式
└── utils/
    └── buildUrl.ts             # basePath 感知的 URL 构建工具
```

### 核心数据流

```
用户输入文字/语音
  → MessageInputContainer (handleSendChat)
  → index.tsx (handleSendChat)
    → MessageMiddleOut.process()          # 超长对话截断
    → openAiChat.getChatResponseStream()   # OpenRouter SSE 流式请求
    → 逐句读取流式响应
      → textsToScreenplay()                # 情绪标签解析 [happy]文本 → {expression, talk}
      → speakCharacter()                   # Edge TTS 合成 → 音频播放
        → VRM Viewer.speak()               # 唇同步 + 表情动画
      → setAssistantMessage()              # 更新 UI 气泡
    → setChatLog()                         # 持久化到 localStorage
```

### 关键配置文件

| 文件 | 作用 |
|:----|:-----|
| `next.config.js` | `basePath` / `assetPrefix` / `publicRuntimeConfig.root` 均读取 `process.env.BASE_PATH` |
| `package.json` | Next.js 13.2.4，构建脚本 `build` / `export` |
| `tsconfig.json` | TypeScript 配置，路径别名 `@/` → `src/` |

## 重要经验与避坑 🚧

### 1. Ready Player Me 已关停 ⚠️
RPM 于 **2026年1月31日** 正式下线（被 Netflix 收购后关停）。如果项目之前依赖 RPM 作为 3D 模型源，需要迁移。

### 2. VRM 模型来源
ChatVRM 项目**不内置任何 VRM 模型**（仅有一个 `idle_loop.vrma` 动画文件）。推荐来源：
- 🥇 [VRoid Hub](https://hub.vroid.com/en/models) — 免费下载，搜索 `AvatarSample` 系列
- 🥈 [VRoid Studio](https://vroid.com/en/studio) — 免费软件自制模型
- 🥉 [BOOTH](https://booth.pm) — 付费购买专业模型

### 3. 选择 zoan37/ChatVRM 而非 pixiv 原版
- **pixiv/ChatVRM** 已于 2024 年归档，使用 Koeiromap API（日语 TTS）+ ChatGPT API
- **zoan37/ChatVRM** 更活跃，已内置 **OpenRouter 支持**（`openAiChat.ts` 直接写了 OpenRouter 流式调用），改用 ElevenLabs

### 4. Edge TTS 替换 ElevenLabs 的关键改动
- ElevenLabs 需要付费 API Key
- Edge TTS **完全免费**，可返回音频与 word boundary 时间戳，用于驱动 viseme 唇同步
- 唇同步从原来的**音量驱动**（嘴巴随音量大小张合）升级为 **viseme 驱动**（根据发音映射嘴型）
- 当 Edge TTS 没有返回 word boundary 或进入 Web Speech API 后备链路时，需要根据文本长度和音频时长生成 fallback viseme

### 5. 唇形同步经验：不要只看 TTS，要检查时间轴和表情清理
如果数字人表现为“第一次回复开头张一下嘴，后面一直张着/不动”，优先检查以下三类问题，而不是直接更换 TTS：

1. **播放时间轴起点**：Edge TTS 音频通过 `AudioBufferSource.start()` 播放时会记录 `_playbackStartTime`；但 Web Speech API 后备方案是浏览器自己播放音频，不会进入 `playFromArrayBuffer()`。这种场景必须调用 `startVisemeSequence()` 手动重置 viseme 时间轴，否则 `elapsed` 会沿用旧音频起点，导致后续 viseme 全部错过。
2. **中文 word boundary 粒度**：中文 TTS 的 word boundary 常常是一整句或一整个词。不能直接把一个中文片段映射成一个嘴型，否则会变成“开头动一下，后面同一个嘴型”。项目通过 `buildVisemeSequence()` 将中文文本拆到字符级，再映射到 `aa / ih / ou / ee / oh`，让中文语音期间持续变化嘴型。
3. **嘴型 preset 清理**：VRM 嘴型不只 `aa`，还包括 `ee / ih / oh / ou / JawOpen` 等。闭嘴时只把 `aa` 设为 0 会让上一个嘴型残留。项目通过 `resetLipSync()` 统一清空所有可能嘴型，避免“嘴一直张着”。

相关文件：
- `src/features/lipSync/lipSync.ts` — viseme 时间轴、序列启停、音频播放
- `src/features/vrmViewer/model.ts` — word boundary → 字符级 viseme 序列、中文映射、播放结束清理
- `src/features/emoteController/expressionController.ts` — VRM mouth expression 重置
- `scripts/lipSyncRegressionTest.js` — 唇同步回归检查脚本

### 6. VRM 模型的唇同步兼容性
不是所有 VRM 模型都有完整的 viseme blendshape。下载模型后建议检查 BlendShape 列表是否包含 `aa`, `ih`, `ou`, `oh`, `ee` 等标准 viseme 名称。VRoid Hub 的 AvatarSample 系列通常兼容性最好。

### 7. GitHub Pages 部署避坑

#### 🔥 必须加 `.nojekyll` 文件
GitHub Pages 默认用 Jekyll 处理页面，会覆盖 Next.js 的静态 HTML。解决方法：
```bash
touch out/.nojekyll
npx gh-pages -d out --branch gh-pages --dotfiles
```

#### 🔥 不用 GitHub Actions
原项目带的 `.github/workflows/nextjs.yml` 使用已废弃的 `actions/upload-artifact@v3`，会报错。建议直接本地构建后推送到 `gh-pages` 分支。

#### 🔥 大文件注意
VRM 模型文件通常 10-20MB，`npx gh-pages` 上传和 GitHub Pages 首次构建需要时间（1-3 分钟），期间返回 404 是正常的。

#### 🔥 `BASE_PATH` 必须在 build 和 export 两阶段都设置
`next.config.js` 中 `basePath`、`assetPrefix`、`publicRuntimeConfig.root` 均读取 `process.env.BASE_PATH`。如果构建时不设此环境变量，生成的 HTML 会引用 `/_next/...` 而非 `/digital-vrm/_next/...`，导致 GitHub Pages 上所有 JS/CSS 返回 404，React 无法 hydrate，页面表现为空白或 "Application error"。

**正确的完整部署流程：**

```bash
# 1. 构建（必须带 BASE_PATH）
BASE_PATH=/digital-vrm npx next build

# 2. 静态导出（Next.js export 读取上一步 .next 构建产物）
npx next export

# 3. 添加 .nojekyll（防止 Jekyll 覆盖）
touch out/.nojekyll

# 4. 部署到 gh-pages 分支
npx gh-pages -d out -b gh-pages --dotfiles

# 5. 等待 CDN 刷新（约 30 秒）
sleep 30
```

> ⚠️ 裸 `npm run build && npm run export`（不带 `BASE_PATH`）会导致部署后页面白屏。

### 8. OpenRouter 已内置，无需额外修改
zoan37/ChatVRM 的 `src/features/chat/openAiChat.ts` 已经内置了 OpenRouter 的流式调用，包括：
- `getChatResponseStream` 流式函数
- `openRouterKey` 的 localStorage 持久化
- 模型调用逻辑（当前默认 `deepseek/deepseek-v4-flash`）

> ⚠️ 公开 GitHub Pages 部署不要在 `NEXT_PUBLIC_OPENROUTER_API_KEY` 中内置真实密钥。`NEXT_PUBLIC_*` 会被 Next.js 烤进客户端 JS bundle，公开仓库推送时可能触发 GitHub Push Protection，且密钥会泄露。正确做法是让用户在 Settings 页面自行输入 OpenRouter Key，并保存到浏览器 localStorage。

### 9. 未来规划
- [ ] 跳舞功能：集成 VRM 动画文件（`.vrma`）播放
- [ ] 更多 VRM 动画：手势、表情组合
- [ ] 模型热替换 UI：设置面板中的模型 URL 输入
- [ ] 导出为可分享链接

## 许可证

MIT License — 基于 [zoan37/ChatVRM](https://github.com/zoan37/ChatVRM)（MIT）和 [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM)（MIT）。