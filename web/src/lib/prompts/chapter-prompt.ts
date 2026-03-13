export function getChapterPrompt(
  chapterContext: string,
  styleGuide: string,
  previousContext: string,
  chapterNumber: number,
  foreshadowingInstructions: string,
): string {
  return `## 회차 정보
${chapterContext}

## 스타일 가이드
${styleGuide}

## 이전 전개
${previousContext}

## 지시사항
위 컨텍스트를 바탕으로 ${chapterNumber}화를 작성해주세요.

카카오페이지 스타일 필수 요소:
1. 짧은 문단 (3문장 이하)
2. 대사 비중 60% 이상
3. 매 회차 끝에 후킹 (궁금증 유발)
4. 6000자 내외
${chapterNumber <= 3 ? `
### 초반부 특별 지시 (${chapterNumber}화) — 반드시 따를 것!

**전개 속도:**
- 이 화에서 다뤄야 할 핵심 포인트가 위에 적혀 있지만, 전부 소화하려 하지 말 것
- ${chapterNumber === 1 ? '1화는 "한 장면"이면 충분하다. 주인공이 처한 상황 하나를 깊이 있게 보여줘라.' : `${chapterNumber}화도 아직 초반이다. 한 걸음씩만.`}
- 사건을 나열하지 말고, 하나의 사건을 디테일하게 — 대화, 감각, 공간 묘사로 채워라
- "그리고 다음날" "며칠 후" 같은 시간 점프 금지. 한 장면에 머물러라.

**캐릭터:**
- 등장 캐릭터 목록에 여러 명이 있어도, 주인공 중심 1~2명만 제대로 등장
- 나머지는 이름 없이 암시만 하거나 아예 등장시키지 말 것

**분위기:**
- 독자가 "이 세계는 어떤 곳이지?" "이 주인공은 누구지?"를 느끼게 하는 게 이 화의 목표
- 스토리를 진행시키는 게 아니라, 독자를 이 세계에 착지시키는 것
- "설정 덤프" 금지: 세계관, 능력 체계 등을 설명하지 말고, 장면 속에서 자연스럽게 드러내라` : ''}

${foreshadowingInstructions}

출력: 소설 본문만 (메타 정보 없이)`;
}
