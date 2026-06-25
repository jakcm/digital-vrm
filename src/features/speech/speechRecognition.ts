/**
 * Web Speech API 语音识别模块
 * 提供浏览器端语音输入功能
 */

export type SpeechRecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

export type SpeechRecognitionState = "idle" | "listening" | "error";

export class SpeechRecognitionManager {
  private recognition: SpeechRecognition | null = null;
  private _state: SpeechRecognitionState = "idle";
  private onResultCallback: ((result: SpeechRecognitionResult) => void) | null = null;
  private onStateChangeCallback: ((state: SpeechRecognitionState) => void) | null = null;

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    if (typeof window === "undefined") return;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn("当前浏览器不支持 Web Speech API");
      return;
    }

    this.recognition = new SpeechRecognitionAPI();
    const recognition = this.recognition as SpeechRecognition;
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const transcript = finalTranscript || interimTranscript;
      if (transcript && this.onResultCallback) {
        this.onResultCallback({
          transcript,
          isFinal: !!finalTranscript,
        });
      }
    };

    recognition.onerror = (event: any) => {
      console.error("语音识别错误:", event.error);
      this._state = "error";
      this.onStateChangeCallback?.("error");
    };

    recognition.onend = () => {
      if (this._state === "listening") {
        // 如果还在监听状态但语音结束了，自动重启
        try {
          this.recognition?.start();
        } catch (e) {
          // ignore
        }
      }
    };
  }

  get state(): SpeechRecognitionState {
    return this._state;
  }

  public start() {
    if (!this.recognition) {
      this.initRecognition();
    }
    try {
      this.recognition?.start();
      this._state = "listening";
      this.onStateChangeCallback?.("listening");
    } catch (e) {
      console.error("启动语音识别失败:", e);
    }
  }

  public stop() {
    try {
      this.recognition?.stop();
    } catch (e) {
      // ignore
    }
    this._state = "idle";
    this.onStateChangeCallback?.("idle");
  }

  public onResult(callback: (result: SpeechRecognitionResult) => void) {
    this.onResultCallback = callback;
  }

  public onStateChange(callback: (state: SpeechRecognitionState) => void) {
    this.onStateChangeCallback = callback;
  }

  public destroy() {
    this.stop();
    this.recognition = null;
    this.onResultCallback = null;
    this.onStateChangeCallback = null;
  }
}