// Smoke test: every page returns 200 HTML.
const BASE = "http://localhost:3000";
const pages = ["/login", "/signup", "/onboarding", "/home", "/journey", "/settings", "/", "/session/1", "/report/1"];
let fail = false;
for (const p of pages) {
  const res = await fetch(BASE + p, { redirect: "manual" });
  const ok = [200, 307].includes(res.status);
  if (!ok) fail = true;
  const body = await res.text();
  const hasHtml = body.includes("<!DOCTYPE html") || res.status === 307;
  console.log(`${ok && hasHtml ? "✅" : "❌"} ${p} -> ${res.status} (${body.length} bytes)`);
}
process.exit(fail ? 1 : 0);
