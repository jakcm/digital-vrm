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
  private _isPlaying: boolean = false; // 音频是否正在播放
  private _currentBufferSource: AudioBufferSourceNode | null = null; // 当前音频源（用于停止/清理）

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
   * 从当前 AudioContext 时间开始驱动 viseme 序列。
   *
   * Edge TTS 音频播放会在 playFromArrayBuffer() 内记录起点；但 Web Speech API
   * 后备方案是浏览器自己播放音频，没有 AudioBufferSource 的 start() 可挂钩。
   * 如果不在这里重置播放起点，elapsed 会沿用上一次音频的起点，导致只有开头
   * 瞬间命中 viseme，后续直接错过整个序列。
   */
  public startVisemeSequence(visemes: Array<{ viseme: string; startTime: number; endTime: number }>) {
    this._playbackStartTime = this.audio.currentTime;
    this.setVisemeSequence(visemes);
  }

  /**
   * 清除 viseme 序列，回退到音量驱动模式
   * 应在音频播放结束后调用
   */
  public clearVisemeSequence() {
    this._visemeQueue = [];
    this._visemesActive = false;
    this._currentViseme = "sil";
    this._visemeWeight = 0;
  }

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * 手动设置播放状态（用于 Web Speech API 等无 AudioBufferSource 的场景）
   */
  public setPlaying(value: boolean) {
    this._isPlaying = value;
  }

  public update(): LipSyncAnalyzeResult {
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    let rawVolume = 0.0;
    for (let i = 0; i < TIME_DOMAIN_DATA_LENGTH; i++) {
      rawVolume = Math.max(rawVolume, Math.abs(this.timeDomainData[i]));
    }

    // ⚠️ 关键修复：sigmoid 的 DC 偏置问题
    // 旧代码：volume = 1 / (1 + Math.exp(-12 * volume + 2))
    // 当输入为 0（完全静音）时，sigmoid 输出 ≈ 0.119，永远高于所有阈值，
    // 导致 resetLipSync() 永远不被调用，嘴巴一直微微张开。
    // 修复：对原始音量做静音门限，只有真正有声音时才经过 sigmoid。
    let volume = 0;
    if (rawVolume >= 0.01) {
      volume = 1 / (1 + Math.exp(-12 * rawVolume + 2));
      if (volume < 0.05) volume = 0;
    }
    // rawVolume < 0.01 → volume = 0，彻底消除 DC 偏置

    // 使用相对于播放起点的elapsedTime来匹配 viseme
    // 应用唇同步偏移量（从 localStorage 读取，默认 -120ms）
    // 负值 = 嘴巴提前动（视觉上更自然）
    const lipsyncOffsetMs = parseInt(localStorage.getItem('lipsyncOffset') || '-120', 10);
    const elapsed = this.audio.currentTime - this._playbackStartTime - (lipsyncOffsetMs / 1000);

    let activeViseme = "sil";
    let activeWeight = 0;

    if (this._visemesActive) {
      // 清理已过期的 viseme
      this._visemeQueue = this._visemeQueue.filter(v => elapsed < v.endTime);

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

      // 如果队列空了（所有 viseme 已过期），说明 viseme 序列已耗尽。
      // 如果音频还在播放（_isPlaying=true），用音量做微弱的衰减；
      // 如果音频已结束（_isPlaying=false），彻底关闭 viseme 模式，确保闭嘴。
      if (this._visemeQueue.length === 0) {
        if (!this._isPlaying && rawVolume < 0.01) {
          // 音频已结束 + 静音 → 彻底关闭 viseme 模式
          this._visemesActive = false;
          this._currentViseme = "sil";
          this._visemeWeight = 0;
          return {
            volume: 0,
            viseme: "sil",
            visemeWeight: 0,
            visemesActive: false,
          };
        }
        // 音频仍在播放但 viseme 已耗尽，用音量做微弱衰减
        activeViseme = "sil";
        activeWeight = 0; // 不再用 sigmoid 偏置的 volume 驱动
      }

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
    // 停止并清理上一个音频源（防止多个音频重叠）
    if (this._currentBufferSource) {
      try { this._currentBufferSource.stop(); } catch {}
      this._currentBufferSource.disconnect();
      this._currentBufferSource = null;
    }

    const audioBuffer = await this.audio.decodeAudioData(buffer);

    const bufferSource = this.audio.createBufferSource();
    bufferSource.buffer = audioBuffer;

    bufferSource.connect(this.audio.destination);
    bufferSource.connect(this.analyser);
    
    // 记录播放起始时间，用于 viseme 时间偏移
    this._playbackStartTime = this.audio.currentTime;
    this._isPlaying = true;
    this._currentBufferSource = bufferSource;
    
    bufferSource.start();
    bufferSource.addEventListener("ended", () => {
      this._isPlaying = false;
      this._currentBufferSource = null;
      // 断开音频节点，防止 analyser 残留旧数据
      bufferSource.disconnect();
      if (onEnded) onEnded();
    });
  }

  public async playFromURL(url: string, onEnded?: () => void) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    this.playFromArrayBuffer(buffer, onEnded);
  }
}
