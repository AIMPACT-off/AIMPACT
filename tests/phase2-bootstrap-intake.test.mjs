import test from "node:test";
import assert from "node:assert/strict";
import tenantBootstrap from "../netlify/functions/tenant-bootstrap.mjs";
import diagnosisIntake from "../netlify/functions/diagnosis-intake.mjs";
import { signTenantContext } from "../phase2/auth/tenant-context.mjs";

const originalFetch=globalThis.fetch;
const envKeys=["SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","DIAGNOSIS_INGEST_ENABLED","TENANT_CONTEXT_HMAC_SECRET","TENANT_BOOTSTRAP_ENABLED"];
const originalEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
function restore(){
  globalThis.fetch=originalFetch;
  for(const key of envKeys){
    if(originalEnv[key]===undefined)delete process.env[key];
    else process.env[key]=originalEnv[key];
  }
}
function configure(){
  process.env.SUPABASE_URL="https://test-project.supabase.co";
  process.env.SUPABASE_ANON_KEY="anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY="service-test-key";
  process.env.TENANT_BOOTSTRAP_ENABLED="true";
}

test("tenant bootstrap is disabled unless explicitly enabled",async()=>{
  process.env.TENANT_BOOTSTRAP_ENABLED="false";
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error("must not call");};
  try{
    const response=await tenantBootstrap(new Request("https://aimpact.test/.netlify/functions/tenant-bootstrap",{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"Acme",slug:"acme-co"})
    }));
    assert.equal(response.status,503);
    assert.equal(calls,0);
  }finally{restore();}
});

test("tenant bootstrap rejects missing bearer JWT before contacting Supabase",async()=>{
  configure();
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error("must not call");};
  try{
    const response=await tenantBootstrap(new Request("https://aimpact.test/.netlify/functions/tenant-bootstrap",{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"Acme",slug:"acme-co"})
    }));
    assert.equal(response.status,401);
    assert.equal(calls,0);
  }finally{restore();}
});

test("tenant bootstrap derives owner ID from verified Auth response, not request body",async()=>{
  configure();
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith("/auth/v1/user")){
      assert.equal(options.headers.Authorization,"Bearer valid.jwt.token");
      return new Response(JSON.stringify({id:"auth-user-verified",email_confirmed_at:"2026-10-04T00:00:00Z"}),{status:200});
    }
    return new Response(JSON.stringify({tenant_id:"tenant-created",owner_user_id:"auth-user-verified",created:true}),{status:200});
  };
  try{
    const response=await tenantBootstrap(new Request("https://aimpact.test/.netlify/functions/tenant-bootstrap",{
      method:"POST",
      headers:{"content-type":"application/json",authorization:"Bearer valid.jwt.token"},
      body:JSON.stringify({name:"Acme Inc",slug:"acme-inc",owner_user_id:"attacker-controlled"})
    }));
    const data=await response.json();
    assert.equal(response.status,201);
    assert.equal(data.tenant_id,"tenant-created");
    assert.equal(calls.length,2);
    const rpcBody=JSON.parse(calls[1].options.body);
    assert.equal(rpcBody.p_owner_user_id,"auth-user-verified");
    assert.equal("owner_user_id" in rpcBody,false);
  }finally{restore();}
});

test("tenant bootstrap blocks unconfirmed Auth identities",async()=>{
  configure();
  let rpcCalls=0;
  globalThis.fetch=async(url)=>{
    if(String(url).endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:"unconfirmed-user"}),{status:200});
    rpcCalls++;
    return new Response("{}",{status:200});
  };
  try{
    const response=await tenantBootstrap(new Request("https://aimpact.test/.netlify/functions/tenant-bootstrap",{
      method:"POST",headers:{"content-type":"application/json",authorization:"Bearer valid.jwt.token"},
      body:JSON.stringify({name:"Acme",slug:"acme-co"})
    }));
    assert.equal(response.status,403);
    assert.equal(rpcCalls,0);
  }finally{restore();}
});

test("diagnosis intake submits once to atomic RPC and never returns raw answers",async()=>{
  configure();
  process.env.DIAGNOSIS_INGEST_ENABLED="true";
  process.env.TENANT_CONTEXT_HMAC_SECRET="test-hmac-secret";
  const token=signTenantContext({tenant_id:"tenant-a",subject:"auth-user-a",exp:Math.floor(Date.now()/1000)+300},process.env.TENANT_CONTEXT_HMAC_SECRET);
  let call;
  globalThis.fetch=async(url,options)=>{
    call={url:String(url),options};
    if(String(url).includes("/tenant_memberships?")){
      return new Response(JSON.stringify([{tenant_id:"tenant-a",user_id:"auth-user-a",role:"owner"}]),{status:200});
    }
    return new Response(JSON.stringify({submission_id:"submission-1",job_id:"job-1",duplicate:false,queued:true}),{status:200});
  };
  try{
    const answers={company:"Acme",problem:"Manual reporting"};
    const response=await diagnosisIntake(new Request("https://aimpact.test/.netlify/functions/diagnosis-intake",{
      method:"POST",
      headers:{"content-type":"application/json","x-aimpact-tenant-context":token,"idempotency-key":"phase2-idempotency-0001"},
      body:JSON.stringify({schema_version:"1.0.0",answers})
    }));
    const data=await response.json();
    assert.equal(response.status,202);
    assert.equal(data.queued,true);
    assert.equal(data.submission_id,"submission-1");
    assert.equal(data.job_id,"job-1");
    assert.equal("answers" in data,false);
    assert.equal(call.url,"https://test-project.supabase.co/rest/v1/rpc/create_diagnosis_intake_atomic");
    const rpc=JSON.parse(call.options.body);
    assert.equal(rpc.p_tenant_id,"tenant-a");
    assert.equal(rpc.p_submitted_by,"auth-user-a");
    assert.deepEqual(rpc.p_raw_answers,answers);
    assert.equal(rpc.p_idempotency_key,"phase2-idempotency-0001");
  }finally{restore();}
});
