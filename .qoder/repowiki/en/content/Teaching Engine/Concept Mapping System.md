# Concept Mapping System

<cite>
**Referenced Files in This Document**
- [journey.ts](file://stepwise ai/app/lib/journey.ts)
- [types.ts](file://stepwise ai/app/lib/types.ts)
- [db.ts](file://stepwise ai/app/lib/db.ts)
- [route.ts (journey)](file://stepwise ai/app/app/api/journey/route.ts)
- [page.tsx (journey UI)](file://stepwise ai/app/app/journey/page.tsx)
- [07-learning-journey.md.txt](file://stepwise ai/specs/07-learning-journey.md.txt)
- [05-teaching-engine.md.txt](file://stepwise ai/specs/05-teaching-engine.md.txt)
- [06-visual-learning-engine.md.txt](file://stepwise ai/specs/06-visual-learning-engine.md.txt)
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
This document explains StepWise AI’s Concept Mapping System: how concepts are structured hierarchically with dependencies, how student understanding is mapped across related topics, and how personalized learning paths are generated from evidence collected during sessions. It focuses on concept mastery assessment beyond simple right/wrong answers, prerequisite tracking to identify knowledge gaps, and the generation of tailored next steps based on misconceptions and progress.

The system treats each concept as a node in a learning graph. Evidence from board interactions, hints used, self-corrections, and conceptual errors drives state transitions for each concept. Misconceptions are tracked with lifecycles and recurrence signals. Recommendations are explainable and tied to current goals, prerequisites, and recent performance.

## Project Structure
At a high level, the Concept Mapping System spans:
- Domain types that define states, errors, recommendations, and session artifacts
- A journey engine that updates and reads the long-term learning map
- A database layer that persists concepts, student-concept states, misconceptions, reviews, and recommendations
- An API route exposing the current user’s journey
- A UI page visualizing concepts, misconceptions, upcoming reviews, and recommendations
- Specifications defining the intended behavior of the teaching and visual engines that feed evidence into the journey

```mermaid
graph TB
UI["Journey Page<br/>app/app/journey/page.tsx"] --> API["GET /api/journey<br/>app/app/api/journey/route.ts"]
API --> JourneyLib["Learning Journey Engine<br/>app/lib/journey.ts"]
JourneyLib --> DB["Database Layer<br/>app/lib/db.ts"]
Types["Shared Types<br/>app/lib/types.ts"] --> JourneyLib
Specs["Specs: Teaching & Visual Engines<br/>specs/*"] --> JourneyLib
```

**Diagram sources**
- [route.ts (journey):1-17](file://stepwise ai/app/app/api/journey/route.ts#L1-L17)
- [journey.ts:1-357](file://stepwise ai/app/lib/journey.ts#L1-L357)
- [db.ts:1-224](file://stepwise ai/app/lib/db.ts#L1-L224)
- [types.ts:1-302](file://stepwise ai/app/lib/types.ts#L1-L302)
- [page.tsx (journey UI):1-207](file://stepwise ai/app/app/journey/page.tsx#L1-L207)

**Section sources**
- [route.ts (journey):1-17](file://stepwise ai/app/app/api/journey/route.ts#L1-L17)
- [journey.ts:1-357](file://stepwise ai/app/lib/journey.ts#L1-L357)
- [db.ts:1-224](file://stepwise ai/app/lib/db.ts#L1-L224)
- [types.ts:1-302](file://stepwise ai/app/lib/types.ts#L1-L302)
- [page.tsx (journey UI):1-207](file://stepwise ai/app/app/journey/page.tsx#L1-L207)

## Core Components
- Concept model and states: Concepts are identified by name, subject, and topic. Each student has per-concept status, confidence, evidence counts, hint usage, and review scheduling.
- Mastery evidence: Completion ratios, self-corrections, conceptual errors, and hint levels influence whether a concept moves toward UNDERSTOOD, STRONG, or MASTERED.
- Misconception lifecycle: Detected misconceptions are recorded with occurrence counts and statuses such as DETECTED, BEING_ADDRESSED, RECURRING, RESOLVED.
- Spaced review: Developing or partially understood concepts schedule future review items.
- Recommendations: Explainable suggestions like CONTINUE, REVIEW, STRENGTHEN_PREREQUISITE, PRACTICE, GO_DEEPER, APPLY, EXPLORE, REST.
- Read side: Aggregates concepts, misconceptions, reviews, recommendations, events, and summary stats for the UI.

**Section sources**
- [journey.ts:10-19](file://stepwise ai/app/lib/journey.ts#L10-L19)
- [journey.ts:26-36](file://stepwise ai/app/lib/journey.ts#L26-L36)
- [journey.ts:59-261](file://stepwise ai/app/lib/journey.ts#L59-L261)
- [journey.ts:274-357](file://stepwise ai/app/lib/journey.ts#L274-L357)
- [types.ts:149-193](file://stepwise ai/app/lib/types.ts#L149-L193)

## Architecture Overview
The Concept Mapping System integrates three layers:
- Evidence capture: The Teaching Engine and Visual Learning Engine produce structured evaluation results, errors, hints, and board snapshots. These become inputs to the journey update.
- Journey processing: The journey engine computes concept state transitions, schedules reviews, records misconceptions, and generates recommendations.
- Persistence and exposure: The database layer stores all entities; an API exposes the current user’s journey; the UI renders it.

```mermaid
sequenceDiagram
participant Student as "Student"
participant Board as "Board + Visual Engine"
participant Teach as "Teaching Engine"
participant Journey as "Journey Engine"
participant DB as "Database"
participant API as "/api/journey"
participant UI as "Journey Page"
Student->>Board : Interact (text, drawing, annotations)
Board-->>Teach : Attempt + context
Teach-->>Journey : EvaluationResult, errors, hints, selfCorrections
Journey->>DB : Update concepts, misconceptions, reviews, recommendations
UI->>API : GET /api/journey
API->>Journey : getJourney(userId)
Journey->>DB : Query concepts, misconceptions, reviews, recommendations
DB-->>Journey : Data
Journey-->>API : Journey view
API-->>UI : { journey }
UI-->>Student : Map of understanding, misconceptions, reviews, recommendations
```

**Diagram sources**
- [journey.ts:59-261](file://stepwise ai/app/lib/journey.ts#L59-L261)
- [journey.ts:274-357](file://stepwise ai/app/lib/journey.ts#L274-L357)
- [route.ts (journey):1-17](file://stepwise ai/app/app/api/journey/route.ts#L1-L17)
- [page.tsx (journey UI):61-87](file://stepwise ai/app/app/journey/page.tsx#L61-L87)

## Detailed Component Analysis

### Concept Mastery Assessment
Concept mastery is not binary. The system uses multiple signals:
- Session completion ratio: Full completion adds evidence; partial completion advances to developing or partially understood depending on hint usage.
- Self-corrections: Recognized as strong evidence of understanding and increase confidence.
- Conceptual errors: Presence pushes concepts back to DEVELOPING when incomplete.
- Hint dependency: High hint usage prevents premature mastery.
- Evidence accumulation: Multiple varied evidences over time are required to reach MASTERED.

```mermaid
flowchart TD
Start(["Session End"]) --> Ratio["Compute completion ratio"]
Ratio --> |>= 1| AddEvidence["Add evidence delta<br/>+ self-correction bonus"]
Ratio --> |> 0| Partial["Partial progress"]
Ratio --> |= 0| Intro["Introduce concept if new"]
AddEvidence --> StatusCalc["Determine next status:<br/>UNDERSTOOD / STRONG / MASTERED"]
Partial --> HintCheck{"Hints >= 3?"}
HintCheck --> |Yes| Develop["Set DEVELOPING"]
HintCheck --> |No| KeepOrAdvance["Keep or advance to PARTIALLY_UNDERSTOOD"]
StatusCalc --> MasteryCheck{"Prior evidence + delta >= 4<br/>and hints <= 1?"}
MasteryCheck --> |Yes| Mastered["MASTERED"]
MasteryCheck --> |No| Understood["UNDERSTOOD or STRONG"]
Develop --> ScheduleReview["Schedule spaced review if needed"]
KeepOrAdvance --> ScheduleReview
Understood --> ScheduleReview
Intro --> End(["Persist changes"])
ScheduleReview --> End
```

**Diagram sources**
- [journey.ts:100-196](file://stepwise ai/app/lib/journey.ts#L100-L196)
- [types.ts:149-193](file://stepwise ai/app/lib/types.ts#L149-L193)

**Section sources**
- [journey.ts:100-196](file://stepwise ai/app/lib/journey.ts#L100-L196)
- [types.ts:149-193](file://stepwise ai/app/lib/types.ts#L149-L193)

### Prerequisite Tracking and Knowledge Gaps
Prerequisites are modeled as relationships between concepts. When repeated conceptual errors occur, the system can infer missing foundational knowledge and recommend strengthening prerequisites. The read side surfaces misconceptions and review items that indicate gaps.

```mermaid
graph LR
A["Current Topic"] --> B["Observed Errors"]
B --> C["Infer Missing Prerequisite"]
C --> D["Recommend Strengthen Prerequisite"]
D --> E["Schedule Review Items"]
E --> F["Update Recommendations"]
```

**Diagram sources**
- [journey.ts:199-242](file://stepwise ai/app/lib/journey.ts#L199-L242)
- [types.ts:179-193](file://stepwise ai/app/lib/types.ts#L179-L193)

**Section sources**
- [journey.ts:199-242](file://stepwise ai/app/lib/journey.ts#L199-L242)
- [types.ts:179-193](file://stepwise ai/app/lib/types.ts#L179-L193)

### Personalized Learning Path Generation
After meaningful sessions, the system produces explainable recommendations based on:
- Completion ratio
- Conceptual error count
- Recent progress
- Current goal and prerequisite needs

Examples include continuing, reviewing, practicing, going deeper, applying, exploring, or resting.

```mermaid
flowchart TD
Input["Session Stats"] --> Decision{"Completion ratio"}
Decision --> |Complete & no conceptual errors| GoDeeper["GO_DEEPER"]
Decision --> |Complete & conceptual errors| Practice["PRACTICE"]
Decision --> |Partial| Continue["CONTINUE"]
Decision --> |None| Review["REVIEW"]
Decision --> |Conceptual errors >= 2| Strengthen["STRENGTHEN_PREREQUISITE"]
GoDeeper --> Persist["Persist recommendation"]
Practice --> Persist
Continue --> Persist
Review --> Persist
Strengthen --> Persist
```

**Diagram sources**
- [journey.ts:199-242](file://stepwise ai/app/lib/journey.ts#L199-L242)
- [types.ts:179-193](file://stepwise ai/app/lib/types.ts#L179-L193)

**Section sources**
- [journey.ts:199-242](file://stepwise ai/app/lib/journey.ts#L199-L242)
- [types.ts:179-193](file://stepwise ai/app/lib/types.ts#L179-L193)

### Concept Graph Construction and Dependency Resolution
Concepts are stored with name, subject, and topic. Student-concept rows track per-user status and evidence. While explicit prerequisite edges are defined in the data schema, the current journey update logic primarily uses observed errors and completion to infer prerequisite needs and generate recommendations. Dependency resolution occurs at recommendation time by identifying foundational gaps from conceptual errors.

```mermaid
erDiagram
CONCEPTS {
int id PK
string name
string subject
string topic
}
STUDENT_CONCEPTS {
int user_id FK
int concept_id FK
string status
int evidence_count
int hint_count
int self_correction_count
string last_seen
string last_practiced
string review_due
}
MISCONCEPTIONS {
int id PK
int user_id FK
string concept_name
string description
string status
int occurrence_count
string first_detected
string last_detected
string resolved_at
}
REVIEW_ITEMS {
int id PK
int user_id FK
string concept_name
string due_at
string reason
string status
}
RECOMMENDATIONS {
int id PK
int user_id FK
string type
string title
string reason
}
CONCEPTS ||--o{ STUDENT_CONCEPTS : "linked by concept_id"
STUDENT_CONCEPTS ||--o{ MISCONCEPTIONS : "concept_name reference"
STUDENT_CONCEPTS ||--o{ REVIEW_ITEMS : "concept_name reference"
STUDENT_CONCEPTS ||--o{ RECOMMENDATIONS : "user_id reference"
```

**Diagram sources**
- [db.ts:23-44](file://stepwise ai/app/lib/db.ts#L23-L44)
- [journey.ts:26-36](file://stepwise ai/app/lib/journey.ts#L26-L36)
- [journey.ts:68-98](file://stepwise ai/app/lib/journey.ts#L68-L98)
- [journey.ts:138-196](file://stepwise ai/app/lib/journey.ts#L138-L196)
- [journey.ts:234-242](file://stepwise ai/app/lib/journey.ts#L234-L242)

**Section sources**
- [db.ts:23-44](file://stepwise ai/app/lib/db.ts#L23-L44)
- [journey.ts:26-36](file://stepwise ai/app/lib/journey.ts#L26-L36)
- [journey.ts:68-98](file://stepwise ai/app/lib/journey.ts#L68-L98)
- [journey.ts:138-196](file://stepwise ai/app/lib/journey.ts#L138-L196)
- [journey.ts:234-242](file://stepwise ai/app/lib/journey.ts#L234-L242)

### Misconception Lifecycle and Recurrence
Misconceptions are tracked with occurrence counts and statuses. Recurring patterns elevate priority and inform future interventions.

```mermaid
stateDiagram-v2
[*] --> DETECTED
DETECTED --> BEING_ADDRESSED : "first or second occurrence"
BEING_ADDRESSED --> RECURRING : "third occurrence or corrected once then recurring"
BEING_ADDRESSED --> CORRECTED_ONCE : "one correction"
CORRECTED_ONCE --> RECURRING : "reappears"
RECURRING --> RESOLVED : "stable improvement"
CORRECTED_ONCE --> RESOLVED : "no recurrence"
```

**Diagram sources**
- [journey.ts:68-98](file://stepwise ai/app/lib/journey.ts#L68-L98)
- [types.ts:171-177](file://stepwise ai/app/lib/types.ts#L171-L177)

**Section sources**
- [journey.ts:68-98](file://stepwise ai/app/lib/journey.ts#L68-L98)
- [types.ts:171-177](file://stepwise ai/app/lib/types.ts#L171-L177)

### Spaced Review Scheduling
Developing or partially understood concepts trigger scheduled review items and update review_due timestamps.

```mermaid
flowchart TD
Check["Concept status in {DEVELOPING, PARTIALLY_UNDERSTOOD, EXPLORING}"] --> |Yes| InsertReview["Insert review item<br/>due_at = now + 2 days"]
InsertReview --> UpdateDue["Update student_concepts.review_due"]
Check --> |No| Skip["No review scheduled"]
```

**Diagram sources**
- [journey.ts:179-196](file://stepwise ai/app/lib/journey.ts#L179-L196)

**Section sources**
- [journey.ts:179-196](file://stepwise ai/app/lib/journey.ts#L179-L196)

### Journey Read Side and UI Integration
The read side aggregates:
- Concepts with status, evidence, and review due dates
- Misconceptions with occurrence counts
- Pending reviews
- Recent recommendations
- Events and stats

The UI displays these elements with status labels and tones.

```mermaid
sequenceDiagram
participant UI as "Journey Page"
participant API as "/api/journey"
participant Journey as "getJourney"
participant DB as "Database"
UI->>API : GET /api/journey
API->>Journey : getJourney(userId)
Journey->>DB : Query student_concepts, concepts
DB-->>Journey : Concept rows
Journey->>DB : Query misconceptions, reviews, recommendations, events
DB-->>Journey : Related data
Journey-->>API : Journey view
API-->>UI : { journey }
UI-->>UI : Render concepts, misconceptions, reviews, recommendations
```

**Diagram sources**
- [route.ts (journey):1-17](file://stepwise ai/app/app/api/journey/route.ts#L1-L17)
- [journey.ts:274-357](file://stepwise ai/app/lib/journey.ts#L274-L357)
- [page.tsx (journey UI):61-87](file://stepwise ai/app/app/journey/page.tsx#L61-L87)

**Section sources**
- [route.ts (journey):1-17](file://stepwise ai/app/app/api/journey/route.ts#L1-L17)
- [journey.ts:274-357](file://stepwise ai/app/lib/journey.ts#L274-L357)
- [page.tsx (journey UI):61-87](file://stepwise ai/app/app/journey/page.tsx#L61-L87)

## Dependency Analysis
Key dependencies:
- Journey engine depends on shared types for domain modeling and on the database layer for persistence.
- API route depends on authentication helpers and the journey engine.
- UI depends on the API and renders journey data using typed structures.

```mermaid
graph TB
Types["types.ts"] --> Journey["journey.ts"]
DB["db.ts"] --> Journey
Journey --> API["journey route.ts"]
API --> UI["journey page.tsx"]
```

**Diagram sources**
- [types.ts:1-302](file://stepwise ai/app/lib/types.ts#L1-302)
- [journey.ts:1-357](file://stepwise ai/app/lib/journey.ts#L1-L357)
- [db.ts:1-224](file://stepwise ai/app/lib/db.ts#L1-L224)
- [route.ts (journey):1-17](file://stepwise ai/app/app/api/journey/route.ts#L1-L17)
- [page.tsx (journey UI):1-207](file://stepwise ai/app/app/journey/page.tsx#L1-L207)

**Section sources**
- [types.ts:1-302](file://stepwise ai/app/lib/types.ts#L1-L302)
- [journey.ts:1-357](file://stepwise ai/app/lib/journey.ts#L1-L357)
- [db.ts:1-224](file://stepwise ai/app/lib/db.ts#L1-L224)
- [route.ts (journey):1-17](file://stepwise ai/app/app/api/journey/route.ts#L1-L17)
- [page.tsx (journey UI):1-207](file://stepwise ai/app/app/journey/page.tsx#L1-L207)

## Performance Considerations
- Database writes are synchronous and atomic within transactions to ensure consistency during journey updates.
- Queries limit results to recent entries to keep UI responsive.
- Avoid sending AI requests for every interaction; only process meaningful events to reduce overhead.
- Use local state and optimistic updates where appropriate to maintain responsiveness.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and diagnostics:
- No journey data returned: Verify authentication and user context in the API route.
- Stalled concept progression: Check completion ratio, conceptual errors, and hint usage in journey updates.
- Excessive misconceptions: Inspect occurrence counts and statuses; recurring misconceptions may require prerequisite strengthening.
- Review backlog: Ensure review items are being created for developing concepts and that due dates are set correctly.

**Section sources**
- [route.ts (journey):1-17](file://stepwise ai/app/app/api/journey/route.ts#L1-L17)
- [journey.ts:68-98](file://stepwise ai/app/lib/journey.ts#L68-L98)
- [journey.ts:179-196](file://stepwise ai/app/lib/journey.ts#L179-L196)
- [journey.ts:199-242](file://stepwise ai/app/lib/journey.ts#L199-L242)

## Conclusion
StepWise AI’s Concept Mapping System builds a living map of student understanding by treating concepts as nodes in a graph and updating their states based on real evidence from sessions. It goes beyond right/wrong answers by considering self-corrections, conceptual errors, hint dependency, and completion ratios. Prerequisite gaps are inferred from repeated conceptual errors and surfaced through recommendations and review scheduling. The result is a personalized, explainable learning path that adapts to individual progress and misconceptions.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Example: Concept Graph Construction
- Concepts are ensured by name and linked to subjects/topics.
- Student-concept rows store per-user status and evidence.
- Misconceptions and reviews are attached to concepts via names.

**Section sources**
- [journey.ts:26-36](file://stepwise ai/app/lib/journey.ts#L26-L36)
- [journey.ts:138-196](file://stepwise ai/app/lib/journey.ts#L138-L196)
- [db.ts:23-44](file://stepwise ai/app/lib/db.ts#L23-L44)

### Example: Dependency Resolution
- Conceptual errors trigger prerequisite strengthening recommendations.
- Reviews are scheduled for developing concepts.
- Read side aggregates these signals for the UI.

**Section sources**
- [journey.ts:199-242](file://stepwise ai/app/lib/journey.ts#L199-L242)
- [journey.ts:274-357](file://stepwise ai/app/lib/journey.ts#L274-L357)

### Example: Personalized Learning Path Generation
- Based on completion ratio and conceptual errors, the system recommends CONTINUE, REVIEW, STRENGTHEN_PREREQUISITE, PRACTICE, or GO_DEEPER.
- Recommendations are persisted and displayed alongside misconceptions and reviews.

**Section sources**
- [journey.ts:199-242](file://stepwise ai/app/lib/journey.ts#L199-L242)
- [page.tsx (journey UI):82-207](file://stepwise ai/app/app/journey/page.tsx#L82-L207)