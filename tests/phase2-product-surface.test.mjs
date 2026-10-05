import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");

test("portal workflow/billing surfaces are wired",()=>{
  const app=read("portal/app.js");
  assert.match(app,/billing-status\?tenant_id=/);
  assert.match(app,/workflow-status\?tenant_id=/);
  assert.match(app,/workflow-start/);
  assert.match(app,/start-workflow/);
});

test("billing entitlement migration has tenant-scoped authenticated read policy",()=>{
  const sql=read("supabase/migrations/202610050001_billing_entitlement_test.sql");
  assert.match(sql,/tenant_entitlements_member_read/);
  assert.match(sql,/is_active_tenant_member\(tenant_id\)/);
  assert.match(sql,/stale/);
});

test("workflow/outcome migration enforces tenant-scoped read",()=>{
  const sql=read("supabase/migrations/202610050002_workflow_outcome_roi.sql");
  assert.match(sql,/workflow_runs_member_read/);
  assert.match(sql,/outcome_metrics_member_read/);
  assert.match(sql,/foreign key \(tenant_id, report_id\)/);
  assert.match(sql,/foreign key \(tenant_id, workflow_id\)/);
});

for (const file of [
  "netlify/functions/billing-status.mjs",
  "netlify/functions/workflow-status.mjs",
  "netlify/functions/workflow-start.mjs",
  "netlify/functions/outcome-submit.mjs"
]) test(file+" exists",()=>assert.ok(fs.existsSync(file)));


test("customer app v1 exposes the complete commercial loop",()=>{
  const html=read("portal/index.html");
  for (const view of ["overview","discover","diagnosis","reports","match","workflows","roi","billing"]) assert.match(html,new RegExp('id="'+view+'"'));
  for (const label of ["COMMAND CENTER","DISCOVER","DIAGNOSE","REPORT","MATCH","EXECUTE","MEASURE","BILLING"]) assert.match(html,new RegExp(label));
  assert.match(html,/id="diagnosisForm"/);
  assert.match(html,/id="reportsPanel"/);
  assert.match(html,/id="workflowPanel"/);
  assert.match(html,/id="billingPanel"/);
});

test("customer app v1 keeps evidence-first and fail-closed copy",()=>{
  const html=read("portal/index.html");
  assert.match(html,/Evidence before/);
  assert.match(html,/No invented metrics/);
  assert.match(html,/Production not activated/i);
  assert.match(html,/tenant boundary/i);
});