export default async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return json({ error: "SERVER_DATA_LAYER_NOT_CONFIGURED" }, 503);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }

  const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const company = String(body.company || "").trim();
  const problem = String(body.problem || "").trim();
  if (!company || !problem) return json({ error: "COMPANY_AND_PROBLEM_REQUIRED" }, 422);

  const c = {
    company,
    industry: String(body.industry || "Other"),
    revenue: n(body.revenue),
    team: n(body.team),
    problem,
    hours: n(body.hours),
    cost: n(body.cost),
    affected: n(body.affected),
    error: Math.min(100, Math.max(0, n(body.error))),
    tools: String(body.tools || "").trim(),
    process: String(body.process || "").trim()
  };

  const auto = Math.min(.6, Math.max(.15, .25 + (c.hours > 100 ? .2 : 0) + (c.error > 15 ? .1 : 0)));
  const hs = c.hours * auto;
  const cs = c.cost * auto;
  const ro = c.affected * Math.min(.2, Math.max(.03, c.error / 100 * .5 + .03));
  const score = Math.min(99, Math.round(35 + Math.min(25, c.hours / 8) + Math.min(20, c.error) + Math.min(15, c.affected ? 10 : 0) + Math.min(10, c.team / 5)));
  const diagnosis = {
    auto, hs, cs, ro, score,
    severity: score >= 80 ? "CRITICAL" : score >= 65 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
    priority: c.hours >= 40 ? "TIME / WORKFLOW BOTTLENECK" : c.affected ? "REVENUE LEAKAGE" : "MANUAL PROCESS / AUTOMATION"
  };
  const caseId = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  const actionPlan = [
    { priority: "P0", title: "Instrument the current workflow", detail: "Capture baseline volume, cycle time, manual touches and rework for 7 days." },
    { priority: "P1", title: "Automate the highest-repeat step", detail: "Use AI classification/drafting with human approval at material actions." },
    { priority: "P2", title: "Measure the result", detail: "Compare actual hours, cost, volume and revenue impact against baseline." }
  ];

  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/create_business_xray_case`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ caseId, input: c, diagnosis, actionPlan })
  });

  if (!rpc.ok) {
    return json({ error: "CASE_PERSIST_FAILED", detail: await rpc.text() }, 502);
  }

  return json({ caseId, input: c, diagnosis, actionPlan, state: "DIAGNOSIS_READY" });
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
