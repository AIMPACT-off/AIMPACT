import React, { useEffect, useMemo, useState } from "react";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { authConfigReady, sendOtp, verifyOtp, getSessionToken } from "./session";

const ENTITLEMENT_API = "https://aimpact-ai.netlify.app/api/entitlement";
const CHECKOUT_API = "https://aimpact-ai.netlify.app/api/checkout";
const AUDIT_API = "https://aimpact-ai.netlify.app/api/audit";

export default function App() {
  const [tab, setTab] = useState("overview");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [industry, setIndustry] = useState("Retail");
  const [problem, setProblem] = useState("");
  const [hours, setHours] = useState("");
  const [cost, setCost] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [paid, setPaid] = useState(false);
  const [notice, setNotice] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

  const requestOtp = async () => {
    try {
      if (!authConfigReady) throw new Error("AUTH_PROVIDER_NOT_CONFIGURED");
      if (!email.trim()) throw new Error("EMAIL_REQUIRED");
      await sendOtp(email);
      setOtpSent(true);
      setNotice("인증코드를 이메일로 보냈습니다.");
    } catch (error) {
      setNotice(error.message === "AUTH_PROVIDER_NOT_CONFIGURED"
        ? "Supabase Auth 설정이 아직 연결되지 않았습니다."
        : "인증코드를 보내지 못했습니다. 이메일을 확인해 주세요.");
    }
  };

  const confirmOtp = async () => {
    try {
      const session = await verifyOtp(email, otp);
      const token = getSessionToken(session);
      if (!token) throw new Error("AUTH_SESSION_MISSING");
      setSessionToken(token);
      setNotice("고객 인증 완료 · 테넌트가 중앙통제에 영구 연결됩니다.");
    } catch {
      setNotice("인증코드가 올바르지 않거나 만료되었습니다.");
    }
  };

  const verifyPaidEntitlement = async (url) => {
    try {
      const sessionId = new URL(url).searchParams.get("session_id");
      if (!sessionId) return false;
      const response = await fetch(ENTITLEMENT_API + "?session_id=" + encodeURIComponent(sessionId), { headers: { Authorization: "Bearer " + sessionToken } });
      const body = await response.json();
      const verified = body?.verified === true;
      setPaid(verified);
      if (verified) {
        setNotice("결제 검증 완료 · AI Quick Audit unlocked");
        setTab("reports");
      }
      return verified;
    } catch {
      setPaid(false);
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;
    Linking.getInitialURL().then(url => { if (mounted && url) verifyPaidEntitlement(url); });
    const sub = Linking.addEventListener("url", ({ url }) => { if (mounted) verifyPaidEntitlement(url); });
    return () => { mounted = false; sub.remove(); };
  }, []);

  const run = async () => {
    setNotice("");
    if (!sessionToken) { setNotice("고객 인증 후 AI AUDIT을 실행할 수 있습니다."); return; }
    if (!company.trim() || !email.trim() || !problem.trim()) {
      setNotice("회사명·이메일·실제 업무 문제를 입력해 주세요.");
      return;
    }
    try {
      setNotice("AI AUDIT 실행 중 · 중앙 서버에서 검증 가능한 진단을 생성합니다.");
      const response = await fetch(AUDIT_API, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + sessionToken },
        body: JSON.stringify({
          company: company.trim(),
          email: email.trim(),
          industry: industry.trim() || "General",
          problem: problem.trim(),
          currentTools: ""
        })
      });
      const body = await response.json();
      if (!response.ok || body?.verified !== true || !body?.report) {
        setNotice(body?.error === "AI_PROVIDER_NOT_CONFIGURED"
          ? "AI 엔진이 아직 개통되지 않았습니다. 중앙통제에서 공급자 인증을 완료해야 합니다."
          : "AI 진단을 완료하지 못했습니다. 결제나 결과를 허위로 표시하지 않습니다.");
        return;
      }
      const audit = {
        ...body.report,
        createdAt: new Date().toISOString(),
        auditId: body.auditId,
        industry: industry.trim() || "General"
      };
      setResult(audit);
      setHistory(prev => [audit, ...prev].slice(0, 5));
      setNotice("AI AUDIT 완료 · 서버 검증 및 감사 기록 저장 PASS");
      setTab("reports");
    } catch {
      setNotice("AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  const resetAudit = () => {
    setProblem("");
    setHours("");
    setCost("");
    setResult(null);
    setNotice("");
    setTab("audit");
  };

  const buy = async () => {
    if (!sessionToken) { setNotice("고객 인증 후 결제를 시작할 수 있습니다."); return; }
    try {
      const response = await fetch(CHECKOUT_API, {
        method: "POST",
        headers: { Authorization: "Bearer " + sessionToken, "content-type": "application/json" }
      });
      const body = await response.json();
      if (!response.ok || body?.verified !== true || !body?.checkoutUrl) {
        setNotice("결제 세션을 생성하지 못했습니다. 결제를 허위로 표시하지 않습니다.");
        return;
      }
      await Linking.openURL(body.checkoutUrl);
    } catch {
      setNotice("결제 서버에 연결하지 못했습니다.");
    }
  };

  const nav = [
    ["overview", "OVERVIEW"],
    ["audit", "AI AUDIT"],
    ["reports", "REPORT"],
    ["products", "PRODUCTS"],
    ["billing", "BILLING"]
  ];

  const kpis = useMemo(() => {
    if (!result) return [["BUSINESS HEALTH", "—"], ["AI OPPORTUNITIES", "—"], ["HOURS TO AUTOMATE", "—"], ["ROI TRACKED", "—"]];
    return [
      ["BUSINESS HEALTH", result.score + "/100"],
      ["AI OPPORTUNITIES", result.category],
      ["HOURS TO AUTOMATE", result.saving ? String(result.saving) + "h" : "VERIFY"],
      ["ROI TRACKED", result.value ? "₩" + result.value.toLocaleString() : "VERIFY"]
    ];
  }, [result]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.logo}>AIMPACT</Text>
        <View style={s.headerRight}>
          <View style={[s.dot, paid && s.dotLive]} />
          <Text style={s.status}>{paid ? "AUDIT UNLOCKED" : "AI BUSINESS OS"}</Text>
        </View>
      </View>

      {!sessionToken && (
        <View style={s.card}>
          <Text style={s.label}>CUSTOMER AUTH · REQUIRED FOR VERIFIED AI AUDIT</Text>
          <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@company.com" placeholderTextColor="#656a73" style={s.input} />
          {!otpSent ? (
            <TouchableOpacity style={s.secondary} onPress={requestOtp}><Text style={s.secondaryText}>SEND EMAIL CODE</Text></TouchableOpacity>
          ) : (
            <View>
              <TextInput value={otp} onChangeText={setOtp} keyboardType="number-pad" placeholder="6-digit code" placeholderTextColor="#656a73" style={s.input} />
              <TouchableOpacity style={s.primary} onPress={confirmOtp}><Text style={s.primaryText}>VERIFY CUSTOMER →</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}
      <View style={s.nav}>
        {nav.map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => setTab(id)} style={[s.navItem, tab === id && s.navActive]}>
            <Text style={[s.navText, tab === id && s.navTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {notice ? <View style={s.notice}><Text style={s.noticeText}>{notice}</Text></View> : null}

        {tab === "overview" && (
          <View>
            <Text style={s.eyebrow}>AIMPACT BUSINESS OS · 2026</Text>
            <Text style={s.title}>See the business.{"\n"}Decide. Act. Measure.</Text>
            <Text style={s.sub}>Business Problem → AI Decision → Business Outcome</Text>
            <View style={s.grid}>
              {kpis.map(([label, metric]) => (
                <View style={s.card} key={label}>
                  <Text style={s.label}>{label}</Text>
                  <Text style={s.metric}>{metric}</Text>
                  <Text style={s.muted}>{result ? "Current audit signal" : "Verified evidence required"}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.primary} onPress={() => setTab("audit")}>
              <Text style={s.primaryText}>START AI AUDIT →</Text>
            </TouchableOpacity>
            <View style={s.card}>
              <Text style={s.cardTitle}>THE AIMPACT LOOP</Text>
              <Text style={s.sub}>DISCOVER → VERIFY → COMPARE → APPLY</Text>
              <Text style={s.muted}>Problem을 발견하고, 증거를 검증한 뒤 AI 의사결정과 실행으로 연결합니다.</Text>
            </View>
          </View>
        )}

        {tab === "audit" && (
          <View>
            <Text style={s.eyebrow}>01 · AI AUDIT</Text>
            <Text style={s.title}>Start with one{"\n"}real problem.</Text>
            <View style={s.card}>
              <Text style={s.label}>COMPANY *</Text>
              <TextInput value={company} onChangeText={setCompany} placeholder="Your company" placeholderTextColor="#656a73" style={s.input} />
              <Text style={s.label}>EMAIL *</Text>
              <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@company.com" placeholderTextColor="#656a73" style={s.input} />
              <Text style={s.label}>INDUSTRY</Text>
              <TextInput value={industry} onChangeText={setIndustry} placeholder="Retail / E-commerce / SaaS" placeholderTextColor="#656a73" style={s.input} />
              <Text style={s.label}>BUSINESS PROBLEM *</Text>
              <TextInput value={problem} onChangeText={setProblem} placeholder="What takes too much time, money or attention?" placeholderTextColor="#656a73" multiline style={[s.input, s.textarea]} />
              <Text style={s.label}>MONTHLY MANUAL HOURS</Text>
              <TextInput value={hours} onChangeText={setHours} keyboardType="numeric" placeholder="100" placeholderTextColor="#656a73" style={s.input} />
              <Text style={s.label}>MONTHLY PROCESS COST · KRW</Text>
              <TextInput value={cost} onChangeText={setCost} keyboardType="numeric" placeholder="3000000" placeholderTextColor="#656a73" style={s.input} />
              <TouchableOpacity style={s.primary} onPress={run}>
                <Text style={s.primaryText}>RUN AI AUDIT →</Text>
              </TouchableOpacity>
              <Text style={s.muted}>AI 서버가 생성한 진단만 정식 결과로 표시합니다. ROI는 측정 전까지 확정하지 않습니다.</Text>
            </View>
          </View>
        )}

        {tab === "reports" && (
          <View>
            <Text style={s.eyebrow}>02 · EXECUTIVE REPORT</Text>
            <Text style={s.title}>Turn the problem{"\n"}into an action plan.</Text>
            {!result ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>NO AUDIT YET</Text>
                <Text style={s.sub}>실제 업무 문제 하나를 입력하면 즉시 첫 진단 결과를 생성합니다.</Text>
                <TouchableOpacity style={s.primary} onPress={() => setTab("audit")}><Text style={s.primaryText}>RUN AUDIT →</Text></TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={s.scoreCard}>
                  <Text style={s.label}>AIMPACT OPPORTUNITY SCORE</Text>
                  <Text style={s.score}>{result.score}</Text>
                  <Text style={s.priority}>{result.category} · {result.industry}</Text>
                </View>
                <View style={s.card}>
                  <Text style={s.label}>CONCLUSION</Text>
                  <Text style={s.answer}>{result.conclusion}</Text>
                  <Text style={s.label}>RECOMMENDED WORKFLOW</Text>
                  <Text style={s.answer}>{result.workflow}</Text>
                  <Text style={s.label}>EXPECTED IMPACT</Text>
                  <Text style={s.answer}>{result.saving ? "월 약 " + result.saving + "시간 절감 후보" : "정량 데이터가 없어 절감시간을 추정하지 않습니다."}{result.value ? " · 비용 기준 환산 후보 ₩" + result.value.toLocaleString() + "/월" : ""}</Text>
                  <Text style={s.label}>IMPLEMENTATION ORDER</Text>
                  <Text style={s.answer}>1. 현재 프로세스 캡처{"\n"}2. 반복 단계 자동화{"\n"}3. AI 판단 적용{"\n"}4. 사람 승인{"\n"}5. 결과·ROI 측정</Text>
                  <Text style={s.muted}>검증되지 않은 절감·ROI는 성과로 표시하지 않습니다.</Text>
                </View>
                {!paid && (
                  <View style={s.unlock}>
                    <Text style={s.label}>FULL REPORT</Text>
                    <Text style={s.cardTitle}>Unlock the verified AI Quick Audit</Text>
                    <Text style={s.sub}>결제 후 고객 entitlement를 서버에서 검증하고 결과를 정식 고객 상태로 연결합니다.</Text>
                    <TouchableOpacity style={s.primary} onPress={buy}><Text style={s.primaryText}>UNLOCK · ₩99,000 →</Text></TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity style={s.secondary} onPress={resetAudit}><Text style={s.secondaryText}>START ANOTHER AUDIT</Text></TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {tab === "products" && (
          <View>
            <Text style={s.eyebrow}>03 · PRODUCTS</Text>
            <Text style={s.title}>Buy the outcome.{"\n"}Use the platform.</Text>
            <View style={s.card}>
              <Text style={s.label}>START</Text>
              <Text style={s.cardTitle}>AI Quick Audit</Text>
              <Text style={s.sub}>One real business process mapped into an AI opportunity, workflow and implementation order.</Text>
              <Text style={s.price}>₩99,000</Text>
              <Text style={s.muted}>one-time</Text>
              <TouchableOpacity style={s.primary} onPress={buy}><Text style={s.primaryText}>BUY / START →</Text></TouchableOpacity>
            </View>
            <View style={s.card}>
              <Text style={s.label}>GROW · CONTROLLED</Text>
              <Text style={s.cardTitle}>Business AI Platform</Text>
              <Text style={s.sub}>Recurring billing remains closed until live payment, onboarding and entitlement verification are production-ready.</Text>
              <Text style={s.price}>₩490,000</Text>
              <Text style={s.muted}>/ month · not live</Text>
            </View>
          </View>
        )}

        {tab === "billing" && (
          <View>
            <Text style={s.eyebrow}>04 · BILLING</Text>
            <Text style={s.title}>Revenue is part{"\n"}of the product.</Text>
            <View style={s.card}>
              <Text style={s.label}>CHECKOUT</Text>
              <Text style={s.price}>₩99,000</Text>
              <Text style={s.sub}>AI Quick Audit · one-time</Text>
              <TouchableOpacity style={s.primary} onPress={buy}><Text style={s.primaryText}>OPEN CHECKOUT →</Text></TouchableOpacity>
            </View>
            <View style={s.card}>
              <Text style={s.label}>ENTITLEMENT</Text>
              <Text style={s.cardTitle}>{paid ? "VERIFIED · UNLOCKED" : "VERIFICATION REQUIRED"}</Text>
              <Text style={s.sub}>{paid ? "서버 검증된 결제 entitlement가 확인되었습니다." : "Stripe checkout return 자체를 결제 증거로 취급하지 않습니다. 서버 검증 후 고객 entitlement를 활성화합니다."}</Text>
            </View>
            {history.length > 0 && (
              <View style={s.card}>
                <Text style={s.label}>RECENT AUDITS</Text>
                {history.map((h, i) => <TouchableOpacity key={h.createdAt} onPress={() => { setResult(h); setTab("reports"); }} style={s.historyRow}>
                  <Text style={s.historyTitle}>{i + 1}. {h.category}</Text><Text style={s.historyScore}>{h.score}</Text>
                </TouchableOpacity>)}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#08090b"},
  header:{height:64,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:"#292c33"},
  logo:{color:"#fff",fontWeight:"900",letterSpacing:3,fontSize:16},
  headerRight:{flexDirection:"row",alignItems:"center",gap:7},
  dot:{width:6,height:6,borderRadius:3,backgroundColor:"#6c7078"},
  dotLive:{backgroundColor:"#9df0bd"},
  status:{color:"#9298a3",fontSize:9,letterSpacing:1},
  nav:{height:48,borderBottomWidth:1,borderBottomColor:"#292c33",flexDirection:"row",paddingHorizontal:6},
  navItem:{paddingHorizontal:9,justifyContent:"center"},
  navActive:{borderBottomWidth:2,borderBottomColor:"#fff"},
  navText:{color:"#777d88",fontSize:8.5,letterSpacing:.7},
  navTextActive:{color:"#fff"},
  content:{padding:20,paddingBottom:60},
  notice:{backgroundColor:"#171a20",borderWidth:1,borderColor:"#383d47",borderRadius:8,padding:11,marginBottom:14},
  noticeText:{color:"#e7e9ed",fontSize:11,lineHeight:16},
  eyebrow:{color:"#9298a3",fontSize:9,letterSpacing:2,fontWeight:"800",marginBottom:12},
  title:{color:"#f5f6f7",fontSize:38,fontWeight:"800",letterSpacing:-1.5,lineHeight:39,marginBottom:14},
  sub:{color:"#9298a3",fontSize:13,lineHeight:20,marginBottom:16},
  grid:{gap:10,marginVertical:18},
  card:{backgroundColor:"#101216",borderWidth:1,borderColor:"#292c33",borderRadius:12,padding:18,marginBottom:12},
  scoreCard:{backgroundColor:"#15171c",borderWidth:1,borderColor:"#3b3f48",borderRadius:12,padding:20,marginBottom:12},
  unlock:{backgroundColor:"#0e1115",borderWidth:1,borderColor:"#555b67",borderRadius:12,padding:18,marginBottom:12},
  label:{color:"#9298a3",fontSize:9,letterSpacing:1.4,fontWeight:"800",marginTop:8,marginBottom:8},
  metric:{color:"#fff",fontSize:25,fontWeight:"800",marginBottom:3},
  muted:{color:"#777d88",fontSize:10,lineHeight:16},
  cardTitle:{color:"#fff",fontSize:18,fontWeight:"700",marginBottom:8},
  primary:{backgroundColor:"#fff",borderRadius:8,padding:14,alignItems:"center",marginTop:10},
  primaryText:{color:"#08090b",fontSize:10,fontWeight:"900",letterSpacing:1},
  secondary:{borderWidth:1,borderColor:"#343842",borderRadius:8,padding:13,alignItems:"center",marginTop:2,marginBottom:12},
  secondaryText:{color:"#c8cbd1",fontSize:10,fontWeight:"800",letterSpacing:1},
  input:{backgroundColor:"#0b0c0f",borderWidth:1,borderColor:"#292c33",borderRadius:7,color:"#fff",padding:12,marginBottom:12},
  textarea:{minHeight:120,textAlignVertical:"top"},
  price:{color:"#fff",fontSize:28,fontWeight:"900",marginTop:8},
  score:{color:"#fff",fontSize:64,fontWeight:"900",marginTop:2},
  priority:{color:"#ffd58a",fontSize:10,letterSpacing:1.2,marginBottom:4},
  answer:{color:"#e6e8eb",fontSize:13,lineHeight:21,marginBottom:16},
  historyRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:11,borderTopWidth:1,borderTopColor:"#292c33"},
  historyTitle:{color:"#e6e8eb",fontSize:12},
  historyScore:{color:"#fff",fontWeight:"800",fontSize:15}
});
