\# SupplyCMD — Codex Project Instructions



\## Project Identity



SupplyCMD is a deterministic supply-chain intelligence and decision-support platform built above an ERP system.



Current ERP integration:

\- Odoo 19



Core principle:



ERP truth first.

Deterministic calculations second.

AI explanation last.



AI must never become the authoritative calculation engine.



\---



\## Repository



Repository root:



C:\\Users\\H-Als\\OneDrive\\Desktop\\supplycmd-sr6-clean



Git remote:



https://github.com/Najeeb-121/supplycmd.git



Primary branch:



Hasan's\_Code



Latest safe pushed checkpoint:



31c40bb — Expose all simulation scenarios in dashboard



Previous Phase 14 checkpoint:



ddbd60f — Stabilize dashboard test timeout



\---



\## Development Environment



Operating system:

Windows



Shell:

PowerShell



Editor:

Antigravity / VS Code-compatible environment



Backend:

port 8080



Dashboard:

port 5173



Important commands:



pnpm --dir artifacts/api-server typecheck



pnpm --dir artifacts/supply-chain-dashboard typecheck



pnpm --dir artifacts/supply-chain-dashboard test



\---



\## Important Paths



Backend API:



artifacts/api-server



Dashboard:



artifacts/supply-chain-dashboard



Database:



lib/db



Simulation-related files:



artifacts/api-server/src/routes/simulation.ts



artifacts/api-server/src/routes/production.ts



artifacts/api-server/src/simulation/scenarios.ts



artifacts/supply-chain-dashboard/src/pages/simulations.tsx



artifacts/supply-chain-dashboard/src/\_\_tests\_\_/pages/simulations-page.test.tsx



Always inspect the real current files before modifying code.



\---



\## Multi-Tenant Rules



SupplyCMD is multi-tenant.



Tenant isolation is a critical security requirement.



Every tenant-owned query must be scoped by:



req.user!.companyId



Never trust a company ID from the browser when the authenticated session can provide it.



Never expose data from one company to another.



Always fail closed if tenant ownership cannot be verified.



\---



\## Authentication and Authorization



Roles include:



\- owner

\- admin

\- member



Authorization must be enforced server-side.



Do not rely only on hidden UI controls.



Never hard-code credentials.



Never expose passwords, tokens, session IDs, database URLs, API keys, or secrets.



\---



\## Odoo Acceptance Environment



The Odoo 19 database is a live acceptance environment for SupplyCMD.



It contains a realistic beverage-manufacturing supply chain.



It includes:



\- products

\- raw materials

\- finished goods

\- suppliers

\- vendor pricing

\- inventory

\- purchase orders

\- sales orders

\- bills of materials

\- manufacturing orders

\- work centers

\- work orders

\- stock movements

\- reordering

\- planning data



Do not erase or casually overwrite this acceptance dataset.



Do not fabricate ERP data if Odoo data is unavailable.



\---



\## ERP Truth and Unsupported Data



SupplyCMD must clearly distinguish between:



1\. ERP facts

2\. deterministic derived values

3\. external real-world assumptions

4\. unsupported or unknown values

5\. AI narration



If data is unsupported, use:



\- null

\- UNKNOWN

\- N/A

\- explicit unsupported state



Never fabricate:



\- inventory

\- supplier relationships

\- prices

\- currencies

\- lead times

\- financial losses

\- confidence scores

\- turnover

\- days on hand

\- demand values

\- production capacity



\---



\## Supported Simulation Scenarios



SupplyCMD supports 8 primary deterministic scenarios.



\### Supply Risks



1\. SUPPLIER\_DELAY



Parameters:

\- productId

\- supplierId

\- delayDays



2\. SUPPLIER\_QUALITY\_FAILURE



Parameters:

\- productId

\- supplierId

\- failurePct



3\. SINGLE\_SOURCE\_FAILURE



Parameters:

\- productId

\- supplierId



4\. SUPPLIER\_PRICE\_SHOCK



Parameters:

\- productId

\- supplierId

\- shockPct



\### Demand Risks



5\. DEMAND\_SURGE



Parameters:

\- productId

\- surgePct



6\. DEMAND\_COLLAPSE



Parameters:

\- productId

