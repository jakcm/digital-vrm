/**
 * Edge TTS - 免费语音合成，基于 WebSocket 协议
 * 
 * 使用微软 Edge 浏览器的内置朗读功能（与 Edge 浏览器"大声朗读"同一接口）
 * 无需 API Key，通过 WebSocket 连接获取音频 + 真实的 word boundary 时间戳
 * 
 * 参考实现：https://github.com/rany2/edge-tts (Python)
 */

export type VisemeInfo = {
  word: string;
  offset: number;   // 在音频中的开始时间（秒）
  duration: number; // 持续时间（秒）
};

export type EdgeTTSResult = {
  audioBuffer: ArrayBuffer;
  visemes: VisemeInfo[];
};

// 微软 Edge TTS 发音人列表
export const EDGE_VOICES = [
  { name: "zh-CN-XiaoxiaoNeural", label: "晓晓（女，中文）" },
  { name: "zh-CN-YunxiNeural", label: "云希（男，中文）" },
  { name: "zh-CN-YunyeNeural", label: "云野（男，中文，小说）" },
  { name: "en-US-AriaNeural", label: "Aria（女，英文）" },
  { name: "en-US-GuyNeural", label: "Guy（男，英文）" },
  { name: "ja-JP-NanamiNeural", label: "Nanami（女，日文）" },
];

const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

/** Edge TTS 固定的 TrustedClientToken（公开值，非密钥） */
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

/** WebSocket 连接超时 */
const WS_TIMEOUT_MS = 15000;

/**
 * 生成 RFC 4122 格式的 UUID（无横线）
 */
function generateUUID(): string {
  // 优先使用浏览器原生 crypto
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // 回退到手动生成
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) continue;
    uuid += hex[Math.floor(Math.random() * 16)];
  }
  return uuid;
}

/**
 * 获取当前 ISO 格式时间戳
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 使用 Edge TTS WebSocket API 合成语音
 * 
 * 流程：
 * 1. 连接到 wss://speech.platform.bing.com/.../edge/v1
 * 2. 发送 config 消息（指定输出格式 + 启用 word boundary）
 * 3. 发送 SSML 消息
 * 4. 接收音频数据和 word boundary 元数据
 * 5. 拼接所有音频 chunk，解析 word boundary 时间戳
 */
export async function synthesizeEdgeTTS(
  text: string,
  voice: string = DEFAULT_VOICE,
  rate: number = 0,
  pitch: number = 0,
): Promise<EdgeTTSResult> {
  if (!text || text.trim() === "") {
    throw new Error("语音合成文本为空");
  }

  const requestId = generateUUID();
  
  // 构建 SSML
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voice}">
    <prosody rate="${rate}%" pitch="${pitch}%">
      ${text}
    </prosody>
  </voice>
