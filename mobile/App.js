import React, { useEffect, useMemo, useState } from "react";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";

const CHECKOUT = "https://buy.stripe.com/test_7sY7sL1Gz1dI7ohg1ofrW04";
const ENTITLEMENT_API = "https://aimpact-ai.netlify.app/api/entitlement";
const AUDIT_API = "https://aimpact-ai.netlify.app/api/audit";

const rules = [
  ["CONTENT / MARKETING", ["content","copy","사진","이미지","상품","sns","social","marketing","마케팅"], "콘텐츠 제작·배포 업무를 표준화하고 생성·재가공을 자동화합니다.", "콘텐츠 입력 → AI 초안 → 담당자 승인 → 채널별 배포 → 성과 집계"],
  ["SALES / CRM", ["sales","lead","고객","문의","crm","영업","상담","proposal","견적"], "문의·리드의 분류와 후속조치를 자동화해 응답 누락을 줄입니다.", "문의 수집 → AI 분류 → 우선순위 → 담당자 배정 → 후속 알림 → 전환 측정"],
  ["OPERATIONS", ["반복","수작업","manual","엑셀","spreadsheet","보고","report","운영","정산","재고"], "반복 입력과 보고 업무를 검증 가능한 워크플로우로 통합합니다.", "원천 데이터 → 검증 → 자동 처리 → 예외 승인 → 결과 기록"],
  ["CUSTOMER SUPPORT", ["support","cs","고객센터","불만","환불"], "반복 문의를 분류·초안화하고 사람의 승인 아래 응답 품질을 관리합니다.", "문의 → 의도 분류 → 답변 초안 → 사람 승인 → 발송 → 만족도 측정"]
];

function makeAudit(problem, hours, cost, industry) {
  const t = problem.toLowerCase();
  const m = rules.find(r => r[1].some(k => t.includes(k))) ||
    ["GENERAL PROCESS", [], "업무를 단계별로 분해하고 반복·판단·승인 구간을 분리한 뒤 자동화 우선순위를 정합니다.", "현재 업무 → 단계 분해 → 병목 측정 → AI 적용 → 승인 → 결과 측정"];
  const h = Number(hours) || 0;
  const c = Number(cost) || 0;
  const saving = h ? Math.max(1, Math.round(h * 0.35)) : null;
  const value = saving && c ? Math.round(c * (saving / Math.max(h, 1))) : null;
  const score = Math.min(95, 45 + (h ? 20 : 0) + (c ? 15 : 0) + (problem.length > 80 ? 10 : 0) + (m[0] !== "GENERAL PROCESS" ? 10 : 0));
  return { score, category: m[0], conclusion: m[2], workflow: m[3], saving, value, industry, createdAt: new Date().toISOString() };
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
  const [history, setHistory] = useState([]);
  const [paid, setPaid] = useState(false);
  const [notice, setNotice] = useState("");

  const verifyPaidEntitlement = async (url) => {
    try {
      const sessionId = new URL(url).searchParams.get("session_id");
      if (!sessionId) return false;
      const response = await fetch(ENTITLEMENT_API + "?session_id=" + encodeURIComponent(sessionId));
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
    if (!company.trim() || !email.trim() || !problem.trim()) {
      setNotice("회사명·이메일·실제 업무 문제를 입력해 주세요.");
      return;
    }
    try {
      setNotice("AI AUDIT 실행 중 · 중앙 서버에서 검증 가능한 진단을 생성합니다.");
      const response = await fetch(AUDIT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
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

  const buy = () => Linking.openURL(CHECKOUT);

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
              <Text style={s.label}>EMAIL *</Text>\n              <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@company.com" placeholderTextColor="#656a73" style={s.input} />\n              <Text style={s.label}>INDUSTRY</Text>
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
