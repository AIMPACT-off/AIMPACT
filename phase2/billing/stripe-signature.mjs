import crypto from "node:crypto";

export function signBillingReference(payload, secret){
  if(!secret) throw new Error("BILLING_REFERENCE_HMAC_SECRET_REQUIRED");
  const body=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac=crypto.createHmac("sha256",secret).update(body).digest("base64url");
  return body+"."+mac;
}
export function verifyBillingReference(reference, secret){
  if(!reference||!secret)return null;
  const parts=String(reference).split(".");
  if(parts.length!==2)return null;
  const [body,provided]=parts;
  const expected=crypto.createHmac("sha256",secret).update(body).digest("base64url");
  const a=Buffer.from(provided),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{
    const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
    if(!payload?.tenant_id||!payload?.subject||!Number.isInteger(payload.exp)||payload.exp<Math.floor(Date.now()/1000))return null;
    return payload;
  }catch{return null;}
}
export function verifyStripeSignature(rawBody, header, secret, toleranceSeconds=300){
  if(!rawBody||!header||!secret)return false;
  const parts=String(header).split(",");
  const timestamp=parts.find(v=>v.startsWith("t="))?.slice(2);
  const signatures=parts.filter(v=>v.startsWith("v1=")).map(v=>v.slice(3));
  const ts=Number(timestamp);
  if(!Number.isInteger(ts)||Math.abs(Math.floor(Date.now()/1000)-ts)>toleranceSeconds||!signatures.length)return false;
  const expected=crypto.createHmac("sha256",secret).update(ts+"."+rawBody).digest("hex");
  const eb=Buffer.from(expected);
  return signatures.some(value=>{const cb=Buffer.from(value);return cb.length===eb.length&&crypto.timingSafeEqual(cb,eb);});
}
