import assert from "node:assert/strict";
import { createLearningSignalRecord, deriveLearningSignal } from "../phase2/control-plane/learning-loop.mjs";

const tenant="tenant-learning-a";
const executed=deriveLearningSignal({tenantId:tenant,executionId:"exec-1",signalType:"ACTION_OUTCOME",dispatchStatus:"EXECUTED",result:{status:"ok"}});
assert.equal(executed.signal_type,"ACTION_OUTCOME");
assert.equal(executed.outcome,"POSITIVE");

const failed=deriveLearningSignal({tenantId:tenant,executionId:"exec-2",signalType:"ACTION_FAILURE",dispatchStatus:"FAILED",result:{code:"ERR"}});
assert.equal(failed.signal_type,"ACTION_FAILURE");
assert.equal(failed.outcome,"NEGATIVE");

const replay=deriveLearningSignal({tenantId:tenant,executionId:"exec-1",signalType:"ACTION_OUTCOME",dispatchStatus:"EXECUTED",duplicate:true});
assert.equal(replay.signal_type,"ACTION_REPLAY");
assert.equal(replay.outcome,"DUPLICATE");

const blocked=deriveLearningSignal({tenantId:tenant,signalType:"POLICY_BLOCK",dispatchStatus:"NOT_DISPATCHED",policyDecision:"NOT_VERIFIED"});
assert.equal(blocked.signal_type,"POLICY_BLOCK");
assert.equal(blocked.outcome,"BLOCKED");

const record=createLearningSignalRecord({tenantId:tenant,executionId:"exec-3",signalType:"ACTION_OUTCOME",dispatchStatus:"EXECUTED"});
assert.ok(record.signal_id);
assert.equal(record.tenant_id,tenant);
assert.ok(record.created_at);

assert.throws(()=>deriveLearningSignal({tenantId:"",executionId:"exec-4",signalType:"ACTION_OUTCOME",dispatchStatus:"EXECUTED"}),/LEARNING_TENANT_REQUIRED/);
console.log("control-plane learning tests passed");
