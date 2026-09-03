# Response Generation System

<cite>
**Referenced Files in This Document**
- [index.ts](file://app/lib/ai/index.ts)
- [demoProvider.ts](file://app/lib/ai/demoProvider.ts)
- [openaiProvider.ts](file://app/lib/ai/openaiProvider.ts)
- [knowledge.ts](file://app/lib/ai/knowledge.ts)
- [teaching.ts](file://app/lib/teaching.ts)
- [types.ts](file://app/lib/types.ts)
- [sessionsRepo.ts](file://app/lib/sessionsRepo.ts)
- [route.ts](file://app/app/api/sessions/route.ts)
- [analyze route.ts](file://app/app/api/sessions/[id]/analyze/route.ts)
- [hint route.ts](file://app/app/api/sessions/[id]/hint/route.ts)
- [complete route.ts](file://app/app/api/sessions/[id]/complete/route.ts)
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

## Introduction
This document explains the response generation system that creates contextual explanations, feedback, and pedagogical guidance for students. It covers how natural language responses are produced to be age-appropriate, encouraging, and educationally effective; how evaluation results become constructive comments and suggestions; how personalization and tone adjustment adapt to learning modes and student profiles; and how AI providers integrate with quality controls to ensure accuracy and appropriateness.

## Project Structure
The response generation system spans API routes, a provider abstraction, teaching logic, session persistence, and shared types:
- API routes orchestrate sessions, evaluations, hints, and completion/reporting.
- The AI provider abstraction selects between a demo heuristic provider and an OpenAI-compatible provider.
- Teaching utilities define feedback labels, hint escalation, intervention policy, and state transitions.
- Session repository persists board objects, messages, hints, errors, and session state.
- Shared types define the domain model for evaluation, hints, reports, and profiles.

```mermaid
graph TB
Client["Client App"] --> SessAPI["Sessions API"]
SessAPI --> Provider["AI Provider Abstraction"]
Provider --> Demo["Demo Provider"]
Provider --> OpenAI["OpenAI-Compatible Provider"]
SessAPI --> Repo["Session Repository"]
SessAPI --> Teach["Teaching Engine"]
Repo --> DB["Database"]
```

**Diagram sources**
- [route.ts:11-40](file://app/app/api/sessions/route.ts#L11-L40)
- [analyze route.ts:22-179](file://app/app/api/sessions/[id]/analyze/route.ts#L22-L179)
- [hint route.ts:20-92](file://app/app/api/sessions/[id]/hint/route.ts#L20-L92)
- [complete route.ts:15-123](file://app/app/api/sessions/[id]/complete/route.ts#L15-L123)
- [index.ts:12-26](file://app/lib/ai/index.ts#L12-L26)
- [demoProvider.ts:69-201](file://app/lib/ai/demoProvider.ts#L69-L201)
- [openaiProvider.ts:72-146](file://app/lib/ai/openaiProvider.ts#L72-L146)
- [sessionsRepo.ts:26-116](file://app/lib/sessionsRepo.ts#L26-L116)
- [teaching.ts:8-77](file://app/lib/teaching.ts#L8-L77)

**Section sources**
- [route.ts:11-40](file://app/app/api/sessions/route.ts#L11-L40)
- [index.ts:12-26](file://app/lib/ai/index.ts#L12-L26)

## Core Components
- AI Provider Abstraction: Central factory selects demo or OpenAI provider based on environment configuration.
- Demo Provider: Heuristic-based tutor with misconception detection, concept matching, hint ladder, and report assembly.
- OpenAI-Compatible Provider: Structured JSON prompts with strict validation and sanitization to produce evaluation, hints, explanations, and final reports.
- Teaching Engine: Feedback label taxonomy, hint escalation titles, thresholds per learning mode, next hint level calculation, state mapping, and intervention policy.
- Session Repository: Creates sessions, persists board snapshots, records hints/errors, tracks AI messages, and computes session stats.
- Types: Domain models for evaluation results, hints, question analysis, profiles, and final reports.

Key responsibilities:
- Generate age-appropriate, encouraging, and pedagogically sound responses.
- Personalize tone and depth using profile fields (age band, explanation depth).
- Adapt pacing via learning mode thresholds and hint escalation.
- Ensure educational safety by validating and constraining AI outputs.

**Section sources**
- [index.ts:12-26](file://app/lib/ai/index.ts#L12-L26)
- [demoProvider.ts:69-201](file://app/lib/ai/demoProvider.ts#L69-L201)
- [openaiProvider.ts:72-146](file://app/lib/ai/openaiProvider.ts#L72-L146)
- [teaching.ts:8-77](file://app/lib/teaching.ts#L8-L77)
- [sessionsRepo.ts:26-116](file://app/lib/sessionsRepo.ts#L26-L116)
- [types.ts:61-296](file://app/lib/types.ts#L61-L296)

## Architecture Overview
The system follows a clear pipeline:
- A student submits a question through the Sessions API.
- The AI provider analyzes the question into steps and introduces the topic.
- During interaction, the analyze endpoint evaluates student work against step expectations and produces feedback and next actions.
- Hints are generated with escalating support levels.
- On completion, a final report is generated, validated, saved, and used to update the learning journey.

```mermaid
sequenceDiagram
participant C as "Client"
participant API as "Sessions API"
participant AI as "AI Provider"
participant R as "Session Repository"
participant T as "Teaching Engine"
C->>API : POST /api/sessions {question}
API->>AI : analyzeQuestion(question)
AI-->>API : QuestionAnalysis
API->>R : createLearningSession(...)
R-->>API : Session + Board
API-->>C : {sessionId, boardId, steps, introduction}
C->>API : POST /api/sessions/ : id/analyze {stepIndex, attemptText}
API->>R : getBoardObjects(), getSession()
API->>T : decideIntervention(status, providerLevel)
API->>AI : evaluateStudentWork(ctx)
AI-->>API : EvaluationResult
API->>R : recordErrors()/markErrorsCorrected(), addAiMessage()
API->>R : updateSessionState(...)
API-->>C : {evaluation, stepJustCompleted, nextStepIndex}
C->>API : POST /api/sessions/ : id/hint {attemptText}
API->>AI : generateHint(ctx, level)
AI-->>API : Hint
API->>R : recordHint(), addAiMessage(), updateSessionState()
API-->>C : {hint, level}
C->>API : POST /api/sessions/ : id/complete
API->>R : getSessionStats()
API->>AI : generateFinalReport({question, sessionStats})
AI-->>API : FinalReport
API->>R : save report, finalize session
API-->>C : {report, journey}
```

**Diagram sources**
- [route.ts:11-40](file://app/app/api/sessions/route.ts#L11-L40)
- [analyze route.ts:22-179](file://app/app/api/sessions/[id]/analyze/route.ts#L22-L179)
- [hint route.ts:20-92](file://app/app/api/sessions/[id]/hint/route.ts#L20-L92)
- [complete route.ts:15-123](file://app/app/api/sessions/[id]/complete/route.ts#L15-L123)
- [teaching.ts:41-77](file://app/lib/teaching.ts#L41-L77)
- [sessionsRepo.ts:26-116](file://app/lib/sessionsRepo.ts#L26-L116)

## Detailed Component Analysis

### AI Provider Abstraction
- Selects provider at runtime based on environment variables.
- Provides a unified interface for question analysis, evaluation, hints, explanations, and final reports.
- Exposes whether the active provider is a development/demo fallback.

```mermaid
classDiagram
class AIProviderAbstraction {
+getAIProvider() AIProvider
+isDemoMode() boolean
}
class AIProvider {
+info : AIProviderInfo
+analyzeQuestion(text) Promise~QuestionAnalysis~
+evaluateStudentWork(ctx) Promise~EvaluationResult~
+generateHint(ctx, level) Promise~Hint~
+generateExplanation(topic, depth, band) Promise~string~
+generateFinalReport(input) Promise~FinalReport~
}
class DemoProvider
class OpenAIProvider
AIProviderAbstraction --> AIProvider : "returns"
AIProvider <|.. DemoProvider
AIProvider <|.. OpenAIProvider
```

**Diagram sources**
- [index.ts:12-26](file://app/lib/ai/index.ts#L12-L26)
- [types.ts:252-296](file://app/lib/types.ts#L252-L296)

**Section sources**
- [index.ts:12-26](file://app/lib/ai/index.ts#L12-L26)
- [types.ts:252-296](file://app/lib/types.ts#L252-L296)

### Demo Provider (Heuristic Tutor)
- Analyzes questions using seeded topics or generic decomposition.
- Evaluates student work by detecting misconceptions and matching expected concepts.
- Generates hints via a fixed 7-level ladder tailored to step context.
- Produces final reports from session statistics and question analysis.

```mermaid
flowchart TD
Start(["Evaluate Student Work"]) --> CheckEmpty{"Any student content?"}
CheckEmpty --> |No| Uncertain["Return 'uncertain' with invitation to attempt"]
CheckEmpty --> |Yes| DetectMis["Detect misconceptions"]
DetectMis --> HasMis{"Conceptual error found?"}
HasMis --> |Yes| ConceptError["Return 'error' with CONCEPT_ERROR feedback<br/>and higher intervention"]
HasMis --> |No| MatchConcepts["Match expected concepts"]
MatchConcepts --> Ratio{"Ratio >= 0.99?"}
Ratio --> |Yes| Correct["Return 'correct' with positive feedback"]
Ratio --> |No| Partial{"Ratio >= 0.5?"}
Partial --> |Yes| PartialResp["Return 'partial' with MISSING_IDEA feedback"]
Partial --> |No| LowCoverage["Return 'error' with CHECK_THIS_STEP feedback"]
Uncertain --> End(["Exit"])
ConceptError --> End
Correct --> End
PartialResp --> End
LowCoverage --> End
```

**Diagram sources**
- [demoProvider.ts:205-402](file://app/lib/ai/demoProvider.ts#L205-L402)

**Section sources**
- [demoProvider.ts:69-201](file://app/lib/ai/demoProvider.ts#L69-L201)
- [demoProvider.ts:205-402](file://app/lib/ai/demoProvider.ts#L205-L402)
- [knowledge.ts:14-203](file://app/lib/ai/knowledge.ts#L14-L203)

### OpenAI-Compatible Provider (Structured LLM Responses)
- Uses structured JSON prompts with strict schemas for all outputs.
- Sanitizes and clamps AI responses to trusted shapes before use.
- Enforces educational rules via system instructions (no full answers until appropriate, treat student content as untrusted).
- Produces evaluations, hints, explanations, and final reports aligned with domain types.

```mermaid
sequenceDiagram
participant API as "Analyze Route"
participant OA as "OpenAI Provider"
participant V as "Sanitizer"
API->>OA : evaluateStudentWork(ctx)
OA->>OA : chatJson(system, user, schema)
OA-->>API : raw JSON
API->>V : sanitizeEvaluation(raw)
V-->>API : EvaluationResult (validated)
```

**Diagram sources**
- [openaiProvider.ts:149-170](file://app/lib/ai/openaiProvider.ts#L149-L170)
- [openaiProvider.ts:234-279](file://app/lib/ai/openaiProvider.ts#L234-L279)
- [analyze route.ts:83-88](file://app/app/api/sessions/[id]/analyze/route.ts#L83-L88)

**Section sources**
- [openaiProvider.ts:72-146](file://app/lib/ai/openaiProvider.ts#L72-L146)
- [openaiProvider.ts:149-170](file://app/lib/ai/openaiProvider.ts#L149-L170)
- [openaiProvider.ts:234-279](file://app/lib/ai/openaiProvider.ts#L234-L279)

### Teaching Engine (Feedback Labels, Hint Escalation, Intervention Policy)
- Defines feedback labels with icons and human-readable labels.
- Maps hint levels to titles and provides escalation logic.
- Adjusts thresholds based on learning mode (e.g., guided vs challenge).
- Translates evaluation status to session state transitions and determines intervention levels.

```mermaid
flowchart TD
Mode["Learning Mode"] --> Thresh["Get thresholds for mode"]
Status["Evaluation Status"] --> StateMap["Map to state machine state"]
Status --> Intervention["Decide intervention level"]
PrevHints["Previous hint levels"] --> NextLevel["Compute next hint level"]
```

**Diagram sources**
- [teaching.ts:8-77](file://app/lib/teaching.ts#L8-L77)

**Section sources**
- [teaching.ts:8-77](file://app/lib/teaching.ts#L8-L77)

### Session Repository (Persistence and Evidence Tracking)
- Creates learning sessions, seeds board objects, and records initial events.
- Persists board snapshots, AI messages, hints, and errors.
- Computes session statistics including time, hints, errors, and progress.

```mermaid
flowchart TD
Create["createLearningSession"] --> InsertQ["Insert question"]
InsertQ --> InsertS["Insert session"]
InsertS --> InsertB["Insert board"]
InsertB --> Seed["Seed board objects (question + intro)"]
Seed --> Events["Record learning events"]
```

**Diagram sources**
- [sessionsRepo.ts:26-116](file://app/lib/sessionsRepo.ts#L26-L116)

**Section sources**
- [sessionsRepo.ts:26-116](file://app/lib/sessionsRepo.ts#L26-L116)
- [sessionsRepo.ts:378-399](file://app/lib/sessionsRepo.ts#L378-L399)

### API Routes (Orchestration)
- Sessions creation: validates input, calls AI to analyze, persists session, returns board and steps.
- Analyze: builds evaluation context, calls AI evaluation, applies teaching policies, updates state, records evidence.
- Hint: escalates hints based on history, records hint usage, updates state.
- Complete: generates final report, saves atomically, finalizes session, updates learning journey.

**Section sources**
- [route.ts:11-40](file://app/app/api/sessions/route.ts#L11-L40)
- [analyze route.ts:22-179](file://app/app/api/sessions/[id]/analyze/route.ts#L22-L179)
- [hint route.ts:20-92](file://app/app/api/sessions/[id]/hint/route.ts#L20-L92)
- [complete route.ts:15-123](file://app/app/api/sessions/[id]/complete/route.ts#L15-L123)

## Dependency Analysis
- API routes depend on AI provider abstraction, teaching engine, and session repository.
- Providers depend on shared types and environment configuration.
- Demo provider depends on seed knowledge for predefined topics.
- OpenAI provider depends on external HTTP endpoints and enforces strict output validation.

```mermaid
graph LR
Routes["API Routes"] --> AI["AI Provider Abstraction"]
AI --> Demo["Demo Provider"]
AI --> OAI["OpenAI Provider"]
Routes --> Teach["Teaching Engine"]
Routes --> Repo["Session Repository"]
Demo --> Knowledge["Seed Knowledge"]
OAI --> Types["Shared Types"]
Teach --> Types
Repo --> Types
```

**Diagram sources**
- [route.ts:11-40](file://app/app/api/sessions/route.ts#L11-L40)
- [analyze route.ts:22-179](file://app/app/api/sessions/[id]/analyze/route.ts#L22-L179)
- [hint route.ts:20-92](file://app/app/api/sessions/[id]/hint/route.ts#L20-L92)
- [complete route.ts:15-123](file://app/app/api/sessions/[id]/complete/route.ts#L15-L123)
- [index.ts:12-26](file://app/lib/ai/index.ts#L12-L26)
- [demoProvider.ts:69-201](file://app/lib/ai/demoProvider.ts#L69-L201)
- [openaiProvider.ts:72-146](file://app/lib/ai/openaiProvider.ts#L72-L146)
- [knowledge.ts:14-203](file://app/lib/ai/knowledge.ts#L14-L203)
- [teaching.ts:8-77](file://app/lib/teaching.ts#L8-L77)
- [sessionsRepo.ts:26-116](file://app/lib/sessionsRepo.ts#L26-L116)
- [types.ts:61-296](file://app/lib/types.ts#L61-L296)

**Section sources**
- [index.ts:12-26](file://app/lib/ai/index.ts#L12-L26)
- [types.ts:61-296](file://app/lib/types.ts#L61-L296)

## Performance Considerations
- Avoid per-keystroke evaluation; only evaluate on meaningful submissions to reduce AI calls.
- Cache provider selection at startup to avoid repeated environment checks.
- Limit board object payloads to necessary fields when building evaluation context.
- Clamp and slice strings to prevent oversized payloads to AI providers.
- Use incremental hint escalation to minimize unnecessary AI requests.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing AI key: OpenAI provider will throw a configuration error if the API key is not set; ensure environment variables are configured.
- Empty or invalid step index: Validate step indices before calling analyze; handle INVALID_STEP responses.
- Session completed: Subsequent analyze/hint calls should be rejected when session status is completed.
- No student content: Expect uncertain feedback prompting the student to attempt; guide them to add content.
- Misconception detection: In demo mode, conceptual errors are flagged with specific descriptions; review expected concepts and patterns.
- Provider mode banner: When using demo provider, UI should display a visible banner indicating development fallback.

**Section sources**
- [openaiProvider.ts:24-32](file://app/lib/ai/openaiProvider.ts#L24-L32)
- [analyze route.ts:29-41](file://app/app/api/sessions/[id]/analyze/route.ts#L29-L41)
- [hint route.ts:27-35](file://app/app/api/sessions/[id]/hint/route.ts#L27-L35)
- [demoProvider.ts:211-229](file://app/lib/ai/demoProvider.ts#L211-L229)
- [demoProvider.ts:232-278](file://app/lib/ai/demoProvider.ts#L232-L278)
- [index.ts:23-26](file://app/lib/ai/index.ts#L23-L26)

## Conclusion
The response generation system combines robust provider abstractions, structured AI interactions, and pedagogical heuristics to deliver age-appropriate, encouraging, and educationally effective feedback. Through explicit feedback labels, escalating hints, intervention policies, and validated outputs, it ensures both safety and effectiveness across different learning modes and student profiles. The integration points with AI providers enable scalable, high-quality tutoring while maintaining strong quality control and traceability.