import OpenAI from "openai";

export interface OrchestratorMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
  function_call?: OpenAI.Chat.ChatCompletionMessage["function_call"];
}

export interface OrchestratorResponse {
  actions: string[];
  isDone: boolean;
  summary?: string;
}

export interface BaseOrchestrator {
  chat(messages: OrchestratorMessage[]): Promise<OrchestratorResponse>;
}
