import { signBillingReference } from "../../phase2/billing/stripe-signature.mjs";
const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const fail=(code,status)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});
async function verifiedUser(request,url,anon){
  const match=(request.headers.get("authorization")||"").match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
  if(!match)return null;
  const auth=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+match[1]}});
  if(!auth.ok)return null;
  const user=await auth.json();return user?.id?user:null;
}
async function membership(url,service,userId,tenantId){
  const params=new URLSearchParams({user_id:"eq."+userId,status:"eq.active",tenant_id:"eq."+tenantId,select:"tenant_id,role,status"});
  const res=await fetch(url+"/rest/v1/tenant_memberships?"+params,{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!res.ok)return null;const rows=await res.json();return rows.length===1?rows[0]:null;
}
export default async function handler(request){
  if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
  if(process.env.BILLING_TEST_ENABLED!=="true")return fail("BILLING_DISABLED",503);
  const url=process.env.SUPABASE_URL?.replace(/\/$/,"");
  const anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY,secret=process.env.BILLING_REFERENCE_HMAC_SECRET;
  if(!url||!anon||!service||!secret)return fail("BILLING_SERVER_CONFIG_REQUIRED",503);
  let body;try{body=await request.json();}catch{return fail("INVALID_JSON",400);}
  const plan=String(body?.plan||"").toUpperCase(),tenantId=String(body?.tenant_id||"");
  const link=plan==="START"?process.env.STRIPE_START_PAYMENT_LINK:plan==="GROWTH"?process.env.STRIPE_GROWTH_PAYMENT_LINK:null;
  if(!link||!tenantId)return fail("INVALID_BILLING_REQUEST",400);
  const user=await verifiedUser(request,url,anon);if(!user)return fail("INVALID_OR_EXPIRED_AUTH",401);
  const member=await membership(url,service,user.id,tenantId);if(!member)return fail("TENANT_MEMBERSHIP_NOT_FOUND",403);
  const reference=signBillingReference({tenant_id:tenantId,subject:user.id,plan,exp:Math.floor(Date.now()/1000)+900},secret);
  const separator=link.includes("?")?"&":"?";
  return new Response(JSON.stringify({ok:true,plan,checkout_url:link+separator+"client_reference_id="+encodeURIComponent(reference),expires_in:900}),{status:200,headers:HEADERS});
}
