const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const fail=(code,status=400)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});
async function user(request,url,anon){
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
  if(!token)return null;
  const r=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+token}});
  if(!r.ok)return null; const u=await r.json(); return u?.id?u:null;
}
export default async function handler(request){
  if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
  if(process.env.WORKFLOW_PORTAL_ENABLED!=="true")return fail("WORKFLOW_PORTAL_DISABLED",503);
  const url=process.env.SUPABASE_URL?.replace(/\\/$/,""),anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service)return fail("SUPABASE_SERVER_CONFIG_REQUIRED",503);
  const u=await user(request,url,anon); if(!u)return fail("INVALID_OR_EXPIRED_AUTH",401);
  let body;try{body=await request.json();}catch{return fail("INVALID_JSON");}
  const tenantId=String(body?.tenant_id||""),reportId=String(body?.report_id||"");
  if(!tenantId||!reportId)return fail("TENANT_AND_REPORT_REQUIRED",400);

  const member=await fetch(url+"/rest/v1/tenant_memberships?"+new URLSearchParams({tenant_id:"eq."+tenantId,user_id:"eq."+u.id,status:"eq.active",select:"tenant_id,role",limit:"1"}),{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!member.ok)return fail("TENANT_MEMBERSHIP_LOOKUP_FAILED",503);
  if((await member.json()).length!==1)return fail("ACTIVE_TENANT_MEMBERSHIP_REQUIRED",403);

  const ent=await fetch(url+"/rest/v1/tenant_entitlements?"+new URLSearchParams({tenant_id:"eq."+tenantId,status:"eq.ACTIVE",select:"plan,status",limit:"1"}),{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!ent.ok)return fail("ENTITLEMENT_LOOKUP_FAILED",503);
  if((await ent.json()).length!==1)return fail("ACTIVE_ENTITLEMENT_REQUIRED",402);

  const report=await fetch(url+"/rest/v1/diagnosis_reports?"+new URLSearchParams({tenant_id:"eq."+tenantId,id:"eq."+reportId,report_status:"eq.APPROVED",select:"id,tenant_id,problem_category,workflow_recommendation",limit:"1"}),{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!report.ok)return fail("REPORT_LOOKUP_FAILED",503);
  const reports=await report.json(); if(reports.length!==1)return fail("APPROVED_REPORT_REQUIRED",409);

  const review=await fetch(url+"/rest/v1/diagnosis_reviews?"+new URLSearchParams({tenant_id:"eq."+tenantId,report_id:"eq."+reportId,decision:"eq.APPROVED",select:"id",order:"created_at.desc",limit:"1"}),{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!review.ok)return fail("REVIEW_LOOKUP_FAILED",503);
  if((await review.json()).length!==1)return fail("APPROVED_REVIEW_REQUIRED",409);

  const existing=await fetch(url+"/rest/v1/workflow_runs?"+new URLSearchParams({tenant_id:"eq."+tenantId,report_id:"eq."+reportId,select:"id,status,workflow_name,current_step",limit:"1"}),{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!existing.ok)return fail("WORKFLOW_LOOKUP_FAILED",503);
  const existingRows=await existing.json(); if(existingRows.length)return new Response(JSON.stringify({ok:true,duplicate:true,workflow:existingRows[0]}),{status:200,headers:HEADERS});

  const recommendation=reports[0].workflow_recommendation&&typeof reports[0].workflow_recommendation==="object"?reports[0].workflow_recommendation:{};
  const name=String(recommendation.name||reports[0].problem_category||"AIMPACT Implementation Workflow").slice(0,160);
  const insert=await fetch(url+"/rest/v1/workflow_runs",{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({tenant_id:tenantId,report_id:reportId,status:"QUEUED",workflow_name:name,current_step:"DISCOVER"})});
  if(!insert.ok)return fail("WORKFLOW_CREATE_FAILED",503);
  const rows=await insert.json();
  return new Response(JSON.stringify({ok:true,duplicate:false,workflow:rows[0]||null}),{status:201,headers:HEADERS});
}
