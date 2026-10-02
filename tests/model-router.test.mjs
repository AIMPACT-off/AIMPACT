import test from "node:test";
import assert from "node:assert/strict";
import {preparePayload,estimateCostUsd} from "../lib/model-router.mjs";
const countTokens=msgs=>msgs.reduce((n,m)=>n+m.content.length,0);
test("rejects unverified pricing and token capacity",()=>{
 assert.throws(()=>preparePayload({messages:[{role:"user",content:"hi"}],target:{id:"x",contextWindow:100,countTokens},pricing:{verified:false,inputPerMillion:1,outputPerMillion:1},maxCostUsd:1}),/MODEL_PRICING_UNVERIFIED/);
 assert.throws(()=>preparePayload({messages:[{role:"user",content:"hi"}],target:{id:"x",contextWindow:100},pricing:{verified:true,inputPerMillion:1,outputPerMillion:1},maxCostUsd:1}),/TOKENIZER_REQUIRED/);
});
test("applies token ceiling and cost cap",()=>{
 const out=preparePayload({messages:[{role:"user",content:"hello"}],target:{id:"small",contextWindow:100,countTokens},pricing:{verified:true,inputPerMillion:1,outputPerMillion:2},maxCostUsd:1,reserveOutputTokens:10});
 assert.equal(out.model,"small"); assert.equal(out.inputTokens,5);
 assert.throws(()=>preparePayload({messages:[{role:"user",content:"hello"}],target:{id:"small",contextWindow:100,countTokens},pricing:{verified:true,inputPerMillion:1e6,outputPerMillion:2},maxCostUsd:1}),/MODEL_COST_CAP_EXCEEDED/);
});
test("requires explicit adaptive converter for oversized payload",()=>{
 const base={messages:[{role:"user",content:"x".repeat(100)}],target:{id:"tiny",contextWindow:20,countTokens},pricing:{verified:true,inputPerMillion:1,outputPerMillion:1},maxCostUsd:1,reserveOutputTokens:10};
 assert.throws(()=>preparePayload(base),/PAYLOAD_EXCEEDS_CONTEXT/);
 const out=preparePayload({...base,summarize:()=>[{role:"user",content:"short"}]});
 assert.equal(out.inputTokens,5);
});
