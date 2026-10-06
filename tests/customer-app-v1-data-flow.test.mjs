import assert from "node:assert/strict";
import test from "node:test";
import { signTenantContext } from "../phase2/auth/tenant-context.mjs";
import diagnosisIntake from "../netlify/functions/diagnosis-intake.mjs";
import diagnosisPortal from "../netlify/functions/diagnosis-portal.mjs";
import workflowStart from "../netlify/functions/workflow-start.mjs";
import workflowStatus from "../netlify/functions/workflow-status.mjs";
import outcomeSubmit from "../netlify/functions/outcome-submit.mjs";
import billingStatus from "../netlify/functions/billing-status.mjs";

const URL="https://test.supabase.local", TENANT="tenant-v1", USER="user-v1", REPORT="report-v1", WORKFLOW="workflow-v1", TOKEN="auth-token", SECRET="test-tenant-secret";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const req=(method,url,body=null,headers={})=>new Request("https://aimpact.local"+url,{method,headers:{"content-type":"application/json",...headers},body:body===null?undefined:JSON.stringify(body)});

function env(){Object.assign(process.env,{SUPABASE_URL:URL,SUPABASE_ANON_KEY:"anon",SUPABASE_SERVICE_ROLE_KEY:"service",TENANT_CONTEXT_HMAC_SECRET:SECRET,DIAGNOSIS_INGEST_ENABLED:"true",DIAGNOSIS_PORTAL_ENABLED:"true",WORKFLOW_PORTAL_ENABLED:"true",BILLING_TEST_ENABLED:"true"});}

test("Customer App V1 seven-stage data flow executes through the real handlers",async()=>{
  env();
  const original=global.fetch,calls=[]; let workflowCreated=false,outcomeCreated=false;
  global.fetch=async(url,options={})=>{
    const u=String(url); calls.push({url:u,method:options.method||"GET"});
    if(u.endsWith("/auth/v1/user")) return json({id:USER});
    if(u.includes("/rest/v1/tenant_memberships")) return json([{tenant_id:TENANT,user_id:USER,role:"owner",status:"active"}]);
    if(u.includes("/rest/v1/rpc/create_diagnosis_intake_atomic")) return json({submission_id:"submission-v1",job_id:"job-v1",queued:true,duplicate:false});
    if(u.includes("/rest/v1/diagnosis_reports")) return json([{id:REPORT,tenant_id:TENANT,report_status:"APPROVED",problem_category:"Revenue Operations",problem_statement:"Manual lead qualification bottleneck",solution_candidates:[{name:"Verified workflow candidate"}],workflow_recommendation:{name:"Lead Qualification Workflow"},evidence:[{source:"approved-test-evidence"}],confidence:0.91}]);
    if(u.includes("/rest/v1/diagnosis_reviews")) return json([{id:"review-v1",report_id:REPORT,decision:"APPROVED",created_at:"2026-10-05T00:00:00Z"}]);
    if(u.includes("/rest/v1/tenant_entitlements")) return json([{tenant_id:TENANT,plan:"START",status:"ACTIVE",current_period_end:"2026-11-05T00:00:00Z"}]);
    if(u.includes("/rest/v1/workflow_runs")&&options.method==="POST"){workflowCreated=true;return json([{id:WORKFLOW,tenant_id:TENANT,report_id:REPORT,status:"QUEUED",workflow_name:"Lead Qualification Workflow",current_step:"DISCOVER"}],201);}
    if(u.includes("/rest/v1/workflow_runs")) return json(workflowCreated?[{id:WORKFLOW,report_id:REPORT,status:"QUEUED",workflow_name:"Lead Qualification Workflow",current_step:"DISCOVER"}]:[]);
    if(u.includes("/rest/v1/outcome_metrics")&&options.method==="POST"){outcomeCreated=true;return json([{id:"outcome-v1",workflow_id:WORKFLOW,metric_name:"qualified_leads",baseline_value:10,current_value:15,unit:"count",verified:false}],201);}
    if(u.includes("/rest/v1/outcome_metrics")) return json(outcomeCreated?[{id:"outcome-v1",workflow_id:WORKFLOW,metric_name:"qualified_leads",baseline_value:10,current_value:15,unit:"count",verified:false}]:[]);
    throw new Error("UNEXPECTED_TEST_REQUEST "+u);
  };
  try{
    const context=signTenantContext({tenant_id:TENANT,subject:USER,exp:Math.floor(Date.now()/1000)+300},SECRET);
    const diagnosis=await diagnosisIntake(req("POST","/.netlify/functions/diagnosis-intake",{schema_version:"1.0.0",answers:{outcome:"Increase qualified leads",current_workflow:"Manual",bottleneck:"Lead qualification",systems:"CRM",success_measure:"Qualified leads"}},{"X-AIMPACT-Tenant-Context":context,"Idempotency-Key":"loop-v1"}));
    assert.equal(diagnosis.status,202); assert.equal((await diagnosis.json()).queued,true);
    const portal=await diagnosisPortal(req("GET","/.netlify/functions/diagnosis-portal?tenant_id="+TENANT,null,{Authorization:"Bearer "+TOKEN}));
    assert.equal(portal.status,200); const pd=await portal.json(); assert.equal(pd.reports[0].id,REPORT); assert.equal(pd.reports[0].review.decision,"APPROVED");
    const workflow=await workflowStart(req("POST","/.netlify/functions/workflow-start",{tenant_id:TENANT,report_id:REPORT},{Authorization:"Bearer "+TOKEN}));
    assert.equal(workflow.status,201); assert.equal((await workflow.json()).workflow.id,WORKFLOW); assert.equal(workflowCreated,true);
    const status=await workflowStatus(req("GET","/.netlify/functions/workflow-status?tenant_id="+TENANT,null,{Authorization:"Bearer "+TOKEN}));
    assert.equal(status.status,200); assert.equal((await status.json()).workflows[0].id,WORKFLOW);
    const outcome=await outcomeSubmit(req("POST","/.netlify/functions/outcome-submit",{tenant_id:TENANT,workflow_id:WORKFLOW,metric_name:"qualified_leads",baseline_value:10,current_value:15,unit:"count"},{Authorization:"Bearer "+TOKEN}));
    assert.equal(outcome.status,201); assert.equal((await outcome.json()).outcome.verified,false); assert.equal(outcomeCreated,true);
    const billing=await billingStatus(req("GET","/.netlify/functions/billing-status?tenant_id="+TENANT,null,{Authorization:"Bearer "+TOKEN}));
    assert.equal(billing.status,200); const bd=await billing.json(); assert.equal(bd.entitlement.status,"ACTIVE"); assert.equal(bd.entitlement.plan,"START");
    assert.ok(calls.some(x=>x.url.includes("create_diagnosis_intake_atomic")));
    assert.ok(calls.some(x=>x.url.includes("diagnosis_reports")));
    assert.ok(calls.some(x=>x.url.includes("workflow_runs")&&x.method==="POST"));
    assert.ok(calls.some(x=>x.url.includes("outcome_metrics")&&x.method==="POST"));
  } finally {global.fetch=original;}
});

test("Customer App V1 remains fail-closed when billing is disabled",async()=>{
  env(); const original=global.fetch; global.fetch=async()=>json({id:USER});
  try{process.env.BILLING_TEST_ENABLED="false"; const r=await billingStatus(req("GET","/.netlify/functions/billing-status?tenant_id="+TENANT,null,{Authorization:"Bearer "+TOKEN})); assert.equal(r.status,503); assert.equal((await r.json()).code,"BILLING_DISABLED");}
  finally{process.env.BILLING_TEST_ENABLED="true";global.fetch=original;}
});
