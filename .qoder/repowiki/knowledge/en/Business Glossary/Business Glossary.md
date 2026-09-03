---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### Board
- Definition：The central interactive canvas where students work through questions — supports text, drawings, shapes, connectors, images, formulas, notes, annotations, and visual objects with pan/zoom, move/resize, undo/redo, and AI-generated read-only objects. Each object has an owner (`student`, `ai`, `system`, `imported`) and is persisted per session.
- Aliases：interactive board、canvas

### Session
- Definition：A single learning interaction between a user and a question, tracked through a state machine from `QUESTION_RECEIVED` through `SESSION_COMPLETE`. A session owns one Board, accumulates hints/errors/self-corrections, and produces a Final Report when completed.

### Learning Journey
- Definition：Long-term concept mastery tracking per user. Concepts move through states like `UNKNOWN → INTRODUCED → EXPLORING → DEVELOPING → UNDERSTOOD → MASTERED`, with misconception detection, spaced review scheduling, and explainable recommendations for what to study next.
- Aliases：journey、concept map

### Final Report
- Definition：Server-authoritative summary of a completed session including time stats, concepts explored/understood/developing, mistakes, corrections, self-corrections, hint interpretation, final understanding, complete answer, key takeaways, remaining gaps, review recommendations, and next learning suggestions. Generated idempotently from structured session evidence.
- Aliases：report

### Intervention level
- Definition：A 0–8 scale used by the teaching engine to measure how much guidance a student needs during a step. Higher levels trigger more direct hints or scaffolding; it drives the adaptive UI and hint escalation across the 7-level hint ladder.
- Aliases：interventionLevel

### Misconception
- Definition：A detected but not-yet-resolved incorrect mental model about a concept. Lifecycle: `DETECTED → BEING_ADDRESSED → CORRECTED_ONCE → STABLE → RECURRING → RESOLVED`. Misconceptions feed spaced reviews and recommendation logic in the Learning Journey.
- Aliases：misconception、misconception lifecycle

### Age band
- Definition：Adaptive UI profile controlling tone, complexity, and presentation: `EARLY_LEARNER`, `YOUNG_LEARNER`, `EARLY_TEEN`, `TEEN`, `ADULT`. Stored in the user profile and passed into AI prompts so explanations match the learner's maturity.
- Aliases：age_band、learner band

### Ownership
- Definition：Per-Board-object ownership model distinguishing who created each piece of content: `student` (user input), `ai` (generated hints/intros), `system` (framework artifacts), `imported` (external content). Used for rendering rules and safety boundaries on the Board.
- Aliases：owner

### Demo mode
- Definition：Development fallback where the AI provider is replaced by a local mock tutor. When active, `isDemo=true` must be displayed so users know they are not interacting with a real LLM. Activated by `AI_PROVIDER=mock` or missing API key.
- Aliases：offline demo tutor、demo provider
