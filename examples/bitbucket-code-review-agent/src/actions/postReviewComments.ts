import { createAction } from "spinai";
import type { SpinAiContext } from "spinai";
import { FileReview, ReviewFeedback, ReviewState } from "../types";

export const postReviewComments = createAction({
  id: "postReviewComments",
  description: "Posts review comments on the PR",
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
    if (!process.env.BITBUCKET_ACCESS_TOKEN) {
      throw new Error(
        "BITBUCKET_ACCESS_TOKEN environment variable is required"
      );
    }

    const state = context.state as ReviewState;
    const { reviews } = state;

    if (!reviews || reviews.length === 0) {
      console.error("No reviews found in context state:", {
        state: JSON.stringify(state, null, 2),
      });
      throw new Error("No reviews found in context");
    }

    console.log("Reviews in context state:", {
      count: reviews.length,
      files: reviews.map((r) => r.file),
    });

    const { workspace, repo_slug, pull_request_id } = parameters || {};

    if (!workspace || !repo_slug || !pull_request_id) {
      throw new Error(
        "Missing required parameters: workspace, repo_slug, or pull_request_id"
      );
    }

    try {
      // Create comments for each review
      console.log("Total reviews to process:", reviews.length);

      for (const review of reviews) {
        console.log("Processing review for file:", review.file);
        console.log("Number of feedback items:", review.feedback.length);

        if (!review.feedback || review.feedback.length === 0) {
          console.log("No feedback to post for this file");
          continue;
        }

        for (const feedback of review.feedback) {
          console.log("Posting comment for line:", feedback.line);
          console.log("Comment content:", feedback.comment);

          try {
            const commentResponse = await fetch(
              `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/comments`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.BITBUCKET_ACCESS_TOKEN}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  content: {
                    raw: feedback.comment,
                  },
                  inline: {
                    path: review.file,
                    to: feedback.line,
                  },
                }),
              }
            );

            if (!commentResponse.ok) {
              console.error("Failed to post comment:", {
                file: review.file,
                line: feedback.line,
                status: commentResponse.status,
                statusText: commentResponse.statusText,
                body: await commentResponse.text(),
              });
            } else {
              const responseData = (await commentResponse.json()) as {
                id: string;
              };
              console.log("Comment posted successfully:", {
                file: review.file,
                line: feedback.line,
                commentId: responseData.id,
              });
            }
          } catch (error) {
            console.error("Error posting comment:", {
              file: review.file,
              line: feedback.line,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Add summary comment
      console.log("Posting summary comment...");
      const summaryResponse = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.BITBUCKET_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: {
              raw: `heyyy bestie! ✨ just did a vibe check on your code! dropped some comments for you to slay through 💅 keep coding bestie, you're doing amazing! 🚀`,
            },
          }),
        }
      );

      if (!summaryResponse.ok) {
        console.error("Failed to post summary comment:", {
          status: summaryResponse.status,
          statusText: summaryResponse.statusText,
          body: await summaryResponse.text(),
        });
      } else {
        console.log("Summary comment posted successfully");
      }

      return context;
    } catch (error) {
      console.error("Error posting comments:", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
