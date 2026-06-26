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
  private _smoothedWeight: number = 0; // ⚠️ 修复根因 3：平滑插值后的权重
  private _smoothedViseme: string = "sil"; // 平滑后的 viseme（用于渐变过渡）
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
    // ⚠️ 根因 C 修复：音频未在播放时，AnalyserNode 内部 buffer 仍残留上一帧样本，
    // getFloatTimeDomainData 会返回非零值导致 volume 永不归零 → 嘴一直张着。
    // 当没有活跃音频源时，直接强制静音结果，不读取 analyser。
    if (!this._isPlaying && this._currentBufferSource === null) {
      // 平滑衰减到零（避免硬切）
      this._smoothedWeight *= 0.5;
      if (this._smoothedWeight < 0.01) this._smoothedWeight = 0;
      return {
        volume: 0,
        viseme: this._smoothedWeight > 0.01 ? this._smoothedViseme : "sil",
        visemeWeight: this._smoothedWeight,
        visemesActive: this._visemesActive && this._smoothedWeight > 0.01,
      };
    }

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

    const elapsed = this.audio.currentTime - this._playbackStartTime;

    let activeViseme = "sil";
    let activeWeight = 0;

    if (this._visemesActive) {
      // 清理已过期的 viseme
      this._visemeQueue = this._visemeQueue.filter(v => elapsed < v.endTime);

      // viseme 驱动模式：只按时间序列查找，不受音量影响
      for (const v of this._visemeQueue) {
        if (elapsed >= v.startTime && elapsed < v.endTime) {
          activeViseme = v.viseme;
          // ⚠️ 修复根因 2：非对称权重包络
          // 旧代码（对称三角波）：weight 在区间中点达峰，前后对称
          //   → 嘴型在每个字符中间停留太久，看起来"卡在张嘴状态"
          // 新代码（非对称包络）：参照 digital-human 项目
          //   快速张嘴（20% 处达峰）→ 缓慢闭嘴（95% 处归零）
          //   → 更接近真实说话的嘴型节奏
          const progress = (elapsed - v.startTime) / (v.endTime - v.startTime);
          if (progress < 0.20) {
            // 淡入：0 → 1（前 20% 快速上升到峰值）
            activeWeight = progress / 0.20;
          } else {
            // 淡出：1 → 0（后 80% 缓慢下降）
            activeWeight = Math.max(0, 1 - (progress - 0.20) / 0.75);
          }
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
          this._smoothedWeight = 0;
          return {
            volume: 0,
            viseme: "sil",
            visemeWeight: 0,
            visemesActive: false,
          };
        }
        // 音频仍在播放但 viseme 已耗尽
        activeViseme = "sil";
        activeWeight = 0;
      }

      this._currentViseme = activeViseme;
      this._visemeWeight = activeWeight;

      // ⚠️ 修复根因 3+5：平滑插值替代硬重置
      // 旧代码：每帧直接输出 activeWeight，在 viseme 边界处会 0→1→0 跳变
      //   → model.update() 中 gap 帧会触发 resetLipSync() → 闪烁
      // 新代码：用指数平滑滤波器，消除高频跳变
      //   当 viseme 切换时，先快速衰减旧值再上升新值
      const SMOOTH_UP = 0.35;   // 张嘴方向平滑系数（越小越平滑）
      const SMOOTH_DOWN = 0.55; // 闭嘴方向平滑系数（比张嘴稍快，防止拖沓）

      if (activeViseme !== this._smoothedViseme) {
        // viseme 切换：先快速衰减旧 viseme 的权重
        this._smoothedWeight *= SMOOTH_DOWN;
        if (this._smoothedWeight < 0.05) {
          // 旧值衰减到足够低，切换到新 viseme
          this._smoothedViseme = activeViseme;
          this._smoothedWeight = activeWeight * SMOOTH_UP;
        }
      } else {
        // 同一 viseme：平滑追踪目标值
        const target = activeWeight;
        if (target > this._smoothedWeight) {
          // 上升（张嘴）
          this._smoothedWeight += (target - this._smoothedWeight) * SMOOTH_UP;
        } else {
          // 下降（闭嘴）
          this._smoothedWeight += (target - this._smoothedWeight) * SMOOTH_DOWN;
        }
      }

      return {
        volume,
        viseme: this._smoothedViseme,
        visemeWeight: this._smoothedWeight,
        visemesActive: true,
      };
    }

    // 音量驱动 fallback（无 viseme 序列时）
    this._currentViseme = "sil";
    this._visemeWeight = 0;
    this._smoothedWeight *= 0.5; // 平滑衰减
    if (this._smoothedWeight < 0.01) this._smoothedWeight = 0;

    return {
      volume,
      viseme: "sil",
      visemeWeight: 0,
      visemesActive: false,
    };
  }

  /**
   * 播放音频并驱动唇同步。
   *
   * ⚠️ 关键时序修复（根因 A）：viseme 序列必须在 bufferSource.start() 之后、
   * 与 _playbackStartTime 在同一同步执行栈内设置。之前 model.speak 在调用本方法
   * （含 await decodeAudioData）之前就 setVisemeSequence，导致 decode 期间每帧
   * update() 用旧 _playbackStartTime 算出巨大 elapsed，filter 把整个队列清空，
   * 且 _isPlaying=false 时 _visemesActive 被关闭 → 整个回复退化为纯音量驱动。
   */
  public async playFromArrayBuffer(
    buffer: ArrayBuffer,
    onEnded?: () => void,
    visemeSequence?: Array<{ viseme: string; startTime: number; endTime: number }>,
  ) {
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

    // ⚠️ 必须在 start() 之后、同一同步栈内设置 viseme 队列，
    // 确保 _playbackStartTime 与队列基于同一时刻，避免 decode 期间队列被旧时间清空。
    if (visemeSequence && visemeSequence.length > 0) {
      this.setVisemeSequence(visemeSequence);
    }
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
