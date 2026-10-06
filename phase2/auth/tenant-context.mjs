import { createHmac, timingSafeEqual } from "node:crypto";

export function signTenantContext({tenant_id,subject,exp},secret){
  if(!secret || !tenant_id || !subject || !Number.isFinite(Number(exp))) throw new Error("INVALID_SIGNING_INPUT");
  const payload=Buffer.from(JSON.stringify({tenant_id,subject,exp:Number(exp)})).toString("base64url");
  const signature=createHmac("sha256",secret).update(payload).digest("base64url");
  return payload+"."+signature;
}

export function verifyTenantContext(token,secret,now=Math.floor(Date.now()/1000)){
  if(!secret || typeof token!=="string") return null;
  const parts=token.split(".");
  if(parts.length!==2) return null;
  const [payload,signature]=parts;
  const expected=createHmac("sha256",secret).update(payload).digest();
  const received=Buffer.from(signature,"base64url");
  if(received.length!==expected.length || !timingSafeEqual(received,expected)) return null;
  try{
    const ctx=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(!ctx.tenant_id || !ctx.subject || Number(ctx.exp)<=now) return null;
    return {tenant_id:String(ctx.tenant_id),subject:String(ctx.subject),exp:Number(ctx.exp)};
  }catch{return null;}
}
