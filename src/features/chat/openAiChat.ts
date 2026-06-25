import { Message } from "../messages/messages";
import { getWindowAI } from 'window.ai';

export async function getChatResponse(messages: Message[], apiKey: string) {
  // function currently not used
  throw new Error("Not implemented");
}

/**
 * 连接超时时间（毫秒）
 * 如果在此时长内没有收到任何响应头，则判定为网络不可达
 */
const CONNECTION_TIMEOUT_MS = 30000;

export async function getChatResponseStream(
  messages: Message[],
  apiKey: string,
  openRouterKey: string
) {
  console.log('getChatResponseStream');

  console.log('messages');
  console.log(messages);

  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
      let streamErrored = false;

      try {

        const OPENROUTER_API_KEY = openRouterKey;
        const YOUR_SITE_URL = 'https://chat-vrm-window.vercel.app/';
        const YOUR_SITE_NAME = 'ChatVRM';

        let isStreamed = false;
        
        // 使用 AbortController 实现连接超时
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          abortController.abort();
        }, CONNECTION_TIMEOUT_MS);

        let generation: Response;
        try {
          generation = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
              "HTTP-Referer": `${YOUR_SITE_URL}`,
              "X-Title": `${YOUR_SITE_NAME}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              "model": "deepseek/deepseek-v4-flash",
              "reasoning": { "effort": "low" },
              "messages": messages,
              "temperature": 0.7,
              "max_tokens": 512,
              "stream": true,
            }),
            signal: abortController.signal,
          });
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError?.name === 'AbortError') {
            throw new Error(`连接超时（${CONNECTION_TIMEOUT_MS / 1000}秒无响应），可能是网络不可达。请检查网络连接或尝试使用代理。`);
          }
          throw new Error(`网络请求失败：${fetchError?.message || '未知错误'}。可能是网络不可达，请检查网络连接或尝试使用代理。`);
        }
        
        clearTimeout(timeoutId);

        if (!generation.ok) {
          let errMsg = `API Error ${generation.status}: ${generation.statusText}`;
          try {
            const errBody = await generation.text();
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) {
              errMsg = `API Error ${generation.status}: ${errJson.error.message}`;
            }
          } catch {
            // keep default message
          }
          controller.error(new Error(errMsg));
          streamErrored = true;
          return;
        }

        if (generation.body) {
          const reader = generation.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              // Assuming the stream is text, convert the Uint8Array to a string
              let chunk = new TextDecoder().decode(value);

              // split the chunk into lines
              let lines = chunk.split('\n');

              const SSE_COMMENT = ": OPENROUTER PROCESSING";

              // filter out lines that start with SSE_COMMENT
              lines = lines.filter((line) => !line.trim().startsWith(SSE_COMMENT));

              // filter out lines that end with "data: [DONE]"
              lines = lines.filter((line) => !line.trim().endsWith("data: [DONE]"));

              // Filter out empty lines and lines that do not start with "data:"
              const dataLines = lines.filter(line => line.startsWith("data:"));

              // Extract and parse the JSON from each data line
              const messages = dataLines.map(line => {
                // Remove the "data: " prefix and parse the JSON
                const jsonStr = line.substring(5); // "data: ".length == 5
                return JSON.parse(jsonStr);
              });

              try {
                messages.forEach((message) => {
                  const content = message.choices[0].delta.content;

                  // Skip deltas without content (e.g. role-only or reasoning
                  // deltas) so we don't enqueue undefined into the stream.
                  if (content) {
                    controller.enqueue(content);
                  }
                });
              } catch (error) {
                // log the messages
                console.log('error processing messages:');
                console.log(messages);

                throw error;
              }

              isStreamed = true;
            }
          } catch (error) {
            // 传播流读取错误，不再静默吞掉
            console.error('Error reading the stream', error);
            const errMsg = error instanceof Error ? error.message : String(error);
            controller.error(new Error(`对话流中断：${errMsg}。可能是网络不稳定，请检查网络连接或尝试使用代理。`));
            streamErrored = true;
          } finally {
            reader.releaseLock();
          }
        }

        // handle case where streaming is not supported
        if (!isStreamed && !streamErrored) {
          console.error('Streaming not supported! Need to handle this case.');
        }
      } catch (error) {
        if (!streamErrored) {
          controller.error(error);
          streamErrored = true;
        }
      } finally {
        // 只在未出错时关闭流，避免对已 errored 的 controller 调用 close() 抛异常
        if (!streamErrored) {
          controller.close();
        }
      }
    },
  });

  return stream;
}
