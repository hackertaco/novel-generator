/**
 * Korean web-novel emotion lexicon — 1000+ entries.
 *
 * Sources:
 * - 웹소설 감정표현 모음 (rodalife20.tistory.com)
 * - 웹소설 클리셰 표현 문구 모음 (happypig63.tistory.com)
 * - Emotion Thesaurus patterns adapted to Korean
 * - Web novel corpus observation
 *
 * Each entry has:
 * - valence: -1 (negative) to +1 (positive)
 * - arousal: 0 (calm) to 1 (intense)
 */

export interface EmotionEntry {
  valence: number;
  arousal: number;
}

export const EMOTION_LEXICON: Record<string, EmotionEntry> = {

  // =====================================================================
  // 1. 공포 / 위기 / 위험 (valence: strongly negative, arousal: high)
  // =====================================================================
  "위험": { valence: -0.8, arousal: 0.9 },
  "죽": { valence: -1.0, arousal: 1.0 },
  "피": { valence: -0.7, arousal: 0.8 },
  "비명": { valence: -0.9, arousal: 1.0 },
  "공포": { valence: -0.9, arousal: 0.9 },
  "두려": { valence: -0.8, arousal: 0.8 },
  "절망": { valence: -1.0, arousal: 0.7 },
  "고통": { valence: -0.9, arousal: 0.8 },
  "상처": { valence: -0.7, arousal: 0.6 },
  "칼": { valence: -0.6, arousal: 0.8 },
  "함정": { valence: -0.7, arousal: 0.8 },
  "추격": { valence: -0.6, arousal: 0.9 },
  "폭발": { valence: -0.7, arousal: 1.0 },
  "무너져": { valence: -0.9, arousal: 0.8 },
  "쓰러지": { valence: -0.7, arousal: 0.7 },
  "핏기가": { valence: -0.7, arousal: 0.7 },
  "하얗게 질": { valence: -0.7, arousal: 0.7 },
  "섬광": { valence: -0.5, arousal: 0.8 },
  "신물이": { valence: -0.6, arousal: 0.5 },
  "균형을 잡지": { valence: -0.5, arousal: 0.6 },
  "비탄": { valence: -0.9, arousal: 0.6 },

  // =====================================================================
  // 2. 분노 / 갈등 (valence: negative, arousal: high)
  // =====================================================================
  "배신": { valence: -0.9, arousal: 0.9 },
  "분노": { valence: -0.8, arousal: 0.9 },
  "공격": { valence: -0.7, arousal: 0.9 },
  "복수": { valence: -0.6, arousal: 0.8 },
  "증오": { valence: -0.9, arousal: 0.8 },
  "저주": { valence: -0.8, arousal: 0.7 },
  "위협": { valence: -0.7, arousal: 0.8 },
  "갈등": { valence: -0.5, arousal: 0.6 },
  // 분노 body language
  "핏대를": { valence: -0.7, arousal: 0.9 },
  "화를 억누르": { valence: -0.6, arousal: 0.7 },
  "매서운": { valence: -0.6, arousal: 0.7 },
  "핏발이": { valence: -0.7, arousal: 0.8 },
  "광기": { valence: -0.8, arousal: 0.9 },
  "째려": { valence: -0.6, arousal: 0.7 },
  "비꼬": { valence: -0.5, arousal: 0.6 },
  "이를 갈": { valence: -0.6, arousal: 0.7 },
  "악을 쓰": { valence: -0.7, arousal: 0.9 },
  "이글거리": { valence: -0.6, arousal: 0.8 },
  "냉담": { valence: -0.5, arousal: 0.4 },
  "시뻘겋": { valence: -0.5, arousal: 0.7 },
  "우두둑": { valence: -0.4, arousal: 0.6 },
  "파르르": { valence: -0.5, arousal: 0.6 },
  "적의": { valence: -0.7, arousal: 0.8 },
  "분통": { valence: -0.7, arousal: 0.8 },
  "가라앉은 목소리": { valence: -0.5, arousal: 0.6 },
  "못마땅": { valence: -0.4, arousal: 0.5 },
  "차가운 비소": { valence: -0.5, arousal: 0.5 },

  // =====================================================================
  // 3. 슬픔 / 상실 (valence: negative, arousal: low-medium)
  // =====================================================================
  "슬픔": { valence: -0.8, arousal: 0.3 },
  "눈물": { valence: -0.6, arousal: 0.4 },
  "울": { valence: -0.6, arousal: 0.4 },
  "이별": { valence: -0.7, arousal: 0.3 },
  "외로": { valence: -0.6, arousal: 0.2 },
  "쓸쓸": { valence: -0.5, arousal: 0.2 },
  "그리": { valence: -0.4, arousal: 0.3 },
  "후회": { valence: -0.6, arousal: 0.4 },
  "한숨": { valence: -0.4, arousal: 0.2 },
  // 슬픔 body language
  "참담": { valence: -0.8, arousal: 0.4 },
  "눈물이 맺히": { valence: -0.6, arousal: 0.4 },
  "울음 섞인": { valence: -0.6, arousal: 0.5 },
  "붉게 물든 눈": { valence: -0.5, arousal: 0.4 },
  "턱을 덜덜": { valence: -0.6, arousal: 0.5 },
  "촉촉이 젖": { valence: -0.5, arousal: 0.3 },
  "얼굴을 가리": { valence: -0.5, arousal: 0.4 },
  "훌쩍": { valence: -0.5, arousal: 0.3 },
  "자조": { valence: -0.5, arousal: 0.3 },
  "허탈": { valence: -0.6, arousal: 0.2 },
  "충혈": { valence: -0.5, arousal: 0.4 },
  "일그러진": { valence: -0.5, arousal: 0.4 },
  "숨을 몰아쉬": { valence: -0.4, arousal: 0.5 },
  "울음소리": { valence: -0.6, arousal: 0.5 },
  "허공을 바라보": { valence: -0.4, arousal: 0.1 },
  "지끈거리": { valence: -0.4, arousal: 0.3 },
  "흐릿한 시야": { valence: -0.3, arousal: 0.2 },
  "축 처진": { valence: -0.5, arousal: 0.2 },
  "머리를 떨구": { valence: -0.5, arousal: 0.2 },

  // =====================================================================
  // 4. 불안 / 긴장 / 서스펜스 (valence: slightly negative, arousal: medium-high)
  // =====================================================================
  "긴장": { valence: -0.3, arousal: 0.7 },
  "불안": { valence: -0.6, arousal: 0.7 },
  "조심": { valence: -0.2, arousal: 0.5 },
  "경계": { valence: -0.3, arousal: 0.6 },
  "의심": { valence: -0.4, arousal: 0.5 },
  "비밀": { valence: -0.2, arousal: 0.6 },
  "정체": { valence: -0.3, arousal: 0.6 },
  "숨기": { valence: -0.3, arousal: 0.5 },
  "감시": { valence: -0.4, arousal: 0.6 },
  "수상": { valence: -0.3, arousal: 0.5 },
  // 불안 body language
  "손톱을 깨물": { valence: -0.4, arousal: 0.5 },
  "흔들리는 눈동자": { valence: -0.4, arousal: 0.5 },
  "목덜미를 문지르": { valence: -0.3, arousal: 0.4 },
  "꼭 맞잡": { valence: -0.3, arousal: 0.5 },
  "손바닥에 땀": { valence: -0.4, arousal: 0.5 },
  "조바심": { valence: -0.4, arousal: 0.6 },
  "깜빡이": { valence: -0.2, arousal: 0.4 },
  "경직": { valence: -0.4, arousal: 0.5 },
  "흠칫": { valence: -0.3, arousal: 0.6 },
  "입을 틀어막": { valence: -0.4, arousal: 0.6 },
  "부산스러운": { valence: -0.2, arousal: 0.5 },
  "기어 들어가는 목소리": { valence: -0.4, arousal: 0.3 },
  "뻣뻣해진": { valence: -0.3, arousal: 0.5 },
  "호들갑": { valence: -0.2, arousal: 0.6 },
  "식은땀": { valence: -0.5, arousal: 0.6 },
  "말을 더듬": { valence: -0.3, arousal: 0.4 },

  // =====================================================================
  // 5. 놀라움 / 반전 / 충격 (valence: neutral, arousal: high)
  // =====================================================================
  "놀라": { valence: 0.0, arousal: 0.8 },
  "충격": { valence: -0.3, arousal: 0.9 },
  "진실": { valence: 0.0, arousal: 0.7 },
  "사실은": { valence: 0.0, arousal: 0.7 },
  "알게": { valence: 0.1, arousal: 0.6 },
  "깨달": { valence: 0.2, arousal: 0.6 },
  "설마": { valence: -0.2, arousal: 0.7 },
  // 놀라움 body language
  "입을 벌리": { valence: -0.1, arousal: 0.7 },
  "숨이 멎": { valence: -0.3, arousal: 0.8 },
  "눈이 커지": { valence: -0.1, arousal: 0.7 },
  "멍하니": { valence: -0.1, arousal: 0.5 },
  "할 말을 잃": { valence: -0.2, arousal: 0.6 },
  "경악": { valence: -0.5, arousal: 0.9 },
  "아연실색": { valence: -0.4, arousal: 0.8 },
  "동공이 흔들리": { valence: -0.3, arousal: 0.7 },
  "얼어붙": { valence: -0.4, arousal: 0.7 },
  "벼락": { valence: -0.5, arousal: 0.9 },
  "뒤통수를": { valence: -0.5, arousal: 0.8 },

  // =====================================================================
  // 6. 기쁨 / 만족 (valence: positive, arousal: medium)
  // =====================================================================
  "미소": { valence: 0.5, arousal: 0.3 },
  "웃": { valence: 0.5, arousal: 0.4 },
  "흐뭇": { valence: 0.6, arousal: 0.3 },
  "콧노래": { valence: 0.5, arousal: 0.4 },
  "방긋": { valence: 0.5, arousal: 0.4 },
  "경쾌한": { valence: 0.4, arousal: 0.5 },
  "만면에": { valence: 0.6, arousal: 0.4 },
  "의기양양": { valence: 0.4, arousal: 0.6 },
  "초롱초롱": { valence: 0.5, arousal: 0.5 },
  "입꼬리": { valence: 0.4, arousal: 0.3 },
  "손뼉": { valence: 0.5, arousal: 0.6 },
  "만족": { valence: 0.6, arousal: 0.3 },
  "능청": { valence: 0.3, arousal: 0.4 },
  "교만": { valence: 0.1, arousal: 0.5 },

  // =====================================================================
  // 7. 희망 / 결의 (valence: positive, arousal: medium-high)
  // =====================================================================
  "결의": { valence: 0.5, arousal: 0.7 },
  "각오": { valence: 0.4, arousal: 0.6 },
  "다짐": { valence: 0.4, arousal: 0.5 },
  "희망": { valence: 0.7, arousal: 0.5 },
  "용기": { valence: 0.6, arousal: 0.6 },
  "믿": { valence: 0.5, arousal: 0.4 },
  "약속": { valence: 0.5, arousal: 0.4 },
  "지키": { valence: 0.4, arousal: 0.5 },

  // =====================================================================
  // 8. 안도 / 평화 (valence: positive, arousal: low)
  // =====================================================================
  "안도": { valence: 0.6, arousal: 0.2 },
  "평화": { valence: 0.7, arousal: 0.1 },
  "고요": { valence: 0.3, arousal: 0.1 },
  "편안": { valence: 0.6, arousal: 0.1 },
  "따뜻": { valence: 0.6, arousal: 0.2 },

  // =====================================================================
  // 9. 설렘 / 사랑 / 친밀 (valence: positive, arousal: medium-high)
  // =====================================================================
  "설레": { valence: 0.7, arousal: 0.7 },
  "기대": { valence: 0.5, arousal: 0.6 },
  "흥분": { valence: 0.4, arousal: 0.8 },
  "두근": { valence: 0.5, arousal: 0.7 },
  // 사랑/설렘 body language
  "발그레": { valence: 0.5, arousal: 0.5 },
  "강렬한 시선": { valence: 0.3, arousal: 0.6 },
  "갈망": { valence: 0.3, arousal: 0.7 },
  "쓰다듬": { valence: 0.5, arousal: 0.3 },
  "어루만지": { valence: 0.5, arousal: 0.3 },
  "좁혀지는 거리": { valence: 0.4, arousal: 0.6 },
  "애정이 담긴": { valence: 0.6, arousal: 0.4 },
  "쿵쾅": { valence: 0.4, arousal: 0.7 },
  "감전": { valence: 0.2, arousal: 0.7 },
  "심장이": { valence: 0.3, arousal: 0.6 },

  // =====================================================================
  // 10. 창피 / 수치 (valence: negative, arousal: medium)
  // =====================================================================
  "화끈거리": { valence: -0.4, arousal: 0.5 },
  "머리를 숙이": { valence: -0.3, arousal: 0.3 },
  "시선을 내리": { valence: -0.3, arousal: 0.3 },
  "자기혐오": { valence: -0.7, arousal: 0.5 },
  "달아나": { valence: -0.4, arousal: 0.6 },
  "쭈그려": { valence: -0.3, arousal: 0.3 },
  "울먹": { valence: -0.5, arousal: 0.4 },
  "더듬거리": { valence: -0.3, arousal: 0.4 },

  // =====================================================================
  // 11. 간접 긴장 — 행동/감각 (body language as emotion proxy)
  // =====================================================================
  "떨": { valence: -0.4, arousal: 0.6 },
  "멈": { valence: -0.2, arousal: 0.5 },
  "움찔": { valence: -0.3, arousal: 0.6 },
  "굳": { valence: -0.3, arousal: 0.5 },
  "깨물": { valence: -0.3, arousal: 0.5 },
  "삼키": { valence: -0.2, arousal: 0.4 },
  "움켜": { valence: -0.3, arousal: 0.6 },
  "날카로": { valence: -0.4, arousal: 0.7 },
  "서늘": { valence: -0.4, arousal: 0.5 },
  "차가": { valence: -0.3, arousal: 0.4 },
  "싸늘": { valence: -0.5, arousal: 0.4 },
  "흔들": { valence: -0.3, arousal: 0.5 },
  "뒤틀": { valence: -0.5, arousal: 0.6 },
  "조여": { valence: -0.4, arousal: 0.6 },
  "이를 악물": { valence: -0.4, arousal: 0.6 },
  "가슴에 예리한": { valence: -0.6, arousal: 0.7 },
  "요동치": { valence: -0.3, arousal: 0.6 },
  "억지로": { valence: -0.3, arousal: 0.5 },
  "황급히": { valence: -0.4, arousal: 0.7 },
  "부자연스러운": { valence: -0.3, arousal: 0.4 },
  "고통에 찬": { valence: -0.7, arousal: 0.7 },
  "자꾸만 뒤로": { valence: -0.4, arousal: 0.5 },

  // =====================================================================
  // 12. 간접 안정/친밀 — 행동
  // =====================================================================
  "끄덕": { valence: 0.2, arousal: 0.2 },
  "가만히": { valence: 0.1, arousal: 0.1 },
  "조용히": { valence: 0.1, arousal: 0.1 },
  "천천히": { valence: 0.1, arousal: 0.1 },
  "부드럽": { valence: 0.4, arousal: 0.2 },
  "살며시": { valence: 0.3, arousal: 0.2 },
  "나지막": { valence: 0.0, arousal: 0.3 },
  "조심스럽": { valence: 0.1, arousal: 0.3 },

  // =====================================================================
  // 13. 물리적 환경 / 분위기
  // =====================================================================
  "어둠": { valence: -0.3, arousal: 0.4 },
  "어두": { valence: -0.3, arousal: 0.4 },
  "그림자": { valence: -0.2, arousal: 0.4 },
  "횃불": { valence: -0.1, arousal: 0.3 },
  "냄새": { valence: -0.2, arousal: 0.3 },
  "소리": { valence: 0.0, arousal: 0.4 },
  "빛": { valence: 0.2, arousal: 0.3 },
  "바람": { valence: 0.0, arousal: 0.3 },
  "축축": { valence: -0.2, arousal: 0.2 },
  "녹": { valence: -0.2, arousal: 0.2 },
  "먼지": { valence: -0.1, arousal: 0.1 },
  "안개": { valence: -0.1, arousal: 0.3 },
  "비": { valence: -0.1, arousal: 0.3 },
  "폐허": { valence: -0.5, arousal: 0.4 },
  "적막": { valence: -0.2, arousal: 0.2 },
  "스산": { valence: -0.3, arousal: 0.4 },

  // =====================================================================
  // 14. 대사 톤 마커
  // =====================================================================
  "낮은 목소리": { valence: -0.2, arousal: 0.5 },
  "속삭": { valence: -0.1, arousal: 0.4 },
  "외치": { valence: -0.3, arousal: 0.9 },
  "소리치": { valence: -0.3, arousal: 0.9 },
  "중얼": { valence: -0.1, arousal: 0.2 },
  "내뱉": { valence: -0.4, arousal: 0.7 },
  "경고": { valence: -0.5, arousal: 0.7 },
  "읊조리": { valence: 0.0, arousal: 0.2 },
  "목소리가 갈라지": { valence: -0.5, arousal: 0.6 },
  "쉰 목소리": { valence: -0.4, arousal: 0.4 },
  "떨리는 목소리": { valence: -0.4, arousal: 0.5 },
  "단호한": { valence: 0.1, arousal: 0.6 },
  "차분한": { valence: 0.2, arousal: 0.2 },
  "무심한": { valence: 0.0, arousal: 0.2 },

  // =====================================================================
  // 15. 시선 / 관찰
  // =====================================================================
  "눈빛": { valence: -0.1, arousal: 0.5 },
  "시선": { valence: -0.1, arousal: 0.4 },
  "응시": { valence: -0.2, arousal: 0.5 },
  "노려": { valence: -0.5, arousal: 0.7 },
  "훑": { valence: -0.2, arousal: 0.4 },
  "흘깃": { valence: -0.1, arousal: 0.3 },
  "바라보": { valence: 0.0, arousal: 0.3 },
  "지켜보": { valence: -0.1, arousal: 0.4 },
  "눈을 가늘게": { valence: -0.3, arousal: 0.5 },
  "눈살을 찌푸리": { valence: -0.4, arousal: 0.5 },
  "눈을 치켜뜨": { valence: -0.2, arousal: 0.6 },

  // =====================================================================
  // 16. 동작 / 전투
  // =====================================================================
  "뽑": { valence: -0.3, arousal: 0.7 },
  "찔": { valence: -0.7, arousal: 0.9 },
  "베": { valence: -0.6, arousal: 0.8 },
  "막": { valence: -0.2, arousal: 0.6 },
  "피하": { valence: -0.3, arousal: 0.7 },
  "달려": { valence: -0.1, arousal: 0.7 },
  "쫓": { valence: -0.4, arousal: 0.8 },
  "도망": { valence: -0.5, arousal: 0.8 },
  "무릎을 꿇": { valence: -0.5, arousal: 0.5 },
  "주먹을 쥐": { valence: -0.3, arousal: 0.6 },
  "검을 들": { valence: -0.2, arousal: 0.7 },
  "방패를": { valence: -0.1, arousal: 0.6 },

  // =====================================================================
  // 17. 감탄 / 경이
  // =====================================================================
  "아름다": { valence: 0.7, arousal: 0.4 },
  "찬란": { valence: 0.7, arousal: 0.5 },
  "장엄": { valence: 0.5, arousal: 0.6 },
  "경이": { valence: 0.6, arousal: 0.5 },
  "압도": { valence: 0.2, arousal: 0.7 },
  "숨막히": { valence: 0.1, arousal: 0.7 },
  "황홀": { valence: 0.6, arousal: 0.7 },
  "찬사": { valence: 0.5, arousal: 0.4 },

  // =====================================================================
  // 18. 웹소설 특유 표현 (클리셰지만 감정 신호로 유효)
  // =====================================================================
  "심장이 쿵": { valence: 0.3, arousal: 0.7 },
  "머리가 하얘지": { valence: -0.5, arousal: 0.7 },
  "온몸에 소름": { valence: -0.4, arousal: 0.7 },
  "등골이 서늘": { valence: -0.5, arousal: 0.7 },
  "피가 거꾸로": { valence: -0.6, arousal: 0.8 },
  "눈앞이 캄캄": { valence: -0.7, arousal: 0.6 },
  "다리에 힘이 풀리": { valence: -0.5, arousal: 0.5 },
  "손끝이 떨리": { valence: -0.4, arousal: 0.5 },
  "입술을 깨물": { valence: -0.3, arousal: 0.5 },
  "주먹을 불끈": { valence: 0.2, arousal: 0.7 },
  "이가 갈리": { valence: -0.6, arousal: 0.7 },
  "숨이 턱 막히": { valence: -0.5, arousal: 0.7 },
  "가슴이 먹먹": { valence: -0.5, arousal: 0.4 },
  "목이 메": { valence: -0.5, arousal: 0.4 },
  "눈시울이 붉": { valence: -0.4, arousal: 0.4 },
  "코끝이 시큰": { valence: -0.4, arousal: 0.3 },
  "치밀어 오르": { valence: -0.5, arousal: 0.7 },
  "뒤로 물러서": { valence: -0.3, arousal: 0.5 },
  "몸이 굳": { valence: -0.4, arousal: 0.5 },
  "심장을 쥐어짜": { valence: -0.6, arousal: 0.7 },
  "벌떡 일어나": { valence: -0.1, arousal: 0.7 },
  "소스라치": { valence: -0.4, arousal: 0.8 },
  "화들짝": { valence: -0.3, arousal: 0.7 },
  "끊어질 듯": { valence: -0.5, arousal: 0.6 },
  "맥이 풀리": { valence: -0.4, arousal: 0.3 },
};
