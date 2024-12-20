import * as dotenv from "dotenv";
import { runAgentServer } from "@repo/spinup";

dotenv.config();

runAgentServer(8080);
