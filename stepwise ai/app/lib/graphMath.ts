/**
 * Pure math helpers for the Visual Aid "graph" kind. No DOM, no network —
 * so they can be exercised by unit tests and reused server-side.
 *
 * Grammar (the AI is instructed to emit exactly this):
 *   - cartesian:  y = <expr>   or   f(x) = <expr>   (several curves may be
 *                 separated with "," or ";")
 *   - polar:      r = <expr in theta>     (t is also accepted as the angle)
 *   - parametric: x = <expr in t>, y = <expr in t>
 *   - <expr>      — numbers, the curve variable, + - * / ^ ( ) and
 *                 abs, sqrt, sin, cos, tan, ln, log, exp, floor, ceil, min,
 *                 max; the constants pi (or π) and e; implicit multiplication
 *                 (2x, 3sin(x), (x+1)(x-1)) and unicode math symbols
 *                 (π, θ, ×, ÷, −, ², ³, √) are all accepted.
 */

export type GraphFn = (v: number) => number | null;

const FN1: Record<string, (a: number) => number> = {
  abs: Math.abs,
  sqrt: (a) => (a < 0 ? NaN : Math.sqrt(a)),
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
};

const FN2: Record<string, (a: number, b: number) => number> = {
  min: Math.min,
  max: Math.max,
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

// Words the tokenizer knows about. Sorted longest-first so greedy
// splitting prefers "asin" over "a"+"sin" and "theta" over "t"+"heta".
const KNOWN_WORDS = [
  "sqrt", "asin", "acos", "atan", "ceil", "floor", "min", "max",
  "sin", "cos", "tan", "abs", "exp", "log", "ln", "pi", "theta",
  "t", "x", "r", "e",
].sort((a, b) => b.length - a.length);

const RESERVED = new Set<string>([...KNOWN_WORDS]);

type Tok =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "fn1"; name: string }
  | { kind: "fn2"; name: string }
  | { kind: "const"; value: number }
  | { kind: "op"; value: string }
  | { kind: "lp" }
  | { kind: "rp" }
  | { kind: "comma" };

/** Map unicode / fancy math symbols to their ASCII equivalents. */
function normalizeExpr(expr: string): string {
  return expr
    .replace(/π/g, " pi ")
    .replace(/θ/g, " theta ")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/√\s*/g, "sqrt ")
    .replace(/\*\*/g, "^")
    .replace(/[\[\]]/g, "(")
    .trim();
}

/**
 * Greedily split an unknown identifier into known words:
 * "xsinx" -> ["x","sin","x"], "2xsinx" keeps "xsinx" for the caller.
 * Returns null when any part is unknown (caller then rejects the word).
 */
function splitWord(w: string): string[] | null {
  let rest = w;
  const parts: string[] = [];
  while (rest.length > 0) {
    const hit = KNOWN_WORDS.find((k) => rest.startsWith(k));
    if (!hit) return null;
    parts.push(hit);
    rest = rest.slice(hit.length);
  }
  return parts.length > 0 ? parts : null;
}

function tokenize(expr: string, varName: string): Tok[] | null {
  const src = normalizeExpr(expr);
  // Convert |a| absolute-value bars into abs(a) before tokenizing.
  let guarded = src;
  for (let i = 0; i < 10; i++) {
    const next = guarded.replace(/\|([^|()]+)\|/, "abs($1)");
    if (next === guarded) break;
    guarded = next;
  }
  const toks: Tok[] = [];
  const re = /(\d+(?:\.\d+)?|\.\d+)|([a-zA-Z_]+)|(\+|-|\*|\/|\^)|([(),])|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(guarded)) !== null) {
    if (m[1] !== undefined) {
      toks.push({ kind: "num", value: parseFloat(m[1]) });
    } else if (m[2] !== undefined) {
      // A word: expand concatenated identifiers ("xsinx" -> x, sin, x).
      const parts = splitWord(m[2].toLowerCase());
      if (!parts) return null;
      for (const w of parts) {
        if (w === varName) toks.push({ kind: "var", name: w });
        else if (w in FN1) toks.push({ kind: "fn1", name: w });
        else if (w in FN2) toks.push({ kind: "fn2", name: w });
        else if (w in CONSTS) toks.push({ kind: "const", value: CONSTS[w] });
        else return null;
      }
    } else if (m[3] !== undefined) {
      toks.push({ kind: "op", value: m[3] });
    } else if (m[4] !== undefined) {
      if (m[4] === "(") toks.push({ kind: "lp" });
      else if (m[4] === ")") toks.push({ kind: "rp" });
      else toks.push({ kind: "comma" });
    }
    // whitespace matches are skipped
  }
  return toks;
}

