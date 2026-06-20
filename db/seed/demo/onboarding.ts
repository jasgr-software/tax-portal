/**
 * db/seed/demo/onboarding.ts — Demo seed: QuestionnaireTemplate, QuestionnaireAnswer,
 *                              DocumentRequest, Document rows
 *
 * Seeds onboarding artifacts so the gate looks lived-in:
 *
 *   QuestionnaireTemplate: one per major service type. The template for
 *     "Individual Tax Return Preparation" is the most complete; others are
 *     abbreviated. Keyed on serviceId (UNIQUE in the schema).
 *
 *   QuestionnaireAnswer: one row per engagement where questionnaireDone = true
 *     (margaret, rafael, diane). Answers are realistic plain-ASCII strings.
 *
 *   DocumentRequest: a checklist for each engagement that has passed the letter
 *     step. Items are labelled with realistic tax-document names.
 *     Keyed for idempotency via "engagementId + label" (no stable surrogate —
 *     we use INSERT WHERE NOT EXISTS).
 *
 *   Document: a handful of metadata rows (status='active') for engagements that
 *     are Complete or Review — simulates already-uploaded files.
 *     storageKey uses the ADR-009 shape:
 *       engagements/{engagementId}/documents/{documentId}/v1/{filename}
 *     PLACEHOLDER: no real blob bytes exist. The key is deterministic and clearly
 *     fake (contains "demo-placeholder"). Downstream code that tries to fetch from
 *     Azurite will get a 404 for these rows — that is expected and acceptable for
 *     demo purposes (the UI shows file metadata; blob fetch is not exercised in the
 *     walkthrough recording).
 *
 * ASCII-only constraint: all strings are plain ASCII.
 * Called by: db/seed/demo/index.ts
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../../../packages/db/src/admin-connection.js";

const { NVarChar, BigInt: MssqlBigInt, Request: MssqlRequest } = mssqlPkg;

// ─── QuestionnaireTemplate definitions ────────────────────────────────────────

// Question JSON shape per DECISION-G / QuestionDef interface:
// [{ id, prompt, type, required }]

const INDIVIDUAL_TAX_QUESTIONS = JSON.stringify([
  {
    id: "filing_status",
    prompt: "What is your filing status for this tax year?",
    type: "text",
    required: true,
  },
  {
    id: "dependents",
    prompt:
      "How many dependents are you claiming? Please list their names and relationship to you.",
    type: "textarea",
    required: true,
  },
  {
    id: "income_sources",
    prompt:
      "List all sources of income (W-2 wages, 1099 freelance, rental, investments, etc.).",
    type: "textarea",
    required: true,
  },
  {
    id: "state_returns",
    prompt: "Which states do you need to file in this year?",
    type: "text",
    required: true,
  },
  {
    id: "major_life_changes",
    prompt:
      "Did you experience any major life changes this year (marriage, divorce, new home, retirement)?",
    type: "textarea",
    required: false,
  },
  {
    id: "prior_year_refund",
    prompt:
      "Did you receive a state income tax refund last year? If so, approximately how much?",
    type: "text",
    required: false,
  },
  {
    id: "additional_notes",
    prompt:
      "Is there anything else you would like us to know before we begin preparing your return?",
    type: "textarea",
    required: false,
  },
]);

const BUSINESS_TAX_QUESTIONS = JSON.stringify([
  {
    id: "entity_type",
    prompt: "What is the entity type? (S-Corp, C-Corp, Partnership, LLC, Sole Proprietorship)",
    type: "text",
    required: true,
  },
  {
    id: "ein",
    prompt: "What is your Federal Employer Identification Number (EIN)?",
    type: "text",
    required: true,
  },
  {
    id: "fiscal_year",
    prompt: "What is the fiscal year end date for the business?",
    type: "text",
    required: true,
  },
  {
    id: "states_filed",
    prompt: "In which states does the business have nexus or file returns?",
    type: "textarea",
    required: true,
  },
  {
    id: "accounting_software",
    prompt:
      "What accounting software do you use? (QuickBooks, Xero, Wave, spreadsheets, other)",
    type: "text",
    required: false,
  },
  {
    id: "changes_this_year",
    prompt:
      "Did the business have any significant changes this year (new partners, buyouts, asset purchases over $2,500)?",
    type: "textarea",
    required: false,
  },
]);

const TAX_PLANNING_QUESTIONS = JSON.stringify([
  {
    id: "current_year_income_estimate",
    prompt:
      "What is your estimated total income for the current tax year (wages, self-employment, investment)?",
    type: "text",
    required: true,
  },
  {
    id: "retirement_contributions",
    prompt:
      "Have you made or are you planning to make retirement account contributions (401k, IRA, SEP) this year?",
    type: "textarea",
    required: false,
  },
  {
    id: "planning_goals",
    prompt:
      "What are your primary tax planning goals? (reduce current-year liability, minimize estimated payments, other)",
    type: "textarea",
    required: true,
  },
]);

const BOOKKEEPING_QUESTIONS = JSON.stringify([
  {
    id: "accounting_software_bk",
    prompt:
      "What accounting software do you currently use, if any? (QuickBooks Online, Xero, Wave, spreadsheets, none)",
    type: "text",
    required: true,
  },
  {
    id: "transaction_volume",
    prompt:
      "Approximately how many bank and credit card transactions does the business have per month?",
    type: "text",
    required: true,
  },
  {
    id: "catch_up_needed",
    prompt:
      "Are your books current, or do you need catch-up bookkeeping? If catch-up, how many months are behind?",
    type: "textarea",
    required: true,
  },
  {
    id: "payroll",
    prompt: "Does the business run payroll? If yes, which payroll provider?",
    type: "text",
    required: false,
  },
]);

const IRS_QUESTIONS = JSON.stringify([
  {
    id: "notice_type",
    prompt:
      "What type of IRS notice or action are you responding to? (CP2000, CP2501, audit letter, levy, other) " +
      "Please provide the notice number if available.",
    type: "textarea",
    required: true,
  },
  {
    id: "tax_years_involved",
    prompt: "Which tax year(s) are involved?",
    type: "text",
    required: true,
  },
  {
    id: "response_deadline",
    prompt: "What is the response deadline on the notice (if any)?",
    type: "text",
    required: true,
  },
  {
    id: "prior_correspondence",
    prompt:
      "Have you already corresponded with the IRS about this issue? If yes, please describe.",
    type: "textarea",
    required: false,
  },
]);

// ─── DocumentRequest label sets per engagement role ──────────────────────────

const INDIVIDUAL_DOC_REQUESTS = [
  "W-2 form(s) from all employers",
  "1099 form(s) — income from freelance, contract, or gig work",
  "Form 1098 — mortgage interest statement (if applicable)",
  "Property tax statements (if applicable)",
  "Prior year federal and state tax returns",
  "Social Security numbers for all dependents",
  "1099-DIV and 1099-INT — dividend and interest statements",
];

const BUSINESS_DOC_REQUESTS = [
  "Profit and loss statement for the fiscal year",
  "Balance sheet as of fiscal year end",
  "Bank statements for all business accounts (12 months)",
  "Prior year business tax return",
  "Payroll summary / W-3 (if applicable)",
  "Fixed asset list with purchase dates and costs",
  "Vehicle mileage log (if vehicles used for business)",
];

const IRS_DOC_REQUESTS = [
  "Copy of the IRS notice or audit letter",
  "Prior year tax return(s) for the year(s) under review",
  "Documentation supporting income and deductions questioned by the IRS",
  "Any prior correspondence with the IRS regarding this matter",
];

// ─── QuestionnaireAnswer data ─────────────────────────────────────────────────

// Answers keyed by questionId matching the templates above.
const MARGARET_ANSWERS = JSON.stringify({
  filing_status: "Married Filing Jointly",
  dependents:
    "Two children: Aisha Okonkwo (daughter, age 12) and Tobias Okonkwo (son, age 9).",
  income_sources:
    "W-2 from Northwestern University (full-time). Husband has W-2 from City of Chicago (firefighter). We also have a small amount of savings account interest.",
  state_returns:
    "Illinois (full year) and Ohio (partial year - moved in March). This is the first year we need to file in two states.",
  major_life_changes:
    "Relocated from Columbus, OH to Chicago, IL in March for my job. Purchased a new home in Evanston in April.",
  prior_year_refund: "Received approx $1,200 from Ohio last year.",
  additional_notes:
    "We have a home office used exclusively for my remote work days. Not sure if that qualifies given the move mid-year.",
});

const RAFAEL_ANSWERS = JSON.stringify({
  entity_type: "LLC (single member, taxed as S-Corp effective 2025)",
  ein: "82-XXXXXXX",
  fiscal_year: "December 31",
  states_filed: "Texas (no state income tax). Possible nexus in California due to a client there - need to discuss.",
  accounting_software: "QuickBooks Online",
  changes_this_year:
    "Made S-Corp election effective January 1, 2025. Purchased a commercial espresso machine for our cafe pop-up ($8,400). Added one part-time employee in Q3.",
});

const DIANE_ANSWERS = JSON.stringify({
  filing_status: "Single",
  dependents: "None",
  income_sources:
    "W-2 from Brigham and Women's Hospital (RN, full time). Some interest from a savings account - less than $50.",
  state_returns: "Massachusetts",
  major_life_changes: "None this year.",
  prior_year_refund: "About $300 from Massachusetts last year.",
  additional_notes: "",
});

// ─── Seed functions ───────────────────────────────────────────────────────────

/**
 * Upserts QuestionnaireTemplate rows for each major service type.
 * Returns a map of serviceName -> templateId.
 */
