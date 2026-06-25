/**
 * 唇形同步分析结果
 * 
 * volume: 音量（0-1），用于基础的嘴巴张合
 * viseme: 当前 viseme 名称（aa, ee, ih, oh, ou 等），用于精准唇形
 * visemeWeight: viseme 权重（0-1）
 */
export interface LipSyncAnalyzeResult {
  volume: number;
  viseme?: string;
  visemeWeight?: number;
  /** 是否有 viseme 序列正在驱动（true 时应走 viseme 路径，false 时走音量 fallback） */
  visemesActive?: boolean;
}