import type { AgentDef } from "./types";
import { inventoryAgent, negotiatorAgent, wasteAgent } from "./procurement";
import { churnAgent, conciergeAgent, retentionAgent } from "./crm";
import { dealsAgent, noShowAgent } from "./scheduling";
import { performanceAgent, recruiterAgent } from "./hr";
import { billingAgent, gstAgent } from "./finance";
import { optimizerAgent } from "./platform";

/** The agent mesh. Each agent subscribes to bus events and/or runs on the orchestrator's schedule. */
export const AGENTS: AgentDef[] = [
  inventoryAgent, negotiatorAgent, wasteAgent,
  conciergeAgent, churnAgent, retentionAgent,
  noShowAgent, dealsAgent,
  recruiterAgent, performanceAgent,
  billingAgent, gstAgent,
  optimizerAgent,
];
