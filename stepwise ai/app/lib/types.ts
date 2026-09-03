// ============================================================================
// StepWise AI — shared domain types
// These reflect the data model defined in the StepWise master specification.
// ============================================================================

// --- Session state machine (doc 04 — AI Brain) -----------------------------
export type SessionState =
  | "QUESTION_RECEIVED"
  | "QUESTION_ANALYZED"
  | "LEARNING_BLUEPRINT_CREATED"
  | "INTRODUCTION"
  | "FIRST_ATTEMPT"
  | "EVALUATING"
  | "CORRECT"
  | "PARTIAL"
  | "ERROR"
  | "UNCERTAIN"
  | "GUIDANCE"
  | "RETRY"
  | "CONCEPT_CHECK"
  | "NEXT_CONCEPT"
  | "INTEGRATION"
  | "FINAL_DEMONSTRATION"
  | "SESSION_COMPLETE";

// --- Board object model (doc 02 — Interactive Board) ------------------------
export type BoardObjectType =
  | "text"
  | "handwriting"
  | "drawing"
  | "shape"
  | "connector"
  | "image"
  | "note"
  | "formula"
  | "annotation"
  | "table"
  | "diagram"
  | "graph"
  | "visual";

export type Ownership = "student" | "ai" | "system" | "imported";

export interface BoardObject {
  id: string;
  board_id: string;
  type: BoardObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  content: string;
  style: Record<string, unknown>;
  meta: Record<string, unknown>;
  owner: Ownership;
  created_at: string;
  updated_at: string;
}

export type SaveStatus = "saved" | "saving" | "offline" | "error";

// --- Evaluation & feedback (doc 05 — Teaching Engine) -----------------------
export type EvaluationStatus = "correct" | "partial" | "error" | "uncertain";

export type FeedbackLabel =
  | "CORRECT_UNDERSTANDING" // 🟢
  | "PARTIALLY_CORRECT" // 🟡
  | "MISSING_IDEA" // 🔵
  | "CONCEPT_ERROR" // 🔴
  | "THINK_ABOUT_THIS" // 🟣
  | "CHECK_THIS_STEP" // 🟠
  | "AI_UNCERTAIN"; // ⚪

export interface FeedbackItem {
  label: FeedbackLabel;
  title: string;
  message: string;
  objectIds: string[]; // board objects this feedback refers to
}

export type ErrorCategory =
  | "CONCEPTUAL"
  | "PROCEDURAL"
  | "CALCULATION"
  | "MISREADING"
  | "MISSING_STEP"
  | "INCOMPLETE_ANSWER"
  | "VOCABULARY"
  | "REASONING"
  | "APPLICATION"
  | "GRAPH_DIAGRAM"
  | "UNIT_NOTATION"
  | "LANGUAGE_ONLY";

export type ErrorSeverity = "MINOR" | "MODERATE" | "IMPORTANT" | "FOUNDATIONAL";

export interface DetectedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  description: string;
  objectIds: string[];
  corrected: boolean;
  selfCorrected: boolean;
}

export interface EvaluationResult {
  status: EvaluationStatus;
  summary: string;
  feedback: FeedbackItem[];
  errors: DetectedError[];
  strengths: string[];
  missingElements: string[];
  interventionLevel: number; // 0–8 per AI Brain spec
  nextAction: string; // what the student should do next
}

// Hints — 7 escalating levels (doc 05)
export type HintLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Hint {
  level: HintLevel;
  title: string;
  message: string;
  nextAction: string;
}

// --- Question model (doc 04) -------------------------------------------------
export interface QuestionStep {
  id: string;
  index: number;
  title: string;
  instruction: string;
  expectedConcepts: string[];
  completed: boolean;
}

export interface QuestionAnalysis {
  intent: string;
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  requiredConcepts: string[];
  prerequisites: string[];
  introduction: string;
  steps: QuestionStep[];
  referenceAnswer: string;
  clarifyQuestion?: string; // set when the question is too ambiguous
}

// --- Learning Journey (doc 07) ------------------------------------------------
export type ConceptStatus =
  | "UNKNOWN"
  | "INTRODUCED"
  | "EXPLORING"
  | "DEVELOPING"
  | "PARTIALLY_UNDERSTOOD"
  | "UNDERSTOOD"
  | "STRONG"
  | "MASTERED"
  | "NEEDS_REVIEW"
  | "MISCONCEPTION_DETECTED"
  | "PREREQUISITE_BLOCKED";

export type MasteryEvidenceType =
  | "CORRECT_EXPLANATION"
  | "CORRECT_REASONING"
  | "CORRECT_APPLICATION"
  | "SELF_CORRECTION"
  | "TEACH_BACK"
  | "CORRECT_VARIATION";

export type MisconceptionStatus =
  | "DETECTED"
  | "BEING_ADDRESSED"
  | "CORRECTED_ONCE"
  | "STABLE"
  | "RECURRING"
  | "RESOLVED";

