import {createHmac,timingSafeEqual,randomUUID} from "node:crypto";
const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"},MAX=12000;
const fail=(code,status=400)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});
function verifyTenantContext(raw){
  const secret=process.env.TENANT_CONTEXT_HMAC_SECRET;if(!secret||!raw)return null;
  const [payload,signature]=raw.split(".");if(!payload||!signature)return null;
  const expected=createHmac("sha256",secret).update(payload).digest("base64url");
  const a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return null;
  try{const ctx=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));if(!ctx.tenant_id||!ctx.subject||Date.now()/1000>Number(ctx.exp))return null;return ctx;}catch{return null;}
}
export default async function handler(request){
  if(process.env.DIAGNOSIS_INGEST_ENABLED!=="true")return fail("INGEST_DISABLED",503);
  if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
  if(request.headers.get("content-type")?.toLowerCase().split(";")[0]!=="application/json")return fail("JSON_REQUIRED");
  const ctx=verifyTenantContext(request.headers.get("x-aimpact-tenant-context"));if(!ctx)return fail("TRUSTED_TENANT_CONTEXT_REQUIRED",401);
  const length=Number(request.headers.get("content-length")||0);if(length>MAX)return fail("BODY_TOO_LARGE",413);
  let body;try{body=await request.json();}catch{return fail("INVALID_JSON");}
  const fields=["outcome","current_workflow","bottleneck","systems","success_measure"];
  if(fields.some(k=>typeof body[k]!=="string"||!body[k].trim()))return fail("INVALID_DIAGNOSIS_PAYLOAD");
  if(JSON.stringify(body).length>MAX)return fail("BODY_TOO_LARGE",413);
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return fail("SUPABASE_SERVER_CONFIG_REQUIRED",503);
  const idem=request.headers.get("idempotency-key")||randomUUID();
  const row={tenant_id:ctx.tenant_id,idempotency_key:idem,problem_statement:body.outcome.trim(),problem_category:"BUSINESS_DIAGNOSIS",solution_candidates:{current_workflow:body.current_workflow.trim(),bottleneck:body.bottleneck.trim(),systems:body.systems.trim(),success_measure:body.success_measure.trim()}};
  const response=await fetch(url.replace(/\/$/,"")+"/rest/v1/diagnosis_submissions",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation,resolution=ignore-duplicates"},body:JSON.stringify(row)});
  if(!response.ok)return fail("DIAGNOSIS_DB_REJECTED",503);
  const data=await response.json().catch(()=>[]);
  return new Response(JSON.stringify({ok:true,submission:data[0]||null,queued:true}),{status:202,headers:HEADERS});
}
