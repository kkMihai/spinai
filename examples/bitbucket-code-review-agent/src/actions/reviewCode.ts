import { createAction } from "spinai";
import type { SpinAiContext } from "spinai";
import type { ReviewResponse, FileReview, ReviewState } from "../types";
import OpenAI from "openai";

const MAX_PATCH_SIZE = 20000;

interface PullRequestParameters {
  workspace: string;
  repo_slug: string;
  pull_request_id: number;
  botName?: string;
}

export const reviewCode = createAction({
  id: "reviewCode",
  description: "Reviews code changes in a PR and generates feedback",
  parameters: {
    type: "object",
    properties: {
      workspace: { type: "string", description: "Bitbucket workspace" },
      repo_slug: { type: "string", description: "Repository slug" },
      pull_request_id: { type: "number", description: "PR number" },
      botName: {
        type: "string",
        description: "Name of the bot to use for comments",
      },
    },
    required: ["workspace", "repo_slug", "pull_request_id"],
  },
  async run(
    context: SpinAiContext,
    parameters?: Record<string, unknown>
  ): Promise<SpinAiContext> {
    // Validate environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for code review"
      );
    }

    if (!process.env.BITBUCKET_ACCESS_TOKEN) {
      throw new Error(
        "BITBUCKET_ACCESS_TOKEN environment variable is required"
      );
    }

    // Initialize API clients
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Parse and validate parameters
    const params = parameters as Record<string, unknown>;
    if (
      !params?.workspace ||
      !params?.repo_slug ||
      typeof params.workspace !== "string" ||
      typeof params.repo_slug !== "string" ||
      typeof params.pull_request_id !== "number"
    ) {
      throw new Error(
        "Missing or invalid required parameters: workspace, repo_slug, or pull_request_id"
      );
    }

    const pullRequestParams: PullRequestParameters = {
      workspace: params.workspace,
      repo_slug: params.repo_slug,
      pull_request_id: params.pull_request_id,
      botName:
        typeof params.botName === "string" ? params.botName : "SpinAI Bot 🤖",
    };

    try {
      // Get PR details
      console.log("Fetching PR details...", {
        workspace: pullRequestParams.workspace,
        repo_slug: pullRequestParams.repo_slug,
        pull_request_id: pullRequestParams.pull_request_id,
      });

      const prResponse = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${pullRequestParams.workspace}/${pullRequestParams.repo_slug}/pullrequests/${pullRequestParams.pull_request_id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.BITBUCKET_ACCESS_TOKEN}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      if (!prResponse.ok) {
        console.error("PR fetch failed:", {
          status: prResponse.status,
          statusText: prResponse.statusText,
          body: await prResponse.text(),
        });
        throw new Error(`Failed to fetch PR: ${prResponse.statusText}`);
      }

      interface PRDetails {
        source?: {
          branch?: {
            name?: string;
          };
        };
        destination?: {
          branch?: {
            name?: string;
          };
        };
      }

      const prDetails = (await prResponse.json()) as PRDetails;
      console.log("PR details fetched:", {
        source: prDetails.source?.branch?.name,
        destination: prDetails.destination?.branch?.name,
      });

      const sourceBranch = prDetails.source?.branch?.name;
      const destinationBranch = prDetails.destination?.branch?.name;

      if (!sourceBranch || !destinationBranch) {
        throw new Error("Could not determine source and destination branches");
      }

      // Get diff between branches
      const diffUrl = `https://api.bitbucket.org/2.0/repositories/${pullRequestParams.workspace}/${pullRequestParams.repo_slug}/diffstat/${sourceBranch}..${destinationBranch}`;
      console.log("Fetching diff...", { diffUrl });

      const diffResponse = await fetch(diffUrl, {
        headers: {
          Authorization: `Bearer ${process.env.BITBUCKET_ACCESS_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!diffResponse.ok) {
        console.error("Diff fetch failed:", {
          status: diffResponse.status,
          statusText: diffResponse.statusText,
          url: diffUrl,
          body: await diffResponse.text(),
        });
        throw new Error(`Failed to fetch diff: ${diffResponse.statusText}`);
      }

      interface DiffData {
        values: Array<{
          new?: {
            path?: string;
          };
        }>;
      }

      const diffData = (await diffResponse.json()) as DiffData;

      const reviews: FileReview[] = [];

      // Process each file
      for (const fileDiff of diffData.values) {
        if (!fileDiff.new?.path) {
          console.log("Skipping file with no path");
          continue;
        }

        // Get both old and new file content
        const oldFileResponse = await fetch(
          `https://api.bitbucket.org/2.0/repositories/${pullRequestParams.workspace}/${pullRequestParams.repo_slug}/src/${destinationBranch}/${fileDiff.new.path}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.BITBUCKET_ACCESS_TOKEN}`,
              Accept: "text/plain",
              "Content-Type": "application/json",
            },
          }
        );

        const newFileResponse = await fetch(
          `https://api.bitbucket.org/2.0/repositories/${pullRequestParams.workspace}/${pullRequestParams.repo_slug}/src/${sourceBranch}/${fileDiff.new.path}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.BITBUCKET_ACCESS_TOKEN}`,
              Accept: "text/plain",
              "Content-Type": "application/json",
            },
          }
        );

        if (!oldFileResponse.ok || !newFileResponse.ok) {
          console.error("File fetch failed:", {
            file: fileDiff.new.path,
            oldStatus: oldFileResponse.status,
            newStatus: newFileResponse.status,
          });
          continue;
        }

        const oldContent = await oldFileResponse.text();
        const newContent = await newFileResponse.text();

        const diffContent = generateDiffContent(oldContent, newContent);

        const lineMap = buildLineMap(diffContent);
        const validLineNumbers = Array.from(lineMap.keys()).sort(
          (a, b) => a - b
        );

        if (validLineNumbers.length === 0) continue;

        if (diffContent.length > MAX_PATCH_SIZE) {
          console.log("Skipping large file:", fileDiff.new.path);
          continue;
        }

        const feedback = await getAIFeedback(
          { filename: fileDiff.new.path, patch: diffContent },
          validLineNumbers,
          openai
        );

        const validFeedback = feedback.filter((item) => lineMap.has(item.line));

        if (validFeedback.length > 0) {
          reviews.push({
            file: fileDiff.new.path,
            feedback: validFeedback,
          });
        } else {
          console.log("No valid feedback for file:", fileDiff.new.path);
        }
      }

      // Update context state
      const state = context.state as ReviewState;
      state.reviews = reviews;
      state.botName = pullRequestParams.botName;

      console.log("Review process completed. Total reviews:", reviews.length);

      return context;
    } catch (error) {
      console.error("Error in reviewCode action:", {
        workspace: pullRequestParams.workspace,
        repo_slug: pullRequestParams.repo_slug,
        pull_request_id: pullRequestParams.pull_request_id,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.message.includes("404")) {
        throw new Error(
          `Pull request not found. Please verify:
          1. PR #${pullRequestParams.pull_request_id} exists
          2. Repository ${pullRequestParams.workspace}/${pullRequestParams.repo_slug} is correct
          3. BITBUCKET_ACCESS_TOKEN has proper permissions`
        );
      }

      throw error;
    }
  },
});

