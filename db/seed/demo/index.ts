/**
 * db/seed/demo/index.ts — Demo seed orchestrator
 *
 * Seeds a complete, believable solo tax-practice dataset for walkthrough recordings.
 * All operations use the admin pool (bypasses RLS — correct for seed writes).
 *
 * FK-safe execution order:
 *   1. Services      (seedServices — already handles its own MERGE)
 *   2. Clients       (User + EngagementRequest + EngagementRequestService)
 *   3. Engagements   (one per accepted request)
 *   4. Questionnaire templates  (one per service type)
 *   5. Questionnaire answers    (for completed engagements)
 *   6. Document requests        (checklist per engagement past letter-sign)
 *   7. Documents                (metadata rows for complete/review engagements)
 *   8. Notifications            (accountant inbox)
 *
 * Called by: scripts/db-seed.ts --demo
 *
 * ASCII-only constraint applies to all downstream seed modules.
 */

import { seedServices } from "../services.js";
import { seedClients, seedAccountant } from "./clients.js";
import { seedEngagements } from "./engagements.js";
import {
  seedQuestionnaireTemplates,
  seedQuestionnaireAnswers,
  seedDocumentRequests,
  seedDocuments,
} from "./onboarding.js";
import { seedNotifications } from "./notifications.js";

/**
 * Runs the full demo seed pipeline.
 * Safe to call multiple times — all steps are idempotent.
 */
export async function seedDemo(): Promise<void> {
  console.warn("=== [demo seed] Starting demo data pipeline ===");

  // Step 1: Services (base data — must exist before request join rows)
  await seedServices();

  // Step 2a: Accountant — ACCOUNTANT User row (must exist before admin pages do User lookups)
  // TASK-009-004: accountant-seed precondition; see DECISION in clients.ts seedAccountant().
  await seedAccountant();

  // Step 2: Clients — User rows + EngagementRequests + service join rows
  const clientMap = await seedClients();

  // Step 3: Engagements — one per accepted request, spread across lifecycle states
  const engagementIdByEmail = await seedEngagements(clientMap);

  // Step 4: Questionnaire templates — one per major service type
  const templateIdByServiceName = await seedQuestionnaireTemplates();

  // Step 5: Questionnaire answers — for engagements where questionnaire is done
  await seedQuestionnaireAnswers(engagementIdByEmail, templateIdByServiceName);

  // Step 6: Document requests — checklist for each engagement past letter-sign step
  const requestIdMap = await seedDocumentRequests(engagementIdByEmail);

  // Step 7: Documents — metadata rows for complete/review engagements
  await seedDocuments(engagementIdByEmail, requestIdMap);

  // Step 8: Notifications — accountant inbox with realistic history + 2 unread
  await seedNotifications(clientMap);

  console.warn("=== [demo seed] Demo data pipeline complete ===");
}
