/**
 * 语音合成模块 - 替换 ElevenLabs 为 Edge TTS
 * 
 * 支持：Edge TTS（免费）、Web Speech API（备用）
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
  ) => {
    const fetchPromise = prevFetchPromise.then(async () => {
      const now = Date.now();
      if (now - lastTime < 1000) {
        await wait(1000 - (now - lastTime));
      }

      const result = await fetchEdgeTTSAudio(screenplay.talk.message, edgeTtsVoice)
        .catch((err) => {
          console.error("Edge TTS 合成失败:", err);
          return null;
        });

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
    prevSpeakPromise.then(() => {
      onComplete?.();
    });
  };
};

export const speakCharacter = createSpeakCharacter();

/**
 * 调用 Edge TTS 合成语音
 */
export const fetchEdgeTTSAudio = async (
  text: string,
  voice: string,
): Promise<EdgeTTSResult | null> => {
  if (!text || text.trim() === "") return null;

  return await synthesizeEdgeTTS(text, voice);
};

/**
 * 获取可用的 Edge TTS 发音人列表
 */
export const getAvailableVoices = () => {
  return getEdgeVoices();
};