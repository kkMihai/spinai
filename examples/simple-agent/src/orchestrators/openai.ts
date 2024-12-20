import type { BaseOrchestrator } from "@repo/spinup";
import { createOpenAIOrchestrator } from "@repo/spinup";

const orchestrator: BaseOrchestrator = createOpenAIOrchestrator({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4-turbo-preview",
  prompt: `
You are an orchestrator AI.


The user will send a request and you will determine which actions to run,
in what order, based on their dependencies. After running required actions,
return the final result.
`,
});

export default orchestrator;
