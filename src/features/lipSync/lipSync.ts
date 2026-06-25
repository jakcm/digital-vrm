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
  private _visemesActive: boolean = false; // 是否有 viseme 序列正在驱动

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
    this._visemesActive = visemes.length > 0;
  }

  /**
   * 清除 viseme 序列，回退到音量驱动模式
   * 应在音频播放结束后调用
   */
  public clearVisemeSequence() {
    this._visemeQueue = [];
    this._visemesActive = false;
  }

  public update(): LipSyncAnalyzeResult {
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    let volume = 0.0;
    for (let i = 0; i < TIME_DOMAIN_DATA_LENGTH; i++) {
      volume = Math.max(volume, Math.abs(this.timeDomainData[i]));
    }

    // cook — 使用更平滑的 sigmoid，避免音量被压到恒定 1.0
    volume = 1 / (1 + Math.exp(-12 * volume + 2));
    if (volume < 0.05) volume = 0;

    // 使用相对于播放起点的.elapsedTime来匹配 viseme
    const elapsed = this.audio.currentTime - this._playbackStartTime;

    let activeViseme = "sil";
    let activeWeight = 0;

    if (this._visemesActive) {
      // viseme 驱动模式：只按时间序列查找，不受音量影响
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
        visemeWeight: activeWeight,
        visemesActive: true,
      };
    }

    // 音量驱动 fallback（无 viseme 序列时）
    this._currentViseme = "sil";
    this._visemeWeight = 0;

    return {
      volume,
      viseme: "sil",
      visemeWeight: 0,
      visemesActive: false,
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
