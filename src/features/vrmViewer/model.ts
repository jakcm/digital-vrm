import * as THREE from "three";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRMAnimation } from "../../lib/VRMAnimation/VRMAnimation";
import { VRMLookAtSmootherLoaderPlugin } from "@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin";
import { LipSync } from "../lipSync/lipSync";
import { EmoteController } from "../emoteController/emoteController";
import { Screenplay } from "../messages/messages";
import { VisemeInfo } from "../edgeTts/edgeTts";

/**
 * 3Dキャラクターを管理するクラス
 */
export class Model {
  public vrm?: VRM | null;
  public mixer?: THREE.AnimationMixer;
  public emoteController?: EmoteController;

  private _lookAtTargetParent: THREE.Object3D;
  private _lipSync?: LipSync;

  private prevPlayedEmotion: string | null = null;

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent;
    this._lipSync = new LipSync(new AudioContext());
  }

  public async loadVRM(url: string): Promise<void> {
    const loader = new GLTFLoader();
    loader.register(
      (parser) =>
        new VRMLoaderPlugin(parser, {
          lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
        })
    );

    const gltf = await loader.loadAsync(url);

    const vrm = (this.vrm = gltf.userData.vrm);
    vrm.scene.name = "VRMRoot";

    // log all info about vrm, including blend shapes and expressions
    console.log(vrm);

    VRMUtils.rotateVRM0(vrm);
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent);
  }

  public unLoadVrm() {
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
  }

  /**
   * VRMアニメーションを読み込む
   */
  public async loadAnimation(vrmAnimation: VRMAnimation): Promise<void> {
    const { vrm, mixer } = this;
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const clip = vrmAnimation.createAnimationClip(vrm);
    const action = mixer.clipAction(clip);
    action.play();
  }

  /**
   * 音声を再生し、リップシンクを行う
   * 支持 viseme 序列驱动的精准唇同步
   */
  public async speak(
    buffer: ArrayBuffer | null,
    screenplay: Screenplay,
    visemes?: VisemeInfo[]
  ) {
    // prevent flickering of avatar expression
    if (this.prevPlayedEmotion !== screenplay.expression) {
      this.emoteController?.playEmotion(screenplay.expression);
      this.prevPlayedEmotion = screenplay.expression;
    }

    if (!buffer || buffer.byteLength === 0) {
      // Web Speech API 后备方案：音频已由浏览器播放，只需设置 viseme 序列
      if (visemes && visemes.length > 0) {
        const visemeSequence = buildVisemeSequence(visemes);
        this._lipSync?.startVisemeSequence(visemeSequence);
      }
      // 标记为"播放中"，防止 viseme 队列中途空了就被过早关闭
      this._lipSync?.setPlaying(true);
      // 等待一段时间让 viseme 动画播放（基于文本长度估算）
      const msgLength = screenplay.talk.message.length;
      const estimatedDuration = visemes && visemes.length > 0
        ? visemes[visemes.length - 1].offset + visemes[visemes.length - 1].duration
        : Math.min(msgLength * 0.15, 10);
      await new Promise(resolve => setTimeout(resolve, estimatedDuration * 1000));
      // 清除 viseme 序列和播放状态，避免残留
      this._lipSync?.setPlaying(false);
      this._lipSync?.clearVisemeSequence();
      this.resetLipSync();
      return;
    }

    // 如果有 viseme 序列，传给 lipSync
    if (visemes && visemes.length > 0) {
      const visemeSequence = buildVisemeSequence(visemes);
      this._lipSync?.setVisemeSequence(visemeSequence);
    }

    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(buffer, () => {
        // 音频播放结束，清除 viseme 序列，回退到音量驱动
        this._lipSync?.clearVisemeSequence();
        resolve(true);
      });
    });
  }

  public update(delta: number): void {
    if (this._lipSync) {
      const { volume, viseme, visemeWeight, visemesActive } = this._lipSync.update();

      if (visemesActive) {
        // viseme 驱动模式：严格按 viseme 序列驱动
        const weight = visemeWeight ?? 0;
        if (weight > 0 && viseme && viseme !== "sil") {
          // 有效 viseme：驱动嘴型
          const vrmViseme = mapToVRMViseme(viseme);
          if (vrmViseme) {
            this.emoteController?.lipSync(vrmViseme as any, weight);
          }
        } else if (volume > 0.08) {
          // viseme 间隙但有音量：用音量做微弱平滑（避免突变）
          this.emoteController?.lipSync("aa" as any, volume * 0.3);
        } else {
          // viseme 间隙 + 低音量：闭嘴
          this.resetLipSync();
        }
      } else {
        // 音量驱动 fallback（无 viseme 序列时）
        // 修复后 sigmoid 不会再产生 DC 偏置，volume=0 时此分支会走 resetLipSync()
        if (volume > 0.08) {
          let expression = this.vrm?.expressionManager?.getExpression("JawOpen");
          if (expression) {
            // @ts-ignore
            this.emoteController?.lipSync("JawOpen", volume * 0.4);
          } else {
            this.emoteController?.lipSync("aa" as any, volume * 0.4);
          }
        } else {
          // 音量足够低，完全闭嘴
          this.resetLipSync();
        }
      }
    }

    this.emoteController?.update(delta);
    this.mixer?.update(delta);
    this.vrm?.update(delta);
  }

  private resetLipSync() {
    this.emoteController?.resetLipSync();
  }
}

