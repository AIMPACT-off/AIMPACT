import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handler } from "../netlify/functions/autonomous-github-webhook.mjs";

const body=JSON.stringify({action:"completed",after:"abc",repository:{full_name:"AIMPACT-off/AIMPACT"},workflow_run:{id:123,head_sha:"abc"}});
const secret="test-secret";
const sig="sha256="+crypto.createHmac("sha256",secret).update(body).digest("hex");\nconst originalFetch=global.fetch;\nconst rpcCalls=[];\nglobal.fetch=async (url,opts)=>{ rpcCalls.push({url,body:opts?.body}); return {ok:true,json:async()=>({ok:true,duplicate:false})}; };

test("autonomous webhook rejects invalid signature",async()=>{
  const old=process.env.AIMPACT_GITHUB_WEBHOOK_SECRET; process.env.AIMPACT_GITHUB_WEBHOOK_SECRET=secret;
  const r=await handler({httpMethod:"POST",body,headers:{"x-hub-signature-256":"sha256=bad","x-github-delivery":"evt-1","x-github-event":"workflow_run"}});
  if(old===undefined) delete process.env.AIMPACT_GITHUB_WEBHOOK_SECRET; else process.env.AIMPACT_GITHUB_WEBHOOK_SECRET=old;
  assert.equal(r.statusCode,401);
});
test("autonomous webhook accepts signed event without exposing secret",async()=>{
  const old=process.env.AIMPACT_GITHUB_WEBHOOK_SECRET; process.env.AIMPACT_GITHUB_WEBHOOK_SECRET=secret;
  const r=await handler({httpMethod:"POST",body,headers:{"x-hub-signature-256":sig,"x-github-delivery":"evt-1","x-github-event":"workflow_run"}});
  if(old===undefined) delete process.env.AIMPACT_GITHUB_WEBHOOK_SECRET; else process.env.AIMPACT_GITHUB_WEBHOOK_SECRET=old;
  assert.equal(r.statusCode,202);
  const out=JSON.parse(r.body); assert.equal(out.accepted,true); assert.equal(out.event.event_id,"evt-1"); assert.equal(out.event.commit_sha,"abc");
  assert.equal(r.body.includes(secret),false);\n  assert.equal(rpcCalls.length,1);
});
\nprocess.on("exit",()=>{ global.fetch=originalFetch; });\n