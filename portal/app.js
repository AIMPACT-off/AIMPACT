const views=[...document.querySelectorAll(".view")];
const nav=[...document.querySelectorAll(".nav")];
const heading=document.getElementById("heading");
const crumb=document.getElementById("crumb");

function show(id){
  views.forEach(v=>v.classList.toggle("active",v.id===id));
  nav.forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  crumb.textContent="AIMPACT / "+id.toUpperCase();
  heading.textContent={overview:"Business Command Center",diagnosis:"Business Diagnosis",reports:"Approved Reports",workflows:"Workflow Operations",roi:"Outcome & ROI",billing:"Billing & Entitlements"}[id]||"AIMPACT";
  window.scrollTo({top:0,behavior:"smooth"});
}
nav.forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
document.querySelectorAll("[data-view-target]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.viewTarget)));

async function loadPortal(){
  try{
    const r=await fetch("/.netlify/functions/diagnosis-portal",{headers:{Accept:"application/json"}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.code||"BACKEND_LOCKED");
    document.getElementById("tenant").textContent=data.tenant?.name||"Authenticated tenant";
    document.getElementById("connection").textContent="SERVER CONNECTED";
    document.getElementById("status").textContent="CONNECTED";
    document.getElementById("metricDiagnosis").textContent=data.metrics?.diagnosis??"0";
    document.getElementById("metricReports").textContent=data.metrics?.approvedReports??"0";
    document.getElementById("metricWorkflows").textContent=data.metrics?.activeWorkflows??"0";
    document.getElementById("metricRoi").textContent=data.metrics?.roi??"—";
  }catch{
    document.getElementById("connection").textContent="BACKEND LOCKED";
    document.getElementById("status").textContent="FAIL-CLOSED";
  }
}

document.getElementById("diagnosisForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const note=document.getElementById("formnote");
  note.textContent="Sending to the authenticated server boundary…";
  const payload=Object.fromEntries(new FormData(event.currentTarget).entries());
  try{
    const r=await fetch("/.netlify/functions/diagnosis-intake",{
      method:"POST",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify(payload)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.code||"INGEST_REJECTED");
    note.textContent="Accepted by server. Submission ID: "+(data.submission?.id||"pending");
    note.dataset.state="accepted";
  }catch(error){
    note.textContent="Submission blocked by server gate: "+error.message+". No unauthenticated tenant data was queued.";
    note.dataset.state="blocked";
  }
});
loadPortal();
