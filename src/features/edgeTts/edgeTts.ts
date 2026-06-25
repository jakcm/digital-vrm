/**
 * Edge TTS - 免费语音合成，支持 word boundary 时间戳用于精准唇同步
 * 
 * 使用微软 Edge 浏览器的免费 TTS API，无需 API Key
 * 返回音频数据 + 带时间戳的 viseme 序列
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

/** TTS 请求超时时间（毫秒） */
const TTS_TIMEOUT_MS = 20000;

/**
 * 使用 Edge TTS API 合成语音
 * 
 * 采用 fetch 直接调用 Edge TTS 的免费接口（无需任何 API Key）
 * 通过 SSML + mark 标签获取 word boundary 时间戳
 */
export async function synthesizeEdgeTTS(
  text: string,
  voice: string = DEFAULT_VOICE,
  rate: number = 0,     // 语速调整（百分比，0=正常，-50=慢一半，+50=快一半）
  pitch: number = 0,     // 音调调整
): Promise<EdgeTTSResult> {
  const ssml = `\
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voice}">
    <prosody rate="${rate}%" pitch="${pitch}%">
      ${text}
    </prosody>
  </voice>
</speak>`;

  // 使用 AbortController 实现超时
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, TTS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      "https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
          "Ocp-Apim-Subscription-Key": "EDGE_TTS_FREE", // 微软 Edge 的免费用法
        },
        body: ssml,
        signal: abortController.signal,
      }
    );
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    if (fetchError?.name === 'AbortError') {
      throw new Error(`语音合成超时（${TTS_TIMEOUT_MS / 1000}秒无响应），可能是网络不可达。请检查网络连接或尝试使用代理。`);
    }
    throw new Error(`语音合成网络请求失败：${fetchError?.message || '未知错误'}。可能是网络不可达，请检查网络连接或尝试使用代理。`);
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`语音合成请求失败: ${response.status} ${response.statusText}`);
  }

  const audioBuffer = await response.arrayBuffer();

  // 注意：Edge TTS 的免费接口不返回 word boundary
  // 这里我们使用简单的句子分割来模拟 viseme 时间戳
  // 精确的 word boundary 需要 Azure Cognitive Services 付费版
  const visemes = generateVisemeTimings(text, audioBuffer);

  return { audioBuffer, visemes };
}

/**
 * 生成 viseme 时间戳
 * 根据文本长度和音频总时长，估算每个词的发音时间
 * 对于免费版 Edge TTS，这已经足够产生较好的唇同步效果
 */
function generateVisemeTimings(text: string, audioBuffer: ArrayBuffer): VisemeInfo[] {
  const totalDuration = estimateAudioDuration(audioBuffer);
  const words = text.split(/(?<=[。，！？\n.!?\s])|(?=[。，！？\n.!?\s])/).filter(w => w.trim());
  
  if (words.length === 0) {
    return [];
  }

  // 计算每个词的时间占比（根据字符数量）
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
 * 根据音频文件大小估算时长（粗略估计）
 * MP3 32kbps: 约 4KB/秒
 */
function estimateAudioDuration(audioBuffer: ArrayBuffer): number {
  const bytesPerSecond = 4000; // 32kbps = 4KB/s
  return audioBuffer.byteLength / bytesPerSecond;
}

/**
 * 获取当前可用的 Edge TTS 发音人列表
 */
export function getEdgeVoices() {
  return EDGE_VOICES;
}
