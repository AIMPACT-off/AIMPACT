#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRuntimePersistenceBridge } from "../phase2/control-plane/runtime-persistence.mjs";
import { createActionLedgerAdapter } from "../phase2/control-plane/action-execution-ledger.mjs";
import { createLearningAdapter } from "../phase2/control-plane/learning-loop.mjs";

const dbUrl=process.env.TEST_DATABASE_URL;
if(!dbUrl || process.env.TEST_DB_DISPOSABLE!=="YES") throw new Error("FAIL-CLOSED: disposable TEST database required");
const u=new URL(dbUrl);
if(!["postgres:","postgresql:"].includes(u.protocol) || /(prod|production|live)/i.test(u.hostname+u.pathname)) throw new Error("FAIL-CLOSED: unsafe database target");
const runId=crypto.randomUUID(), A=crypto.randomUUID(), successEvent=crypto.randomUUID(), failureEvent=crypto.randomUUID();
const successCorrelation=crypto.randomUUID(), successCausation=crypto.randomUUID();
const failureCorrelation=crypto.randomUUID(), failureCausation=crypto.randomUUID();
const successKey="true-loop-success-"+runId, failureKey="true-loop-failure-"+runId;
const conflictExecution=crypto.randomUUID();
const evidenceDir=process.env.TEST_EVIDENCE_DIR||"artifacts/phase2-test-evidence";
fs.mkdirSync(evidenceDir,{recursive:true});

