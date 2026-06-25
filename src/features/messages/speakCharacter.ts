/**
 * 语音合成模块 - Edge TTS (主) + Web Speech API (后备)
 * 
 * 优先使用 Edge TTS（WebSocket 协议，免费，返回 word boundary 时间戳）
 * 如果 Edge TTS 不可用（网络问题等），回退到浏览器内置的 Web Speech API
 */

import { wait } from "@/utils/wait";
import { synthesizeEdgeTTS, getEdgeVoices, EdgeTTSResult } from "../edgeTts/edgeTts";
import { Viewer } from "../vrmViewer/viewer";
import { Screenplay } from "./messages";

const createSpeakCharacter = () => {
  let lastTime = 0;
  let prevFetchPromise: Promise<unknown> = Promise.resolve();
  let prevSpeakPromise: Promise<unknown> = Promise.resolve();

  return (
    screenplay: Screenplay,
    edgeTtsVoice: string,
    viewer: Viewer,
    onStart?: () => void,
    onComplete?: () => void
  ): Promise<void> => {
    const fetchPromise = prevFetchPromise.then(async () => {
      const now = Date.now();
      if (now - lastTime < 1000) {
        await wait(1000 - (now - lastTime));
      }

      // 尝试 Edge TTS，失败则回退到 Web Speech API
      const result = await fetchEdgeTTSAudio(screenplay.talk.message, edgeTtsVoice);

      lastTime = Date.now();
      return result;
    });

    prevFetchPromise = fetchPromise;
    prevSpeakPromise = Promise.all([fetchPromise, prevSpeakPromise]).then(([result]) => {
      onStart?.();
      if (!result) {
        // 没有音频时只更新表情
        return viewer.model?.speak(null, screenplay);
      }
      // 传递 viseme 序列给模型
      return viewer.model?.speak(result.audioBuffer, screenplay, result.visemes);
    });
    
    // 返回 promise 以便调用方可以 await
    return prevSpeakPromise.then(() => {
      onComplete?.();
    });
  };
};

export const speakCharacter = createSpeakCharacter();

/**
 * 调用 Edge TTS 合成语音
 * 如果 Edge TTS 失败，回退到 Web Speech API
 */
export const fetchEdgeTTSAudio = async (
  text: string,
  voice: string,
): Promise<EdgeTTSResult | null> => {
  if (!text || text.trim() === "") return null;

  try {
    return await synthesizeEdgeTTS(text, voice);
  } catch (edgeTtsError) {
    console.warn('Edge TTS 失败，尝试回退到 Web Speech API:', edgeTtsError);
    
    // 回退到浏览器内置 Web Speech API
    try {
      const fallbackResult = await synthesizeWithWebSpeech(text, voice);
      return fallbackResult;
    } catch (webSpeechError) {
      console.error('Web Speech API 也失败了:', webSpeechError);
      // 两个都失败了，抛出原始 Edge TTS 错误（包含网络信息）
      throw edgeTtsError;
    }
  }
};

/**
 * Web Speech API 后备方案
 * 使用浏览器内置的 SpeechSynthesis 进行语音合成
 * 生成模拟的 viseme 时间戳（基于文本分词估算）
 */
async function synthesizeWithWebSpeech(text: string, voiceName: string): Promise<EdgeTTSResult | null> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error('浏览器不支持 Web Speech API');
  }

  // 查找匹配的语音
  const voices = window.speechSynthesis.getVoices();
  // 尝试精确匹配，然后尝试语言匹配
  let voice = voices.find(v => v.name === voiceName);
  if (!voice) {
    // 从 voiceName 提取语言代码（如 zh-CN-XiaoxiaoNeural → zh-CN）
    const lang = voiceName.split('-').slice(0, 2).join('-');
    voice = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split('-')[0]));
  }

  return new Promise<EdgeTTSResult>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // 收集 word boundary 事件（Chrome 支持 boundary 事件）
    const visemes: { word: string; offset: number; duration: number }[] = [];
    let startTime = 0;

    utterance.onstart = () => {
      startTime = performance.now() / 1000;
    };

    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      const currentTime = performance.now() / 1000;
      const offset = currentTime - startTime;
      const word = event.name === 'word' ? text.substring(event.charIndex, event.charIndex + (event.charLength || 1)) : '';
      visemes.push({
        word,
        offset,
        duration: 0.2, // 估算每个词 200ms
      });
    };

    // Web Speech API 不产生音频 ArrayBuffer，我们需要用 AudioContext 录制
    // 但这比较复杂，这里我们返回一个特殊标记，让 speakCharacter 走 Web Speech 路径
    // 实际上，我们直接用 Web Speech API 播放，不经过 LipSync 的 playFromArrayBuffer
    
    utterance.onend = () => {
      // 生成一个空的 audioBuffer 和 visemes
      // 真正的播放已经由 Web Speech API 完成了
      resolve({
        audioBuffer: new ArrayBuffer(0), // 空缓冲区，model.speak 会跳过音频播放
        visemes,
      });
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      reject(new Error(`Web Speech API 错误: ${event.error}`));
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * 获取可用的 Edge TTS 发音人列表
 */
export const getAvailableVoices = () => {
  return getEdgeVoices();
};
