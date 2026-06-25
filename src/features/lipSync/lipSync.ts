import { LipSyncAnalyzeResult } from "./lipSyncAnalyzeResult";

const TIME_DOMAIN_DATA_LENGTH = 2048;

/**
 * Oculus 15 viseme 列表
 * 用于将音频特征映射到 VRM blend shape
 */
const VISEME_MAP: Record<string, string> = {
  sil: "neutral",
  PP: "aa",
  FF: "ih",
  DD: "aa",
  kk: "kk",
  CH: "ih",
  SS: "ss",
  nn: "nn",
  RR: "oh",
  aa: "aa",
  E: "ee",
  ih: "ih",
  oh: "oh",
  ou: "ou",
};

export class LipSync {
  public readonly audio: AudioContext;
  public readonly analyser: AnalyserNode;
  public readonly timeDomainData: Float32Array;
  
  private _visemeQueue: Array<{ viseme: string; startTime: number; endTime: number }> = [];
  private _currentViseme: string = "sil";
  private _visemeWeight: number = 0;

  public constructor(audio: AudioContext) {
    this.audio = audio;
    this.analyser = audio.createAnalyser();
    this.timeDomainData = new Float32Array(TIME_DOMAIN_DATA_LENGTH);
  }

  /**
   * 设置 viseme 时间序列（由 Edge TTS word boundary 生成）
   */
  public setVisemeSequence(visemes: Array<{ viseme: string; startTime: number; endTime: number }>) {
    this._visemeQueue = [...visemes];
  }

  public update(): LipSyncAnalyzeResult {
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    let volume = 0.0;
    for (let i = 0; i < TIME_DOMAIN_DATA_LENGTH; i++) {
      volume = Math.max(volume, Math.abs(this.timeDomainData[i]));
    }

    // cook
    volume = 1 / (1 + Math.exp(-45 * volume + 5));
    if (volume < 0.1) volume = 0;

    // 检查是否有活动的 viseme
    const now = this.audio.currentTime;
    let activeViseme = this._currentViseme;
    let activeWeight = this._visemeWeight;

    // 查找当前时间对应的 viseme
    for (const v of this._visemeQueue) {
      if (now >= v.startTime && now < v.endTime) {
        activeViseme = v.viseme;
        // 计算在 viseme 区间内的进度（0-1 淡入淡出）
        const mid = (v.startTime + v.endTime) / 2;
        const halfDur = (v.endTime - v.startTime) / 2;
        activeWeight = Math.max(0, 1 - Math.abs(now - mid) / halfDur);
        break;
      }
    }

    // 清理已过期的 viseme
    this._visemeQueue = this._visemeQueue.filter(v => now < v.endTime);

    this._currentViseme = activeViseme;
    this._visemeWeight = activeWeight;

    return {
      volume,
      viseme: activeViseme,
      visemeWeight: volume > 0.1 ? activeWeight : 0,
    };
  }

  public async playFromArrayBuffer(buffer: ArrayBuffer, onEnded?: () => void) {
    const audioBuffer = await this.audio.decodeAudioData(buffer);

    const bufferSource = this.audio.createBufferSource();
    bufferSource.buffer = audioBuffer;

    bufferSource.connect(this.audio.destination);
    bufferSource.connect(this.analyser);
    bufferSource.start();
    if (onEnded) {
      bufferSource.addEventListener("ended", onEnded);
    }
  }

  public async playFromURL(url: string, onEnded?: () => void) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    this.playFromArrayBuffer(buffer, onEnded);
  }
}