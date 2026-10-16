#!/usr/bin/env python3
"""Create a dated AIMPACT Instagram Reels brief and caption; no rendering or publishing."""
import argparse, json
from datetime import date, datetime, timezone
from pathlib import Path

TOPICS = [
 {"theme":"반복 업무 누수","hook":"매일 반복하는 그 업무, 비용으로 계산해 보셨나요?","problem":"반복 입력·복사·확인 업무는 직원의 시간을 조용히 소모합니다.","solution":"AIMPACT는 업무 흐름을 점검해 자동화 후보와 검증 방법을 정리합니다.","measure":"도입 전후 처리 시간·오류 건수·재작업 횟수를 비교합니다.","visual":"반복 업무 카드가 어지럽게 쌓이다 Control Tower 한 화면으로 정돈되는 프리미엄 오피스 모션.","cta":"반복 업무를 진단하려면 프로필 링크에서 상담을 신청하세요."},
 {"theme":"리드 후속 누락","hook":"문의가 들어왔는데, 답장이 늦어지고 있지 않나요?","problem":"담당자 배정과 후속 연락이 늦으면 잠재 고객을 놓칠 수 있습니다.","solution":"AIMPACT는 리드 접수부터 담당자 지정·후속 알림까지 연결할 흐름을 설계합니다.","measure":"응답 시간·미처리 리드 수·상담 전환율을 기준선과 비교합니다.","visual":"여러 창에 흩어진 문의 알림이 Control Tower 대시보드로 모이는 시네마틱 모션.","cta":"리드 관리 흐름을 점검하려면 프로필 링크에서 상담을 신청하세요."},
 {"theme":"재고·콘텐츠 지연","hook":"매출 기회가 사라지는 이유, 광고비만은 아닙니다.","problem":"재고 정보·상품 콘텐츠·판매 채널 업데이트가 어긋나면 기회를 놓칠 수 있습니다.","solution":"AIMPACT는 데이터 전달 지점과 반복 작업을 찾아 개선 우선순위를 정리합니다.","measure":"업데이트 소요 시간·오류율·품절 및 지연 관련 지표를 전후 비교합니다.","visual":"엇갈린 패션 상품·재고 신호가 정돈된 Control Tower 화면으로 바뀌는 장면.","cta":"커머스 업무 병목을 찾으려면 프로필 링크를 확인하세요."}
]
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--date",default=datetime.now(timezone.utc).date().isoformat())
 p.add_argument("--output",default="artifacts/instagram")
 a=p.parse_args(); day=date.fromisoformat(a.date); t=TOPICS[day.toordinal()%len(TOPICS)]
 out=Path(a.output)/a.date; out.mkdir(parents=True,exist_ok=True)
 brief=f"""# AIMPACT Reels Brief — {a.date}

**Status:** DRAFT — NOT RENDERED / NOT PUBLISHED  
**Theme:** {t['theme']} · **Duration:** 20–25 sec · **Format:** 9:16

| Time | Visual | On-screen text / voiceover |
|---|---|---|
| 0–2s | 강렬한 첫 장면, JOHN 등장 | {t['hook']} |
| 2–7s | LEAK가 문제를 드러냄 | {t['problem']} |
| 7–15s | CONTROL TOWER가 업무 흐름을 정리 | {t['solution']} |
| 15–21s | 숫자를 꾸며내지 않은 측정 항목 화면 | {t['measure']} |
| 21–25s | AIMPACT 로고 및 CTA | FIND THE LEAK. FIX WHAT PAYS. / {t['cta']} |

## Visual direction
{t['visual']}
- 프리미엄 에디토리얼 톤, 차콜·화이트·절제된 골드 포인트, 큰 한국어 고딕 자막.
- JOHN은 전문 진행자, LEAK는 숨겨진 문제의 상징, CONTROL TOWER는 근거 확인·우선순위·측정 역할.
- 한국어 내레이션과 사용 권한이 확인된 배경음악. 음성 구간에서는 음악 볼륨을 낮춤.
- 검증되지 않은 ROI 수치, 고객 성과, 성능 주장을 넣지 않음.

## Publish gate
- [ ] MP4가 실제 생성되고 처음부터 끝까지 재생됨
- [ ] 자막 싱크·가독성 확인
- [ ] 내레이션 및 사용 권한 확인된 음악 확인
- [ ] 캐릭터 일관성 확인
- [ ] 사람의 최종 승인 기록
"""
 caption=f"""**{t['hook']}**

{t['problem']}

AIMPACT는 AI를 보여주는 데서 끝나지 않습니다. 업무 흐름에서 반복 작업과 누락 지점을 찾고, 개선 전후를 측정할 방법까지 설계합니다.

**무엇을 확인할까요?** {t['measure']}

{t['cta']}

#AIMPACT #기업자동화 #AI에이전트 #업무자동화 #비즈니스인사이트 #ControlTower
"""
 (out/"reels_brief.md").write_text(brief,encoding="utf-8")
 (out/"caption.md").write_text(caption,encoding="utf-8")
 (out/"manifest.json").write_text(json.dumps({"date":a.date,"theme":t["theme"],"status":"DRAFT_NOT_RENDERED_NOT_PUBLISHED","mp4_created":False,"instagram_published":False,"live_trends_checked":False},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(f"CONTENT_PACKAGE_CREATED={out}")
 print("MP4_RENDERED=false")
 print("INSTAGRAM_PUBLISHED=false")
if __name__=="__main__": main()
