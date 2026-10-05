import test from "node:test";
import assert from "node:assert/strict";
import { dispatchEligibleEvent } from "../phase2/control-plane/autonomous-dispatcher.mjs";

const event={event_id:"00000000-0000-4000-8000-000000000001",event_type:"DIAGNOSIS_REVIEW_APPROVED",correlation_id:"00000000-0000-4000-8000-000000000001",payload:{action:"START_WORKFLOW"}};

test("autonomous dispatcher blocks when evidence is incomplete",()=>{
 const r=dispatchEligibleEvent({event,tenantId:"tenant-a",evidence:{authenticated:true},intentId:"00000000-0000-4000-8000-000000000002",idempotencyKey:"k"});
 assert.equal(r.status,"NOT_DISPATCHED"); assert.equal(r.code,"EVIDENCE_MISSING");
});
test("autonomous dispatcher creates intent only after policy ALLOW",()=>{
 const evidence={tenant_id:"tenant-a",authenticated:true,active_membership:true,approved_report:true,approved_review:true,active_entitlement:true,lifecycle_ready:true};
 const r=dispatchEligibleEvent({event,tenantId:"tenant-a",evidence,intentId:"00000000-0000-4000-8000-000000000002",idempotencyKey:"k",handlers:{START_WORKFLOW:()=>{}}});
 assert.equal(r.status,"DISPATCHED"); assert.equal(r.intent.status,"PENDING"); assert.equal(r.action,"START_WORKFLOW");
});
test("autonomous dispatcher rejects tenant mismatch fail-closed",()=>{
 const r=dispatchEligibleEvent({event,tenantId:"tenant-a",evidence:{tenant_id:"tenant-b",authenticated:true}});
 assert.equal(r.status,"BLOCKED"); assert.equal(r.code,"TENANT_SCOPE_MISMATCH");
});
