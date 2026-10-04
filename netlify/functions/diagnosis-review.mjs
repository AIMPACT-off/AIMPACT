import {assertReviewFirst,rejectBrowserAuthority} from "../../phase2/review-gate/review-policy.mjs";
const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
export default async function handler(request){
  if(request.method!=="GET") return new Response(JSON.stringify({ok:false,code:"METHOD_NOT_ALLOWED"}),{status:405,headers:HEADERS});
  const auth=request.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer ")) return new Response(JSON.stringify({ok:false,code:"AUTH_REQUIRED"}),{status:401,headers:HEADERS});
  const authority=rejectBrowserAuthority({});
  if(!authority.ok) return new Response(JSON.stringify(authority),{status:400,headers:HEADERS});
  const gate=assertReviewFirst({callerAuthenticated:true,tenantId:null,report:null});
  return new Response(JSON.stringify({ok:false,code:gate.code,message:"Review-first data path is locked pending canonical tenant membership verification."}),{status:503,headers:HEADERS});
}
