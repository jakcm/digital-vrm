import { VRMExpressionPresetName } from "@pixiv/three-vrm";

// ChatGPT API
export type Message = {
  role: "assistant" | "system" | "user";
  content: string;
};

const talkStyles = [
  "talk",
  "happy",
  "sad",
  "angry",
  "fear",
  "surprised",
] as const;
export type TalkStyle = (typeof talkStyles)[number];

export type Talk = {
  style: TalkStyle;
  speakerX: number;
  speakerY: number;
  message: string;
};

// 扩展情绪系统，匹配当前项目的 8 种情绪
const emotions = [
  "neutral", "happy", "angry", "sad", "relaxed",
  "fear", "disgust", "love", "sleep"
] as const;
type EmotionType = (typeof emotions)[number] & VRMExpressionPresetName;

/**
 * 発話文と音声の感情と、モデルの感情表現がセットになった物
 */
export type Screenplay = {
  expression: EmotionType;
  talk: Talk;
};

export const splitSentence = (text: string): string[] => {
  const splitMessages = text.split(/(?<=[。．！？\n])/g);
  return splitMessages.filter((msg) => msg !== "");
};

export const textsToScreenplay = (
  texts: string[],
): Screenplay[] => {
  const screenplays: Screenplay[] = [];
  let prevExpression = "neutral";
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    const match = text.match(/\[(.*?)\]/);

    const tag = (match && match[1]) || prevExpression;

    const message = text.replace(/\[(.*?)\]/g, "");

    let expression = prevExpression;
    if (emotions.includes(tag as any)) {
      expression = tag;
      prevExpression = tag;
    }

    screenplays.push({
      expression: expression as EmotionType,
      talk: {
        style: emotionToTalkStyle(expression as EmotionType),
        speakerX: 0,
        speakerY: 0,
        message: message,
      },
    });
  }

  return screenplays;
};

const emotionToTalkStyle = (emotion: EmotionType): TalkStyle => {
  switch (emotion) {
    case "angry":
      return "angry";
    case "happy":
      return "happy";
    case "sad":
      return "sad";
    default:
      return "talk";
  }
};

/**
 * 情绪图标映射
 */
export const moodIcons: Record<string, string> = {
  neutral: "😐",
  happy: "😄",
  love: "🥰",
  angry: "😤",
  sad: "😢",
  fear: "😨",
  disgust: "🤢",
  sleep: "😴",
  relaxed: "😌",
};

export const moodLabels: Record<string, string> = {
  neutral: "中性",
  happy: "开心",
  love: "可爱",
  angry: "生气",
  sad: "难过",
  fear: "害怕",
  disgust: "嫌弃",
  sleep: "犯困",
  relaxed: "放松",
};