function q(v){if(v===null||v===undefined)return"null";if(typeof v==="boolean")return v?"true":"false";if(typeof v==="number")return String(v);if(typeof v==="object")return"'"+JSON.stringify(v).replaceAll("'","''")+"'";return"'"+String(v).replaceAll("'","''")+"'";}
function sql(name,args){return"select public."+name+"("+args.map(q).join(",")+")::text";}
function psql(s,label){const r=spawnSync("psql",[dbUrl,"-X","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-c",s],{encoding:"utf8",env:{...process.env,PGPASSWORD:process.env.PGPASSWORD||""}});if(r.error)throw r.error;if(r.status!==0)throw new Error(label+": "+(r.stderr||r.stdout||"psql failed").replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[REDACTED_DB_URL]"));return r.stdout.trim();}
function client(){return{async rpc(name,args){try{const raw=psql(sql(name,Object.values(args)),"RPC "+name);let data;try{data=JSON.parse(raw)}catch{data=raw}return{data,error:null}}catch(error){return{data:null,error}}}};}
const supabase=client(), ledgerBase=createActionLedgerAdapter(supabase), learningBase=createLearningAdapter(supabase);
const order=[];
const persistence={
 async getLifecycleState(t){const r=psql("select to_jsonb(s)::text from public.customer_lifecycle_state s where tenant_id="+q(t),"lifecycle read");return r?JSON.parse(r):null;},
 async getEventByIdempotencyKey(t,k){const r=psql("select to_jsonb(e)::text from public.control_plane_events e where tenant_id="+q(t)+" and idempotency_key="+q(k),"event read");return r?JSON.parse(r):null;},
 async applyLifecycleEvent(e,v){return JSON.parse(psql(sql("apply_lifecycle_event_atomic",[e.event_id,e.tenant_id,e.event_type,e.idempotency_key,v,e.sequence,e.actor_type||"system",e.actor_id||null,e.correlation_id||null,e.causation_id||null,e.schema_version||"1",e.payload||{},e.occurred_at]),"lifecycle RPC"));}
};
let learningFailureCalls=0;
const learning={async record(s){order.push("learning");return learningBase.record(s);}};
const bridge=createRuntimePersistenceBridge({
 persistence,
 actionLedger:{async record(e){order.push("ledger");return ledgerBase.record(e);}},
 learning,
 handlers:{START_WORKFLOW:async()=>{order.push("dispatch");return{workflow_id:"TEST-"+runId};}}
});
const evidence={status:"PASS",run_id:runId,tenant_id:A,success_path:{},ledger_failure_path:{}};
try{
 psql("insert into public.tenants (id,name,slug,created_by) values ("+q(A)+","+q("TRUE Closed Loop Test")+" ,"+q("true-closed-loop-"+runId)+",null); insert into public.customer_lifecycle_state (tenant_id,state,version) values ("+q(A)+","+"'DIAGNOSIS'"+",2);","create true-loop fixture");
 const ev={event_id:successEvent,event_type:"DIAGNOSIS_REVIEW_APPROVED",tenant_id:A,occurred_at:new Date().toISOString(),schema_version:"1",sequence:3,idempotency_key:successKey,actor_type:"system",correlation_id:successCorrelation,causation_id:successCausation,payload:{source:"true-closed-loop"}};
 const result=await bridge.process(ev,{evidence:{authenticated:true,active_membership:true,approved_report:true,approved_review:true,active_entitlement:true,lifecycle_ready:true}},{source:"true-closed-loop"});
 if(!result.ok||result.status!=="EXECUTED")throw new Error("true loop did not execute");
 if(order.join(">")!=="dispatch>ledger>learning")throw new Error("order="+order.join(">"));
 if(!result.ledger?.execution_id)throw new Error("missing ledger execution_id");
 if(result.learning?.execution_id!==result.ledger.execution_id)throw new Error("learning execution mismatch");
 if(result.learning?.signal_type!=="ACTION_OUTCOME"||result.learning?.outcome!=="POSITIVE")throw new Error("bad learning signal");
 if(result.learning?.correlation_id!==successCorrelation||result.learning?.causation_id!==successCausation)throw new Error("correlation/causation lost");
 const er=JSON.parse(psql("select to_jsonb(e)::text from public.control_plane_events e where event_id="+q(successEvent),"event evidence"));
 const lr=JSON.parse(psql("select to_jsonb(e)::text from public.control_plane_action_executions e where event_id="+q(successEvent),"ledger evidence"));
 const sr=JSON.parse(psql("select to_jsonb(s)::text from public.control_plane_learning_signals s where event_id="+q(successEvent),"learning evidence"));
 if(lr.execution_id!==result.ledger.execution_id||sr.execution_id!==lr.execution_id)throw new Error("DB execution linkage mismatch");
 if(sr.signal_type!=="ACTION_OUTCOME"||sr.outcome!=="POSITIVE")throw new Error("DB learning mismatch");
 if(er.correlation_id!==successCorrelation||er.causation_id!==successCausation)throw new Error("DB correlation mismatch");
 evidence.success_path={status:"PASS",order:[...order],execution_id:result.ledger.execution_id,learning_signal_type:result.learning.signal_type,learning_outcome:result.learning.outcome,learning_execution_id:result.learning.execution_id,correlation_id:successCorrelation,causation_id:successCausation,db_event:true,db_ledger:true,db_learning:true};

 psql(sql("record_action_execution_atomic",[conflictExecution,A,successEvent,"START_WORKFLOW","EXECUTED",failureKey,1,"v1",{status:"EXECUTED",action:"START_WORKFLOW",result:{conflict:true}},null,null,failureCorrelation,failureCausation,new Date().toISOString(),new Date().toISOString()]),"ledger conflict fixture");
 const failureBridge=createRuntimePersistenceBridge({
  persistence,
  actionLedger:{async record(e){order.push("ledger_failure");return ledgerBase.record(e);}},
  learning:{async record(){learningFailureCalls++;throw new Error("LEARNING_SHOULD_NOT_BE_CALLED");}},
  actionMap:{ENTITLEMENT_ACTIVE:"START_WORKFLOW"},
  handlers:{START_WORKFLOW:async()=>({workflow_id:"not-used"})}
 });
 let failureError=null;
 try{await failureBridge.process({event_id:failureEvent,event_type:"ENTITLEMENT_ACTIVE",tenant_id:A,occurred_at:new Date().toISOString(),schema_version:"1",sequence:4,idempotency_key:failureKey,actor_type:"system",correlation_id:failureCorrelation,causation_id:failureCausation,payload:{source:"ledger-failure"}},{evidence:{authenticated:true,active_membership:true,approved_report:true,approved_review:true,active_entitlement:true,lifecycle_ready:true}},{source:"ledger-failure"});}catch(e){failureError=String(e.message||e);}
 if(!failureError||!/23505|duplicate|unique/i.test(failureError))throw new Error("expected ledger 23505 failure not observed: "+failureError);
 const failureRows=Number(psql("select count(*) from public.control_plane_learning_signals where event_id="+q(failureEvent),"failure learning rows"));
 if(failureRows!==0||learningFailureCalls!==0)throw new Error("learning was called after ledger failure");
 evidence.ledger_failure_path={status:"PASS",ledger_error_observed:failureError,learning_calls:learningFailureCalls,learning_rows:failureRows,learning_blocked:true};
 evidence.final_state=psql("select state||'|'||version from public.customer_lifecycle_state where tenant_id="+q(A),"final state");
}catch(e){evidence.status="FAIL";evidence.error=String(e.message||e);process.exitCode=1;}
finally{
 try{psql("delete from public.control_plane_learning_signals where event_id in ("+q(successEvent)+","+q(failureEvent)+");delete from public.control_plane_action_executions where event_id in ("+q(successEvent)+","+q(failureEvent)+") or idempotency_key="+q(failureKey)+";update public.customer_lifecycle_state set last_event_id=null where tenant_id="+q(A)+";delete from public.control_plane_events where event_id in ("+q(successEvent)+","+q(failureEvent)+");delete from public.customer_lifecycle_state where tenant_id="+q(A)+";delete from public.tenants where id="+q(A)+";","true-loop cleanup");evidence.fixture_cleanup="PASS";}catch(e){evidence.fixture_cleanup="FAILED: "+String(e.message||e);process.exitCode=1;}
 const out=evidenceDir+"/true-closed-loop-"+runId+".json";fs.writeFileSync(out,JSON.stringify(evidence,null,2)+"\n",{mode:0o600});process.stdout.write(JSON.stringify(evidence,null,2)+"\n");
}
