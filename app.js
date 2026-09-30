const {createClient}=supabase;
const db=createClient(window.AIMPACT_CONFIG.supabaseUrl,window.AIMPACT_CONFIG.supabaseKey);
let tools=[],workflows=[],selected=[];
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const sessionKey="aimpact_session_id";
const sessionId=localStorage.getItem(sessionKey)||crypto.randomUUID();
localStorage.setItem(sessionKey,sessionId);

async function event(name,payload={}){
  const t=payload.tool_id?tools.find(x=>x.id===payload.tool_id):null;
  const row={event_name:name,event_type:name,tool_id:payload.tool_id||null,tool_name:payload.tool_name||t?.name||null,page:location.pathname,query:payload.query||null,source:params.get("utm_source"),campaign:params.get("utm_campaign"),session_id:sessionId,metadata:payload,payload};
  const {error}=await db.from("events").insert(row);
  if(error) console.warn("analytics",error);
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function safeUrl(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}}
function normalize(t){return {...t,name:t.name||"Unnamed AI Tool",category:t.category||"Other",pricing:(t.pricing||t.pricing_model||"UNKNOWN").toUpperCase(),description:t.description||"Verified AI tool.",url:safeUrl(t.website||t.official_url),use_cases:Array.isArray(t.use_cases)?t.use_cases:[],industries:Array.isArray(t.industries)?t.industries:[],free_plan:t.free_plan||"UNKNOWN",api_access:t.api_access||"UNKNOWN",commercial_use:t.commercial_use||"UNKNOWN",integration:Array.isArray(t.integration)?t.integration:[]}}
function relevance(t,q){
 const text=JSON.stringify({name:t.name,category:t.category,description:t.description,use_cases:t.use_cases,industries:t.industries}).toLowerCase();
 let score=0;
 q.toLowerCase().split(/\s+/).filter(Boolean).forEach(w=>{if(w.length>1&&text.includes(w))score+=text.includes(String(t.name).toLowerCase())?4:1});
 const intent={쇼핑몰:["e-commerce","commerce","image","marketing","automation","content"],상품:["image","design","marketing","content"],사진:["image","design","photo"],인스타그램:["social","marketing","content"],영상:["video"],고객센터:["customer","support","automation"],패션:["fashion","design","marketing"],콘텐츠:["content","writing","marketing","video"],자동화:["automation"],개발:["development"],웹사이트:["development","design"],검색:["research","data"],리서치:["research","data"],교육:["education"]};
 Object.entries(intent).forEach(([k,terms])=>{if(q.toLowerCase().includes(k))terms.forEach(x=>{if(text.includes(x))score+=3})});
 return score;
}
function render(){
 const q=$("search")?.value.trim().toLowerCase(),cat=$("category")?.value,price=$("pricing")?.value;
 let list=tools.filter(t=>(!cat||t.category===cat)&&(!price||t.pricing.includes(price)));
 if(q)list=list.map(t=>({...t,_score:relevance(t,q)})).filter(t=>t._score>0).sort((a,b)=>b._score-a._score);
 $("grid").innerHTML=list.map(t=>'<article class="card"><div><span class="tag">'+escapeHtml(t.category)+' · '+escapeHtml(t.pricing)+'</span><h3>'+escapeHtml(t.name)+'</h3><p>'+escapeHtml(t.description)+'</p></div><div class="actions"><button class="primary" onclick="detail(\''+t.id+'\')">VIEW</button><button onclick="toggleCompare(\''+t.id+'\')">COMPARE</button></div></article>').join("")||'<div class="loading">No verified tools are currently published. AIMPACT is keeping the directory empty until evidence is verified.</div>';
 updateCompare();
}
function workflowScore(w,q){const text=JSON.stringify({title:w.title,problem:w.problem,industry:w.industry,category:w.category,steps:w.steps}).toLowerCase();return q.toLowerCase().split(/\s+/).filter(x=>x.length>1).reduce((s,x)=>s+(text.includes(x)?2:0),0)}
function renderWorkflowResult(q,top,template){
 const workflow=template||workflows.map(w=>({...w,_score:workflowScore(w,q)})).sort((a,b)=>b._score-a._score)[0];
 const workflowTools=workflow?.tools?.length?workflow.tools:top;
 const toolCards=workflowTools.slice(0,5).map(ref=>{const t=tools.find(x=>x.id===ref.id)||tools.find(x=>x.name===ref.name)||ref;return '<div class="resultTool"><b>'+escapeHtml(t.name||"Verified tool")+'</b><span>'+escapeHtml(t.category||"")+' · '+escapeHtml(t.pricing||"UNKNOWN")+'</span></div>'}).join("");
 $("applyResult").innerHTML='<h3>WORKFLOW DRAFT</h3><p><b>Problem:</b> '+escapeHtml(q)+'</p>'+(workflow?'<h4>'+escapeHtml(workflow.title)+'</h4><p>'+escapeHtml(workflow.problem)+'</p><ol>'+((workflow.steps||[]).map(s=>'<li>'+escapeHtml(s)+'</li>').join(""))+'</ol>':"<p>AIMPACT will scope this as a new workflow during an audit.")+'<h4>VERIFIED TOOLS</h4>'+toolCards;
 event("workflow_start",{query:q,workflow_id:workflow?.id||null});
}
window.detail=async id=>{
 const t=tools.find(x=>x.id===id);if(!t)return;
 $("modalBody").innerHTML='<span class="tag">'+escapeHtml(t.category)+' · '+escapeHtml(t.pricing)+'</span><h2>'+escapeHtml(t.name)+'</h2><p>'+escapeHtml(t.description)+'</p><div class="detailGrid"><div><b>Pricing</b><span>'+escapeHtml(t.pricing)+'</span></div><div><b>Commercial use</b><span>'+escapeHtml(t.commercial_use)+'</span></div><div><b>API</b><span>'+escapeHtml(t.api_access)+'</span></div><div><b>Verification</b><span>'+escapeHtml(t.verification_status)+'</span></div></div><div class="actions">'+(t.url?'<button class="primary" id="visitTool">VISIT TOOL →</button>':"")+'</div>';
 $("modal").classList.add("show");event("tool_view",{tool_id:t.id});
 $("visitTool")?.addEventListener("click",()=>{event("external_click",{tool_id:t.id,destination:t.url});window.open(t.url,"_blank","noopener,noreferrer")});
};
window.toggleCompare=id=>{selected=selected.includes(id)?selected.filter(x=>x!==id):selected.length<3?[...selected,id]:selected;updateCompare();event("compare",{tool_ids:selected})};
function updateCompare(){
 const box=$("compareBox");if(!box)return;
 if(!selected.length){box.innerHTML="<p>No tools selected.</p>";return}
 const ts=selected.map(id=>tools.find(t=>t.id===id)).filter(Boolean);
 box.innerHTML='<div class="compareTable"><div class="compareHead"><b>CRITERIA</b>'+ts.map(t=>'<b>'+escapeHtml(t.name)+'</b>').join("")+'</div>'+[["Category","category"],["Pricing","pricing"],["Commercial Use","commercial_use"],["API","api_access"]].map(([l,k])=>'<div class="compareLine"><span>'+l+'</span>'+ts.map(t=>'<span>'+escapeHtml(t[k]||"UNKNOWN")+'</span>').join("")+'</div>').join("")+'</div>';
}
$("search")?.addEventListener("input",()=>{const q=$("search").value.trim();if(q)event("search",{query:q});render()});
$("category")?.addEventListener("change",render);$("pricing")?.addEventListener("change",render);

