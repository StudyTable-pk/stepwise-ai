# Board Integration and Persistence

<cite>
**Referenced Files in This Document**
- [Board.tsx](file://stepwise ai/app/components/board/Board.tsx)
- [sessionsRepo.ts](file://stepwise ai/app/lib/sessionsRepo.ts)
- [types.ts](file://stepwise ai/app/lib/types.ts)
- [boards route](file://stepwise ai/app/app/api/boards/[id]/route.ts)
- [sessions route](file://stepwise ai/app/app/api/sessions/route.ts)
- [session page](file://stepwise ai/app/app/session/[id]/page.tsx)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains how the interactive board integrates with sessions, from board creation during session initialization to persistence, event recording, and alignment with the session state machine. It covers:
- How boards are created with a question card and AI introduction note
- The saveBoardObjects function for optimistic updates and atomic persistence
- The BoardObject data model fields and constraints
- Ownership and access control between boards and sessions
- Board event recording via recordBoardEvent
- Examples for saving snapshots, handling large states, and performance optimization
- Concurrent editing considerations, conflict resolution strategies, and versioning recommendations
- Integration with the session state machine to ensure board operations align with progression

## Project Structure
The board integration spans client components, API routes, and server-side repository logic:
- Client UI renders the board and handles user interactions, committing changes optimistically
- API routes enforce ownership, validate inputs, and delegate to repository functions
- Repository performs database transactions, persists board objects, and records events

```mermaid
graph TB
subgraph "Client"
SP["Session Page<br/>state + autosave"]
B["Board Component<br/>interactions"]
end
subgraph "API Routes"
BR["/api/boards/:id<br/>GET/PUT/POST event"]
SR["/api/sessions/:id<br/>GET full recovery"]
SCR["/api/sessions<br/>POST create session"]
end
subgraph "Repository"
R["sessionsRepo.ts<br/>createLearningSession,<br/>getBoardObjects,<br/>saveBoardObjects,<br/>recordBoardEvent"]
end
subgraph "Database"
DB["boards, board_objects,<br/>sessions, learning_events,<br/>board_events"]
end
SP --> B
SP --> BR
SP --> SR
SP --> SCR
BR --> R
SR --> R
SCR --> R
R --> DB
```

**Diagram sources**
- [session page:77-130](file://stepwise ai/app/app/session/[id]/page.tsx#L77-L130)
- [boards route:28-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L28-L105)
- [sessions route:9-44](file://stepwise ai/app/app/api/sessions/route.ts#L9-L44)
- [sessionsRepo.ts:26-116](file://stepwise ai/app/lib/sessionsRepo.ts#L26-L116)
- [sessionsRepo.ts:198-282](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L282)

**Section sources**
- [session page:77-130](file://stepwise ai/app/app/session/[id]/page.tsx#L77-L130)
- [boards route:28-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L28-L105)
- [sessions route:9-44](file://stepwise ai/app/app/api/sessions/route.ts#L9-L44)
- [sessionsRepo.ts:26-116](file://stepwise ai/app/lib/sessionsRepo.ts#L26-L116)
- [sessionsRepo.ts:198-282](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L282)

## Core Components
- Board component: Renders the canvas, handles tools (select, text, draw, erase, pan), manages viewport, selection, editing, and emits commits through onCommit
- Session page: Loads session recovery payload, manages local object history (undo/redo), debounced autosave, and orchestrates teaching loop actions (check, hint, finish)
- API routes: Validate ownership, sanitize inputs, persist board snapshots, and record meaningful events
- Repository: Creates sessions with seeded board objects, retrieves and persists board objects atomically, and records board events

Key responsibilities:
- Board: User interaction and immediate UI updates; no direct DB writes
- Session page: Local state management, undo/redo, and debounced persistence
- API: Security checks, input validation, and delegation to repository
- Repository: Transactional persistence, ownership verification, and analytics/event logging

**Section sources**
- [Board.tsx:44-105](file://stepwise ai/app/components/board/Board.tsx#L44-L105)
- [session page:77-130](file://stepwise ai/app/app/session/[id]/page.tsx#L77-L130)
- [boards route:28-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L28-L105)
- [sessionsRepo.ts:26-116](file://stepwise ai/app/lib/sessionsRepo.ts#L26-L116)
- [sessionsRepo.ts:198-282](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L282)

## Architecture Overview
The flow begins when a student starts a session. The system creates a session, seeds the board with a question card and AI introduction, and returns the board ID. The client loads the session, fetches board objects, and allows interactive edits. Edits are committed locally and persisted via an autosave mechanism that sends a full snapshot to the server. The server validates ownership, sanitizes inputs, and atomically replaces board objects. Meaningful board events can be recorded separately for analytics.

```mermaid
sequenceDiagram
participant U as "User"
participant SP as "Session Page"
participant BR as "Boards API"
participant SR as "Sessions API"
participant R as "Repository"
participant DB as "Database"
U->>SP : Open session
SP->>SR : GET /api/sessions/ : id
SR->>R : getSession()
R-->>SR : Session + boardId
SR-->>SP : Recovery payload (session, objects, messages)
U->>SP : Edit board (text/draw/move)
SP->>SP : commit(nextObjects)
SP->>BR : PUT /api/boards/ : id (debounced)
BR->>R : saveBoardObjects(userId, boardId, objects)
R->>DB : Atomic replace of board_objects
BR-->>SP : saved
U->>BR : POST /api/boards/ : id/event (meaningful)
BR->>R : recordBoardEvent(userId, boardId, eventType, payload)
R->>DB : Insert board_event
BR-->>U : recorded
```

**Diagram sources**
- [sessions route:9-44](file://stepwise ai/app/app/api/sessions/route.ts#L9-L44)
- [sessionsRepo.ts:26-116](file://stepwise ai/app/lib/sessionsRepo.ts#L26-L116)
- [session page:77-130](file://stepwise ai/app/app/session/[id]/page.tsx#L77-L130)
- [boards route:28-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L28-L105)
- [sessionsRepo.ts:198-282](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L282)

## Detailed Component Analysis

### Board Object Model
The BoardObject type defines the structure stored and rendered on the board:
- Identity and association: id, board_id
- Geometry: x, y, width, height, rotation, z_index
- Content and metadata: content (string), style (object), meta (object)
- Ownership and timestamps: owner (student, ai, system, imported), created_at, updated_at

Constraints and normalization occur at the API and repository layers:
- Input types and owners are validated against allowed sets
- Dimensions are clamped to safe ranges
- Content and JSON fields are truncated to limits
- IDs are sanitized to fixed length

```mermaid
classDiagram
class BoardObject {
+string id
+string board_id
+BoardObjectType type
+number x
+number y
+number width
+number height
+number rotation
+number z_index
+string content
+Record~string, unknown~ style
+Record~string, unknown~ meta
+Ownership owner
+string created_at
+string updated_at
}
class BoardObjectType {
<<enum>>
"text"
"handwriting"
"drawing"
"shape"
"connector"
"image"
"note"
"formula"
"annotation"
"visual"
}
class Ownership {
<<enum>>
"student"
"ai"
"system"
"imported"
}
BoardObject --> BoardObjectType : "uses"
BoardObject --> Ownership : "uses"
```

**Diagram sources**
- [types.ts:27-57](file://stepwise ai/app/lib/types.ts#L27-L57)

**Section sources**
- [types.ts:27-57](file://stepwise ai/app/lib/types.ts#L27-L57)
- [boards route:10-22](file://stepwise ai/app/app/api/boards/[id]/route.ts#L10-L22)
- [sessionsRepo.ts:206-233](file://stepwise ai/app/lib/sessionsRepo.ts#L206-L233)

### Session Initialization and Board Seeding
When a new session is created:
- A question is analyzed by the AI provider
- A session record is inserted with initial state INTRODUCTION
- A board is created linked to the session
- Two seed objects are inserted:
  - Question card: system-owned note with the question text and variant styling
  - AI introduction: ai-owned note with the generated introduction and variant styling
- A learning event is recorded indicating the question started

```mermaid
flowchart TD
Start(["Create Learning Session"]) --> Analyze["Analyze Question"]
Analyze --> CreateSession["Insert Session<br/>state=INTRODUCTION"]
CreateSession --> CreateBoard["Insert Board<br/>linked to session"]
CreateBoard --> SeedQuestion["Insert Question Card<br/>owner=system"]
SeedQuestion --> SeedIntro["Insert AI Introduction<br/>owner=ai"]
SeedIntro --> RecordEvent["Insert learning_event<br/>question_started"]
RecordEvent --> ReturnSession["Return Session Record"]
```

**Diagram sources**
- [sessionsRepo.ts:26-116](file://stepwise ai/app/lib/sessionsRepo.ts#L26-L116)

**Section sources**
- [sessionsRepo.ts:26-116](file://stepwise ai/app/lib/sessionsRepo.ts#L26-L116)

### Optimistic Updates and Atomic Persistence
The session page implements optimistic updates:
- Local state changes immediately via commit(next)
- Undo/Redo history is maintained in memory
- Autosave is debounced to reduce network load
- On flush, a full snapshot of objects is sent to the server

The server enforces ownership and sanitizes inputs before calling saveBoardObjects:
- Ownership check ensures the user owns the board
- Inputs are validated and normalized
- saveBoardObjects performs an atomic transaction:
  - Verifies ownership again
  - Removes existing board_objects for the board
  - Inserts up to a capped number of objects with normalized fields
  - Updates board updated_at timestamp

```mermaid
sequenceDiagram
participant SP as "Session Page"
participant BR as "Boards API"
participant R as "Repository"
participant DB as "Database"
SP->>SP : commit(nextObjects)
SP->>BR : PUT /api/boards/ : id (debounced)
BR->>BR : Validate ownership & inputs
BR->>R : saveBoardObjects(userId, boardId, objects)
R->>DB : BEGIN TRANSACTION
R->>DB : Remove board_objects for board
R->>DB : Insert normalized objects (capped)
R->>DB : Update boards.updated_at
R->>DB : COMMIT
BR-->>SP : saved
```

**Diagram sources**
- [session page:99-130](file://stepwise ai/app/app/session/[id]/page.tsx#L99-L130)
- [boards route:41-85](file://stepwise ai/app/app/api/boards/[id]/route.ts#L41-L85)
- [sessionsRepo.ts:239-265](file://stepwise ai/app/lib/sessionsRepo.ts#L239-L265)

**Section sources**
- [session page:99-130](file://stepwise ai/app/app/session/[id]/page.tsx#L99-L130)
- [boards route:41-85](file://stepwise ai/app/app/api/boards/[id]/route.ts#L41-L85)
- [sessionsRepo.ts:239-265](file://stepwise ai/app/lib/sessionsRepo.ts#L239-L265)

### Board Event Recording
Meaningful board events are recorded via a dedicated endpoint:
- The client posts an event type and payload
- The server verifies ownership and calls recordBoardEvent
- The repository inserts a board_event row with session linkage and sanitized fields

```mermaid
sequenceDiagram
participant SP as "Session Page"
participant BR as "Boards API"
participant R as "Repository"
participant DB as "Database"
SP->>BR : POST /api/boards/ : id/event {eventType, payload}
BR->>BR : Validate ownership
BR->>R : recordBoardEvent(userId, boardId, eventType, payload)
R->>DB : Insert board_event (sanitized)
BR-->>SP : recorded
```

**Diagram sources**
- [boards route:87-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L87-L105)
- [sessionsRepo.ts:267-282](file://stepwise ai/app/lib/sessionsRepo.ts#L267-L282)

**Section sources**
- [boards route:87-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L87-L105)
- [sessionsRepo.ts:267-282](file://stepwise ai/app/lib/sessionsRepo.ts#L267-L282)

### Relationship Between Board Ownership and Session Ownership
Access control is enforced consistently:
- Every board operation checks that the board belongs to the authenticated user
- Sessions are also checked where applicable (e.g., adding AI messages)
- This ensures proper isolation and prevents unauthorized access across users

```mermaid
flowchart TD
Req["Incoming Request"] --> Auth["Authenticate User"]
Auth --> CheckBoard{"Owns Board?"}
CheckBoard --> |No| Deny["Not Found / Unauthorized"]
CheckBoard --> |Yes| Proceed["Proceed with Operation"]
Proceed --> RepoCall["Repository Function"]
RepoCall --> DB["Database Access"]
```

**Diagram sources**
- [boards route:24-35](file://stepwise ai/app/app/api/boards/[id]/route.ts#L24-L35)
- [sessionsRepo.ts:198-204](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L204)
- [sessionsRepo.ts:239-243](file://stepwise ai/app/lib/sessionsRepo.ts#L239-L243)

**Section sources**
- [boards route:24-35](file://stepwise ai/app/app/api/boards/[id]/route.ts#L24-L35)
- [sessionsRepo.ts:198-204](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L204)
- [sessionsRepo.ts:239-243](file://stepwise ai/app/lib/sessionsRepo.ts#L239-L243)

### Integration with Session State Machine
The session state machine governs progression:
- New sessions start in INTRODUCTION
- The session page tracks steps completed and current step
- Teaching loop actions (check, hint, finish) update state and progress
- Board operations should align with session progression (e.g., read-only mode when completed)

```mermaid
stateDiagram-v2
[*] --> INTRODUCTION
INTRODUCTION --> FIRST_ATTEMPT
FIRST_ATTEMPT --> EVALUATING
EVALUATING --> CORRECT
EVALUATING --> PARTIAL
EVALUATING --> ERROR
EVALUATING --> UNCERTAIN
CORRECT --> NEXT_CONCEPT
PARTIAL --> GUIDANCE
ERROR --> RETRY
UNCERTAIN --> GUIDANCE
GUIDANCE --> FIRST_ATTEMPT
NEXT_CONCEPT --> INTEGRATION
INTEGRATION --> FINAL_DEMONSTRATION
FINAL_DEMONSTRATION --> SESSION_COMPLETE
```

**Diagram sources**
- [types.ts:7-24](file://stepwise ai/app/lib/types.ts#L7-L24)
- [sessionsRepo.ts:45-57](file://stepwise ai/app/lib/sessionsRepo.ts#L45-L57)
- [session page:189-261](file://stepwise ai/app/app/session/[id]/page.tsx#L189-L261)

**Section sources**
- [types.ts:7-24](file://stepwise ai/app/lib/types.ts#L7-L24)
- [sessionsRepo.ts:45-57](file://stepwise ai/app/lib/sessionsRepo.ts#L45-L57)
- [session page:189-261](file://stepwise ai/app/app/session/[id]/page.tsx#L189-L261)

## Dependency Analysis
The board integration depends on clear boundaries:
- Client components depend on API endpoints for persistence and events
- API routes depend on repository functions for data access
- Repository functions depend on database operations and shared types

```mermaid
graph LR
Types["types.ts"] --> Repo["sessionsRepo.ts"]
Types --> API["boards route"]
API --> Repo
SessionPage["session page"] --> API
Board["Board.tsx"] --> SessionPage
Repo --> DB["Database"]
```

**Diagram sources**
- [types.ts:27-57](file://stepwise ai/app/lib/types.ts#L27-L57)
- [sessionsRepo.ts:198-282](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L282)
- [boards route:28-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L28-L105)
- [session page:77-130](file://stepwise ai/app/app/session/[id]/page.tsx#L77-L130)
- [Board.tsx:44-105](file://stepwise ai/app/components/board/Board.tsx#L44-L105)

**Section sources**
- [types.ts:27-57](file://stepwise ai/app/lib/types.ts#L27-L57)
- [sessionsRepo.ts:198-282](file://stepwise ai/app/lib/sessionsRepo.ts#L198-L282)
- [boards route:28-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L28-L105)
- [session page:77-130](file://stepwise ai/app/app/session/[id]/page.tsx#L77-L130)
- [Board.tsx:44-105](file://stepwise ai/app/components/board/Board.tsx#L44-L105)

## Performance Considerations
- Debounced autosave reduces network overhead while preserving responsiveness
- Server caps the number of objects per save to prevent excessive payloads
- Dimensions and content are clamped/truncated to protect storage and rendering
- Sorting by z_index ensures correct layering without expensive computations on each render
- Undo/Redo history is bounded to avoid unbounded memory growth

Recommendations:
- Keep autosave interval tuned to balance latency and throughput
- Monitor object count and consider pagination or lazy loading for very large boards
- Use incremental diffs if concurrent editing becomes a requirement
- Offload heavy rendering tasks to Web Workers if needed

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Save failures: Check network connectivity and server availability; review save status indicators
- Not found errors: Ensure the board belongs to the authenticated user; verify board ID correctness
- Invalid inputs: Confirm object types and owners match allowed sets; check content length limits
- Stale state: Refresh the session to recover full state including board objects and messages

Debugging tips:
- Inspect browser console for API errors
- Verify board ownership checks in API logs
- Review board events for anomalies using the event endpoint

**Section sources**
- [boards route:41-85](file://stepwise ai/app/app/api/boards/[id]/route.ts#L41-L85)
- [boards route:87-105](file://stepwise ai/app/app/api/boards/[id]/route.ts#L87-L105)
- [session page:99-130](file://stepwise ai/app/app/session/[id]/page.tsx#L99-L130)

## Conclusion
The board integration provides a robust, secure, and performant system for interactive learning:
- Boards are initialized with meaningful context (question card and AI introduction)
- Optimistic updates deliver responsive UX while ensuring data integrity through atomic persistence
- Ownership checks enforce strict access control aligned with session ownership
- Event recording supports analytics and debugging
- The design aligns board operations with the session state machine for coherent progression

For future enhancements:
- Implement conflict resolution strategies (e.g., operational transforms or CRDTs) for concurrent editing
- Add explicit versioning to support rollbacks and audit trails
- Optimize large board handling with virtualization and chunked saves
- Expand event schema for richer telemetry

[No sources needed since this section summarizes without analyzing specific files]