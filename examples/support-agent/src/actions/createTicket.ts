import { ActionContext } from "@repo/spinup";

export async function run(context: ActionContext) {
  const { customerId, subject, priority, description } = context.input;
  // Simulate ticket creation
  return {
    ticketId: "T-124",
    status: "created",
    assignedTo: "support-team-1",
    estimatedResponse: "2 hours",
  };
}

export const config = {
  id: "createTicket",
  retries: 3,
  dependsOn: ["getCustomerInfo"],
  metadata: { description: "Creates a new support ticket" },
};
