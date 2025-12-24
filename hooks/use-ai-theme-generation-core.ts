import { useChatContext } from "@/hooks/use-chat-context";
import { AIPromptData } from "@/types/ai";
import cuid from "cuid";
import { useRef } from "react";

export function useAIThemeGenerationCore() {
  const { status, sendMessage, stop } = useChatContext();
  const isGeneratingTheme = status === "submitted" || status === "streaming";

  // Generate a stable conversationId for this hook instance
  const conversationIdRef = useRef<string>(cuid());

  const generateThemeCore = async (promptData?: AIPromptData) => {
    if (!promptData) throw new Error("Failed to generate theme. Please try again.");

    // Generate a new requestId for each request
    const requestId = cuid();

    sendMessage({
      text: promptData.content,
      metadata: {
        promptData,
        requestId,
        conversationId: conversationIdRef.current,
      },
    });
  };

  return {
    generateThemeCore,
    isGeneratingTheme,
    cancelThemeGeneration: stop,
    conversationId: conversationIdRef.current,
  };
}
