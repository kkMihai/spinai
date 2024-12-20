import express from "express";
import { glob } from "glob";
import path from "path";
import { ActionModule } from "./types";
import { BaseOrchestrator, OrchestratorResponse } from "./orchestrators/base";

export * from "./types";
export * from "./orchestrators/openai";

const DEFAULT_PORT = 8080;

async function getNextActions(
  orchestrator: BaseOrchestrator,
  systemPrompt: string,
  input: string,
  previousResults?: any
): Promise<OrchestratorResponse> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: input },
  ];

  if (previousResults) {
    messages.push({
      role: "user" as const,
      content: `Previous action results: ${JSON.stringify(previousResults, null, 2)}`,
    });
  }

  return orchestrator.chat(messages);
}

async function loadActions(
  actionDirectoryPath: string
): Promise<Record<string, ActionModule>> {
  const actions: Record<string, ActionModule> = {};
  const actionFiles = await glob("**/*.{ts,js}", { cwd: actionDirectoryPath });

  for (const file of actionFiles) {
    const modulePath = path.join(actionDirectoryPath, file);
    const module = await import(modulePath);
    if (module.run && module.config) {
      actions[module.config.id] = module;
    }
  }

  return actions;
}

async function loadOrchestrator(orchestratorDirectoryPath: string) {
  const orchestratorFiles = await glob("**/*.{ts,js}", {
    cwd: orchestratorDirectoryPath,
  });
  if (orchestratorFiles.length === 0) {
    throw new Error("No orchestrator found");
  }

  const modulePath = path.join(orchestratorDirectoryPath, orchestratorFiles[0]);
  return import(modulePath);
}

export async function runAgentServer(port: number = DEFAULT_PORT) {
  const app = express();
  app.use(express.json());

  // Load config
  const configPath = path.join(process.cwd(), "spinup.config.ts");
  const config = await import(configPath);
  const { actionDirectoryPath, orchestratorDirectoryPath } = config.default;

  // Load actions and orchestrator
  const availableActions = await loadActions(actionDirectoryPath);
  const orchestrator = await loadOrchestrator(orchestratorDirectoryPath);

  // Get list of available actions for prompt
  const actionDescriptions = Object.entries(availableActions)
    .map(
      ([id, action]) =>
        `- ${id}: ${action.config.metadata?.description || "No description"}`
    )
    .join("\n");

  // Inject available actions into user's prompt
  const enhancedSystemPrompt = `Available actions:\n${actionDescriptions}\n\n${orchestrator.default.systemPrompt}`;

  app.post("/api/run", async (req, res) => {
    try {
      const { input } = req.body;
      console.log("\n🤖 New request:", input);

      // Create context for actions
      const context = {
        input: { query: input },
        availableActions,
      };

      let previousResults = null;
      let isDone = false;

      while (!isDone) {
        console.log("\n🤔 Consulting orchestrator...");
        const decision = await getNextActions(
          orchestrator.default,
          enhancedSystemPrompt,
          input,
          previousResults
        );

        console.log("📋 Orchestrator decision:", decision);

        if (decision.actions.length === 0) {
          console.log("✅ Task complete");
          return res.json({
            summary: decision.summary,
            results: previousResults,
          });
        }

        // Execute actions
        for (const actionName of decision.actions) {
          console.log(`\n🔄 Executing action: ${actionName}`);
          const action = availableActions[actionName];
          if (!action) {
            throw new Error(`Action ${actionName} not found`);
          }
          previousResults = await action.run({ ...context });
          console.log("📊 Action result:", previousResults);
        }

        isDone = decision.isDone;
      }

      res.json({
        summary: "Task completed",
        results: previousResults,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.listen(port, () => {
    console.log(`🚀 Spinup server running on port ${port}`);
  });
}