\- collapsePct



7\. SEASONALITY\_SHOCK



Parameters:

\- productId

\- peakMultiplier

\- troughMultiplier



\### Production Risks



8\. PRODUCTION\_LINE\_FAILURE



Parameters:

\- productId

\- lineId

\- downtimeDays



Do not invent unsupported scenario parameters.



Inspect backend validation before changing any scenario contract.



\---



\## Production Line Failure



Production work centers are loaded from:



GET /api/production/workcenters?productId=<SupplyCMD product id>



The endpoint must:



\- verify product ownership

\- remain tenant-scoped

\- map the selected product to Odoo production data

\- return only relevant work centers

\- avoid arbitrary production-line choices



\---



\## Current Simulation Dashboard State



The dashboard exposes all 8 supported scenarios.



Current verified dashboard regression:



12 test files passed



80 tests passed



Targeted simulation-page tests currently cover:



\- DEMAND\_SURGE

\- SINGLE\_SOURCE\_FAILURE

\- SUPPLIER\_PRICE\_SHOCK

\- DEMAND\_COLLAPSE

\- SEASONALITY\_SHOCK

\- PRODUCTION\_LINE\_FAILURE



Do not weaken or remove tests just to make the suite pass.



\---



\## Simulation Safety



Simulations are analytical.



They must not mutate the Odoo baseline unless a separate explicit write workflow is authorized.



A simulation should:



1\. read ERP truth

2\. apply an explicit scenario assumption

3\. calculate deterministic consequences

4\. return structured results

5\. optionally generate AI narration afterward



Never silently write hypothetical scenario results back to Odoo.



Reject invalid, impossible, unsupported, or non-finite scenario values.



Fail closed rather than guessing.



\---



\## Inventory and Procurement Rules



Do not count pending or cancelled procurement as committed inbound inventory unless the existing business logic explicitly defines it that way.



Inventory operational states include:



\- out\_of\_stock

\- critical

\- low\_stock

\- overstock

\- healthy



Unsupported KPIs such as turnover or days on hand should remain null if data does not support them.



Do not invent EOQ, safety stock, reorder point, or supplier values.



\---



\## Phase 14



Phase 14 is considered complete and frozen unless a real regression or security issue requires modification.



Phase 14 included:



\- roles

\- invitations

\- tenant-owned ERP configuration

\- endpoint isolation

\- sync isolation

\- security tests

\- company admin UI

\- error handling

\- multi-company acceptance testing

\- real-session authentication testing



Do not casually refactor Phase 14 security behavior.



\---



\## Acceptance Companies



Company 1:



Pepsico



Contains the main acceptance dataset.



Company 2:



Test Company



Used for tenant-isolation validation.



Historical E2E headers include:



x-e2e-test-company-id: 1



x-e2e-test-company-id: 2



Do not allow test-only tenant overrides to weaken production authentication.



\---



\## Current Product Stage



SupplyCMD is approaching final-product validation.



The next major objective is real-world testing.



Preferred validation pipeline:



REAL-WORLD EVENT

↓

SOURCE EVIDENCE

↓

NORMALIZED EXTERNAL ASSUMPTION

↓

SUPPORTED SUPPLYCMD SCENARIO

↓

ODOO-BASED BASELINE

↓

DETERMINISTIC SIMULATION

↓

STRUCTURED RESULTS

↓

EVIDENCE-BASED REPORT

↓

OPTIONAL AI NARRATION



External real-world data may define scenario assumptions.



External data must never silently replace ERP operational truth.



\---



\## Real-World Evidence Rules



External assumptions should preserve provenance.



Record where possible:



\- source

\- publisher

\- publication date

\- event date

\- geography

\- company or supplier

\- material or commodity

\- observed magnitude

\- unit

\- disruption duration

\- source URL

\- retrieval date

\- notes



Prefer authoritative sources such as:



\- government agencies

\- customs authorities

\- port authorities

\- commodity exchanges

\- official company releases

\- company filings

\- international organizations

\- trusted logistics datasets



Do not invent a percentage or duration from vague reporting.



\---



\## Real Event Mapping



Real-world events may be mapped into supported SupplyCMD scenarios.



Examples:



Verified 12-day disruption:



