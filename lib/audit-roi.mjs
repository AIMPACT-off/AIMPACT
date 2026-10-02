export function percentile(values,p){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=(a.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return a[l]+(a[h]-a[l])*(i-l);}
export function calculateAuditRoi({loadedHourlyCost=0,implementationCost=0,monthlyOperatingCost=0,outcomes=[],benchmark=null,assumptions={}}){
 const rows=outcomes.filter(x=>Number.isFinite(x.hoursSaved)&&x.hoursSaved>=0);
 let hours,source,confidence;
 if(rows.length>=5){hours=percentile(rows.map(x=>x.hoursSaved),.5);source="AIMPACT_MEASURED_OUTCOMES";confidence="MEASURED";}
 else if(benchmark&&Number.isFinite(benchmark.hoursSavedPerMonth)&&benchmark.evidenceUrl&&benchmark.observedAt){hours=benchmark.hoursSavedPerMonth;source="EXTERNAL_BENCHMARK";confidence="BENCHMARK_ESTIMATE";}
 else{hours=Number.isFinite(assumptions.hoursSavedPerMonth)?assumptions.hoursSavedPerMonth:0;source="CUSTOMER_ASSUMPTION";confidence="LOW_EVIDENCE";}
 const gross=hours*loadedHourlyCost,net=gross-monthlyOperatingCost;
 return {source,confidence,sampleCount:rows.length,monthlyHoursSaved:hours,monthlyGrossSavings:gross,monthlyNetSavings:net,firstYearNet:net*12-implementationCost,disclaimer:source==="AIMPACT_MEASURED_OUTCOMES"?"Measured outcome records; disclose sample size, period and attribution limits.":"Estimate only; not represented as AIMPACT customer-measured performance."};
}