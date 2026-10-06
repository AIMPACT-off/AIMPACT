import { validateAuditInput } from "../../lib/audit-input-guard.mjs";
import { calculateAuditRoi } from "../../lib/audit-roi.mjs";

const RULES = [
  ["CONTENT / MARKETING", ["content","copy","사진","이미지","상품","sns","social","marketing","마케팅"], "콘텐츠 제작·배포 업무가 반복 비용을 만들고 있습니다.", "콘텐츠 입력 → AI 초안 → 담당자 승인 → 채널별 배포 → 성과 집계"],
  ["SALES / CRM", ["sales","lead","고객","문의","crm","영업","상담","proposal","견적"], "문의·리드 처리의 분류와 후속조치가 반복 비용을 만들고 있습니다.", "문의 수집 → AI 분류 → 우선순위 → 담당자 배정 → 후속 알림 → 전환 측정"],
  ["OPERATIONS", ["반복","수작업","manual","엑셀","spreadsheet","보고","report","운영","정산","재고"], "반복 입력과 보고 업무가 자동화 후보입니다.", "원천 데이터 → 검증 → 자동 처리 → 예외 승인 → 결과 기록"],
  ["CUSTOMER SUPPORT", ["support","cs","고객센터","불만","환불"], "반복 문의의 분류·초안화가 자동화 후보입니다.", "문의 → 의도 분류 → 답변 초안 → 사람 승인 → 발송 → 만족도 측정"]
];

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const body = JSON.parse(event.body || "{}");
    const input = validateAuditInput(body);
    const problem = input.problem.toLowerCase();
    const match = RULES.find(([, keywords]) => keywords.some(k => problem.includes(k)));
    const [category, , conclusion, workflow] = match || [
      "GENERAL PROCESS", [], "업무를 단계별로 분해해 반복·판단·승인 구간을 분리하고 자동화 우선순위를 정합니다.",
      "현재 업무 → 단계 분해 → 병목 측정 → AI 적용 → 승인 → 결과 측정"
    ];
    const hours = Number(body.monthlyManualHours);
    const cost = Number(body.monthlyProcessCost);
    const hasHours = Number.isFinite(hours) && hours > 0;
    const hasCost = Number.isFinite(cost) && cost > 0;
    const estimatedHoursSaved = hasHours ? Math.round(hours * 0.35) : null;
    const estimatedValue = hasHours && hasCost ? Math.round(cost * 0.35) : null;
    const score = Math.min(95, 45 + (hasHours ? 20 : 0) + (hasCost ? 15 : 0) + (input.problem.length > 80 ? 10 : 0) + (match ? 10 : 0));
    const roi = calculateAuditRoi({ assumptions: { hoursSavedPerMonth: estimatedHoursSaved || 0 } });
    return json(200, {
      stage: "DIAGNOSIS_COMPLETE",
      engine: "AIMPACT_SERVER_DIAGNOSTIC_V1",
      verification: "UNVERIFIED",
      customer: { company: input.company, industry: input.industry },
      diagnosis: {
        score, category, problem: input.problem,
        whyItMatters: conclusion,
        businessImpact: hasHours || hasCost ? "입력된 운영 데이터 기준으로 자동화 후보를 산정했습니다. 실제 성과는 구현 후 측정해야 합니다." : "정량 데이터가 부족해 비용·시간 영향은 산정하지 않았습니다.",
        aiOpportunity: "반복 업무의 분류·초안·라우팅·보고 단계를 AI 적용 후보로 식별합니다.",
        recommendedWorkflow: workflow,
        nextAction: "현재 프로세스의 실제 입력·승인·출력 단계를 수집한 뒤 구현 범위를 확정합니다."
      },
      impact: {
        monthlyHoursSavedEstimate: estimatedHoursSaved,
        monthlyValueEstimateKrw: estimatedValue,
        roiEvidence: roi.confidence,
        disclaimer: "모든 절감·ROI 수치는 추정치이며 고객 성과로 검증된 값이 아닙니다."
      }
    });
  } catch (error) {
    return json(400, { error: "audit_request_rejected", message: error?.message || "Invalid audit request" });
  }
}
