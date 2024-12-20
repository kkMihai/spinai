import { ActionContext } from "@repo/spinup";

export async function run(context: ActionContext) {
  const { customerId } = context.input;
  // Simulate DB lookup
  return {
    customerId,
    name: "Jane Smith",
    tier: "premium",
    lastContact: "2024-02-20",
    openTickets: 2,
  };
}

export const config = {
  id: "getCustomerInfo",
  metadata: { description: "Retrieves customer profile and status" },
  retries: 3,
  dependsOn: [],
};
