import test from "node:test";import assert from "node:assert/strict";import {createAnchorRecord,verifyAnchorRecord} from "../lib/audit-anchor.mjs";
test("signs and verifies immutable anchor record",()=>{const r=createAnchorRecord({chainSeq:12,rootHash:"a".repeat(64),key:"test-secret"});assert.equal(verifyAnchorRecord(r,"test-secret"),true);assert.equal(verifyAnchorRecord(r,"wrong"),false);});
