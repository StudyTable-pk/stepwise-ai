// ============================================================================
// Starter diagram builder — turns a question analysis into a simple
// flowchart of AI-owned objects (title card, step boxes, arrow connectors).
// Used by every provider so the board always opens with a visual structure.
// The AI draws the *structure*; the student supplies the meaning (spec:
// "the student does the thinking").
// ============================================================================
import type { QuestionAnalysis, StarterObject } from "@/lib/types";

const FLOW_X = 560; // flowchart column, right of the question/intro cards
const BOX_W = 280;
const BOX_H = 64;
const GAP = 46; // vertical gap filled by an arrow connector

export function buildStepFlowchart(analysis: QuestionAnalysis): StarterObject[] {
  return buildFlowchart(
    analysis.topic,
    analysis.steps.slice(0, 6).map((step, i) => `Step ${i + 1}: ${step.title}`)
  );
}

export function buildFlowchart(topic: string, titles: string[]): StarterObject[] {
  const objects: StarterObject[] = [];
  const steps = titles.slice(0, 6);

  // Title card for the diagram.
  objects.push({
    type: "visual",
    x: FLOW_X,
    y: 40,
    width: 320,
    height: 52,
    content: `🗺️ ${topic} — idea flow`,
    owner: "ai"
  });

  let y = 40 + 52; // bottom of the title card
  // Arrow from title to first step box.
  if (steps.length > 0) {
    objects.push(connector(FLOW_X + BOX_W / 2, y, GAP));
    y += GAP;
  }

  steps.forEach((label, i) => {
    objects.push({
      type: "visual",
      x: FLOW_X,
      y,
      width: BOX_W,
      height: BOX_H,
      content: label,
      owner: "ai"
    });
    y += BOX_H;
    if (i < steps.length - 1) {
      objects.push(connector(FLOW_X + BOX_W / 2, y, GAP));
      y += GAP;
    }
  });

  // Closing "your turn" arrow pointing at free space for the student.
  if (steps.length > 0) {
    objects.push(connector(FLOW_X + BOX_W / 2, y, GAP));
    objects.push({
      type: "visual",
      x: FLOW_X,
      y: y + GAP,
      width: BOX_W,
      height: BOX_H,
      content: "✏️ Your ideas go here — add text boxes and fill each step!",
      owner: "ai"
    });
  }

  return objects;
}

function connector(cx: number, topY: number, dy: number): StarterObject {
  return {
    type: "connector",
    x: cx - 12,
    y: topY,
    width: 24,
    height: dy + 24,
    content: JSON.stringify({ dx: 0, dy }),
    owner: "ai"
  };
}

// --- Tables (AI visual aid) ---------------------------------------------------
// A table is ONE board object whose content JSON is
// { title, columns: string[], rows: string[][] } — rendered as a grid.
export function buildTable(title: string, columns: string[], rows: string[][]): StarterObject[] {
  const cols = columns.map((c) => String(c || "").slice(0, 60)).slice(0, 6);
  const data = rows
    .slice(0, 10)
    .map((r) => cols.map((_, ci) => String(r?.[ci] ?? "").slice(0, 120)));
  if (cols.length === 0 || data.length === 0) return [];
  return [
    {
      type: "table",
      x: 40,
      y: 40,
      width: Math.max(320, cols.length * 180),
      height: Math.max(140, 70 + data.length * 44),
      content: JSON.stringify({ title: String(title || "").slice(0, 100), columns: cols, rows: data }),
      owner: "ai"
    }
  ];
}

// Shift a built aid into free space on the board (route computes the offset).
export function offsetObjects(objects: StarterObject[], dx: number, dy: number): StarterObject[] {
  return objects.map((o) => ({
    ...o,
    x: Math.round(o.x + dx),
    y: Math.round(Math.max(20, o.y + dy))
  }));
}
