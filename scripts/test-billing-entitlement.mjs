#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";

for (const k of ["TEST_DATABASE_URL","TEST_DB_DISPOSABLE"]) if (!process.env[k]) throw new Error("FAIL-CLOSED: "+k+" is required");
if (process.env.TEST_DB_DISPOSABLE !== "YES") throw new Error("FAIL-CLOSED: TEST_DB_DISPOSABLE=YES is required");
const db = process.env.TEST_DATABASE_URL, u = new URL(db);
if (!["postgres:","postgresql:"].includes(u.protocol)) throw new Error("FAIL-CLOSED: postgres URL required");
if (/(prod|production|live)/i.test(u.hostname+u.pathname)) throw new Error("FAIL-CLOSED: production-like target refused");
const migration="supabase/migrations/202610050001_billing_entitlement_test.sql";
if (!fs.existsSync(migration)) throw new Error("FAIL-CLOSED: missing "+migration);
function run(args,label){const r=spawnSync("psql",[db,...args],{encoding:"utf8",env:{...process.env,PGPASSWORD:process.env.PGPASSWORD||""}});if(r.error)throw r.error;if(r.status!==0)throw new Error(label+" failed: "+(r.stderr||"").replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[REDACTED_DB_URL]"));return r.stdout.trim();}
function q(sql,label){return run(["-X","-v","ON_ERROR_STOP=1","-At","-c",sql],label);}
function ok(v,m){if(!v)throw new Error("ASSERTION FAILED: "+m);}
const id=Date.now(), a="d1000000-0000-4000-8000-"+String(id).slice(-12), b="d2000000-0000-4000-8000-"+String(id+1).slice(-12), p="billing-test-"+id;
const ev=(eid,type,status)=>q("select public.process_stripe_entitlement_event('"+eid+"','"+type+"','"+a+"','START','"+status+"','cus_test_a','sub_test_a',now())",eid);
const evidence={target_host:u.hostname,checks:{},result:"FAIL"};
try{
 run(["-f",migration],"billing migration");
 q("insert into public.tenants(id,name,slug) values ('"+a+"','Billing Test A','"+p+"-a'),('"+b+"','Billing Test B','"+p+"-b')","fixtures");
 ok(ev(p+"-active","invoice.paid","paid").includes("ACTIVE"),"invoice.paid => ACTIVE");
 ok(ev(p+"-active","invoice.paid","paid").includes("duplicate"),"duplicate event is idempotent");
 ok(ev(p+"-pastdue","invoice.payment_failed","failed").includes("PAST_DUE"),"invoice.payment_failed => PAST_DUE");
 ok(ev(p+"-cancel","customer.subscription.deleted","canceled").includes("CANCELED"),"subscription.deleted => CANCELED");
 ok(q("select has_function_privilege('anon','public.process_stripe_entitlement_event(text,text,uuid,text,text,text,text,timestamptz)','execute')::text||'|'||has_function_privilege('authenticated','public.process_stripe_entitlement_event(text,text,uuid,text,text,text,text,timestamptz)','execute')::text","RPC privileges")==="false|false","browser RPC denied");
 ok(q("select count(*) from public.tenant_entitlements where tenant_id='"+b+"'","tenant B isolation")==="0","Tenant B unchanged");
 ok(q("select count(*) from public.billing_events where tenant_id='"+a+"' and event_id in ('"+p+"-active','"+p+"-pastdue','"+p+"-cancel')","ledger")==="3","three billing events recorded");
 evidence.checks={migration:"PASS",active:"PASS",duplicate_idempotency:"PASS",past_due:"PASS",canceled:"PASS",browser_rpc_denial:"PASS",tenant_isolation:"PASS",ledger:"PASS"};
 evidence.result="PASS";
}catch(e){evidence.error=String(e.message||e);process.exitCode=1}
finally{try{q("delete from public.billing_events where event_id like '"+p+"-%'; delete from public.tenant_entitlements where tenant_id in ('"+a+"','"+b+"'); delete from public.tenants where id in ('"+a+"','"+b+"')","cleanup")}catch{};console.log(JSON.stringify(evidence,null,2))}
