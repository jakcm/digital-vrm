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

    if (!buffer) {
      return;
    }

    // 如果有 viseme 序列，传给 lipSync
    if (visemes && visemes.length > 0) {
      const visemeSequence = visemes.map(v => ({
        viseme: mapWordToViseme(v.word),
        startTime: v.offset,
        endTime: v.offset + v.duration,
      }));
      this._lipSync?.setVisemeSequence(visemeSequence);
    }

    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(buffer, () => {
        resolve(true);
      });
    });
  }

  public update(delta: number): void {
    if (this._lipSync) {
      const { volume, viseme, visemeWeight } = this._lipSync.update();

      if (viseme && visemeWeight && visemeWeight > 0) {
        // 使用 viseme 驱动的精准唇同步
        const vrmViseme = mapToVRMViseme(viseme);
        if (vrmViseme) {
          this.emoteController?.lipSync(vrmViseme as any, visemeWeight);
        }
      } else {
        // 回退到音量驱动的简单唇同步
        let expression = this.vrm?.expressionManager?.getExpression("JawOpen");
        if (expression) {
          // @ts-ignore
          this.emoteController?.lipSync("JawOpen", volume);
        } else {
          this.emoteController?.lipSync("aa" as any, volume);
        }
      }
    }

    this.emoteController?.update(delta);
    this.mixer?.update(delta);
    this.vrm?.update(delta);
  }
}

/**
 * 将单词映射到 viseme 名称
 * 基于 Oculus 15 viseme 标准
 */
function mapWordToViseme(word: string): string {
  const firstChar = word.charAt(0).toLowerCase();
  const visemeMap: Record<string, string> = {
    'a': 'aa',
    'e': 'ee',
    'i': 'ih',
    'o': 'oh',
    'u': 'ou',
    'b': 'PP',
    'p': 'PP',
    'm': 'PP',
    'f': 'FF',
    'v': 'FF',
    't': 'DD',
    'd': 'DD',
    'k': 'kk',
    'g': 'kk',
    's': 'SS',
    'z': 'SS',
    'c': 'SS',
    'n': 'nn',
    'l': 'nn',
    'r': 'RR',
  };
  return visemeMap[firstChar] || "sil";
}

/**
 * 将通用 viseme 名称映射到 VRM blend shape 名称
 */
function mapToVRMViseme(viseme: string): string | null {
  const vrmMap: Record<string, string> = {
    aa: "aa",
    ee: "E",
    ih: "ih",
    oh: "oh",
    ou: "ou",
    PP: "PP",
    FF: "FF",
    DD: "DD",
    kk: "kk",
    CH: "CH",
    SS: "SS",
    nn: "nn",
    RR: "RR",
    sil: "neutral",
  };
  return vrmMap[viseme] || null;
}