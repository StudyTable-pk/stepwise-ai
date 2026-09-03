// End-to-end MVP verification for StepWise AI (spec part 120 loop).
// Runs against http://localhost:3000 using fetch + a cookie jar.
const BASE = "http://localhost:3000";
let cookie = "";

function setCookie(res) {
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  setCookie(res);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function assert(cond, label, extra) {
  if (!cond) {
    console.error(`❌ FAIL: ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : "");
    process.exitCode = 1;
  } else {
    console.log(`✅ ${label}`);
  }
}

const email = `test${Date.now()}@example.com`;

// 1. Signup
let r = await call("POST", "/api/auth/signup", { email, password: "password123" });
assert(r.status === 201 && r.json?.data?.email === email, "signup", r.json);

// 2. Me + onboarding
r = await call("GET", "/api/me");
assert(r.json?.data?.profile?.onboarded === 0, "me shows not onboarded", r.json);
r = await call("PATCH", "/api/me", { display_name: "Tester", age_band: "TEEN", onboarded: true });
assert(r.json?.data?.profile?.onboarded === 1, "onboard via PATCH /api/me", r.json);

// 3. Ask a question -> session + board created
r = await call("POST", "/api/sessions", { question: "Explain how photosynthesis works" });
const sess = r.json?.data;
assert(r.status === 201 && sess?.sessionId && sess?.boardId, "create session", r.json);
assert(Array.isArray(sess?.steps) && sess.steps.length > 0, "analysis has steps", sess?.steps?.length);
const sessionId = sess?.sessionId;
const boardId = sess?.boardId;

// 4. Session recovery payload
r = await call("GET", `/api/sessions/${sessionId}`);
const rec = r.json?.data;
assert(rec?.objects?.length >= 2, "recovery payload has seeded objects", rec?.objects?.length);
assert(rec?.session?.analysis?.introduction, "analysis contains introduction");

// 5. Student writes on the board -> autosave (PUT)
let objects = rec.objects;
objects.push({
  id: "obj-student-1",
  type: "text",
  x: 520, y: 200, width: 300, height: 100,
  content: "Plants take in sunlight and carbon dioxide and release oxygen",
  owner: "student",
  rotation: 0, z_index: 5, style: {}, meta: {}
});
r = await call("PUT", `/api/boards/${boardId}`, { objects });
assert(r.json?.data?.saved === true, "board autosave", r.json);

// 6. Check this (evaluate) — step 0
r = await call("POST", `/api/sessions/${sessionId}/analyze`, {
  stepIndex: 0,
  attemptText: "Plants take in sunlight and carbon dioxide and release oxygen",
  activeSeconds: 60
});
const ev = r.json?.data;
assert(r.json?.error === null && ev?.evaluation, "analyze returns evaluation", r.json);
console.log(`   evaluation status: ${ev?.evaluation?.status}, intervention: ${ev?.evaluation?.interventionLevel}`);

// 7. Deliberate misconception -> error + feedback labels
objects.push({
  id: "obj-student-2",
  type: "text",
  x: 520, y: 340, width: 300, height: 80,
  content: "Plants get their food from the soil",
  owner: "student",
  rotation: 0, z_index: 6, style: {}, meta: {}
});
await call("PUT", `/api/boards/${boardId}`, { objects });
r = await call("POST", `/api/sessions/${sessionId}/analyze`, {
  stepIndex: ev?.stepJustCompleted ? ev.nextStepIndex : 0,
  attemptText: "Plants get their food from the soil",
  activeSeconds: 90
});
assert(["error", "partial"].includes(r.json?.data?.evaluation?.status), "misconception flagged", r.json?.data?.evaluation?.status);

// 8. Hint ladder
r = await call("POST", `/api/sessions/${sessionId}/hint`, { attemptText: "Plants get their food from the soil" });
assert(r.json?.data?.hint?.level >= 1 && r.json?.data?.hint?.message, "hint generated", r.json);
console.log(`   hint level ${r.json?.data?.hint?.level}: ${r.json?.data?.hint?.title}`);

// 9. Complete all remaining steps with correct content.
// A full, explained answer so BOTH the demo tutor and a real AI model
// (which evaluates meaning, not keywords) accept every step.
const RICH_ANSWER =
  "Sunlight is absorbed by chlorophyll in the chloroplast. Water is split (photolysis), which releases oxygen. The light reactions make ATP and NADPH. In the Calvin cycle, CO2 is fixed by Rubisco into 3-phosphoglycerate, which is reduced to G3P using ATP and NADPH. G3P is used to build glucose, and RuBP is regenerated so the cycle continues. The overall balanced equation is 6CO2 + 6H2O + light energy -> C6H12O6 + 6O2. Light energy becomes chemical energy: photons excite electrons in chlorophyll, driving ATP and NADPH production, and that energy is stored in the chemical bonds of glucose. Photosynthesis is also primary production: it forms the base of almost all food chains and drives the global carbon cycle by removing CO2 from the atmosphere and releasing oxygen.";
const totalSteps = rec.session.analysis.steps.length;
let allDone = false;
const extra = {}; // per-step corrections learned from the AI's own feedback
const done = new Set();
// Real AI models evaluate meaning and can be stricter on a given call, so
// give every step up to 4 explained attempts until the server reports done.
for (let pass = 0; pass < 4 && !allDone; pass++) {
  for (let i = 0; i < totalSteps; i++) {
    if (done.has(i)) continue;
    const step = rec.session.analysis.steps[i];
    const attempt = `${RICH_ANSWER} ${extra[i] || ""} Specifically for "${step.title}": ${step.instruction} The key ideas — ${step.expectedConcepts.join(", ")} — are all part of this process.`;
    r = await call("POST", `/api/sessions/${sessionId}/analyze`, {
      stepIndex: i,
      attemptText: attempt,
      activeSeconds: 120 + i * 30
    });
    const evd = r.json?.data;
    if (evd?.stepJustCompleted) done.add(i);
    allDone = evd?.allStepsDone === true;
    if (allDone) break;
    // Learn from the AI like a student would: fold its missing-elements and
    // next-action into the following attempt for this step.
    const ev = evd?.evaluation;
    if (ev && ev.status !== "correct") {
      extra[i] = `Additionally: ${(ev.missingElements || []).join("; ")}. ${ev.nextAction || ""}`;
    }
    // Stay under free-tier rate limits between AI calls.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}
assert(allDone === true, "all steps completed", r.json?.data);

// 10. Finish -> report + journey (retry: free-tier Groq can transiently fail)
r = await call("POST", `/api/sessions/${sessionId}/complete`, { activeSeconds: 300 });
for (let attempt = 0; r.json?.error && attempt < 3; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
  r = await call("POST", `/api/sessions/${sessionId}/complete`, { activeSeconds: 300 });
}
assert(r.json?.data?.report?.statusLabel, "final report generated", Object.keys(r.json?.data ?? {}));
assert(r.json?.data?.journey, "journey updated");
console.log(`   report: "${r.json?.data?.report?.statusLabel}" — concepts explored: ${r.json?.data?.report?.conceptsExplored}`);

// 11. Idempotent report
r = await call("POST", `/api/sessions/${sessionId}/complete`, { activeSeconds: 300 });
assert(r.json?.data?.alreadyExisted === true, "report generation idempotent", r.json?.data?.alreadyExisted);

// 12. Report fetch + journey fetch
r = await call("GET", `/api/reports/${sessionId}`);
assert(r.json?.data?.report?.sessionId === String(sessionId), "GET report");
r = await call("GET", "/api/journey");
assert(r.json?.data?.journey?.concepts?.length > 0, "journey has concepts", r.json?.data?.journey?.stats);

// 13. Ownership isolation: second user cannot read first user's board
const savedCookie = cookie;
r = await call("POST", "/api/auth/signup", { email: `other${Date.now()}@example.com`, password: "password123" });
r = await call("GET", `/api/boards/${boardId}`);
assert(r.status === 404, "ownership check blocks other users", r.status);
cookie = savedCookie;

// 14. Unauthenticated access blocked
cookie = "";
r = await call("GET", "/api/sessions");
assert(r.status === 401, "unauthenticated blocked", r.status);

console.log("\nMVP loop verification finished.");
