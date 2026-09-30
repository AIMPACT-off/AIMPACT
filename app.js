const {createClient}=supabase;
const db=createClient(window.AIMPACT_CONFIG.supabaseUrl,window.AIMPACT_CONFIG.supabaseKey);
let tools=[],selected=[];
const $=id=>document.getElementById(id);
const sessionKey="aimpact_session_id";
const sessionId=localStorage.getItem(sessionKey)||crypto.randomUUID();
localStorage.setItem(sessionKey,sessionId);

async function event(name,payload={}){
  const t=payload.tool_id?tools.find(x=>x.id===payload.tool_id):null;
  const row={event_name:name,event_type:name,tool_id:payload.tool_id||null,tool_name:payload.tool_name||t?.name||null,page:location.pathname,query:payload.query||null,source:new URLSearchParams(location.search).get("utm_source"),campaign:new URLSearchParams(location.search).get("utm_campaign"),session_id:sessionId,metadata:payload};
  const {error}=await db.from("events").insert(row);
  if(error) console.warn("event",error);
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function safeUrl(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}}
function normalize(t){return {...t,name:t.name||"Unnamed AI Tool",category:t.category||"Other",pricing:(t.pricing||t.pricing_model||"UNKNOWN").toUpperCase(),description:t.description||"Verified AI tool.",url:safeUrl(t.website||t.official_url),use_cases:Array.isArray(t.use_cases)?t.use_cases:[],industries:Array.isArray(t.industries)?t.industries:[],free_plan:t.free_plan||"UNKNOWN",api_access:t.api_access||"UNKNOWN",commercial_use:t.commercial_use||"UNKNOWN",integration:Array.isArray(t.integration)?t.integration:[]}}
function relevance(t,q){const text=JSON.stringify({name:t.name,category:t.category,description:t.description,use_cases:t.use_cases,industries:t.industries}).toLowerCase();let score=0;q.split(/\\s+/).filter(Boolean).forEach(w=>{if(text.includes(w))score+=text.includes(t.name.toLowerCase())?4:1});const intent={쇼핑몰:["e-commerce","commerce","image","marketing","automation"],사진:["image","design","photo"],인스타그램:["social","marketing","content"],영상:["video"],고객센터:["customer","support","automation"],패션:["fashion","design","marketing"]};Object.entries(intent).forEach(([k,terms])=>{if(q.includes(k))terms.forEach(x=>{if(text.includes(x))score+=3})});return score}
function render(){
 const q=$("search").value.trim().toLowerCase(),cat=$("category").value,price=$("pricing").value;
 let list=tools.filter(t=>(!cat||t.category===cat)&&(!price||t.pricing.includes(price)));
 if(q)list=list.map(t=>({...t,_score:relevance(t,q)})).filter(t=>t._score>0).sort((a,b)=>b._score-a._score);
 $("grid").innerHTML=list.map(t=>'<article class="card"><div><span class="tag">'+escapeHtml(t.category)+' · '+escapeHtml(t.pricing)+'</span><h3>'+escapeHtml(t.name)+'</h3><p>'+escapeHtml(t.description)+'</p></div><div class="actions"><button class="primary" onclick="detail(\''+t.id+'\')">VIEW</button><button onclick="toggleCompare(\''+t.id+'\')">COMPARE</button></div></article>').join("")||'<div class="loading">No verified tools match your search.</div>';
 updateCompare();
}
let searchTimer;
$("search").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const q=$("search").value.trim();if(q)event("search",{query:q});render()},250)});
$("category").addEventListener("change",()=>{event("filter_use",{metadata:{filter:"category",value:$("category").value}});render()});
$("pricing").addEventListener("change",()=>{event("filter_use",{metadata:{filter:"pricing",value:$("pricing").value}});render()});