export async function seedQuestionnaireTemplates(): Promise<
  Map<string, string>
> {
  const pool = await getAdminPool();

  const templatesByService: Array<{ serviceName: string; questions: string }> =
    [
      {
        serviceName: "Individual Tax Return Preparation",
        questions: INDIVIDUAL_TAX_QUESTIONS,
      },
      {
        serviceName: "Business Tax Return Preparation",
        questions: BUSINESS_TAX_QUESTIONS,
      },
      { serviceName: "Tax Planning", questions: TAX_PLANNING_QUESTIONS },
      { serviceName: "Bookkeeping", questions: BOOKKEEPING_QUESTIONS },
      {
        serviceName: "IRS Correspondence & Audit Support",
        questions: IRS_QUESTIONS,
      },
    ];

  console.warn(
    "[seed/demo/onboarding] Upserting",
    templatesByService.length,
    "questionnaire templates...",
  );

  const templateIdByServiceName = new Map<string, string>();

  for (const t of templatesByService) {
    // Look up the serviceId
    const svcReq = new MssqlRequest(pool);
    svcReq.input("name", NVarChar(200), t.serviceName);
    const svcResult = await svcReq.query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Service] WHERE [name] = @name`,
    );
    const serviceId = svcResult.recordset[0]?.id;
    if (!serviceId) {
      console.warn(
        `[seed/demo/onboarding] WARNING: Service "${t.serviceName}" not found — skipping template.`,
      );
      continue;
    }

    // MERGE keyed on serviceId (@@unique([serviceId]) in schema)
    const req = new MssqlRequest(pool);
    req.input("serviceId", NVarChar(50), serviceId);
    req.input("questions", NVarChar(mssqlPkg.MAX), t.questions);
    await req.query(`
      MERGE [dbo].[QuestionnaireTemplate] AS target
      USING (SELECT @serviceId AS [serviceId]) AS source
        ON target.[serviceId] = source.[serviceId]
      WHEN MATCHED THEN
        UPDATE SET
          [questions]  = @questions,
          [updatedAt]  = SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN
        INSERT ([serviceId], [questions], [updatedBy], [updatedAt])
        VALUES (@serviceId, @questions, NULL, SYSDATETIMEOFFSET());
    `);

    // Fetch back the template id
    const idReq = new MssqlRequest(pool);
    idReq.input("serviceId", NVarChar(50), serviceId);
    const idResult = await idReq.query<{ id: string }>(
      `SELECT [id] FROM [dbo].[QuestionnaireTemplate] WHERE [serviceId] = @serviceId`,
    );
    const templateId = idResult.recordset[0]?.id;
    if (templateId) {
      templateIdByServiceName.set(t.serviceName, templateId);
    }
  }

  console.warn(
    "[seed/demo/onboarding] Questionnaire templates done.",
  );

  return templateIdByServiceName;
}

/**
 * Upserts QuestionnaireAnswer rows for engagements where the questionnaire is done.
 * Uses MERGE on engagementId (@@unique([engagementId]) in schema).
 */
export async function seedQuestionnaireAnswers(
  engagementIdByEmail: Map<string, string>,
  templateIdByServiceName: Map<string, string>,
): Promise<void> {
  const pool = await getAdminPool();

  // answers[email] = { answers JSON, primary service name for templateId lookup }
  const answerData: Array<{
    clientEmail: string;
    answersJson: string;
    primaryServiceName: string;
    submittedDaysAgo: number;
  }> = [
    {
      clientEmail: "margaret.okonkwo@example.com",
      answersJson: MARGARET_ANSWERS,
      primaryServiceName: "Individual Tax Return Preparation",
      submittedDaysAgo: 36,
    },
    {
      clientEmail: "rafael.montoya@example.com",
      answersJson: RAFAEL_ANSWERS,
      primaryServiceName: "Business Tax Return Preparation",
      submittedDaysAgo: 29,
    },
    {
      clientEmail: "diane.hartwell@example.com",
      answersJson: DIANE_ANSWERS,
      primaryServiceName: "Individual Tax Return Preparation",
      submittedDaysAgo: 22,
    },
  ];

  console.warn(
    "[seed/demo/onboarding] Upserting",
    answerData.length,
    "questionnaire answers...",
  );

  for (const a of answerData) {
    const engagementId = engagementIdByEmail.get(a.clientEmail);
    if (!engagementId) {
      console.warn(
        `[seed/demo/onboarding] WARNING: no engagement for ${a.clientEmail} — skipping answer.`,
      );
      continue;
    }

    const templateId = templateIdByServiceName.get(a.primaryServiceName);
    if (!templateId) {
      console.warn(
        `[seed/demo/onboarding] WARNING: no template for "${a.primaryServiceName}" — skipping answer.`,
      );
      continue;
    }

    const submittedAt = new Date();
    submittedAt.setDate(submittedAt.getDate() - a.submittedDaysAgo);

    const req = new MssqlRequest(pool);
    req.input("engagementId", NVarChar(50), engagementId);
    req.input("templateId", NVarChar(50), templateId);
    req.input("answers", NVarChar(mssqlPkg.MAX), a.answersJson);
    req.input("submittedAt", mssqlPkg.DateTimeOffset, submittedAt);

    await req.query(`
      MERGE [dbo].[QuestionnaireAnswer] AS target
      USING (SELECT @engagementId AS [engagementId]) AS source
        ON target.[engagementId] = source.[engagementId]
      WHEN MATCHED THEN
        UPDATE SET
          [templateId]  = @templateId,
          [answers]     = @answers,
          [submittedAt] = @submittedAt,
          [updatedAt]   = SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN
        INSERT ([engagementId], [templateId], [answers], [submittedAt], [createdAt], [updatedAt])
        VALUES (@engagementId, @templateId, @answers, @submittedAt, @submittedAt, SYSDATETIMEOFFSET());
    `);
  }

  console.warn("[seed/demo/onboarding] Questionnaire answers done.");
}

/**
 * Upserts DocumentRequest checklist rows for each engagement that has passed the
 * letter-sign step.
 * Returns a map of `${engagementId}::${label}` -> documentRequestId.
 *
 * Idempotent: INSERT WHERE NOT EXISTS on (engagementId, label).
 */
export async function seedDocumentRequests(
  engagementIdByEmail: Map<string, string>,
): Promise<Map<string, string>> {
  const pool = await getAdminPool();

  // Define which label set applies to each client (by primary service)
  const docRequestData: Array<{
    clientEmail: string;
    labels: string[];
  }> = [
    {
      clientEmail: "margaret.okonkwo@example.com",
      labels: INDIVIDUAL_DOC_REQUESTS,
    },
    {
      clientEmail: "rafael.montoya@example.com",
      labels: BUSINESS_DOC_REQUESTS,
    },
    {
      clientEmail: "diane.hartwell@example.com",
      labels: INDIVIDUAL_DOC_REQUESTS,
    },
    {
      clientEmail: "james.calloway@example.org",
      labels: IRS_DOC_REQUESTS,
    },
  ];

  console.warn(
    "[seed/demo/onboarding] Upserting document requests for",
    docRequestData.length,
    "engagements...",
  );

  const requestIdMap = new Map<string, string>();

  for (const d of docRequestData) {
    const engagementId = engagementIdByEmail.get(d.clientEmail);
    if (!engagementId) {
      console.warn(
        `[seed/demo/onboarding] WARNING: no engagement for ${d.clientEmail} — skipping doc requests.`,
      );
      continue;
    }

    for (const label of d.labels) {
      const req = new MssqlRequest(pool);
      req.input("engagementId", NVarChar(50), engagementId);
      req.input("label", NVarChar(500), label);

      // INSERT WHERE NOT EXISTS — idempotent without needing a surrogate merge key
      await req.query(`
        IF NOT EXISTS (
          SELECT 1 FROM [dbo].[DocumentRequest]
          WHERE [engagementId] = @engagementId AND [label] = @label
        )
        INSERT INTO [dbo].[DocumentRequest]
          ([engagementId], [label], [createdBy], [updatedAt])
        VALUES
          (@engagementId, @label, NULL, SYSDATETIMEOFFSET());
      `);

      // Fetch the id for the Documents step
      const idReq = new MssqlRequest(pool);
      idReq.input("engagementId", NVarChar(50), engagementId);
      idReq.input("label", NVarChar(500), label);
      const idResult = await idReq.query<{ id: string }>(
        `SELECT [id] FROM [dbo].[DocumentRequest]
         WHERE [engagementId] = @engagementId AND [label] = @label`,
      );
      const drId = idResult.recordset[0]?.id;
      if (drId) {
        requestIdMap.set(`${engagementId}::${label}`, drId);
      }
    }
  }

  console.warn("[seed/demo/onboarding] Document requests done.");

  return requestIdMap;
}

/**
 * Upserts demo Document metadata rows (status='active') for Complete and Review
 * engagements, simulating already-uploaded files.
 *
 * storageKey placeholder shape: engagements/{engagementId}/documents/demo-placeholder-{n}/v1/{filename}
 * PLACEHOLDER: no real blob bytes exist in Azurite for these keys.
 * Idempotent: INSERT WHERE NOT EXISTS on (engagementId, storageKey).
 */
export async function seedDocuments(
  engagementIdByEmail: Map<string, string>,
  requestIdMap: Map<string, string>,
): Promise<void> {
  const pool = await getAdminPool();

  // Pairs of (clientEmail, file metadata)
  const docData: Array<{
    clientEmail: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    requestLabel: string | null;
  }> = [
    // Margaret (Complete) — several uploaded docs
    {
      clientEmail: "margaret.okonkwo@example.com",
      filename: "W2-NorthwesternUniversity-2025.pdf",
      contentType: "application/pdf",
      sizeBytes: 184320,
      requestLabel: "W-2 form(s) from all employers",
    },
    {
      clientEmail: "margaret.okonkwo@example.com",
      filename: "W2-CityOfChicago-2025.pdf",
      contentType: "application/pdf",
      sizeBytes: 176128,
      requestLabel: "W-2 form(s) from all employers",
    },
    {
      clientEmail: "margaret.okonkwo@example.com",
      filename: "Form1098-EvantonMortgage-2025.pdf",
      contentType: "application/pdf",
      sizeBytes: 204800,
      requestLabel: "Form 1098 — mortgage interest statement (if applicable)",
    },
    {
      clientEmail: "margaret.okonkwo@example.com",
      filename: "PriorYearReturn-Federal-2024.pdf",
      contentType: "application/pdf",
      sizeBytes: 512000,
      requestLabel: "Prior year federal and state tax returns",
    },
    // Rafael (Review) — business documents
    {
      clientEmail: "rafael.montoya@example.com",
      filename: "ProfitAndLoss-2025-FY.pdf",
      contentType: "application/pdf",
      sizeBytes: 348160,
      requestLabel: "Profit and loss statement for the fiscal year",
    },
    {
      clientEmail: "rafael.montoya@example.com",
      filename: "BalanceSheet-2025-Dec31.pdf",
      contentType: "application/pdf",
      sizeBytes: 266240,
      requestLabel: "Balance sheet as of fiscal year end",
    },
    {
      clientEmail: "rafael.montoya@example.com",
      filename: "BankStatements-2025-AllAccounts.pdf",
      contentType: "application/pdf",
      sizeBytes: 1048576,
      requestLabel:
        "Bank statements for all business accounts (12 months)",
    },
  ];

  console.warn(
    "[seed/demo/onboarding] Upserting",
    docData.length,
    "demo document rows...",
  );

  for (let i = 0; i < docData.length; i++) {
    const doc = docData[i];
    if (!doc) continue;

    const engagementId = engagementIdByEmail.get(doc.clientEmail);
    if (!engagementId) {
      console.warn(
        `[seed/demo/onboarding] WARNING: no engagement for ${doc.clientEmail} — skipping document.`,
      );
      continue;
    }

    // Resolve documentRequestId if this doc fulfills a specific request label
    let documentRequestId: string | null = null;
    if (doc.requestLabel) {
      documentRequestId =
        requestIdMap.get(`${engagementId}::${doc.requestLabel}`) ?? null;
    }

    // PLACEHOLDER storage key — deterministic, clearly fake, no real bytes in Azurite.
    // ADR-009 key shape: engagements/{engagementId}/documents/{id}/v1/{filename}
    // We use a sequential placeholder id so the key is stable across re-runs.
    const placeholderDocId = `demo-placeholder-${String(i + 1).padStart(3, "0")}`;
    const storageKey = `engagements/${engagementId}/documents/${placeholderDocId}/v1/${encodeURIComponent(doc.filename)}`;

    const req = new MssqlRequest(pool);
    req.input("engagementId", NVarChar(50), engagementId);
    req.input("storageKey", NVarChar(1024), storageKey);
    req.input(
      "documentRequestId",
      NVarChar(50),
      documentRequestId ?? null,
    );
    req.input("originalFilename", NVarChar(500), doc.filename);
    req.input("contentType", NVarChar(255), doc.contentType);
    req.input("status", NVarChar(16), "active");

    // mssql BigInt() type for sizeBytes (schema: @db.BigInt)
    const sizeReq = new MssqlRequest(pool);
    sizeReq.input("engagementId", NVarChar(50), engagementId);
    sizeReq.input("storageKey", NVarChar(1024), storageKey);
    sizeReq.input(
      "documentRequestId",
      NVarChar(50),
      documentRequestId ?? null,
    );
    sizeReq.input("originalFilename", NVarChar(500), doc.filename);
    sizeReq.input("contentType", NVarChar(255), doc.contentType);
    sizeReq.input("status", NVarChar(16), "active");
    sizeReq.input("sizeBytes", MssqlBigInt, doc.sizeBytes);

    await sizeReq.query(`
      IF NOT EXISTS (
        SELECT 1 FROM [dbo].[Document]
        WHERE [engagementId] = @engagementId AND [storageKey] = @storageKey
      )
      INSERT INTO [dbo].[Document]
        ([engagementId], [documentRequestId], [storageKey], [originalFilename],
         [contentType], [sizeBytes], [status], [version], [uploadedBy], [updatedAt])
      VALUES
        (@engagementId, @documentRequestId, @storageKey, @originalFilename,
         @contentType, @sizeBytes, @status, 1, NULL, SYSDATETIMEOFFSET());
    `);
  }

  console.warn("[seed/demo/onboarding] Documents done.");
}
