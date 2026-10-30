import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const code=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=code.indexOf("function verifiedWorkflowTools(");
const end=code.indexOf("function renderWorkflowResult(",start);
assert.ok(start>=0&&end>start,"Fail-closed resolver must exist in app.js");
const snippet=code.slice(start,end);
const verified={id:"v1",name:"Known Tool",verification_status:"VERIFIED",status:"ACTIVE"};
const draft={id:"u1",name:"Unreviewed Tool",verification_status:"NEEDS_REVIEW",status:"ACTIVE"};
const resolve=vm.runInNewContext(snippet+"\nverifiedWorkflowTools;",{tools:[verified,draft]});

test("unverified and nonexistent workflow references are omitted",()=>{
  assert.equal(resolve([{id:"u1"}]).length,0);
  assert.equal(resolve([{id:"nonexistent",name:"Known Tool"}]).length,0);
});
test("only linked, public, VERIFIED tools are returned",()=>{
  assert.equal(resolve([{id:"v1"}]).length,1);
  assert.equal(resolve([{name:"Known Tool"}]).length,1);
  assert.equal(resolve([{id:"v1"},{id:"v1"}]).length,1);
});
test("unpublished VERIFIED tools still remain hidden",()=>{
  const fn=vm.runInNewContext(snippet+"\nverifiedWorkflowTools;",{tools:[{...verified,status:"DRAFT"}]});
  assert.equal(fn([{id:"v1"}]).length,0);
});
test("workflow UI never falls back to unverified reference data",()=>{
  const render=code.slice(end,code.indexOf("window.detail=",end));
  assert.doesNotMatch(render,/\|\|\s*ref\b/);
  assert.match(render,/verifiedWorkflowTools\(workflowRefs\)/);
  assert.match(render,/No currently verified tools are published/);
});
