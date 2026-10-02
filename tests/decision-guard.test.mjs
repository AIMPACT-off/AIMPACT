import test from "node:test"; import assert from "node:assert/strict";
import {enforceDecision} from "../lib/decision-guard.mjs";
test("low confidence is routed to human review",async()=>{let review;await assert.rejects(()=>enforceDecision({decision:{confidence:.84},validateSchema:()=>true,onHumanReview:async x=>review=x}),{code:"HUMAN_REVIEW_REQUIRED"});assert.equal(review.reason,"LOW_CONFIDENCE")});
test("schema failure is blocked",async()=>{await assert.rejects(()=>enforceDecision({decision:{confidence:.9},validateSchema:()=>false}),{code:"SCHEMA_INVALID"})});
test("valid high-confidence decision passes",async()=>{const d={confidence:.9};assert.equal(await enforceDecision({decision:d,validateSchema:()=>true}),d)});