/**
 * 将 TTS word boundary 拆成更细的字符级 viseme 片段。
 * 中文按字符拆分，英文按字符拆分后每个字符独立映射 viseme。
 * 序列末尾自动添加 trailing silence 确保闭嘴。
 */
function buildVisemeSequence(visemes: VisemeInfo[]): Array<{ viseme: string; startTime: number; endTime: number }> {
  const sequence = visemes.flatMap((v) => {
    const wordStr = v.word.trim();
    if (!wordStr) return [{ viseme: "sil", startTime: v.offset, endTime: v.offset + v.duration }];

    const chars = Array.from(wordStr).filter((char) => char.trim() && !/[。，！？\n.!?\s]/.test(char));
    if (chars.length === 0) {
      return [{ viseme: "sil", startTime: v.offset, endTime: v.offset + v.duration }];
    }

    const segmentDuration = v.duration / chars.length;
    return chars.map((char, index) => ({
      viseme: mapWordToViseme(char),
      startTime: v.offset + segmentDuration * index,
      endTime: v.offset + segmentDuration * (index + 1),
    }));
  });

  // 在序列末尾添加一个 trailing silence，确保最后一个 viseme 结束后嘴巴能合上
  if (sequence.length > 0) {
    const last = sequence[sequence.length - 1];
    sequence.push({
      viseme: "sil",
      startTime: last.endTime,
      endTime: last.endTime + 0.3, // 300ms 的静默
    });
  }

  return sequence;
}

/**
 * 将单词映射到 viseme 名称
 * 基于 Oculus 15 viseme 标准 + 扩展音素覆盖
 */
function mapWordToViseme(word: string): string {
  const char = word.charAt(0);

  // 中文字符 → 基于 unicode 的多样化映射
  if (/^[\u4e00-\u9fff]$/.test(char)) {
    const chineseVisemes = ["aa", "ih", "ou", "ee", "oh"];
    const index = (char.charCodeAt(0) + word.length * 7) % chineseVisemes.length;
    return chineseVisemes[index];
  }

  const firstChar = word.charAt(0).toLowerCase();
  const visemeMap: Record<string, string> = {
    // 元音
    'a': 'aa',
    'e': 'ee',
    'i': 'ih',
    'o': 'oh',
    'u': 'ou',
    'y': 'ee',
    'w': 'ou',
    // 双唇音
    'b': 'PP',
    'p': 'PP',
    'm': 'PP',
    // 唇齿音
    'f': 'FF',
    'v': 'FF',
    // 齿龈音
    't': 'DD',
    'd': 'DD',
    'l': 'nn',
    'n': 'nn',
    'r': 'RR',
    // 软腭音
    'k': 'kk',
    'g': 'kk',
    // 咝音
    's': 'SS',
    'z': 'SS',
    'c': 'SS',
    'x': 'SS',
    'j': 'CH',
    'q': 'kk',
    // 喉音/其他
    'h': 'aa',
  };
  return visemeMap[firstChar] || "aa";
}

/**
 * 将通用 viseme 名称映射到 VRM blend shape 名称
 * 标准 VRM 模型只有 aa, ih, ou, ee, oh 五个元音表情，
 * Oculus 辅音 viseme 需要映射到最接近的元音
 */
function mapToVRMViseme(viseme: string): string | null {
  const vrmMap: Record<string, string> = {
    // 元音直接映射
    aa: "aa",
    ee: "ee",
    ih: "ih",
    oh: "oh",
    ou: "ou",
    // 辅音映射到最接近的元音表情
    PP: "ou",   // 双唇音 p/b/m → 嘴唇闭合，最接近 ou
    FF: "ih",   // 唇齿音 f/v → 稍微张嘴，最接近 ih
    DD: "aa",   // 齿龈音 t/d → 张嘴，最接近 aa
    kk: "aa",   // 软腭音 k/g → 张嘴，最接近 aa
    CH: "ih",   // 腭龈音 → 稍微张嘴
    SS: "ih",   // 咝音 s/z → 稍微张嘴
    nn: "aa",   // 鼻音 n → 张嘴
    RR: "ou",   // 卷舌音 r → 圆唇
    sil: "neutral",
  };
  return vrmMap[viseme] || null;
}