</speak>`;

  // 构建 WebSocket URL
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

  return new Promise<EdgeTTSResult>((resolve, reject) => {
    const audioChunks: ArrayBuffer[] = [];
    const visemes: VisemeInfo[] = [];
    let settled = false;

    // 超时处理
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch {}
        reject(new Error(`语音合成超时（${WS_TIMEOUT_MS / 1000}秒无响应），可能是网络不可达。请检查网络连接或尝试使用代理。`));
      }
    }, WS_TIMEOUT_MS);

    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
    } catch (err: any) {
      clearTimeout(timeoutId);
      reject(new Error(`语音合成 WebSocket 连接失败：${err?.message || '未知错误'}`));
      return;
    }

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      // 1. 发送 config 消息
      const configMessage =
        `Path:audio\r\n` +
        `X-RequestId:${requestId}\r\n` +
        `X-Timestamp:${getTimestamp()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "true",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });

      ws.send(configMessage);

      // 2. 发送 SSML 消息
      const ssmlMessage =
        `Path:ssml\r\n` +
        `X-RequestId:${requestId}\r\n` +
        `X-Timestamp:${getTimestamp()}\r\n` +
        `Content-Type:application/ssml+xml\r\n\r\n` +
        ssml;

      ws.send(ssmlMessage);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        // 文本消息：可能是元数据或 turn.end
        const lines = event.data.split('\r\n');
        const pathLine = lines.find(l => l.startsWith('Path:'));
        const path = pathLine?.substring(5).trim();

        if (path === 'turn.end') {
          // 合成完成
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            try { ws.close(); } catch {}
            
            if (audioChunks.length === 0) {
              reject(new Error('语音合成完成但未收到音频数据'));
              return;
            }

            // 合并所有音频 chunk
            const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const audioBuffer = new ArrayBuffer(totalLength);
            const view = new Uint8Array(audioBuffer);
            let offset = 0;
            for (const chunk of audioChunks) {
              view.set(new Uint8Array(chunk), offset);
              offset += chunk.byteLength;
            }

            // 如果没有收到 word boundary，生成估算的 visemes
            const finalVisemes = visemes.length > 0
              ? visemes
              : generateFallbackVisemes(text, audioBuffer);

            resolve({ audioBuffer, visemes: finalVisemes });
          }
          return;
        }

        // 解析 word boundary 元数据
        if (path === 'audio.metadata') {
          const jsonStart = event.data.indexOf('{');
          if (jsonStart >= 0) {
            try {
              const metadata = JSON.parse(event.data.substring(jsonStart));
              // WordBoundary: { "Offset": 500000, "Duration": 1500000, "text": "你好" }
              // Offset 和 Duration 单位是百纳秒（100ns ticks）
              if (metadata?.Metadata?.[0]?.WordBoundary) {
                const wb = metadata.Metadata[0].WordBoundary;
                visemes.push({
                  word: wb.text || wb.Text || '',
                  offset: (wb.Offset || 0) / 10_000_000,  // 百纳秒 → 秒
                  duration: (wb.Duration || 0) / 10_000_000,
                });
              }
            } catch {
              // 解析失败，忽略这条元数据
            }
          }
        }
      } else if (event.data instanceof ArrayBuffer) {
        // 二进制消息：音频数据
        // Edge TTS 的二进制消息前 2 字节是头部长度（大端），后面是音频数据
        const data = new Uint8Array(event.data);
        if (data.length > 2) {
          const headerLength = (data[0] << 8) | data[1];
          const audioData = event.data.slice(2 + headerLength);
          if (audioData.byteLength > 0) {
            audioChunks.push(audioData);
          }
        }
      }
    };

    ws.onerror = (err: Event) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('语音合成 WebSocket 连接出错，可能是网络不可达。请检查网络连接或尝试使用代理。'));
      }
    };

    ws.onclose = () => {
      if (!settled) {
        // 连接关闭但未收到 turn.end
        settled = true;
        clearTimeout(timeoutId);
        if (audioChunks.length > 0) {
          // 有音频数据但没收到 turn.end，仍然返回
          const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
          const audioBuffer = new ArrayBuffer(totalLength);
          const view = new Uint8Array(audioBuffer);
          let offset = 0;
          for (const chunk of audioChunks) {
            view.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }
          const finalVisemes = visemes.length > 0
            ? visemes
            : generateFallbackVisemes(text, audioBuffer);
          resolve({ audioBuffer, visemes: finalVisemes });
        } else {
          reject(new Error('语音合成连接意外关闭，未收到音频数据。可能是网络不稳定。'));
        }
      }
    };
  });
}

/**
 * 后备 viseme 生成：当 WebSocket 未返回 word boundary 时使用
 * 根据文本长度和音频大小估算
 */
function generateFallbackVisemes(text: string, audioBuffer: ArrayBuffer): VisemeInfo[] {
  const totalDuration = estimateAudioDuration(audioBuffer);
  const words = Array.from(text).filter((char) => char.trim() && !/[。，！？\n.!?\s]/.test(char));
  
  if (words.length === 0) return [];

  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  let currentOffset = 0;
  
  return words.map((word) => {
    const charRatio = word.length / totalChars;
    const duration = totalDuration * charRatio;
    const info: VisemeInfo = {
      word,
      offset: currentOffset,
      duration,
    };
    currentOffset += duration;
    return info;
  });
}

/**
 * 根据音频文件大小估算时长
 * MP3 48kbps: 约 6KB/秒
 */
function estimateAudioDuration(audioBuffer: ArrayBuffer): number {
  const bytesPerSecond = 6000; // 48kbps = 6KB/s
  return audioBuffer.byteLength / bytesPerSecond;
}

/**
 * 获取当前可用的 Edge TTS 发音人列表
 */
export function getEdgeVoices() {
  return EDGE_VOICES;
}
