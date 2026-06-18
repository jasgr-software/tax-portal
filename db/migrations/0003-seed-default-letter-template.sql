-- db/migrations/0003-seed-default-letter-template.sql
-- TASK-005-001: EPIC-005 — seed the system-default LetterTemplate row (AC-IDNT-007-01).
--
-- IDEMPOTENT: Only inserts if no row with isSystemDefault = 1 exists.
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + policies).
--
-- ADR-002: Runs under admin pool (taxportal_admin login, app_admin_role member).
-- DECISION-D: Single-current-row pattern — there is always exactly one active template.
--             isSystemDefault = 1 marks the seeded default; the accountant can edit it.
-- AC-IDNT-007-01: A system-provided default engagement-letter template exists without
--                 the accountant authoring one from scratch.
--
-- The placeholder content below is a minimal but production-shaped engagement letter
-- template. The accountant is expected to replace this content via the Tax Portal
-- letter-template editing surface (AC-IDNT-007-02).

IF NOT EXISTS (
    SELECT 1 FROM [dbo].[LetterTemplate] WHERE [isSystemDefault] = 1
)
BEGIN
    INSERT INTO [dbo].[LetterTemplate]
        ([content], [isSystemDefault], [updatedBy], [updatedAt])
    VALUES (
        N'Dear [Client Name],

Thank you for choosing our tax services. This engagement letter outlines the terms and scope of the services we will provide.

**Scope of Services**
We agree to provide the following tax preparation and advisory services:
- Review and preparation of your federal and applicable state income tax returns
- Tax planning advice related to the above returns
- Representation in the event of any inquiries from tax authorities related to the returns we prepare

**Client Responsibilities**
You agree to:
- Provide complete and accurate information necessary for us to complete your returns
- Notify us promptly of any changes in your financial circumstances
- Review the completed returns before signing and filing

**Fees**
Our fees will be based on the time required to complete your returns at our standard hourly rates, or as otherwise agreed.

**Confidentiality**
All information you provide to us will be treated as confidential and will not be disclosed to third parties without your consent, except as required by law.

By signing below, you acknowledge that you have read, understood, and agree to the terms of this engagement letter.

Sincerely,
[Accountant Name]
[Firm Name]',
        1,       -- isSystemDefault = 1 (system-seeded default, AC-IDNT-007-01)
        NULL,    -- updatedBy: NULL for system seed (no accountant clerkId at seed time)
        SYSDATETIMEOFFSET()
    );
END
