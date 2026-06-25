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
  private _playbackStartTime: number = 0; // 音频播放开始的 AudioContext 绝对时间

  public constructor(audio: AudioContext) {
    this.audio = audio;
    this.analyser = audio.createAnalyser();
    this.timeDomainData = new Float32Array(TIME_DOMAIN_DATA_LENGTH);
  }

  /**
   * 设置 viseme 时间序列（由 Edge TTS word boundary 生成）
   * 时间戳相对于音频播放起点（0-based）
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

    // 使用相对于播放起点的.elapsedTime来匹配 viseme
    // viseme 时间戳是 0-based（相对于音频开头），需要减去播放起始时间
    const elapsed = this.audio.currentTime - this._playbackStartTime;

    let activeViseme = "sil";
    let activeWeight = 0;

    // 查找当前时间对应的 viseme
    for (const v of this._visemeQueue) {
      if (elapsed >= v.startTime && elapsed < v.endTime) {
        activeViseme = v.viseme;
        // 计算在 viseme 区间内的进度（0-1 淡入淡出）
        const mid = (v.startTime + v.endTime) / 2;
        const halfDur = (v.endTime - v.startTime) / 2;
        activeWeight = Math.max(0, 1 - Math.abs(elapsed - mid) / halfDur);
        break;
      }
    }

    // 清理已过期的 viseme
    this._visemeQueue = this._visemeQueue.filter(v => elapsed < v.endTime);

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
    
    // 记录播放起始时间，用于 viseme 时间偏移
    this._playbackStartTime = this.audio.currentTime;
    
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
