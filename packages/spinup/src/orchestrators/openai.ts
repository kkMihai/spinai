import OpenAI from "openai";
import {
  BaseOrchestrator,
  OrchestratorMessage,
  OrchestratorResponse,
} from "./base";

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  systemPrompt: string;
}

export class OpenAIOrchestrator implements BaseOrchestrator {
  private client: OpenAI;
  private orchestratorConfig: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.orchestratorConfig = {
      temperature: 0.7,
      ...config,
    };
  }

  async chat(messages: OrchestratorMessage[]): Promise<OrchestratorResponse> {
    const completion = await this.client.chat.completions.create({
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      model: this.orchestratorConfig.model,
      temperature: this.orchestratorConfig.temperature,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No response from orchestrator");

    try {
      return JSON.parse(content);
    } catch (e) {
      throw new Error("Invalid orchestrator response format");
    }
  }
}

export const createOpenAIOrchestrator = (config: OpenAIConfig) => {
  return new OpenAIOrchestrator(config);
};