$("applyForm")?.addEventListener("submit",e=>{
 e.preventDefault();const q=$("applyProblem").value.trim();if(!q)return;
 const matches=tools.map(t=>({...t,_score:relevance(t,q)})).filter(t=>t._score>0).sort((a,b)=>b._score-a._score).slice(0,5);
 const wf=workflows.map(w=>({...w,_score:workflowScore(w,q)})).sort((a,b)=>b._score-a._score)[0];
 renderWorkflowResult(q,matches,wf);
});

$("leadForm")?.addEventListener("submit",async e=>{
 e.preventDefault();
 const form=e.currentTarget,btn=form.querySelector("button[type=submit]"),status=$("leadStatus");
 const payload={
  email:$("leadEmail").value.trim(),company:$("leadCompany").value.trim()||null,name:$("leadName").value.trim()||null,
  problem:$("leadProblem").value.trim(),industry:$("leadIndustry").value||null,company_size:$("leadSize").value.trim()||null,
  current_tools:$("leadCurrentTools").value.trim()||null,desired_automation:$("leadAutomation").value.trim()||null,
  budget:$("leadBudget").value.trim()||null,message:$("leadMessage").value.trim()||null,
  source:params.get("utm_source")||"website",campaign:params.get("utm_campaign"),session_id:sessionId,consent:$("leadConsent").checked,
  funnel_stage:"NEW",next_action:"Review business problem and contact lead"
 };
 if(!payload.consent){status.textContent="Consent is required.";return}
 btn.disabled=true;status.textContent="Submitting…";
 const {data,error}=await db.from("leads").insert(payload).select("id").single();
 if(error){console.error(error);status.textContent="Submission failed. Please try again.";btn.disabled=false;return}
 await event("lead_submit",{lead_id:data?.id||null,query:payload.problem,industry:payload.industry});
 form.reset();status.textContent="Received. AIMPACT will review the problem and respond with the next workflow step.";btn.disabled=false;
});

async function init(){
 const [{data,error},{data:workflowData}]=await Promise.all([
  db.from("public_tools").select("*").eq("verification_status","VERIFIED").order("name"),
  db.from("workflows").select("*").order("created_at")
 ]);
 if(error){$("grid").innerHTML='<div class="loading">Production database connection error.</div>';return}
 tools=(data||[]).map(normalize);workflows=workflowData||[];
 $("toolCount").textContent=tools.length;$("categoryCount").textContent=new Set(tools.map(t=>t.category)).size;$("freeCount").textContent=tools.filter(t=>/FREE|FREEMIUM/.test(t.pricing)).length;
 [...new Set(tools.map(t=>t.category))].sort().forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;$("category").appendChild(o)});
 render();event("page_view");
}
$("close")?.addEventListener("click",()=>$("modal").classList.remove("show"));
$("modal")?.addEventListener("click",e=>{if(e.target===$("modal"))$("modal").classList.remove("show")});
init();