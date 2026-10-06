import React, { useState } from "react";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";

const CHECKOUT = "https://buy.stripe.com/eVq7sLdq33gOgNm9wH1Fe00";
const AUDIT_API = "https://aimpact-ai.netlify.app/api/audit";

async function runServerAudit(input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(AUDIT_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "AIMPACT audit service rejected the request.");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export default function App() {
  const [tab, setTab] = useState("overview");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [industry, setIndustry] = useState("Retail");
  const [problem, setProblem] = useState("");
  const [hours, setHours] = useState("");
  const [cost, setCost] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (busy) return;
    setError("");
    if (!company.trim() || !email.trim() || !problem.trim()) {
      setError("Company, email and business problem are required.");
      return;
    }
    setBusy(true);
    try {
      const data = await runServerAudit({
        company: company.trim(),
        email: email.trim(),
        industry: industry.trim(),
        problem: problem.trim(),
        monthlyManualHours: hours,
        monthlyProcessCost: cost
      });
      setResult(data);
      setTab("reports");
    } catch (e) {
      setError(e?.name === "AbortError" ? "Audit timed out. Please try again." : (e?.message || "Audit failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const buy = () => Linking.openURL(CHECKOUT);
  const nav = [["overview","OVERVIEW"],["audit","AI AUDIT"],["products","PRODUCTS"],["reports","REPORTS"],["billing","BILLING"]];

  return <SafeAreaView style={s.safe}>
    <StatusBar style="light" />
    <View style={s.header}>
      <Text style={s.logo}>AIMPACT</Text>
      <Text style={s.status}>PRODUCT · VERIFICATION IN PROGRESS</Text>
    </View>
    <View style={s.nav}>
      {nav.map(([id,label]) => <TouchableOpacity key={id} onPress={() => setTab(id)} style={[s.navItem, tab===id && s.navActive]}>
        <Text style={[s.navText, tab===id && s.navTextActive]}>{label}</Text>
      </TouchableOpacity>)}
    </View>
    <ScrollView contentContainerStyle={s.content}>
      {tab==="overview" && <View>
        <Text style={s.eyebrow}>AIMPACT BUSINESS OS</Text>
        <Text style={s.title}>Find the work.{ "\n" }Change the system.</Text>
        <Text style={s.sub}>Business Problem → AI Decision → Business Outcome</Text>
        <View style={s.card}>
          <Text style={s.cardTitle}>ONE REAL PROBLEM</Text>
          <Text style={s.answer}>AIMPACT identifies the operational bottleneck, maps an AI opportunity and turns it into a workflow you can actually implement.</Text>
        </View>
        <TouchableOpacity style={s.primary} onPress={() => setTab("audit")}><Text style={s.primaryText}>START AI AUDIT →</Text></TouchableOpacity>
        <View style={s.card}><Text style={s.label}>VALUE LOOP</Text><Text style={s.sub}>AUDIT → ACTION → RESULT → ROI → NEXT ACTION</Text></View>
      </View>}

      {tab==="audit" && <View>
        <Text style={s.eyebrow}>01 · AI AUDIT</Text>
        <Text style={s.title}>Start with one{ "\n" }real problem.</Text>
        <View style={s.card}>
          <Text style={s.label}>COMPANY</Text>
          <TextInput value={company} onChangeText={setCompany} placeholder="Your company" placeholderTextColor="#656a73" style={s.input}/>
          <Text style={s.label}>WORK EMAIL</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" placeholderTextColor="#656a73" style={s.input}/>
          <Text style={s.label}>INDUSTRY</Text>
          <TextInput value={industry} onChangeText={setIndustry} placeholder="Retail / E-commerce / Fashion" placeholderTextColor="#656a73" style={s.input}/>
          <Text style={s.label}>BUSINESS PROBLEM</Text>
          <TextInput value={problem} onChangeText={setProblem} placeholder="What takes too much time or money?" placeholderTextColor="#656a73" multiline style={[s.input,s.textarea]}/>
          <Text style={s.label}>MONTHLY MANUAL HOURS · OPTIONAL</Text>
          <TextInput value={hours} onChangeText={setHours} keyboardType="numeric" placeholder="100" placeholderTextColor="#656a73" style={s.input}/>
          <Text style={s.label}>MONTHLY PROCESS COST · OPTIONAL</Text>
          <TextInput value={cost} onChangeText={setCost} keyboardType="numeric" placeholder="3000000" placeholderTextColor="#656a73" style={s.input}/>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={[s.primary, busy && s.disabled]} onPress={run} disabled={busy}>
            <Text style={s.primaryText}>{busy ? "RUNNING AUDIT…" : "RUN SERVER AUDIT →"}</Text>
          </TouchableOpacity>
          <Text style={s.muted}>Current engine: server-side diagnostic. AI provider and production outcome verification remain gated until separately verified.</Text>
        </View>
      </View>}

      {tab==="products" && <View>
        <Text style={s.eyebrow}>02 · PRODUCTS</Text><Text style={s.title}>Buy the outcome.{ "\n" }Use the platform.</Text>
        <View style={s.card}><Text style={s.label}>START</Text><Text style={s.cardTitle}>AI Quick Audit</Text><Text style={s.sub}>One real business process mapped into an AI opportunity, workflow and next action.</Text><Text style={s.price}>₩99,000</Text><Text style={s.muted}>one-time</Text><TouchableOpacity style={s.primary} onPress={buy}><Text style={s.primaryText}>BUY / START →</Text></TouchableOpacity></View>
        <View style={s.card}><Text style={s.label}>GROW · NOT LIVE</Text><Text style={s.cardTitle}>Business AI Platform</Text><Text style={s.sub}>Recurring access remains closed until live payment and entitlement verification passes.</Text><Text style={s.price}>₩490,000</Text><Text style={s.muted}>/ month</Text></View>
      </View>}

      {tab==="reports" && <View>
        <Text style={s.eyebrow}>03 · EXECUTIVE REPORT</Text><Text style={s.title}>Your business{ "\n" }answer.</Text>
        {!result ? <View style={s.card}><Text style={s.cardTitle}>REPORT EMPTY</Text><Text style={s.sub}>Run a server audit to generate the diagnosis.</Text><TouchableOpacity style={s.primary} onPress={() => setTab("audit")}><Text style={s.primaryText}>RUN AUDIT →</Text></TouchableOpacity></View> :
        <View style={s.card}>
          <Text style={s.label}>AIMPACT DIAGNOSIS · {result.customer?.company || "CUSTOMER"}</Text>
          <Text style={s.score}>{result.diagnosis?.score ?? "—"}</Text>
          <Text style={s.priority}>OPPORTUNITY PRIORITY · {result.diagnosis?.category || "UNVERIFIED"}</Text>
          <Text style={s.label}>PROBLEM</Text><Text style={s.answer}>{result.diagnosis?.problem}</Text>
          <Text style={s.label}>WHY IT MATTERS</Text><Text style={s.answer}>{result.diagnosis?.whyItMatters}</Text>
          <Text style={s.label}>BUSINESS IMPACT</Text><Text style={s.answer}>{result.diagnosis?.businessImpact}</Text>
          <Text style={s.label}>AI OPPORTUNITY</Text><Text style={s.answer}>{result.diagnosis?.aiOpportunity}</Text>
          <Text style={s.label}>RECOMMENDED WORKFLOW</Text><Text style={s.answer}>{result.diagnosis?.recommendedWorkflow}</Text>
          <Text style={s.label}>NEXT ACTION</Text><Text style={s.answer}>{result.diagnosis?.nextAction}</Text>
          <Text style={s.label}>IMPACT ESTIMATE</Text><Text style={s.answer}>{result.impact?.monthlyHoursSavedEstimate != null ? "월 약 " + result.impact.monthlyHoursSavedEstimate + "시간 후보" : "정량 데이터 없음"}{result.impact?.monthlyValueEstimateKrw ? " · 약 " + Number(result.impact.monthlyValueEstimateKrw).toLocaleString() + "원/월 후보" : ""}</Text>
          <Text style={s.muted}>STATUS: {result.verification || "UNVERIFIED"} · {result.impact?.disclaimer}</Text>
        </View>}
      </View>}

      {tab==="billing" && <View>
        <Text style={s.eyebrow}>04 · BILLING</Text><Text style={s.title}>Revenue is part{ "\n" }of the product.</Text>
        <View style={s.card}><Text style={s.label}>QUICK AUDIT</Text><Text style={s.price}>₩99,000</Text><Text style={s.sub}>AI Quick Audit · one-time</Text><TouchableOpacity style={s.primary} onPress={buy}><Text style={s.primaryText}>OPEN CHECKOUT →</Text></TouchableOpacity></View>
        <View style={s.card}><Text style={s.label}>ENTITLEMENT</Text><Text style={s.cardTitle}>FAIL-CLOSED</Text><Text style={s.sub}>Checkout return is not treated as proof of payment. Verified webhook + server-side entitlement is required before paid access is granted.</Text></View>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#08090b"},header:{height:64,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:"#292c33"},
  logo:{color:"#fff",fontWeight:"900",letterSpacing:3,fontSize:16},status:{color:"#ffd58a",fontSize:8,letterSpacing:.8},nav:{height:48,borderBottomWidth:1,borderBottomColor:"#292c33",flexDirection:"row",paddingHorizontal:8},
  navItem:{paddingHorizontal:10,justifyContent:"center"},navActive:{borderBottomWidth:2,borderBottomColor:"#fff"},navText:{color:"#777d88",fontSize:9,letterSpacing:.8},navTextActive:{color:"#fff"},
  content:{padding:20,paddingBottom:50},eyebrow:{color:"#9298a3",fontSize:9,letterSpacing:2,fontWeight:"800",marginBottom:12},title:{color:"#f5f6f7",fontSize:38,fontWeight:"800",letterSpacing:-1.5,lineHeight:39,marginBottom:14},
  sub:{color:"#9298a3",fontSize:13,lineHeight:20,marginBottom:16},card:{backgroundColor:"#101216",borderWidth:1,borderColor:"#292c33",borderRadius:12,padding:18,marginBottom:12},
  label:{color:"#9298a3",fontSize:9,letterSpacing:1.4,fontWeight:"800",marginTop:8,marginBottom:8},muted:{color:"#777d88",fontSize:10,lineHeight:16},cardTitle:{color:"#fff",fontSize:18,fontWeight:"700",marginBottom:8},
  metric:{color:"#fff",fontSize:28,fontWeight:"800",marginBottom:3},primary:{backgroundColor:"#fff",borderRadius:8,padding:14,alignItems:"center",marginTop:10},primaryText:{color:"#08090b",fontSize:10,fontWeight:"900",letterSpacing:1},
  disabled:{opacity:.5},input:{backgroundColor:"#0b0c0f",borderWidth:1,borderColor:"#292c33",borderRadius:7,color:"#fff",padding:12,marginBottom:12},textarea:{minHeight:120,textAlignVertical:"top"},
  price:{color:"#fff",fontSize:28,fontWeight:"900",marginTop:8},score:{color:"#fff",fontSize:64,fontWeight:"900",marginTop:8},priority:{color:"#ffd58a",fontSize:10,letterSpacing:1.2,marginBottom:18},answer:{color:"#e6e8eb",fontSize:13,lineHeight:21,marginBottom:16},error:{color:"#ff8f8f",fontSize:12,lineHeight:18,marginBottom:8}
});