SUPPLIER\_DELAY

delayDays = 12



Verified 18% material cost increase:



SUPPLIER\_PRICE\_SHOCK

shockPct = 18



Verified 25% demand decline:



DEMAND\_COLLAPSE

collapsePct = 25



Verified 3-day production outage:



PRODUCTION\_LINE\_FAILURE

downtimeDays = 3



The real-world source supplies the assumption.



SupplyCMD calculates the consequence.



\---



\## Reporting Rules



Reports must clearly separate:



\### ERP Baseline



Facts from Odoo / SupplyCMD operational storage.



\### Scenario Assumption



The disruption assumption applied.



\### Deterministic Result



SupplyCMD-calculated output.



\### Unsupported Information



Anything not supported by available data.



\### AI Narrative



Optional explanation of deterministic output.



AI narration must not introduce new unsupported numbers or claims.



Reports must remain auditable.



\---



\## Codex Working Rules



Before substantial work:



1\. read AGENTS.md

2\. inspect Git status

3\. inspect the relevant current files

4\. understand existing tests

5\. do not modify anything until the requested task is understood



For broad or risky tasks, begin with:



INSPECTION ONLY



After an authorized change:



1\. make the smallest safe change

2\. typecheck

3\. run targeted tests

4\. run regression tests if needed

5\. inspect Git diff

6\. stage exact files only

7\. commit only after verification



Do not make unrelated cleanup changes.



\---



\## Git Safety



Never use these destructive commands:



git reset --hard



git clean -fd



git restore .



git checkout -- .



git push --force



git push --force-with-lease



Never delete untracked work without explicit human authorization.



Before staging:



git status --short



git diff



Before commit:



git diff --cached



After commit:



git status --short



git log -1 --oneline



Primary branch:



Hasan's\_Code



\---



\## Modification Discipline



When asked to inspect:



Do not modify.



When asked to test:



Do not modify unless explicitly authorized to fix.



When asked to fix:



Make the smallest safe change.



Never silently change formulas, business semantics, tenant behavior, or scenario contracts.



\---



\## Database Safety



Do not run destructive SQL without explicit authorization.



Before deleting data:



\- inspect tenant ownership

\- inspect foreign-key dependencies

\- use a transaction where appropriate

\- verify affected row counts

\- verify the final result



Never erase the Odoo acceptance dataset just to simplify testing.



\---



\## Odoo Integration Safety



Be careful with:



\- incomplete sync responses

\- suspicious empty responses

\- cancelled ERP records

\- product template vs variant identifiers

\- units of measure

\- BoM mappings

\- work-center mappings

\- deleted ERP records

\- relationship mismatches



Do not assume an empty Odoo response means all existing SupplyCMD data should be deleted.



\---



\## Developer Working Style



Work one small step at a time.



When instructing the developer:



\- provide exact Windows file paths

\- provide exact PowerShell commands

\- distinguish inspection from modification

\- do not ask the developer to paste TypeScript into PowerShell

\- stop when output is unexpected



Useful labels:



INSPECTION ONLY



CHANGE REQUIRED



TEST ONLY



CLEANUP REQUIRED



COMMIT



\---



\## Secrets



Never commit:



\- passwords

\- access tokens

\- invitation tokens

\- database URLs

\- Supabase private keys

\- Odoo credentials

\- OpenAI API keys

\- session cookies

\- service-role keys



Use environment variables or secure runtime prompts.



Check whether a secret exists without printing its value whenever possible.



\---



\## Final Product Priorities



Current priorities are:



1\. deterministic scenario coverage

2\. real-world validation

3\. provenance-backed assumptions

4\. ERP-to-report traceability

5\. tenant security

6\. authentication reliability

7\. regression testing

8\. failure-state behavior

9\. auditability

10\. release readiness

11\. evidence-based reports



Avoid large unrelated features until the current product is fully validated end to end.



\---



\## First Instruction for Every New Codex Session



Read AGENTS.md first.



Inspect the current repository and Git status before making changes.



Preserve:



\- ERP truth

\- tenant isolation

\- deterministic calculations

\- unsupported-data semantics

\- test coverage

\- Git safety



Do not modify anything until the requested task and current implementation are understood.