/** Is this token a "value-producing" operand (or a closing paren)? */
function isValueTok(t: Tok): boolean {
  return t.kind === "num" || t.kind === "var" || t.kind === "const" || t.kind === "rp";
}

/** Insert implicit multiplication: 2x, x(x+1), (x+1)(x-1), 3sin(x), xpi... */
function insertImplicitMult(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    out.push(toks[i]);
    const a = toks[i];
    const b = toks[i + 1];
    if (!b) continue;
    const aIsValue = isValueTok(a) || a.kind === "fn2";
    const bStartsValue =
      b.kind === "num" || b.kind === "var" || b.kind === "const" ||
      b.kind === "fn1" || b.kind === "fn2" || b.kind === "lp";
    if (aIsValue && bStartsValue) out.push({ kind: "op", value: "*" });
  }
  return out;
}

/** Shunting-yard -> RPN. Right-associative ^; unary minus -> 0 - x. */
function toRpn(toks: Tok[]): Tok[] | null {
  const out: Tok[] = [];
  const stack: Tok[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, u: 3, "^": 4 };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind === "num" || t.kind === "var" || t.kind === "const") out.push(t);
    else if (t.kind === "fn1" || t.kind === "fn2") stack.push(t);
    else if (t.kind === "comma") {
      while (stack.length && stack[stack.length - 1].kind !== "lp") out.push(stack.pop()!);
    } else if (t.kind === "op") {
      const prev = toks[i - 1];
      const unary = t.value === "-" && (!prev || prev.kind === "op" || prev.kind === "lp" || prev.kind === "comma");
      const op = unary ? "u" : t.value;
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.kind === "op") {
          const topPrec = prec[top.value];
          if (topPrec > prec[op] || (topPrec === prec[op] && op !== "^")) out.push(stack.pop()!);
          else break;
        } else if (top.kind === "fn1" || top.kind === "fn2") {
          out.push(stack.pop()!);
        } else break;
      }
      stack.push({ kind: "op", value: op });
    } else if (t.kind === "lp") stack.push(t);
    else if (t.kind === "rp") {
      while (stack.length && stack[stack.length - 1].kind !== "lp") out.push(stack.pop()!);
      if (!stack.length) return null; // mismatched paren
      stack.pop(); // discard "("
      if (stack.length && (stack[stack.length - 1].kind === "fn1" || stack[stack.length - 1].kind === "fn2")) {
        out.push(stack.pop()!);
      }
    }
  }
  while (stack.length) {
    const t = stack.pop()!;
    if (t.kind === "lp") return null; // mismatched paren
    out.push(t);
  }
  return out;
}

function evalRpn(rpn: Tok[], vars: Record<string, number>): number | null {
  const st: number[] = [];
  for (const t of rpn) {
    if (t.kind === "num" || t.kind === "const") st.push(t.value);
    else if (t.kind === "var") {
      const v = vars[t.name];
      if (typeof v !== "number") return null;
      st.push(v);
    } else if (t.kind === "op") {
      if (t.value === "u") {
        if (st.length < 1) return null;
        st.push(-st.pop()!);
        continue;
      }
      if (st.length < 2) return null;
      const b = st.pop()!;
      const a = st.pop()!;
      switch (t.value) {
        case "+": st.push(a + b); break;
        case "-": st.push(a - b); break;
        case "*": st.push(a * b); break;
        case "/": st.push(a / b); break;
        case "^": st.push(Math.pow(a, b)); break;
        default: return null;
      }
    } else if (t.kind === "fn1") {
      if (st.length < 1) return null;
      st.push(FN1[t.name](st.pop()!));
    } else if (t.kind === "fn2") {
      if (st.length < 2) return null;
      const b = st.pop()!;
      const a = st.pop()!;
      st.push(FN2[t.name](a, b));
    } else return null;
  }
  if (st.length !== 1) return null;
  const v = st[0];
  return typeof v === "number" && isFinite(v) ? v : null;
}

