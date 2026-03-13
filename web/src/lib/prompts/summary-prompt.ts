export function getSummaryPrompt(chapterContent: string): string {
  return `다음 회차 내용을 분석하여 구조화된 요약을 생성해주세요.

## 회차 내용
${chapterContent}

## 출력 형식 (JSON)
\`\`\`json
{
  "plot_summary": "1-2문장 줄거리 요약",
  "emotional_beat": "감정적 톤 (예: 긴장, 감동, 통쾌)",
  "cliffhanger": "마지막 후킹 요소 (없으면 null)",
  "events": [
    {
      "type": "battle|dialogue|discovery|training|romance|betrayal|death|power_up|flashback|cliffhanger",
      "participants": ["캐릭터ID"],
      "description": "무슨 일이 있었는지",
      "outcome": "결과",
      "consequences": {"키": "값"}
    }
  ],
  "character_changes": [
    {
      "character_id": "ID",
      "changes": {"속성": "변화 내용"}
    }
  ],
  "foreshadowing_touched": [
    {
      "foreshadowing_id": "ID",
      "action": "plant|hint|reveal",
      "context": "어떻게 등장했는지"
    }
  ]
}
\`\`\`

중요:
- 캐릭터ID는 seed에 정의된 id 사용
- 복선은 실제로 언급된 것만 기록
- 캐릭터 변화는 유의미한 것만 (레벨업, 관계 변화 등)`;
}
