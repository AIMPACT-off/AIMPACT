#!/usr/bin/env node
import { spawn } from "node:child_process";
const DATABASE_URL=process.env.DATABASE_URL, POLL_MS=Number(process.env.WORKER_POLL_MS||2000),
  LEASE_SECONDS=Number(process.env.WORKER_LEASE_SECONDS||300), ONCE=process.env.WORKER_ONCE==="true",
  WORKER_ID=process.env.WORKER_ID||"aimpact-worker";
if(!DATABASE_URL){console.error("FAIL-CLOSED: DATABASE_URL is required.");process.exit(78);}
function psql(sql){return new Promise((resolve,reject)=>{const p=spawn("psql",[DATABASE_URL,"-X","-v","ON_ERROR_STOP=1","-At","-F","\t","-c",sql],{stdio:["ignore","pipe","pipe"]});let out="",err="";p.stdout.on("data",d=>out+=d);p.stderr.on("data",d=>err+=d);p.on("close",c=>c===0?resolve(out.trim()):reject(new Error(err||"psql failed")));});}
async function claim(){const q="select id::text,tenant_id::text from public.claim_diagnosis_jobs('"+WORKER_ID.replaceAll("'","''")+"',1,"+LEASE_SECONDS+");";const o=await psql(q);return o.split("\n").filter(Boolean)[0]?.split("\t")||null;}
async function fail(tenant,id){const q="select id::text,status,attempt_count from public.fail_diagnosis_job('"+tenant+"'::uuid,'"+id+"'::uuid,'"+WORKER_ID.replaceAll("'","''")+"','WORKER_PROVIDER_NOT_CONFIGURED','AI provider is not configured',jsonb_build_object('summary','provider configuration required'));";return psql(q);}
async function main(){while(true){try{const row=await claim();if(row){console.log(JSON.stringify({tenant_id:row[1],job_id:row[0]}));await fail(row[1],row[0]);}else if(ONCE)return;}catch(e){console.error("WORKER_ERROR",e.message);if(ONCE)process.exitCode=1;}if(ONCE)return;await new Promise(r=>setTimeout(r,POLL_MS));}}
main().catch(e=>{console.error("FAIL-CLOSED",e);process.exit(1);});