/**
 * Compile one curve expression whose variable is `varName` ("x", "t" or
 * "theta"). Any OTHER variable letter is rejected — that is what keeps the
 * engine honest about symbols it does not support. Returns null on any
 * syntax/unknown-symbol failure or when the expression never evaluates.
 */
export function compileFor(rawExpr: string, varName: string): GraphFn | null {
  if (!rawExpr || !varName) return null;
  const toks = tokenize(rawExpr, varName);
  if (!toks || toks.length === 0) return null;
  if (toks.some((t) => t.kind === "comma")) return null; // caller must split first
  const withMult = insertImplicitMult(toks);
  const rpn = toRpn(withMult);
  if (!rpn || rpn.length === 0) return null;
  if (evalRpn(rpn, { [varName]: 1 }) === null && evalRpn(rpn, { [varName]: 0.5 }) === null) return null;
  return (v: number) => evalRpn(rpn, { [varName]: v });
}

/** Backwards-compatible cartesian compiler (variable x). */
export function compileExpr(rawExpr: string): GraphFn | null {
  return compileFor(rawExpr, "x");
}

/* ---------------- graph-spec parsing (cartesian / polar / parametric) --- */

export type GraphSpec =
  | { kind: "cartesian"; curves: Array<{ expr: string; fn: GraphFn }> }
  | { kind: "polar"; expr: string; fn: GraphFn; tMin: number; tMax: number }
  | {
      kind: "parametric";
      xExpr: string;
      yExpr: string;
      fx: GraphFn;
      fy: GraphFn;
      tMin: number;
      tMax: number;
    };

const PARAM_RE = /^\s*x\s*=\s*([\s\S]+?)\s*[,;]\s*y\s*=\s*([\s\S]+)$/i;
const POLAR_RE = /^\s*r\s*=\s*([\s\S]+)$/i;
const USES_TRIG_RE = /\b(sin|cos|tan)\b/i;

/**
 * Parse a full user/AI equation into a plottable spec. Understands:
 *   "y = x^2 − 3"                    -> cartesian, one curve
 *   "y = sin(x), y = cos(x)"         -> cartesian, several curves
 *   "r = 1 + cos(θ)"                 -> polar (angle variable theta/t/x)
 *   "x = cos(t), y = sin(t)"         -> parametric
 * Returns null when nothing plottable can be produced.
 */
export function parseGraphSpec(rawInput: string): GraphSpec | null {
  if (!rawInput) return null;
  const input = rawInput.trim();
  if (!input) return null;

  // 1) Parametric: x = f(t), y = g(t)
  const pm = input.match(PARAM_RE);
  if (pm) {
    const fx = compileFor(pm[1], "t");
    const fy = compileFor(pm[2], "t");
    if (fx && fy) {
      const periodic = USES_TRIG_RE.test(pm[1]) || USES_TRIG_RE.test(pm[2]);
      return {
        kind: "parametric", xExpr: pm[1].trim(), yExpr: pm[2].trim(), fx, fy,
        tMin: periodic ? 0 : -10,
        tMax: periodic ? Math.PI * 2 : 10,
      };
    }
    return null;
  }

  // 2) Polar: r = f(theta)
  const pl = input.match(POLAR_RE);
  if (pl) {
    const body = pl[1].trim();
    const fn = compileFor(body, "theta") ?? compileFor(body, "t") ?? compileFor(body, "x");
    if (fn) return { kind: "polar", expr: body, fn, tMin: 0, tMax: Math.PI * 2 };
    return null;
  }

  // 3) Cartesian: one or several "y = ..." / "f(x) = ..." curves
  const pieces = input
    .split(/[,;]/)
    .map((s) => s.trim().replace(/^(y|f\s*\(\s*x\s*\))\s*=\s*/i, "").trim())
    .filter(Boolean);
  if (pieces.length === 0) return null;
  const curves: Array<{ expr: string; fn: GraphFn }> = [];
  for (const piece of pieces) {
    const fn = compileFor(piece, "x");
    if (fn) curves.push({ expr: piece, fn });
  }
  if (curves.length === 0) return null;
  return { kind: "cartesian", curves };
}