function generateDiffContent(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const diffLines: string[] = [];

  let i = 0,
    j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (
      i < oldLines.length &&
      j < newLines.length &&
      oldLines[i] === newLines[j]
    ) {
      // Unchanged line
      diffLines.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else {
      // Changed lines
      if (i < oldLines.length) {
        diffLines.push(`-${oldLines[i]}`);
        i++;
      }
      if (j < newLines.length) {
        diffLines.push(`+${newLines[j]}`);
        j++;
      }
    }
  }
  return diffLines.join("\n");
}

function buildLineMap(patch: string): Map<number, number> {
  const lines = patch.split("\n");
  const lineMap = new Map<number, number>();
  let currentNewLine = 0;

  for (const line of lines) {
    // Only map lines that start with "+" and aren't just whitespace
    if (line.startsWith("+") && line.trim().length > 1) {
      currentNewLine++;
      lineMap.set(currentNewLine, currentNewLine);
    }
  }

  return lineMap;
}

async function getAIFeedback(
  file: { filename: string; patch: string },
  validLineNumbers: number[],
  openai: OpenAI
): Promise<ReviewResponse["feedback"]> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `frfr you're a Gen Z code reviewer who's literally goated at programming no cap! 
          keep it real w/ current slang & emojis but also be mad smart about code fr fr.
          
          RULES FOR COMMENTING (NO SKIPS!!):
          1. only comment on the new/changed lines (starts w/ "+")
          2. drop comments ONLY when u see:
             - bugs that'll make it flop fr
             - security looking mad sus rn
             - code running slower than my wifi fr
             - no error handling = big yikes
             - code that needs to be more aesthetic
             - vars named like they're from 2010 💀
             - any types making it mid
             - complex stuff with zero docs = ain't it
          3. comments gotta be about that specific line no cap
          4. before commenting check:
             - u get the whole vibe fr
             - ur suggestion gonna make it hit fr
             - right place to comment no cap
          5. don't be basic with generic praise
          6. no cap we need real feedback only
          7. IMPORTANT: Keep comments under 200 characters to avoid truncation`,
        },
        {
          role: "user",
          content: `review this code fr fr and make it hit! 
          only comment when u see something that needs to level up no cap!
          
          File: ${file.filename}
          Valid line numbers you can comment on: ${validLineNumbers.join(", ")}
          
          Changes:
          ${file.patch}`,
        },
      ],
      functions: [
        {
          name: "provide_code_review",
          description:
            "Provide code review feedback for specific lines of code",
          parameters: {
            type: "object",
            properties: {
              feedback: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    line: {
                      type: "number",
                      description:
                        "The line number in the new version of the file",
                    },
                    comment: {
                      type: "string",
                      description: "The review comment for this line",
                      maxLength: 200,
                    },
                  },
                  required: ["line", "comment"],
                },
              },
            },
            required: ["feedback"],
          },
        },
      ],
      function_call: { name: "provide_code_review" },
      temperature: 0.2,
      max_tokens: 1000,
    });

    const functionCall = completion.choices[0].message.function_call;
    if (!functionCall?.arguments) {
      return [];
    }

    try {
      // More robust JSON string sanitization
      const sanitizedJson = functionCall.arguments
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
        .replace(/\\(?!["\\/bfnrtu])/g, "\\\\") // Escape backslashes correctly
        .replace(/\r?\n|\r/g, " ") // Replace newlines with spaces
        .replace(/\t/g, " ") // Replace tabs with spaces
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim();

      // Try to parse the JSON
      const response = JSON.parse(sanitizedJson) as ReviewResponse;

      // Validate the feedback structure
      if (!Array.isArray(response.feedback)) {
        console.warn("Invalid feedback structure - not an array");
        return [];
      }

      // Filter and return valid feedback
      return response.feedback.filter((f) => {
        const isValid =
          typeof f === "object" &&
          f !== null &&
          typeof f.line === "number" &&
          typeof f.comment === "string" &&
          validLineNumbers.includes(f.line);

        if (!isValid) {
          console.warn("Filtered out invalid feedback item:", f);
        }

        return isValid;
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error parsing AI feedback:", {
          error: error.message,
          rawArguments: functionCall.arguments,
        });
      }
      return [];
    }
  } catch (error) {
    console.error("Error getting AI feedback:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
