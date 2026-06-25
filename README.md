# 🤖 Digital VRM — 智能 3D 实时互动数字人

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
| 框架 | Next.js (TypeScript) |
| 部署 | GitHub Pages |

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
- Edge TTS **完全免费**，且提供 word boundary 时间戳，可精准驱动 viseme 唇同步
- 唇同步从原来的**音量驱动**（嘴巴随音量大小张合）升级为 **viseme 驱动**（根据发音映射嘴型）
- 注意：免费版 Edge TTS 不返回精确的 word boundary JSON，需要根据文本长度和音频时长估算

### 5. VRM 模型的唇同步兼容性
不是所有 VRM 模型都有完整的 viseme blendshape。下载模型后建议检查 BlendShape 列表是否包含 `aa`, `ih`, `ou`, `oh`, `ee` 等标准 viseme 名称。VRoid Hub 的 AvatarSample 系列通常兼容性最好。

### 6. GitHub Pages 部署避坑

#### 🔥 必须加 `.nojekyll` 文件
GitHub Pages 默认用 Jekyll 处理页面，会覆盖 Next.js 的静态 HTML。解决方法：
```bash
touch out/.nojekyll
npx gh-pages -d out --branch gh-pages --dotfiles
```

#### 🔥 不用 GitHub Actions
原项目带的 `.github/workflows/nextjs.yml` 使用已废弃的 `actions/upload-artifact@v3`，会报错。建议直接本地构建后推送到 `gh-pages` 分支：

```bash
npm run build && npm run export
npx gh-pages -d out --branch gh-pages
```

#### 🔥 大文件注意
VRM 模型文件通常 10-20MB，`npx gh-pages` 上传和 GitHub Pages 首次构建需要时间（1-3 分钟），期间返回 404 是正常的。

### 7. OpenRouter 已内置，无需额外修改
zoan37/ChatVRM 的 `src/features/chat/openAiChat.ts` 已经内置了 OpenRouter 的流式调用，包括：
- `getChatResponseStream` 流式函数
- `openRouterKey` 的 localStorage 持久化
- 模型切换逻辑（默认 `openai/gpt-oss-120b:nitro`）

### 8. 未来规划
- [ ] 跳舞功能：集成 VRM 动画文件（`.vrma`）播放
- [ ] 更多 VRM 动画：手势、表情组合
- [ ] 模型热替换 UI：设置面板中的模型 URL 输入
- [ ] 导出为可分享链接

## 许可证

MIT License — 基于 [zoan37/ChatVRM](https://github.com/zoan37/ChatVRM)（MIT）和 [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM)（MIT）。