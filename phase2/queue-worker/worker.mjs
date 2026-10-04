#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
const LEASE_SECONDS = Number(process.env.WORKER_LEASE_SECONDS || 300);
const MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS || 5);
const ONCE = process.env.WORKER_ONCE === "true";

if (!DATABASE_URL) {
  console.error("FAIL-CLOSED: DATABASE_URL is required.");
  process.exit(78);
}
if (!Number.isInteger(MAX_ATTEMPTS) || MAX_ATTEMPTS < 1 || MAX_ATTEMPTS > 20) {
  console.error("FAIL-CLOSED: WORKER_MAX_ATTEMPTS must be 1..20.");
  process.exit(78);
}

function psql(sql) {
  return new Promise((resolve, reject) => {
    const p = spawn("psql", [DATABASE_URL, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], {stdio:["ignore","pipe","pipe"]});
    let out="", err="";
    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);
    p.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(err || "psql failed")));
  });
}

async function claim() {
  const sql = "begin; with candidate as (" +
    "select id from public.diagnosis_jobs " +
    "where status in ('QUEUED','RETRY') " +
    "and (lease_until is null or lease_until < now()) " +
    "and coalesce(attempt_count,0) < " + MAX_ATTEMPTS + " " +
    "order by created_at for update skip locked limit 1" +
    ") update public.diagnosis_jobs j set status='PROCESSING', " +
    "lease_until=now() + interval '" + LEASE_SECONDS + " seconds', " +
    "started_at=coalesce(started_at,now()), attempt_count=coalesce(attempt_count,0)+1, updated_at=now() " +
    "from candidate where j.id=candidate.id returning j.id::text; commit;";
  const out=await psql(sql);
  return out.split("\n").filter(Boolean).at(-1)||null;
}

async function failJob(id,message) {
  const safe=String(message).replaceAll("'","''").slice(0,2000);
  await psql("update public.diagnosis_jobs set status=case when coalesce(attempt_count,0) >= " +
    MAX_ATTEMPTS + " then 'FAILED' else 'RETRY' end, error_message='" + safe +
    "', lease_until=null, updated_at=now() where id='" + id + "'::uuid;");
}

async function processJob(id) {
  await failJob(id,"WORKER_PROVIDER_NOT_CONFIGURED");
  return {id,result:"RETRY_OR_FAILED",execution_id:randomUUID()};
}

async function main() {
  while(true) {
    try {
      const id=await claim();
      if(id) console.log(JSON.stringify(await processJob(id)));
      else if(ONCE) return;
    } catch(error) {
      console.error("WORKER_ERROR",error.message);
      if(ONCE) process.exitCode=1;
    }
    if(ONCE) return;
    await new Promise(r=>setTimeout(r,POLL_MS));
  }
}
main().catch(error=>{console.error("FAIL-CLOSED",error);process.exit(1);});
