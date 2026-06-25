import { useState, useCallback } from "react";
import { Link } from "./link";

type Props = {
  openAiKey: string;
  onChangeAiKey: (openAiKey: string) => void;
};
export const Introduction = ({ openAiKey, onChangeAiKey }: Props) => {
  const [opened, setOpened] = useState(true);

  const handleAiKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeAiKey(event.target.value);
    },
    [onChangeAiKey]
  );

  return opened ? (
    <div className="absolute z-40 w-full h-full px-24 py-40  bg-black/30 font-M_PLUS_2">
      <div className="mx-auto my-auto max-w-3xl max-h-full p-24 overflow-auto bg-white rounded-16">
        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary ">
            About ChatVRM
          </div>
          <div>
            You can enjoy conversations with 3D characters using only a web browser using a microphone, text input, and speech synthesis. You can also change the character (VRM), set the personality, and adjust the voice.
          </div>
        </div>
        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            Technology
          </div>
          <div>
            <Link
              url={"https://github.com/pixiv/three-vrm"}
              label={"@pixiv/three-vrm"}
            />&nbsp;
            is used for displaying and manipulating 3D models,
            &nbsp;<Link
              url={
                "https://openrouter.ai/"
              }
              label={"OpenRouter"}
            />&nbsp;
            is used for LLM access, and 
            &nbsp;<Link url={"https://learn.microsoft.com/en-us/azure/ai-services/speech-service/" } label={"Edge TTS"} />&nbsp;
            is used for free text to speech (no API key required).
          </div>
          <div className="my-16">
            The source code for this demo is available on GitHub. Feel free to experiment with changes and modifications!
            <br />
            Repository:
            &nbsp;<Link
              url={"https://github.com/zoan37/ChatVRM"}
              label={"https://github.com/zoan37/ChatVRM"}
            />
          </div>
        </div>

        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            Precautions for use
          </div>
          <div>
            Do not intentionally induce discriminatory or violent remarks, or remarks that demean a specific person. Also, when replacing characters using a VRM model, please follow the model&apos;s terms of use.
          </div>
        </div>
        <div className="my-24">
          <div className="my-8 font-bold typography-20 text-secondary">
            Edge TTS
          </div>
          <div>
            This app uses Edge TTS (Microsoft) for free text-to-speech. No API key is required. You can select from multiple voices in the settings panel.
          </div>
        </div>
        <div className="my-24">
          <button
            onClick={() => {
              setOpened(false);
            }}
            className="font-bold bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled text-white px-24 py-8 rounded-oval"
          >
            Start
          </button>
        </div>
      </div>
    </div>
  ) : null;
};