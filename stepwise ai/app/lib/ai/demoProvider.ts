// ============================================================================
// Offline Demo Tutor — a local heuristic provider used when no AI key is
// configured. Spec part 118: never present simulated results as real AI.
// This provider is flagged isDemo=true and the UI displays a visible banner.
// ============================================================================
import type {
  AIProvider,
  AIProviderInfo,
  AgeBand,
  EvaluationContext,
  EvaluationResult,
  EvaluationStatus,
  ExplanationDepth,
  FinalReport,
  Hint,
  HintLevel,
  QuestionAnalysis,
  FeedbackItem,
  DetectedError
} from "@/lib/types";
import { SEED_TOPICS, genericAnalysis } from "./knowledge";
import { buildStepFlowchart, buildTable } from "./starter";

const info: AIProviderInfo = {
  id: "demo-tutor",
  displayName: "Offline Demo Tutor (development fallback)",
  isDemo: true
};

// Known misconception patterns (spec: detect conceptual errors, not wording).
const MISCONCEPTION_PATTERNS: Array<{ pattern: RegExp; description: string; concept: string }> = [
  {
    // Require "from the soil" right after the food claim so legitimate
    // input text ("plant takes in water from soil") is never mis-flagged.
    pattern: /plants? (get|receive|take|eat)s? (its |their )?(food|glucose|sugar)[^.]*from[^.]*(soil|ground|dirt)/i,
    description: "Believes plants receive their food (glucose) from the soil",
    concept: "Source of plant food"
  },
  {
    pattern: /oxygen.*(input|taken in|needed from air for food)/i,
    description: "Believes oxygen is an input of photosynthesis",
    concept: "Photosynthesis inputs"
  },
  {
    pattern: /sun.*(gives|provides).*(food|glucose)/i,
    description: "Believes sunlight itself is the plant's food",
    concept: "Role of sunlight"
  }
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9/\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findStudentObjects(ctx: EvaluationContext): string[] {
  return ctx.board.objects.filter((o) => o.owner === "student" && o.content.trim()).map((o) => o.id);
}

function detectMisconceptions(text: string): Array<{ description: string; concept: string }> {
  return MISCONCEPTION_PATTERNS.filter((m) => m.pattern.test(text)).map((m) => ({
    description: m.description,
    concept: m.concept
  }));
}

export const demoProvider: AIProvider = {
  info,

  async analyzeQuestion(text) {
    for (const seeded of SEED_TOPICS) {
      if (seeded.match.test(text)) {
        // Deep copy so session-level step state never mutates the seed.
        return JSON.parse(JSON.stringify(seeded.analysis)) as QuestionAnalysis;
      }
    }
    return genericAnalysis(text);
  },

  async analyzeBoard(ctx) {
    return evaluate(ctx);
  },

  async evaluateStudentWork(ctx) {
    return evaluate(ctx);
  },

  async generateHint(ctx, level) {
    const step = ctx.step;
    const hints = buildHintLadder(step.title, step.instruction, step.expectedConcepts);
    const clamped = Math.min(Math.max(level, 1), 7) as HintLevel;
    return hints[clamped - 1];
  },

  async generateStarterBoard(analysis) {
    return buildStepFlowchart(analysis);
  },

  async generateVisualAid(ctx, kind) {
    if (kind === "table") {
      // Demo tutor: a concept scaffold the student fills in themselves.
      const concepts =
        ctx.step.expectedConcepts.length > 0
          ? ctx.step.expectedConcepts
          : ctx.question.requiredConcepts;
      const rows = (concepts.length > 0 ? concepts : ["The main idea"]).slice(0, 6).map((c) => [c, "?"]);
      return buildTable(
        `${ctx.step.title} — key ideas`,
        ["Concept", "What it means (your words)"],
        rows
      );
    }
    return buildStepFlowchart(ctx.question);
  },

  async generateExplanation(topic, depth, band) {
    const styleNote =
      band === "EARLY_LEARNER" || band === "YOUNG_LEARNER"
        ? "Here's a simple way to think about it:"
        : "Here is a structured explanation:";
    const depthNote =
      depth === "QUICK"
        ? "In short: focus on the core idea and one example."
        : depth === "DEEP_DIVE"
          ? "Let's go deep: we'll cover the idea, the mechanism, and an application."
          : "We'll cover the idea and one clear example.";
    return `${styleNote}\n\n${depthNote}\n\nTopic: ${topic}. Start by identifying what is already known, connect it to the new idea, then test the idea with one concrete example. (Demo tutor explanation — configure an AI provider for real adaptive explanations.)`;
  },

  async generateFinalReport(input) {
    const { question, sessionStats } = input;
    const errors = sessionStats.errors;
    const corrected = errors.filter((e) => e.corrected);
    const selfCorrections = sessionStats.selfCorrections;
    const concepts = question.requiredConcepts;
    const understoodCount =
      sessionStats.stepsTotal === 0 ? 0 : Math.round((sessionStats.stepsCompleted / sessionStats.stepsTotal) * concepts.length);

    const statusLabel =
      sessionStats.stepsCompleted >= sessionStats.stepsTotal
        ? "🟢 Strong understanding"
        : sessionStats.stepsCompleted > 0
          ? "🟡 Developing understanding"
          : "🔵 Just getting started";

    const report: FinalReport = {
      sessionId: "",
      topic: question.topic,
      question: question.intent,
      totalTimeSeconds: sessionStats.totalSeconds,
      activeTimeSeconds: sessionStats.activeSeconds,
      conceptsExplored: concepts.length,
      conceptsUnderstood: understoodCount,
      conceptsDeveloping: Math.max(0, concepts.length - understoodCount),
      mistakes: errors.length,
      corrections: corrected.length,
      independentCorrections: selfCorrections.length,
      hintsUsed: sessionStats.hintsUsed.length,
      statusLabel,
      understandingProgression: {
        start: sessionStats.initialAttempt
          ? "You began with an initial attempt and worked through the ideas."
          : "You started fresh and worked through the ideas step by step.",
        during:
          selfCorrections.length > 0
            ? `You corrected ${selfCorrections.length} idea${selfCorrections.length > 1 ? "s" : ""} on your own along the way.`
            : corrected.length > 0
              ? "You refined your thinking with guidance as you went."
              : "You built your understanding step by step.",
        end:
          sessionStats.stepsCompleted >= sessionStats.stepsTotal
            ? "By the end, you could explain the main ideas and put them together."
            : "You made solid progress and have clear next steps to keep going."
      },
      errors: errors.map((e) => ({
        category: e.category,
        severity: e.severity,
        description: e.description,
        corrected: e.corrected,
        selfCorrected: e.selfCorrected
      })),
      selfCorrections,
      hintInterpretation:
        sessionStats.hintsUsed.length === 0
          ? "You worked through this without asking for hints."
          : `You used ${sessionStats.hintsUsed.length} hint${sessionStats.hintsUsed.length > 1 ? "s" : ""} to keep moving forward.`,
      finalUnderstanding:
        sessionStats.finalAttempt ||
        "You worked through the steps and built understanding of the key ideas.",
      completeAnswer:
        question.referenceAnswer ||
        "A complete answer would connect the key ideas of the question with clear reasoning and evidence.",
      keyTakeaways: question.requiredConcepts.slice(0, 4).map((c) => `Understand ${c}.`),
      remainingGaps:
        understoodCount < concepts.length
          ? concepts.slice(understoodCount).map((c) => `Keep practicing: ${c}`)
          : [],
      reviewRecommendations:
        understoodCount < concepts.length
          ? ["Review this topic again in 2 days to strengthen it."]
          : ["A quick review in one week will help this stay fresh."],
      nextLearning:
        sessionStats.stepsCompleted >= sessionStats.stepsTotal
          ? [
              {
                type: "GO_DEEPER",
                title: `Go deeper into ${question.topic}`,
                reason: "You showed strong understanding — a harder variation will stretch you."
              }
            ]
          : [
              {
                type: "CONTINUE",
                title: `Continue ${question.topic}`,
                reason: "You were making progress — pick up where you left off."
              }
            ]
    };
    return report;
  }
};

// ---------------------------------------------------------------------------
function evaluate(ctx: EvaluationContext): EvaluationResult {
  const studentIds = findStudentObjects(ctx);
  const text = normalize(ctx.attemptText);
  const step = ctx.step;
  const expected = step.expectedConcepts.map(normalize);

  // No student content at all -> uncertain, invite an attempt.
  if (!text) {
    return {
      status: "uncertain",
      summary: "I don't see your answer yet.",
      feedback: [
        {
          label: "AI_UNCERTAIN",
          title: "Your turn",
          message: "Write, speak, or draw your thinking on the board, then check your step.",
          objectIds: []
        }
      ],
      errors: [],
      strengths: [],
      missingElements: ["Your answer"],
      interventionLevel: 0,
      nextAction: step.instruction
    };
  }

  const misconceptions = detectMisconceptions(ctx.attemptText);

  // Steps with expected concepts -> concept matching.
  if (expected.length > 0) {
    const matched = expected.filter((e) =>
      e.split(/[\s,]+/).some((token) => token.length > 2 && text.includes(token))
    );
    const ratio = matched.length / expected.length;

    if (misconceptions.length > 0) {
      const errors: DetectedError[] = misconceptions.map((m) => ({
        category: "CONCEPTUAL",
        severity: "IMPORTANT",
        description: m.description,
        objectIds: studentIds,
        corrected: false,
        selfCorrected: false
      }));
      return {
        status: "error",
        summary: "There's a concept worth reconsidering here.",
        feedback: [
          {
            label: "CONCEPT_ERROR",
            title: "Think about this",
            message: `${misconceptions[0].description}. Try to reconsider where that idea comes from.`,
            objectIds: studentIds
          },
          ...(matched.length > 0
            ? (
                [
                  {
                    label: "PARTIALLY_CORRECT",
                    title: "You've got part of it",
                    message: `You correctly identified: ${matched.join(", ")}.`,
                    objectIds: studentIds
                  }
                ] as FeedbackItem[]
              )
            : [])
        ],
        errors,
        strengths: matched,
        missingElements: expected.filter((e) => !matched.includes(e)),
        interventionLevel: 4,
        nextAction: "Reconsider the idea flagged above, then try again."
      };
    }

    if (ratio >= 0.99) {
      return {
        status: "correct",
        summary: "That's a correct and complete answer for this step.",
        feedback: [
          {
            label: "CORRECT_UNDERSTANDING",
            title: "Correct understanding",
            message: "You identified all the key ideas for this step. Well reasoned.",
            objectIds: studentIds
          }
        ],
        errors: [],
        strengths: matched,
        missingElements: [],
        interventionLevel: 0,
        nextAction: "Move on to the next step."
      };
    }

    if (ratio >= 0.5) {
      return {
        status: "partial",
        summary: "You're on the right track — part of this is there.",
        feedback: [
          {
            label: "PARTIALLY_CORRECT",
            title: "On the right track",
            message: `You have: ${matched.join(", ")}. Something is still missing.`,
            objectIds: studentIds
          },
          {
            label: "MISSING_IDEA",
            title: "Missing idea",
            message: "There's still an important idea to add. Look at the step prompt again.",
            objectIds: []
          }
        ],
        errors: [
          {
            category: "INCOMPLETE_ANSWER",
            severity: "MINOR",
            description: "Answer is missing one or more key ideas",
            objectIds: studentIds,
            corrected: false,
            selfCorrected: false
          }
        ],
        strengths: matched,
        missingElements: expected.filter((e) => !matched.includes(e)),
        interventionLevel: 2,
        nextAction: "Add the missing idea, then check again."
      };
    }

    return {
      status: "error",
      summary: "This step needs another look.",
      feedback: [
        {
          label: "CHECK_THIS_STEP",
          title: "Check this step",
          message: "Your answer doesn't yet cover the key ideas of this step. Re-read the prompt.",
          objectIds: studentIds
        }
      ],
      errors: [
        {
          category: "MISSING_STEP",
          severity: "MODERATE",
          description: "Key ideas for this step are not yet addressed",
          objectIds: studentIds,
          corrected: false,
          selfCorrected: false
        }
      ],
      strengths: matched,
      missingElements: expected.filter((e) => !matched.includes(e)),
      interventionLevel: 3,
      nextAction: "Try a hint, then take another attempt."
    };
  }

  // Generic steps (no expected concepts): judge by substance.
  const words = text.split(" ").filter(Boolean).length;
  if (words < 3) {
    return {
      status: "partial",
      summary: "That's a start — can you say a bit more?",
      feedback: [
        {
          label: "THINK_ABOUT_THIS",
          title: "Expand your thinking",
          message: "Add one or two more sentences explaining your reasoning.",
          objectIds: studentIds
        }
      ],
      errors: [],
      strengths: [],
      missingElements: ["More detail"],
      interventionLevel: 1,
      nextAction: "Expand your answer with your reasoning."
    };
  }
  return {
    status: "correct",
    summary: "Good — you've worked through this step thoughtfully.",
    feedback: [
      {
        label: "CORRECT_UNDERSTANDING",
        title: "Good reasoning",
        message: "You engaged with this step. Let's build on it.",
        objectIds: studentIds
      }
    ],
    errors: [],
    strengths: ["Engaged reasoning"],
    missingElements: [],
    interventionLevel: 0,
    nextAction: "Move on to the next step."
  };
}

function buildHintLadder(title: string, instruction: string, expected: string[]): Hint[] {
  const c = (i: number) => expected[i] ?? "the main idea";
  const list = expected.length > 0 ? expected : ["the main idea"];
  return [
    {
      level: 1,
      title: "Gentle nudge",
      message: `Read the step in your own words: "${title}". What exactly is it asking you to figure out?`,
      nextAction: "Rewrite the step as a question on the board, then take one small guess."
    },
    {
      level: 2,
      title: "Focus question",
      message: `Ask yourself: what do I already know about ${c(0)}? Even a tiny piece counts — put it on the board.`,
      nextAction: `Write one sentence about ${c(0)}.`
    },
    {
      level: 3,
      title: "Name a key idea",
      message: `One key idea in this step is "${c(0)}". Where could it fit in your answer?`,
      nextAction: `Add "${c(0)}" to your board text and say what it does.`
    },
    {
      level: 4,
      title: "Find the second piece",
      message:
        expected.length > 1
          ? `Now look for "${c(1)}". How does it connect to ${c(0)}?`
          : `Now check your answer: does it explain *why* ${c(0)} matters?`,
      nextAction:
        expected.length > 1
          ? `Link ${c(0)} and ${c(1)} in one sentence.`
          : "Add a 'because…' to your sentence."
    },
    {
      level: 5,
      title: "Sentence frame",
      message: `Try this frame: "In this step, ${c(0)} ___ , and that leads to ___." Fill both blanks yourself.`,
      nextAction: "Complete the frame in your own words."
    },
    {
      level: 6,
      title: "Nearly there",
      message: `This step is really asking: ${instruction} A strong answer mentions ${list.slice(0, 3).join(", ")}.`,
      nextAction: "Rewrite your answer to include those ideas."
    },
    {
      level: 7,
      title: "Worked example",
      message: `Let's do it together: ${instruction} Start with "${c(0)}" and build from there. Now write YOUR version — explain it like you'd tell a friend.`,
      nextAction: "Write your own version, then press ✓ Check This."
    }
  ];
}
