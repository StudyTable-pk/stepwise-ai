// ============================================================================
// Draw tool options: solid colors, gradient presets and marker styles shared
// by the Board (rendering) and the session toolbar (picker UI). Drawing
// objects store { points, color, style } in their content JSON; color is a
// hex string or "grad:<gradient id>".
// ============================================================================

export interface DrawOptions {
  color: string;
  style: string;
}

export const DEFAULT_DRAW_OPTIONS: DrawOptions = { color: "#166534", style: "pen" };

export const SOLID_COLORS = [
  "#111827",
  "#166534",
  "#dc2626",
  "#2563eb",
  "#f59e0b",
  "#7c3aed",
  "#db2777",
  "#0ea5e9"
];

export interface Gradient {
  id: string;
  label: string;
  from: string;
  to: string;
}

export const GRADIENTS: Gradient[] = [
  { id: "meadow", label: "Meadow", from: "#166534", to: "#ffd21f" },
  { id: "ocean", label: "Ocean", from: "#0ea5e9", to: "#6366f1" },
  { id: "sunset", label: "Sunset", from: "#f97316", to: "#db2777" },
  { id: "fire", label: "Fire", from: "#dc2626", to: "#facc15" },
  { id: "mint", label: "Mint", from: "#10b981", to: "#22d3ee" }
];

export interface MarkerStyle {
  id: string;
  label: string;
  width: number;
  opacity: number;
  dash?: string;
  glow?: boolean;
}

export const MARKER_STYLES: MarkerStyle[] = [
  { id: "fine", label: "Fine pen", width: 1.5, opacity: 1 },
  { id: "pen", label: "Pen", width: 2.5, opacity: 1 },
  { id: "marker", label: "Marker", width: 6, opacity: 0.9 },
  { id: "highlighter", label: "Highlighter", width: 14, opacity: 0.35 },
  { id: "chalk", label: "Chalk", width: 3.5, opacity: 0.8, dash: "7 5" },
  { id: "neon", label: "Neon glow", width: 3, opacity: 1, glow: true }
];

export function markerById(id: string): MarkerStyle {
  return MARKER_STYLES.find((m) => m.id === id) ?? MARKER_STYLES[1];
}

export function gradientById(id: string): Gradient | undefined {
  return GRADIENTS.find((g) => g.id === id);
}

// Resolve a stored color ("#hex" or "grad:<id>") into an SVG stroke value.
// Returns the stroke plus the gradient (if any) so callers can render defs.
export function resolveStroke(color: string, defsId: string): { stroke: string; gradient?: Gradient } {
  if (typeof color === "string" && color.startsWith("grad:")) {
    const gradient = gradientById(color.slice(5));
    if (gradient) return { stroke: `url(#${defsId})`, gradient };
  }
  return { stroke: typeof color === "string" && color.length > 0 ? color : "#166534" };
}