window.detail=async id=>{
 const t=tools.find(x=>x.id===id);if(!t)return;
 const rows=[["Pricing",t.pricing],["Free plan",t.free_plan],["API",t.api_access],["Commercial use",t.commercial_use],["Integration",t.integration.join(", ")||"UNKNOWN"],["Verification",t.verification_status],["Last verified",t.last_verified||t.verified_at||"UNKNOWN"]];
 $("modalBody").innerHTML='<span class="tag">'+escapeHtml(t.category)+' · '+escapeHtml(t.pricing)+'</span><h2>'+escapeHtml(t.name)+'</h2><p>'+escapeHtml(t.description)+'</p><div class="detailGrid">'+rows.map(r=>'<div><b>'+escapeHtml(r[0])+'</b><span>'+escapeHtml(r[1])+'</span></div>').join("")+'</div><div class="actions">'+(t.url?'<button class="primary" id="visitTool">VISIT TOOL →</button>':"")+'<button onclick="applyFromTool(\''+t.id+'\')">APPLY</button><button onclick="toggleCompare(\''+t.id+'\')">COMPARE</button></div>';
 $("modal").classList.add("show");event("tool_view",{tool_id:t.id});
 $("visitTool")?.addEventListener("click",()=>{event(t.affiliate_url&&t.affiliate_status==="VERIFIED"?"affiliate_click":"external_click",{tool_id:t.id,destination:t.url});window.open(t.url,"_blank","noopener,noreferrer")});
};
window.toggleCompare=id=>{selected=selected.includes(id)?selected.filter(x=>x!==id):selected.length<3?[...selected,id]:selected;updateCompare();event("compare",{tool_ids:selected})};
function updateCompare(){
 const box=$("compareBox");if(!selected.length){box.innerHTML="<p>No tools selected.</p>";return}
 const ts=selected.map(id=>tools.find(t=>t.id===id)).filter(Boolean);
 const fields=[["Category","category"],["Use Case","use_cases"],["Pricing","pricing"],["Free Plan","free_plan"],["API","api_access"],["Commercial Use","commercial_use"],["Integration","integration"],["Verification","last_verified"]];
 box.innerHTML='<div class="compareTable"><div class="compareHead"><b>CRITERIA</b>'+ts.map(t=>'<b>'+escapeHtml(t.name)+'</b>').join("")+'</div>'+fields.map(([label,key])=>'<div class="compareLine"><span>'+label+'</span>'+ts.map(t=>'<span>'+escapeHtml(Array.isArray(t[key])?t[key].join(", "):(t[key]||"UNKNOWN"))+'</span>').join("")+'</div>').join("")+'</div>';
}
window.applyFromTool=id=>{$("applyTool").value=id; $("apply").scrollIntoView({behavior:"smooth"}); $("modal").classList.remove("show");event("apply",{tool_id:id})};
$("applyForm").addEventListener("submit",e=>{
 e.preventDefault();const q=$("applyProblem").value.trim();if(!q)return;
 const matches=tools.map(t=>({...t,_score:relevance(t,q)})).filter(t=>t._score>0).sort((a,b)=>b._score-a._score).slice(0,5);
 const top=matches.length?matches:tools.slice(0,5);
 $("applyResult").innerHTML='<h3>AI WORKFLOW</h3><p><b>Problem:</b> '+escapeHtml(q)+'</p><ol><li>Define the task and desired result</li><li>Review verified tools matching the intent</li><li>Compare pricing, access and commercial conditions</li><li>Run the selected tool in your workflow</li></ol><h4>VERIFIED TOOLS</h4>'+top.map(t=>'<div class="resultTool"><b>'+escapeHtml(t.name)+'</b><span>'+escapeHtml(t.category)+' · '+escapeHtml(t.pricing)+'</span><button onclick="detail(\''+t.id+'\')">VIEW</button></div>').join("");
 event("workflow_start",{query:q});event("recommendation_view",{query:q,tool_ids:top.map(t=>t.id)});
});
async function init(){
 const {data,error}=await db.from("public_tools").select("*").eq("verification_status","VERIFIED").order("name");
 if(error){$("grid").innerHTML='<div class="loading">Production database connection error.</div>';return}
 tools=(data||[]).map(normalize);$("toolCount").textContent=tools.length;$("categoryCount").textContent=new Set(tools.map(t=>t.category)).size;$("freeCount").textContent=tools.filter(t=>/FREE|FREEMIUM/.test(t.pricing)).length;
 [...new Set(tools.map(t=>t.category))].sort().forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;$("category").appendChild(o)});render();event("page_view");
}
$("close").onclick=()=>$("modal").classList.remove("show");$("modal").onclick=e=>{if(e.target===$("modal"))$("modal").classList.remove("show")};init();