import React, { useEffect, useState, cache } from "react";
import { IconButton } from "./iconButton";
import { TextButton } from "./textButton";
import { Message } from "@/features/messages/messages";
import { Link } from "./link";
import { getEdgeVoices } from "@/features/edgeTts/edgeTts";
import { RestreamTokens } from "./restreamTokens";
import { buildUrl } from "@/utils/buildUrl";
import Cookies from 'js-cookie';

const APP_VERSION = "20260626.144348";

type Props = {
  openAiKey: string;
  openRouterKey: string;
  systemPrompt: string;
  chatLog: Message[];
  edgeTtsVoice: string;
  onClickClose: () => void;
  onChangeAiKey: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onChangeOpenRouterKey: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onChangeEdgeTtsVoice: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onChangeSystemPrompt: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onChangeChatLog: (index: number, text: string) => void;
  onClickOpenVrmFile: () => void;
  onClickResetChatLog: () => void;
  onClickResetSystemPrompt: () => void;
  backgroundImage: string;
  onChangeBackgroundImage: (image: string) => void;
  onRestreamTokensUpdate?: (tokens: { access_token: string; refresh_token: string; } | null) => void;
  onTokensUpdate: (tokens: any) => void;
  onChatMessage: (message: string) => void;
};
export const Settings = ({
  openAiKey,
  openRouterKey,
  chatLog,
  systemPrompt,
  edgeTtsVoice,
  onClickClose,
  onChangeSystemPrompt,
  onChangeAiKey,
  onChangeOpenRouterKey,
  onChangeEdgeTtsVoice,
  onChangeChatLog,
  onClickOpenVrmFile,
  onClickResetChatLog,
  onClickResetSystemPrompt,
  backgroundImage,
  onChangeBackgroundImage,
  onRestreamTokensUpdate = () => {},
  onTokensUpdate,
  onChatMessage,
}: Props) => {

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        onChangeBackgroundImage(base64String);
        localStorage.setItem('backgroundImage', base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveBackground = () => {
    onChangeBackgroundImage('');
    localStorage.removeItem('backgroundImage');
  };

  const edgeVoices = getEdgeVoices();

  return (
    <div className="absolute z-40 w-full h-full bg-white/80 backdrop-blur ">
      <div className="absolute m-24">
        <IconButton
          iconName="24/Close"
          isProcessing={false}
          onClick={onClickClose}
        ></IconButton>
      </div>
      <div className="max-h-full overflow-auto">
        <div className="text-text1 max-w-3xl mx-auto px-24 py-64 ">
          <div className="my-24 typography-32 font-bold">Settings</div>
          <div className="-mt-16 mb-24 text-sm text-gray-600">Version {APP_VERSION}</div>
          <div className="my-24">
            <div className="my-16 typography-20 font-bold">OpenRouter API</div>
            <input
              type="text"
              placeholder="OpenRouter API key"
              value={openRouterKey}
              onChange={onChangeOpenRouterKey}
              className="my-4 px-16 py-8 w-full h-40 bg-surface3 hover:bg-surface3-hover rounded-4 text-ellipsis"
            ></input>
            <div>
              Enter your OpenRouter API key for custom access. You can get an API key at the&nbsp;
              <Link
                url="https://openrouter.ai/"
                label="OpenRouter website"
              />. By default, this app uses its own OpenRouter API key for people to try things out easily, but that may run of credits and need to be refilled.
            </div>
          </div>
          <div className="my-40">
            <div className="my-16 typography-20 font-bold">
              Voice Selection (Edge TTS)
            </div>
            <div className="my-16">
              Select a voice for text-to-speech (free, no API key required):
            </div>
            <div className="my-8">
              <select className="h-40 px-8"
                id="select-dropdown"
                onChange={onChangeEdgeTtsVoice}
                value={edgeTtsVoice}
              >
                {edgeVoices.map((voice, index) => (
                  <option key={index} value={voice.name}>
                    {voice.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="my-40">
            <div className="my-16 typography-20 font-bold">
              Character Model
            </div>
            <div className="my-8">
              <TextButton onClick={onClickOpenVrmFile}>Open VRM</TextButton>
            </div>
          </div>
          <div className="my-40">
            <div className="my-8">
              <div className="my-16 typography-20 font-bold">
                Character Settings (System Prompt)
              </div>
              <TextButton onClick={onClickResetSystemPrompt}>
                Reset character settings
              </TextButton>
            </div>

            <textarea
              value={systemPrompt}
              onChange={onChangeSystemPrompt}
              className="px-16 py-8  bg-surface1 hover:bg-surface1-hover h-168 rounded-8 w-full"
            ></textarea>
          </div>
          <div className="my-40">
            <div className="my-16 typography-20 font-bold">
              Background Image
            </div>
            <div className="my-16">Choose a custom background image:</div>
            <div className="my-8 flex flex-col gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="my-4"
              />
              {backgroundImage && (
                <div className="flex flex-col gap-4">
                  <div className="my-8">
                    <img
                      src={backgroundImage}
                      alt="Background Preview"
                      className="max-w-[200px] rounded-4"
                    />
                  </div>
                  <div className="my-8">
                    <TextButton onClick={handleRemoveBackground}>
                      Remove Background
                    </TextButton>
                  </div>
                </div>
              )}
              <div className="text-sm text-gray-600">
                The background image will be saved in your browser and restored when you return.
              </div>
            </div>
          </div>
          <RestreamTokens onTokensUpdate={onTokensUpdate} onChatMessage={onChatMessage} />
          <div className="my-40">
            <div className="my-16 typography-20 font-bold">
              Powered By
            </div>
            <div className="my-8 text-sm text-gray-600">
              This app is powered by&nbsp;
              <a target="_blank" href="https://openrouter.ai/" className="underline">
                OpenRouter
              </a>,&nbsp;
              <a target="_blank" href="https://learn.microsoft.com/en-us/azure/ai-services/speech-service/" className="underline">
                Edge TTS
              </a>,&nbsp;
              <a target="_blank" href="https://vroid.com/" className="underline">
                VRoid
              </a>
            </div>
            <div className="my-16">
              <a
                draggable={false}
                href="https://github.com/zoan37/ChatVRM"
                rel="noopener noreferrer"
                target="_blank"
                className="inline-flex items-center gap-8 p-8 rounded-16 bg-[#1F2328] hover:bg-[#33383E] active:bg-[565A60]"
              >
                <img
                  alt="GitHub"
                  height={24}
                  width={24}
                  src={buildUrl("/github-mark-white.svg")}
                ></img>
                <span className="mx-4 text-white font-M_PLUS_2 font-bold">Fork me on GitHub</span>
              </a>
            </div>
          </div>
          {chatLog.length > 0 && (
            <div className="my-40">
              <div className="my-8 grid-cols-2">
                <div className="my-16 typography-20 font-bold">Conversation History</div>
                <TextButton onClick={onClickResetChatLog}>
                  Reset conversation history
                </TextButton>
              </div>
              <div className="my-8">
                {chatLog.map((value, index) => {
                  return (
                    <div
                      key={index}
                      className="my-8 grid grid-flow-col  grid-cols-[min-content_1fr] gap-x-fixed"
                    >
                      <div className="w-[64px] py-8">
                        {value.role === "assistant" ? "Character" : "You"}
                      </div>
                      <input
                        key={index}
                        className="bg-surface1 hover:bg-surface1-hover rounded-8 w-full px-16 py-8"
                        type="text"
                        value={value.content}
                        onChange={(event) => {
                          onChangeChatLog(index, event.target.value);
                        }}
                      ></input>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};