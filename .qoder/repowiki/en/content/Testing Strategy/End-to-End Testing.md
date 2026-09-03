# End-to-End Testing

<cite>
**Referenced Files in This Document**
- [e2e.mjs](file://stepwise ai/e2e.mjs)
- [smoke.mjs](file://stepwise ai/smoke.mjs)
- [route.ts (signup)](file://stepwise ai/app/app/api/auth/signup/route.ts)
- [auth.ts](file://stepwise ai/app/lib/auth.ts)
- [sessions route.ts](file://stepwise ai/app/app/api/sessions/route.ts)
- [analyze route.ts](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts)
- [complete route.ts](file://stepwise ai/app/app/api/sessions/[id]/complete/route.ts)
- [sessionsRepo.ts](file://stepwise ai/app/lib/sessionsRepo.ts)
- [journey.ts](file://stepwise ai/app/lib/journey.ts)
- [types.ts](file://stepwise ai/app/lib/types.ts)
- [teaching.ts](file://stepwise ai/app/lib/teaching.ts)
- [package.json](file://stepwise ai/app/package.json)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion
10. Appendices

## Introduction
This document provides end-to-end testing guidance for StepWise AI using the existing e2e.mjs test suite. It explains how to validate the MVP learning loop from user signup through session completion and final report generation, how to set up the environment, manage cookies, handle authentication, and verify interactive Board operations, AI-powered teaching responses, and adaptive learning flows. It also covers multi-step sessions, hint systems, misconception detection, CI setup ideas, parallelization strategies, reporting, debugging, performance considerations, and maintenance practices for evolving features.

## Project Structure
StepWise AI is a Next.js application with API routes under app/api and shared server logic under app/lib. The e2e tests are Node scripts at the repository root that call the running server endpoints directly via fetch and maintain an HTTP cookie jar for authenticated requests. A lightweight smoke test verifies page availability.

```mermaid
graph TB
E2E["e2e.mjs"] --> S["Server: /api/auth/signup"]
E2E --> M["Server: /api/me"]
E2E --> C["Server: /api/sessions"]
E2E --> B["Server: /api/boards/:id"]
E2E --> A["Server: /api/sessions/:id/analyze"]
E2E --> H["Server: /api/sessions/:id/hint"]
E2E --> K["Server: /api/sessions/:id/complete"]
E2E --> R["Server: /api/reports/:sessionId"]
E2E --> J["Server: /api/journey"]
```

**Diagram sources**
- [e2e.mjs:1-147](file://stepwise ai/e2e.mjs#L1-L147)
- [sessions route.ts:1-56](file://stepwise ai/app/app/api/sessions/route.ts#L1-L56)
- [analyze route.ts:1-180](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L1-L180)
- [complete route.ts:1-124](file://stepwise ai/app/app/api/sessions/[id]/complete/route.ts#L1-L124)

**Section sources**
- [package.json:6-11](file://stepwise ai/app/package.json#L6-L11)
- [e2e.mjs:1-23](file://stepwise ai/e2e.mjs#L1-L23)
- [smoke.mjs:1-14](file://stepwise ai/smoke.mjs#L1-L14)

## Core Components
- Authentication and session cookies: Signup creates a signed httpOnly session cookie used by subsequent requests.
- Session lifecycle: Creating a session seeds the Board with system/AI objects and returns steps for guided learning.
- Board persistence: PUT updates replace board objects atomically; ownership checks prevent cross-user access.
- Evaluation engine: analyze endpoint evaluates student attempts, records errors, transitions state, and advances steps when correct.
- Hint system: Escalating hints are generated and persisted per session.
- Completion and reporting: complete endpoint generates a Final Report idempotently, updates the Learning Journey, and persists events.
- Journey and reports: GET endpoints expose journey data and saved reports.

**Section sources**
- [auth.ts:104-138](file://stepwise ai/app/lib/auth.ts#L104-L138)
- [sessions route.ts:11-43](file://stepwise ai/app/app/api/sessions/route.ts#L11-L43)
- [sessionsRepo.ts:26-116](file://stepwise ai/app/lib/sessionsRepo.ts#L26-L116)
- [sessionsRepo.ts:198-265](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L265)
- [analyze route.ts:22-179](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L22-L179)
- [complete route.ts:15-123](file://stepwise ai/app/app/api/sessions/[id]/complete/route.ts#L15-L123)
- [journey.ts:59-261](file://stepwise ai/app/lib/journey.ts#L59-L261)

## Architecture Overview
The e2e script orchestrates the full MVP loop by calling API endpoints in sequence. Each request carries a Cookie header derived from the signup response. The server enforces authentication, validates inputs, interacts with the database, and optionally calls the AI provider abstraction to evaluate work or generate reports.

```mermaid
sequenceDiagram
participant T as "e2e.mjs"
participant AUTH as "/api/auth/signup"
participant SESS as "/api/sessions"
participant BOARD as "/api/boards/ : id"
participant EVAL as "/api/sessions/ : id/analyze"
participant HINT as "/api/sessions/ : id/hint"
participant COMP as "/api/sessions/ : id/complete"
participant REP as "/api/reports/ : sessionId"
participant JRN as "/api/journey"
T->>AUTH : POST {email,password}
AUTH-->>T : 201 + Set-Cookie
T->>SESS : POST {question}
SESS-->>T : {sessionId,boardId,steps,...}
T->>BOARD : PUT {objects}
BOARD-->>T : {saved : true}
T->>EVAL : POST {stepIndex,attemptText,activeSeconds}
EVAL-->>T : {evaluation,status,nextStepIndex,...}
T->>HINT : POST {attemptText}
HINT-->>T : {hint : {level,message}}
T->>COMP : POST {activeSeconds}
COMP-->>T : {report,journey}
T->>REP : GET
REP-->>T : {report}
T->>JRN : GET
JRN-->>T : {journey}
```

**Diagram sources**
- [e2e.mjs:36-146](file://stepwise ai/e2e.mjs#L36-L146)
- [sessions route.ts:11-43](file://stepwise ai/app/app/api/sessions/route.ts#L11-L43)
- [analyze route.ts:22-179](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L22-L179)
- [complete route.ts:15-123](file://stepwise ai/app/app/api/sessions/[id]/complete/route.ts#L15-L123)

## Detailed Component Analysis

### MVP Verification Loop (e2e.mjs)
The e2e script performs a linear flow:
- Signup and onboarding update
- Create a learning session and capture sessionId/boardId
- Seed and autosave Board objects
- Evaluate multiple attempts, including deliberate misconceptions
- Request hints and observe escalation
- Complete all steps and finalize the session
- Verify idempotent report generation
- Fetch report and journey
- Validate ownership isolation and unauthenticated blocking

```mermaid
flowchart TD
Start(["Start e2e"]) --> Signup["POST /api/auth/signup"]
Signup --> Me["GET/PATCH /api/me"]
Me --> CreateSession["POST /api/sessions"]
CreateSession --> SaveBoard["PUT /api/boards/:id"]
SaveBoard --> Analyze["POST /api/sessions/:id/analyze"]
Analyze --> Misconception{"Misconception?"}
Misconception --> |Yes| Hint["POST /api/sessions/:id/hint"]
Misconception --> |No| NextStep["Advance step"]
Hint --> NextStep
NextStep --> AllDone{"All steps done?"}
AllDone --> |No| Analyze
AllDone --> |Yes| Complete["POST /api/sessions/:id/complete"]
Complete --> Idempotent["Repeat complete"]
Idempotent --> FetchReport["GET /api/reports/:sessionId"]
FetchReport --> FetchJourney["GET /api/journey"]
FetchJourney --> Ownership["Ownership isolation check"]
Ownership --> AuthCheck["Unauthenticated blocked"]
AuthCheck --> End(["Finish"])
```

**Diagram sources**
- [e2e.mjs:36-146](file://stepwise ai/e2e.mjs#L36-L146)

**Section sources**
- [e2e.mjs:36-146](file://stepwise ai/e2e.mjs#L36-L146)

### Authentication and Cookies
- Signup sets a signed httpOnly session cookie. The e2e script extracts it and attaches it to every subsequent request.
- Protected endpoints require a valid session; missing or invalid cookies result in 401.
- Ownership checks ensure users can only access their own resources.

```mermaid
sequenceDiagram
participant T as "e2e.mjs"
participant S as "Signup Route"
participant A as "Auth Lib"
T->>S : POST /api/auth/signup
S->>A : registerUser()
A-->>S : {id}
S->>A : createSession(), setSessionCookie()
S-->>T : 201 + Set-Cookie
T->>T : Extract cookie
T->>S : Any protected endpoint with Cookie header
S->>A : getCurrentUser()
A-->>S : User or null
S-->>T : 200/401 based on auth
```

**Diagram sources**
- [route.ts (signup):10-35](file://stepwise ai/app/app/api/auth/signup/route.ts#L10-L35)
- [auth.ts:46-67](file://stepwise ai/app/lib/auth.ts#L46-L67)
- [auth.ts:78-102](file://stepwise ai/app/lib/auth.ts#L78-L102)

**Section sources**
- [route.ts (signup):10-35](file://stepwise ai/app/app/api/auth/signup/route.ts#L10-L35)
- [auth.ts:46-67](file://stepwise ai/app/lib/auth.ts#L46-L67)
- [auth.ts:78-102](file://stepwise ai/app/lib/auth.ts#L78-L102)

### Interactive Board Operations
- Board objects are seeded with question and introduction content.
- Student contributions are appended and saved via PUT; the server replaces objects atomically with size limits and sanitization.
- Ownership is enforced at read/write time.

```mermaid
flowchart TD
Load["GET session recovery payload"] --> AddObj["Append student object"]
AddObj --> Save["PUT /api/boards/:id"]
Save --> Owned{"Owned by current user?"}
Owned --> |Yes| Persist["Replace board_objects atomically"]
Owned --> |No| Deny["Return NOT_FOUND"]
Persist --> Ready["Board ready for evaluation"]
```

**Diagram sources**
- [sessionsRepo.ts:26-116](file://stepwise ai/app/lib/sessionsRepo.ts#L26-L116)
- [sessionsRepo.ts:198-265](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L265)

**Section sources**
- [sessionsRepo.ts:198-265](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L265)

### AI-Powered Teaching Engine Responses
- The analyze endpoint builds an evaluation context from the current step, attempt text, board snapshot, profile, and prior hints.
- AI evaluation determines status (correct/partial/error/uncertain), produces feedback and errors, and drives state transitions.
- Errors are recorded; self-corrections are tracked when no hints were consumed between error and fix.

```mermaid
sequenceDiagram
participant T as "e2e.mjs"
participant A as "Analyze Route"
participant R as "Sessions Repo"
participant AI as "AI Provider"
T->>A : POST /api/sessions/ : id/analyze
A->>R : getSession(), getBoardObjects()
A->>AI : evaluateStudentWork(ctx)
AI-->>A : {status,feedback,errors,...}
A->>R : recordErrors()/markErrorsCorrected()
A->>R : updateSessionState()
A-->>T : {evaluation,nextStepIndex,allStepsDone,...}
```

**Diagram sources**
- [analyze route.ts:22-179](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L22-L179)
- [sessionsRepo.ts:284-330](file://stepwise ai/app/lib/sessionsRepo.ts#L284-L330)

**Section sources**
- [analyze route.ts:22-179](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L22-L179)
- [sessionsRepo.ts:284-330](file://stepwise ai/app/lib/sessionsRepo.ts#L284-L330)

### Adaptive Learning Flows and Hint System
- Hint levels escalate based on previous hints and evaluation outcomes.
- Intervention policy adjusts support level depending on correctness and uncertainty.
- The e2e script exercises the hint ladder after introducing a misconception.

```mermaid
flowchart TD
Eval["Evaluation status"] --> Decide{"Status?"}
Decide --> |correct| LowIntervene["Low intervention"]
Decide --> |partial| MedIntervene["Medium intervention"]
Decide --> |error| HighIntervene["High intervention"]
Decide --> |uncertain| Clarify["Clarify, no false certainty"]
MedIntervene --> HintNext["nextHintLevel(previous)"]
HighIntervene --> HintNext
HintNext --> Persist["Persist hint level"]
```

**Diagram sources**
- [teaching.ts:41-76](file://stepwise ai/app/lib/teaching.ts#L41-L76)
- [e2e.mjs:100-103](file://stepwise ai/e2e.mjs#L100-L103)

**Section sources**
- [teaching.ts:41-76](file://stepwise ai/app/lib/teaching.ts#L41-L76)
- [e2e.mjs:100-103](file://stepwise ai/e2e.mjs#L100-L103)

### Multi-Step Learning Sessions
- The session creation returns a structured list of steps with titles, instructions, and expected concepts.
- The e2e script iterates over steps, submitting attempts aligned with each step’s expectations until all steps are completed.

```mermaid
sequenceDiagram
participant T as "e2e.mjs"
participant S as "/api/sessions"
participant E as "/api/sessions/ : id/analyze"
T->>S : POST {question}
S-->>T : {steps : [...]}
loop For each step
T->>E : POST {stepIndex, attemptText, activeSeconds}
E-->>T : {stepJustCompleted,nextStepIndex,allStepsDone}
end
```

**Diagram sources**
- [sessions route.ts:11-43](file://stepwise ai/app/app/api/sessions/route.ts#L11-L43)
- [e2e.mjs:105-116](file://stepwise ai/e2e.mjs#L105-L116)
- [analyze route.ts:114-147](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L114-L147)

**Section sources**
- [sessions route.ts:11-43](file://stepwise ai/app/app/api/sessions/route.ts#L11-L43)
- [e2e.mjs:105-116](file://stepwise ai/e2e.mjs#L105-L116)
- [analyze route.ts:114-147](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L114-L147)

### Misconception Detection
- Deliberate incorrect statements trigger conceptual error classification and feedback labels.
- Errors are persisted and later included in the final report and journey updates.

```mermaid
flowchart TD
Attempt["Student attempt with misconception"] --> Eval["AI evaluation"]
Eval --> Status{"Status?"}
Status --> |error| Record["recordErrors()"]
Record --> State["Transition to ERROR/PARTIAL"]
State --> Feedback["Feedback with concept error label"]
```

**Diagram sources**
- [e2e.mjs:83-98](file://stepwise ai/e2e.mjs#L83-L98)
- [analyze route.ts:90-112](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L90-L112)
- [types.ts:80-103](file://stepwise ai/app/lib/types.ts#L80-L103)

**Section sources**
- [e2e.mjs:83-98](file://stepwise ai/e2e.mjs#L83-L98)
- [analyze route.ts:90-112](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L90-L112)
- [types.ts:80-103](file://stepwise ai/app/lib/types.ts#L80-L103)

### Final Report Generation and Journey Update
- Completion is idempotent; repeated calls return the same report without duplication.
- The report aggregates session stats, errors, self-corrections, and step progress.
- The Learning Journey is updated with concept statuses, misconceptions, and recommendations.

```mermaid
sequenceDiagram
participant T as "e2e.mjs"
participant C as "Complete Route"
participant R as "Sessions Repo"
participant J as "Journey"
T->>C : POST /api/sessions/ : id/complete
C->>R : getSessionStats()
C->>C : Check existing report (idempotent)
C->>C : Generate Final Report
C->>R : Insert report + finalize session
C->>J : updateLearningJourney()
C-->>T : {report,journey}
```

**Diagram sources**
- [complete route.ts:15-123](file://stepwise ai/app/app/api/sessions/[id]/complete/route.ts#L15-L123)
- [journey.ts:59-261](file://stepwise ai/app/lib/journey.ts#L59-L261)

**Section sources**
- [complete route.ts:15-123](file://stepwise ai/app/app/api/sessions/[id]/complete/route.ts#L15-L123)
- [journey.ts:59-261](file://stepwise ai/app/lib/journey.ts#L59-L261)

## Dependency Analysis
Key runtime dependencies for e2e execution:
- Node.js runtime to run e2e.mjs and smoke.mjs
- Next.js server running locally on port 3000
- Database backing stored data (files ignored by git include *.db)
- Optional AI provider configuration via environment variables

```mermaid
graph LR
E2E["e2e.mjs"] --> NEXT["Next.js Server :3000"]
NEXT --> DB["Database"]
NEXT --> AI["AI Provider (env)"]
SMOKE["smoke.mjs"] --> NEXT
```

**Diagram sources**
- [e2e.mjs:1-23](file://stepwise ai/e2e.mjs#L1-L23)
- [smoke.mjs:1-14](file://stepwise ai/smoke.mjs#L1-L14)
- [package.json:6-11](file://stepwise ai/app/package.json#L6-L11)

**Section sources**
- [e2e.mjs:1-23](file://stepwise ai/e2e.mjs#L1-L23)
- [smoke.mjs:1-14](file://stepwise ai/smoke.mjs#L1-L14)
- [package.json:6-11](file://stepwise ai/app/package.json#L6-L11)

## Performance Considerations
- Avoid per-keystroke AI calls; evaluate only on meaningful submissions as implemented in the analyze route.
- Use local state and optimistic updates on the client side; persist board snapshots atomically on the server.
- Debounce persistence where applicable and limit payload sizes (content and style/meta fields are truncated).
- Cache AI provider initialization and avoid redundant re-instantiation.
- Keep e2e assertions minimal and focused on critical paths to reduce flakiness and runtime.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing or expired session cookie: Ensure signup response sets a cookie and e2e attaches it to subsequent requests.
- Unauthenticated access: Protected endpoints return 401 if no valid cookie is present.
- Ownership violations: Accessing another user’s board returns 404; verify current user context.
- Invalid step index: Ensure stepIndex is within bounds of analysis.steps.
- AI provider misconfiguration: If AI calls fail, confirm environment variables and fallback behavior.
- Database not initialized: Ensure the server has started and the database file exists before running tests.

**Section sources**
- [auth.ts:78-102](file://stepwise ai/app/lib/auth.ts#L78-L102)
- [sessions route.ts:11-20](file://stepwise ai/app/app/api/sessions/route.ts#L11-L20)
- [analyze route.ts:38-42](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L38-L42)
- [complete route.ts:23-27](file://stepwise ai/app/app/api/sessions/[id]/complete/route.ts#L23-L27)

## Conclusion
The e2e.mjs suite validates the core StepWise AI learning experience end-to-end: authentication, session creation, Board interactions, AI-driven evaluation, hint escalation, misconception handling, step progression, idempotent report generation, and journey updates. By following the setup and strategies outlined here, you can reliably verify MVP functionality, extend coverage for new features, and integrate these tests into continuous integration pipelines.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Environment Setup
- Install dependencies and start the Next.js server on port 3000.
- Ensure required environment variables are set (for example, AUTH_SECRET and optional AI_PROVIDER/OpenAI key).
- Run the smoke test to verify pages respond with HTML.
- Run the e2e suite against the live server.

**Section sources**
- [package.json:6-11](file://stepwise ai/app/package.json#L6-L11)
- [smoke.mjs:1-14](file://stepwise ai/smoke.mjs#L1-L14)
- [e2e.mjs:1-23](file://stepwise ai/e2e.mjs#L1-L23)

### Test Data Management
- Use unique emails per run to avoid collisions.
- Clear or reset the database between runs if necessary.
- Reuse session IDs returned by the server for subsequent steps.

**Section sources**
- [e2e.mjs:34-52](file://stepwise ai/e2e.mjs#L34-L52)

### Handling Authentication Cookies
- Extract Set-Cookie from signup response and attach Cookie header to all subsequent requests.
- Preserve cookies across steps and restore them after temporary switches (for example, ownership isolation checks).

**Section sources**
- [e2e.mjs:6-23](file://stepwise ai/e2e.mjs#L6-L23)
- [e2e.mjs:134-144](file://stepwise ai/e2e.mjs#L134-L144)

### Continuous Integration, Parallelization, and Reporting
- CI setup:
  - Install dependencies, build/start the server, run smoke tests, then run e2e.mjs.
  - Export logs and artifacts for failed runs.
- Parallelization:
  - Split independent scenarios (for example, separate sessions per user) into parallel processes.
  - Ensure each process uses unique credentials and does not share mutable state.
- Reporting:
  - Capture console output from e2e.mjs and smoke.mjs.
  - Summarize pass/fail counts and print key metrics such as steps completed and hints used.

[No sources needed since this section provides general guidance]

### Debugging Failing End-to-End Tests
- Print request payloads and responses around failing assertions.
- Verify server logs for validation errors or exceptions.
- Confirm environment variables and provider configuration.
- Isolate failing steps by commenting out later assertions to narrow scope.

**Section sources**
- [e2e.mjs:25-32](file://stepwise ai/e2e.mjs#L25-L32)
- [analyze route.ts:168-175](file://stepwise ai/app/app/api/sessions/[id]/analyze/route.ts#L168-L175)
- [complete route.ts:119-123](file://stepwise ai/app/app/api/sessions/[id]/complete/route.ts#L119-L123)

### Maintenance Strategies for Evolving Features
- Keep e2e assertions aligned with API contracts defined in types.ts.
- Update step iteration logic when analysis.steps change shape.
- Extend hint and misconception scenarios to cover new edge cases.
- Refactor shared helpers (for example, cookie handling) to reduce duplication.

**Section sources**
- [types.ts:126-147](file://stepwise ai/app/lib/types.ts#L126-L147)
- [e2e.mjs:105-116](file://stepwise ai/e2e.mjs#L105-L116)
- [e2e.mjs:100-103](file://stepwise ai/e2e.mjs#L100-L103)