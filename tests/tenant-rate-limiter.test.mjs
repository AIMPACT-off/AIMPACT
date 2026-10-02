import test from "node:test";
import assert from "node:assert/strict";
import {TenantRateLimiter} from "../lib/tenant-rate-limiter.mjs";
test("isolates tenant buckets and refills",()=>{
 let now=0;const limiter=new TenantRateLimiter({capacity:2,refillPerSecond:1,now:()=>now});
 assert.equal(limiter.consume("A").allowed,true);assert.equal(limiter.consume("A").allowed,true);
 assert.equal(limiter.consume("A").allowed,false);assert.equal(limiter.consume("B").allowed,true);
 now=1000;assert.equal(limiter.consume("A").allowed,true);
});
