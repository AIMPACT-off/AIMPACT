const QUICK_AUDIT_AMOUNT=200000;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};

export default async (request)=>{
  if(request.method==="OPTIONS") return new Response("",{status:204,headers:cors});
  if(request.method!=="POST") return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers:{"content-type":"application/json",...cors}});
  const secret=process.env.TOSS_SECRET_KEY;\n  const supabaseUrl=process.env.SUPABASE_URL;\n  const serviceRole=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret||!supabaseUrl||!serviceRole) return new Response(JSON.stringify({ok:false,error:"TOSS_SECRET_KEY_NOT_CONFIGURED"}),{status:503,headers:{"content-type":"application/json",...cors}});
  let body;
  try{body=await request.json()}catch{return new Response(JSON.stringify({ok:false,error:"INVALID_JSON"}),{status:400,headers:{"content-type":"application/json",...cors}});}
  const paymentKey=String(body?.paymentKey||"");
  const orderId=String(body?.orderId||"");
  const amount=Number(body?.amount||0);
  if(!paymentKey||!orderId||amount!==QUICK_AUDIT_AMOUNT||!/^AIMPACT-QA-[A-Za-z0-9]{24}$/.test(orderId)){
    return new Response(JSON.stringify({ok:false,error:"INVALID_PAYMENT_REQUEST"}),{status:400,headers:{"content-type":"application/json",...cors}});
  }
  const auth=Buffer.from(secret+":").toString("base64");
  const response=await fetch("https://api.tosspayments.com/v1/payments/confirm",{
    method:"POST",
    headers:{"Authorization":"Basic "+auth,"Content-Type":"application/json"},
    body:JSON.stringify({paymentKey,orderId,amount})
  });
  const data=await response.json();
  if(!response.ok) return new Response(JSON.stringify({ok:false,error:data?.code||"PAYMENT_CONFIRM_FAILED",message:data?.message}),{status:response.status,headers:{"content-type":"application/json",...cors}});\n  const sync=await fetch(`${supabaseUrl}/rest/v1/leads?session_id=eq.${encodeURIComponent(orderId.replace("AIMPACT-QA-",""))}`,{method:"PATCH",headers:{apikey:serviceRole,Authorization:"Bearer "+serviceRole,"Content-Type":"application/json"},body:JSON.stringify({funnel_stage:"PAID",next_action:"Deliver AI Quick Audit",source:"app-v1-paid"})});\n  if(!sync.ok) return new Response(JSON.stringify({ok:false,error:"PAYMENT_CONFIRMED_BUT_CASE_SYNC_FAILED"}),{status:502,headers:{"content-type":"application/json",...cors}});\n  return new Response(JSON.stringify({ok:true,payment:data,caseId:orderId.replace("AIMPACT-QA-","")}),{status:200,headers:{"content-type":"application/json",...cors}});
};