// ============================================================================
// Seed knowledge for the offline demo tutor.
// This is a SAFE DEVELOPMENT PLACEHOLDER (spec part 118). It lets the full
// learning loop run without a live AI key. It is clearly marked as a demo
// provider and is never presented as real AI analysis.
// ============================================================================
import type { QuestionAnalysis } from "@/lib/types";

export interface SeededTopic {
  match: RegExp;
  analysis: QuestionAnalysis;
}

export const SEED_TOPICS: SeededTopic[] = [
  {
    match: /photosynth/i,
    analysis: {
      intent: "Explain what photosynthesis is and how plants make food",
      subject: "Biology",
      topic: "Photosynthesis",
      difficulty: "medium",
      requiredConcepts: [
        "Photosynthesis",
        "Inputs (carbon dioxide, water, light)",
        "Glucose production",
        "Oxygen by-product",
        "Role of chlorophyll"
      ],
      prerequisites: ["Plants are living things", "Basic idea of energy"],
      introduction:
        "Photosynthesis is how green plants make their own food. Let's work through the inputs, the process, and the outputs together. You'll do the thinking — I'll guide you step by step.",
      steps: [
        {
          id: "s1",
          index: 0,
          title: "What does a plant need to make food?",
          instruction:
            "List the things a plant takes in to make food. Think about the air, the soil, and sunlight.",
          expectedConcepts: ["carbon dioxide", "water", "sunlight", "light"],
          completed: false
        },
        {
          id: "s2",
          index: 1,
          title: "What does the plant produce?",
          instruction:
            "Now describe what the plant makes from those inputs. What is its food, and what gas is released?",
          expectedConcepts: ["glucose", "sugar", "oxygen"],
          completed: false
        },
        {
          id: "s3",
          index: 2,
          title: "Where does it happen and why?",
          instruction:
            "Explain which part of the plant captures light and why leaves are green.",
          expectedConcepts: ["chlorophyll", "leaf", "leaves", "green"],
          completed: false
        },
        {
          id: "s4",
          index: 3,
          title: "Put it all together",
          instruction:
            "Write one or two sentences summarizing photosynthesis from start to finish.",
          expectedConcepts: ["light", "carbon dioxide", "water", "glucose", "oxygen"],
          completed: false
        }
      ],
      referenceAnswer:
        "Photosynthesis is the process by which green plants use light energy, captured by chlorophyll in their leaves, to convert carbon dioxide and water into glucose (food), releasing oxygen as a by-product."
    }
  },
  {
    match: /water cycle/i,
    analysis: {
      intent: "Explain the water cycle and its stages",
      subject: "Science",
      topic: "Water Cycle",
      difficulty: "easy",
      requiredConcepts: ["Evaporation", "Condensation", "Precipitation", "Collection"],
      prerequisites: ["Water can change state"],
      introduction:
        "The water cycle describes how water moves through the environment. Let's follow one drop of water around the cycle.",
      steps: [
        {
          id: "s1",
          index: 0,
          title: "How does water rise into the sky?",
          instruction: "Describe what happens when the sun heats water in oceans and lakes.",
          expectedConcepts: ["evaporation", "vapor", "vapour", "heat", "sun"],
          completed: false
        },
        {
          id: "s2",
          index: 1,
          title: "How do clouds form?",
          instruction: "Explain what happens to water vapor when it cools high in the sky.",
          expectedConcepts: ["condensation", "cloud", "clouds", "cool"],
          completed: false
        },
        {
          id: "s3",
          index: 2,
          title: "How does water return to the ground?",
          instruction: "Describe how water falls back to Earth from clouds.",
          expectedConcepts: ["precipitation", "rain", "snow", "fall"],
          completed: false
        }
      ],
      referenceAnswer:
        "The water cycle is the continuous movement of water: the sun heats water which evaporates as vapor, the vapor cools and condenses into clouds, water returns as precipitation (rain or snow), and collects in oceans and lakes to begin again."
    }
  },
  {
    match: /fraction/i,
    analysis: {
      intent: "Understand what fractions represent and how to compare them",
      subject: "Mathematics",
      topic: "Fractions",
      difficulty: "medium",
      requiredConcepts: ["Numerator", "Denominator", "Equal parts", "Comparing fractions"],
      prerequisites: ["Division", "Whole numbers"],
      introduction:
        "A fraction describes part of a whole. We'll build the idea from equal parts, then learn to read and compare fractions.",
      steps: [
        {
          id: "s1",
          index: 0,
          title: "What does a fraction mean?",
          instruction:
            "If you split a pizza into 4 equal slices and take 1, how would you write that as a fraction? What do the top and bottom numbers mean?",
          expectedConcepts: ["1/4", "one quarter", "numerator", "denominator", "equal"],
          completed: false
        },
        {
          id: "s2",
          index: 1,
          title: "Which is bigger?",
          instruction: "Compare 1/2 and 1/4. Which is larger, and why?",
          expectedConcepts: ["1/2", "half", "bigger", "larger", "denominator"],
          completed: false
        }
      ],
      referenceAnswer:
        "A fraction has a numerator (parts you have) over a denominator (total equal parts). 1/4 means 1 of 4 equal parts. 1/2 is larger than 1/4 because fewer, larger parts make up the whole."
    }
  }
];

/** Generic decomposition used when no seeded topic matches. */
export function genericAnalysis(question: string): QuestionAnalysis {
  const trimmed = question.trim();
  return {
    intent: trimmed,
    subject: "General",
    topic: trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed,
    difficulty: "medium",
    requiredConcepts: ["Key idea", "Supporting details", "Application"],
    prerequisites: [],
    introduction:
      "Let's break this question down together. I'll guide you through understanding it, working through the key ideas, and checking your reasoning. You do the thinking.",
    steps: [
      {
        id: "s1",
        index: 0,
        title: "Understand the question",
        instruction:
          "In your own words, what is this question asking? Write a short sentence about what you need to find or explain.",
        expectedConcepts: [],
        completed: false
      },
      {
        id: "s2",
        index: 1,
        title: "Identify the key ideas",
        instruction:
          "List the main ideas, terms, or facts involved. What do you already know about this?",
        expectedConcepts: [],
        completed: false
      },
      {
        id: "s3",
        index: 2,
        title: "Work through it",
        instruction:
          "Now put the ideas together. Explain your reasoning or solve the problem step by step.",
        expectedConcepts: [],
        completed: false
      },
      {
        id: "s4",
        index: 3,
        title: "Check your answer",
        instruction:
          "Read back over your work. Does it fully answer the question? Is anything missing or unclear?",
        expectedConcepts: [],
        completed: false
      }
    ],
    referenceAnswer: ""
  };
}
