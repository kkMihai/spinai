import { ActionContext } from "@repo/spinup";

export async function run(context: ActionContext) {
  const { customerId } = context.input;
  // Simulate ticket history
  return {
    tickets: [
      {
        id: "T-123",
        status: "open",
        priority: "high",
        subject: "API Integration Issue",
        created: "2024-02-19",
        customerId,
      },
      {
        id: "T-122",
        status: "resolved",
        priority: "medium",
        subject: "Billing Question",
        created: "2024-02-15",
        customerId,
      },
    ],
  };
}

export const config = {
  id: "getRecentTickets",
  retries: 3,
  dependsOn: ["getCustomerInfo"],
  metadata: { description: "Retrieves customer's recent support tickets" },
};
