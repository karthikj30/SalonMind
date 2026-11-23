import type { AgentDef } from "./types";
import { inventoryAgent, negotiatorAgent, wasteAgent } from "./procurement";
import { churnAgent, conciergeAgent, retentionAgent } from "./crm";
import { dealsAgent, noShowAgent } from "./scheduling";
import { performanceAgent, recruiterAgent } from "./hr";
import { billingAgent, gstAgent } from "./finance";
import { optimizerAgent } from "./platform";
import { loyaltyAgent, reputationAgent, waitlistAgent } from "./growth";
import { translatorAgent } from "./i18n";
import { voiceAgent } from "./voice";
import { briefingAgent, queueAgent } from "./frontdesk";
import { prepaidAgent } from "./prepaid";
import { consultationAgent } from "./consultation";

/** The agent mesh. Each agent subscribes to bus events and/or runs on the orchestrator's schedule. */
export const AGENTS: AgentDef[] = [
  inventoryAgent, negotiatorAgent, wasteAgent,
  conciergeAgent, churnAgent, retentionAgent,
  loyaltyAgent, reputationAgent, prepaidAgent, consultationAgent,
  noShowAgent, dealsAgent, waitlistAgent, queueAgent,
  recruiterAgent, performanceAgent,
  billingAgent, gstAgent,
  optimizerAgent, translatorAgent, voiceAgent, briefingAgent,
];
