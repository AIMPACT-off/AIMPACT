import { verifyTenantContext } from "../../phase2/auth/tenant-context.mjs";

const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};

async function approvedReport(url,key,tenantId,reportId){
  const params=new URLSearchParams({tenant_id:"eq."+tenantId,report_status:"eq.APPROVED",select:"id,tenant_id,report_status"});
  if(reportId) params.set("id","eq."+reportId);
  const reportRes=await fetch(url+"/rest/v1/diagnosis_reports?"+params,{headers:{apikey:key,Authorization:"Bearer "+key}});
  if(!reportRes.ok)return {error:"REPORT_QUERY_FAILED"};
  const reports=await reportRes.json();if(!reports.length)return {error:"REPORT_NOT_APPROVED"};
  const reviewParams=new URLSearchParams({
    tenant_id:"eq."+tenantId,
    report_id:"eq."+reports[0].id,
    select:"id,report_id,decision,created_at",
    order:"created_at.desc",
    limit:"1"
  });
  const reviewRes=await fetch(url+"/rest/v1/diagnosis_reviews?"+reviewParams,{headers:{apikey:key,Authorization:"Bearer "+key}});
  if(!reviewRes.ok)return {error:"REVIEW_QUERY_FAILED"};
  const reviews=await reviewRes.json();
  return reviews.length && reviews[0].decision==="APPROVED"
    ? {report:reports[0],review:reviews[0]}
    : {error:"REVIEW_NOT_APPROVED"};
}

export default async function handler(request){
  if(request.method!=="GET")return new Response(JSON.stringify({ok:false,code:"METHOD_NOT_ALLOWED"}),{status:405,headers:HEADERS});
  const ctx=verifyTenantContext(request.headers.get("x-aimpact-tenant-context"),process.env.TENANT_CONTEXT_HMAC_SECRET);
  if(!ctx)return new Response(JSON.stringify({ok:false,code:"AUTH_REQUIRED"}),{status:401,headers:HEADERS});
  const url=process.env.SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return new Response(JSON.stringify({ok:false,code:"SUPABASE_SERVER_CONFIG_REQUIRED"}),{status:503,headers:HEADERS});
  const result=await approvedReport(url,key,ctx.tenant_id,new URL(request.url).searchParams.get("report_id"));
  if(result.error)return new Response(JSON.stringify({ok:false,code:result.error}),{status:result.error.includes("QUERY")?503:403,headers:HEADERS});
  return new Response(JSON.stringify({ok:true,report:result.report,review:result.review}),{status:200,headers:HEADERS});
}
