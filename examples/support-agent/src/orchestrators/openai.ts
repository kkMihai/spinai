import type { BaseOrchestrator } from "@repo/spinup";
import { createOpenAIOrchestrator } from "@repo/spinup";

const orchestrator: BaseOrchestrator = createOpenAIOrchestrator({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4-turbo-preview",
  temperature: 0.7,
  prompt: `
    You are a customer support orchestrator. Your goal is to help customers by executing 
    the appropriate actions in the right order.
    
    Consider the customer's request carefully...
  `,
});

export default orchestrator;
