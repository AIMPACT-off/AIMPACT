import test from "node:test";
import assert from "node:assert/strict";
import intake from "../netlify/functions/diagnosis-intake.mjs";
import { signTenantContext } from "../phase2/auth/tenant-context.mjs";

const originalFetch=globalThis.fetch;
const envKeys=["DIAGNOSIS_INGEST_ENABLED","TENANT_CONTEXT_HMAC_SECRET","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"];
const originalEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
const secret="test-tenant-context-secret";
function setup(){
  process.env.DIAGNOSIS_INGEST_ENABLED="true";
  process.env.TENANT_CONTEXT_HMAC_SECRET=secret;
  process.env.SUPABASE_URL="https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY="service-test";
}
function restore(){
  globalThis.fetch=originalFetch;
  for(const key of envKeys){
    if(originalEnv[key]===undefined)delete process.env[key];
    else process.env[key]=originalEnv[key];
  }
}
function request(){
  const token=signTenantContext({tenant_id:"tenant-1",subject:"user-1",exp:Math.floor(Date.now()/1000)+300},secret);
  return new Request("https://aimpact.test/.netlify/functions/diagnosis-intake",{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-aimpact-tenant-context":token,
      "idempotency-key":"diagnosis-test-key-0001"
    },
    body:JSON.stringify({
      schema_version:"1.0.0",
      answers:{outcome:"Reduce manual work"}
    })
  });
}

test("diagnosis intake blocks a revoked tenant membership before writing",async()=>{
  setup();
  let rpcCalls=0;
  globalThis.fetch=async url=>{
    if(String(url).includes("/tenant_memberships?"))return new Response("[]",{status:200});
    if(String(url).includes("/rpc/"))rpcCalls++;
    throw new Error("unexpected request");
  };
  try{
    const response=await intake(request());
    const data=await response.json();
    assert.equal(response.status,403);
    assert.equal(data.code,"ACTIVE_TENANT_MEMBERSHIP_REQUIRED");
    assert.equal(rpcCalls,0);
  }finally{restore();}
});

test("diagnosis intake revalidates membership before atomic tenant-scoped insert",async()=>{
  setup();
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push(String(url));
    if(String(url).includes("/tenant_memberships?")){
      assert.match(String(url),/tenant_id=eq.tenant-1/);
      assert.match(String(url),/user_id=eq.user-1/);
      assert.match(String(url),/status=eq.active/);
      return new Response(JSON.stringify([{tenant_id:"tenant-1",user_id:"user-1",role:"owner"}]),{status:200});
    }
    assert.match(String(url),/rpc\/create_diagnosis_intake_atomic/);
    const payload=JSON.parse(options.body);
    assert.equal(payload.p_tenant_id,"tenant-1");
    assert.equal(payload.p_submitted_by,"user-1");
    return new Response(JSON.stringify({submission_id:"submission-1",job_id:"job-1",queued:true,duplicate:false}),{status:200});
  };
  try{
    const response=await intake(request());
    const data=await response.json();
    assert.equal(response.status,202);
    assert.equal(data.queued,true);
    assert.equal(data.submission_id,"submission-1");
    assert.equal(calls.length,2);
    assert.ok(calls[0].includes("/tenant_memberships?"));
    assert.ok(calls[1].includes("/rpc/"));
  }finally{restore();}
});
