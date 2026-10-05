import { verifyBillingReference, verifyStripeSignature } from "../../phase2/billing/stripe-signature.mjs";
const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const fail=(code,status,extra={})=>new Response(JSON.stringify({ok:false,code,...extra}),{status,headers:HEADERS});
function normalizeEvent(event){
  const object=event?.data?.object||{},type=event?.type||"";
  let status="UNKNOWN",tenant=null,plan=null;
  if(type.startsWith("customer.subscription."))status=object.status||"UNKNOWN";
  if(type==="invoice.paid")status="PAID";
  if(type==="invoice.payment_failed")status="PAYMENT_FAILED";
  if(type==="checkout.session.completed"||type==="checkout.session.async_payment_succeeded"){
    status=object.payment_status||"UNKNOWN";tenant=object.client_reference_id||null;plan=object.metadata?.plan||null;
  }
  return {event_id:event?.id||null,type,status,tenant_reference:tenant,plan,customer_id:object.customer||null,subscription_id:object.subscription||null,created:event?.created||null};
}
async function persistEntitlement(normalized,reference){
  const url=process.env.SUPABASE_URL?.replace(/\/$/,""),service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!service)return {ok:false,code:"ENTITLEMENT_SERVER_CONFIG_REQUIRED"};
  const rpc=process.env.BILLING_ENTITLEMENT_RPC||"process_stripe_entitlement_event";
  const response=await fetch(url+"/rest/v1/rpc/"+encodeURIComponent(rpc),{
    method:"POST",
    headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},
    body:JSON.stringify({p_event_id:normalized.event_id,p_event_type:normalized.type,p_tenant_id:reference.tenant_id,p_plan:reference.plan,p_status:normalized.status,p_customer_id:normalized.customer_id,p_subscription_id:normalized.subscription_id,p_event_created_at:normalized.created})
  });
  if(!response.ok)return {ok:false,code:"ENTITLEMENT_PERSIST_FAILED",status:response.status};
  return {ok:true};
}
export default async function handler(request){
  if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
  if(process.env.BILLING_TEST_ENABLED!=="true")return fail("BILLING_DISABLED",503);
  const secret=process.env.STRIPE_WEBHOOK_SECRET;if(!secret)return fail("STRIPE_WEBHOOK_SECRET_REQUIRED",503);
  const raw=await request.text();
  if(!verifyStripeSignature(raw,request.headers.get("stripe-signature"),secret))return fail("INVALID_STRIPE_SIGNATURE",400);
  let event;try{event=JSON.parse(raw);}catch{return fail("INVALID_JSON",400);}
  const supported=new Set(["checkout.session.completed","checkout.session.async_payment_succeeded","invoice.paid","invoice.payment_failed","customer.subscription.updated","customer.subscription.deleted"]);
  if(!supported.has(event.type))return new Response(JSON.stringify({ok:true,ignored:true,event_id:event.id}),{status:200,headers:HEADERS});
  const normalized=normalizeEvent(event);
  const reference=normalized.tenant_reference?verifyBillingReference(normalized.tenant_reference,process.env.BILLING_REFERENCE_HMAC_SECRET):null;
  if(!reference)return fail("ENTITLEMENT_REFERENCE_UNAVAILABLE",503);
  const persisted=await persistEntitlement(normalized,reference);
  if(!persisted.ok)return fail(persisted.code,503,{event_id:event.id});
  return new Response(JSON.stringify({ok:true,event_id:event.id,entitlement:"PROCESSED",tenant_id:reference.tenant_id,plan:reference.plan,status:normalized.status}),{status:200,headers:HEADERS});
}
