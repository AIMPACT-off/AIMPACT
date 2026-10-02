/**
 * Process-local token bucket. Production deployments must use a shared atomic
 * store (e.g. Redis/edge gateway); this class is for tests/single-process use.
 */
export class TenantRateLimiter {
  constructor({capacity=60,refillPerSecond=1,now=()=>Date.now()}={}) {
    if(!(capacity>0)||!(refillPerSecond>0)) throw new Error("INVALID_RATE_LIMIT");
    this.capacity=capacity; this.refillPerSecond=refillPerSecond; this.now=now; this.buckets=new Map();
  }
  consume(tenantId,cost=1) {
    if(typeof tenantId!=="string"||!tenantId.trim()) throw new Error("TENANT_ID_REQUIRED");
    if(!(cost>0)||cost>this.capacity) throw new Error("INVALID_REQUEST_COST");
    const now=this.now(),prev=this.buckets.get(tenantId)||{tokens:this.capacity,at:now};
    const tokens=Math.min(this.capacity,prev.tokens+Math.max(0,now-prev.at)/1000*this.refillPerSecond);
    if(tokens<cost){this.buckets.set(tenantId,{tokens,at:now});return {allowed:false,retryAfterMs:Math.ceil((cost-tokens)/this.refillPerSecond*1000)};}
    this.buckets.set(tenantId,{tokens:tokens-cost,at:now});return {allowed:true,remaining:tokens-cost};
  }
}