export type RecommendationType =
  | "CONTINUE"
  | "REVIEW"
  | "STRENGTHEN_PREREQUISITE"
  | "PRACTICE"
  | "GO_DEEPER"
  | "APPLY"
  | "EXPLORE"
  | "REST";

export interface Recommendation {
  type: RecommendationType;
  title: string;
  reason: string;
}

// --- Final Report (doc 08) ------------------------------------------------------
export interface FinalReport {
  sessionId: string;
  topic: string;
  question: string;
  totalTimeSeconds: number;
  activeTimeSeconds: number;
  conceptsExplored: number;
  conceptsUnderstood: number;
  conceptsDeveloping: number;
  mistakes: number;
  corrections: number;
  independentCorrections: number;
  hintsUsed: number;
  statusLabel: string;
  understandingProgression: {
    start: string;
    during: string;
    end: string;
  };
  errors: Array<{
    category: ErrorCategory;
    severity: ErrorSeverity;
    description: string;
    corrected: boolean;
    selfCorrected: boolean;
  }>;
  selfCorrections: string[];
  hintInterpretation: string;
  finalUnderstanding: string;
  completeAnswer: string;
  keyTakeaways: string[];
  remainingGaps: string[];
  reviewRecommendations: string[];
  nextLearning: Recommendation[];
}

// --- Adaptive UI (doc 09) --------------------------------------------------------
export type AgeBand = "EARLY_LEARNER" | "YOUNG_LEARNER" | "EARLY_TEEN" | "TEEN" | "ADULT";
export type AutonomyLevel = "GUIDED" | "BALANCED" | "INDEPENDENT";
export type ExplanationDepth = "QUICK" | "STANDARD" | "DETAILED" | "DEEP_DIVE";
export type LearningMode = "GUIDED" | "BALANCED" | "CHALLENGE" | "EXPLAIN" | "REVIEW";
export type Theme = "light" | "dark" | "system";

export interface Profile {
  user_id: number;
  display_name: string;
  age_band: AgeBand;
  education_level: string;
  preferred_language: string;
  explanation_depth: ExplanationDepth;
  autonomy_level: AutonomyLevel;
  learning_mode: LearningMode;
  theme: Theme;
  onboarded: number;
}

// --- AI provider abstraction (doc 10, parts 4–5) ----------------------------------
export interface AIProviderInfo {
  id: string;
  displayName: string;
  isDemo: boolean; // true => must be clearly labeled, never presented as real AI
}

export interface BoardSnapshot {
  objects: Array<
    Pick<BoardObject, "id" | "type" | "x" | "y" | "width" | "height" | "content" | "owner">
  >;
}

// An AI-drawn starter object (diagram/flowchart piece) seeded onto a board.
export interface StarterObject {
  type: BoardObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  owner: Ownership;
}

export interface EvaluationContext {
  question: QuestionAnalysis;
  step: QuestionStep;
  attemptText: string;
  board: BoardSnapshot;
  previousHints: HintLevel[];
  studentLevel: AgeBand;
  depth: ExplanationDepth;
  // Summaries of files the student attached to this session (images/PDFs).
  // Untrusted data — providers must present it as material, not instructions.
  attachments?: string;
}

export interface AIProvider {
  info: AIProviderInfo;
  analyzeQuestion(text: string, materials?: string): Promise<QuestionAnalysis>;
  analyzeBoard(ctx: EvaluationContext): Promise<EvaluationResult>;
  evaluateStudentWork(ctx: EvaluationContext): Promise<EvaluationResult>;
  generateHint(ctx: EvaluationContext, level: HintLevel): Promise<Hint>;
  generateExplanation(topic: string, depth: ExplanationDepth, band: AgeBand): Promise<string>;
  // AI-drawn starter diagram/flowchart seeded onto the board when a session
  // opens. The AI draws the *structure*; the student still fills the meaning.
  generateStarterBoard(analysis: QuestionAnalysis): Promise<StarterObject[]>;
  // On-demand visual aid for the current step: the AI draws a supporting
  // flowchart, colorful labeled diagram, or comparison table onto the board
  // (owner "ai", read-only).
  generateVisualAid(
    ctx: EvaluationContext,
    kind: "table" | "flowchart"
  ): Promise<StarterObject[]>;
  generateFinalReport(input: {
    question: QuestionAnalysis;
    sessionStats: {
      activeSeconds: number;
      totalSeconds: number;
      hintsUsed: HintLevel[];
      errors: DetectedError[];
      selfCorrections: string[];
      stepsCompleted: number;
      stepsTotal: number;
      initialAttempt: string;
      finalAttempt: string;
    };
  }): Promise<FinalReport>;
}

// --- API envelope (doc 10, part 89) --------------------------------------------------
export type ApiEnvelope<T> =
  | { data: T; error: null }
  | { data: null; error: { code: string; message: string } };
