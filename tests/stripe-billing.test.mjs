import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {signBillingReference,verifyBillingReference,verifyStripeSignature} from "../phase2/billing/stripe-signature.mjs";

test("billing reference is signed and expires",()=>{
  const ref=signBillingReference({tenant_id:"tenant-1",subject:"user-1",plan:"START",exp:Math.floor(Date.now()/1000)+60},"test-secret");
  assert.equal(verifyBillingReference(ref,"test-secret").tenant_id,"tenant-1");
  assert.equal(verifyBillingReference(ref,"wrong-secret"),null);
});

test("stripe signature verifies raw body",()=>{
  const raw=JSON.stringify({id:"evt_test",type:"checkout.session.completed"});
  const ts=Math.floor(Date.now()/1000),secret="whsec_test";
  const sig=crypto.createHmac("sha256",secret).update(ts+"."+raw).digest("hex");
  assert.equal(verifyStripeSignature(raw,"t="+ts+",v1="+sig,secret),true);
  assert.equal(verifyStripeSignature(raw,"t="+ts+",v1=bad",secret),false);
});
