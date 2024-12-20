import { ActionContext } from "@repo/spinup";

export async function run(context: ActionContext) {
  const { userId } = context.input;
  const userInfo = await fetchUserFromDB(userId);
  return { userInfo };
}

export const config = {
  id: "getUserInfo",
  retries: 3,
  dependsOn: [],
  metadata: { description: "Fetches user info from DB" },
};

async function fetchUserFromDB(userId: string) {
  // Placeholder
  return { id: userId, name: "Jane Doe", status: "active" };
}
