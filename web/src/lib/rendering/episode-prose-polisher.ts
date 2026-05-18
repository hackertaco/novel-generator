import { z } from "zod";

export const EpisodeProsePolishReplacementSchema = z.object({
  pattern: z.string(),
  replacement: z.string(),
  count: z.number().int().nonnegative(),
});

export const EpisodeProsePolishReportSchema = z.object({
  inputCharacterCount: z.number().int().nonnegative(),
  outputCharacterCount: z.number().int().nonnegative(),
  changedReplacementCount: z.number().int().nonnegative(),
  replacements: z.array(EpisodeProsePolishReplacementSchema),
  internalMarkerCount: z.number().int().nonnegative(),
});

export interface EpisodeProsePolishResult {
  text: string;
  report: z.infer<typeof EpisodeProsePolishReportSchema>;
}

interface ReplacementRule {
  pattern: RegExp;
  label: string;
  replacement: string;
}

interface VariantRule {
  pattern: RegExp;
  label: string;
  variants: string[];
  replaceFirst?: boolean;
}

const REPLACEMENT_RULES: ReplacementRule[] = [
  { label: "핵심을 지나친다", pattern: /핵심을 지나친다/gu, replacement: "말을 비껴냈다" },
  { label: "답을 요구한다", pattern: /답을 요구한다/gu, replacement: "답을 요구했다" },
  { label: "질문을 흐린다", pattern: /질문을 흐린다/gu, replacement: "질문을 흘렸다" },
  { label: "부탁을 건넨다", pattern: /부탁을 건넨다/gu, replacement: "부탁을 건넸다" },
  { label: "허락을 기다린다", pattern: /허락을 기다린다/gu, replacement: "허락을 기다렸다" },
  { label: "시선을 둔다", pattern: /시선을 둔다/gu, replacement: "시선을 두었다" },
  { label: "시선을 좇는다", pattern: /시선을 좇는다/gu, replacement: "시선을 좇았다" },
  { label: "길을 연다", pattern: /길을 연다/gu, replacement: "길을 열었다" },
  { label: "말끝을 되받는다", pattern: /말끝을 되받는다/gu, replacement: "말끝을 되받았다" },
  { label: "틈을 줄인다", pattern: /틈을 줄인다/gu, replacement: "틈을 줄였다" },
  { label: "침묵을 고른다", pattern: /침묵을 고른다/gu, replacement: "침묵을 골랐다" },
  { label: "기척을 재본다", pattern: /기척을 재본다/gu, replacement: "기척을 재봤다" },
  { label: "반응을 확인한다", pattern: /반응을 확인한다/gu, replacement: "반응을 확인했다" },
  { label: "손을 둔다", pattern: /손을 둔다/gu, replacement: "손을 두었다" },
  { label: "쪽으로 등진다", pattern: /쪽으로 등진다/gu, replacement: "쪽으로 등을 돌렸다" },
  { label: "표정을 정돈한다", pattern: /표정을 정돈한다/gu, replacement: "표정을 정돈했다" },
  { label: "방향을 바꾼다", pattern: /방향을 바꾼다/gu, replacement: "방향을 바꾸었다" },
  { label: "도움을 청한다", pattern: /도움을 청한다/gu, replacement: "도움을 청했다" },
  { label: "허락을 구한다", pattern: /허락을 구한다/gu, replacement: "허락을 구했다" },
  { label: "거리를 벌린다", pattern: /거리를 벌린다/gu, replacement: "거리를 벌렸다" },
  { label: "시선을 건넨다", pattern: /시선을 건넨다/gu, replacement: "시선을 건넸다" },
  { label: "반응을 기다린다", pattern: /반응을 기다린다/gu, replacement: "반응을 기다렸다" },
  { label: "몫만 말한다", pattern: /몫만 말한다/gu, replacement: "몫만 말했다" },
  { label: "허가를 요구한다", pattern: /허가를 요구한다/gu, replacement: "허가를 요구했다" },
  { label: "대화를 끊는다", pattern: /대화를 끊는다/gu, replacement: "대화를 끊었다" },
  { label: "화제를 비껴간다", pattern: /화제를 비껴간다/gu, replacement: "화제를 비껴갔다" },
  { label: "추궁을 밀어낸다", pattern: /추궁을 밀어낸다/gu, replacement: "추궁을 밀어냈다" },
  { label: "평온한 얼굴만 남긴다", pattern: /평온한 얼굴만 남긴다/gu, replacement: "평온한 얼굴만 남겼다" },
  { label: "표정을 빠르게 거둔다", pattern: /표정을 빠르게 거둔다/gu, replacement: "표정을 빠르게 거뒀다" },
  { label: "질문의 틈을 찌른다", pattern: /질문의 틈을 찌른다/gu, replacement: "질문의 틈을 찔렀다" },
  { label: "반응을 떠본다", pattern: /반응을 떠본다/gu, replacement: "반응을 떠봤다" },
  { label: "얼굴을 되찾는다", pattern: /얼굴을 되찾는다/gu, replacement: "얼굴을 되찾았다" },
  { label: "반문을 남긴다", pattern: /반문을 남긴다/gu, replacement: "반문을 남겼다" },
  { label: "몸을 반쯤 돌린다", pattern: /몸을 반쯤 돌린다/gu, replacement: "몸을 반쯤 돌렸다" },
  { label: "협력을 요구한다", pattern: /협력을 요구한다/gu, replacement: "협력을 요구했다" },
  { label: "고개를 기울인다", pattern: /고개를 기울인다/gu, replacement: "고개를 기울였다" },
  { label: "명분을 세운다", pattern: /명분을 세운다/gu, replacement: "명분을 세웠다" },
  { label: "천천히 번진다", pattern: /천천히 번진다/gu, replacement: "천천히 번졌다" },
  { label: "희미하게 반응한다", pattern: /희미하게 반응한다/gu, replacement: "희미하게 반응했다" },
  { label: "그림자를 숨긴다", pattern: /그림자를 숨긴다/gu, replacement: "그림자를 숨겼다" },
  { label: "짧게 비친다", pattern: /짧게 비친다/gu, replacement: "짧게 비쳤다" },
  { label: "길게 기운다", pattern: /길게 기운다/gu, replacement: "길게 기울었다" },
  { label: "좁아진다", pattern: /좁아진다/gu, replacement: "좁아졌다" },
  { label: "긁고 멈춘다", pattern: /긁고 멈춘다/gu, replacement: "긁고 멈췄다" },
  { label: "문서나 문 쪽", pattern: /문서나 문 쪽/gu, replacement: "닫힌 문 쪽" },
  { label: "향이 말끝", pattern: /향이 말끝/gu, replacement: "엷은 향이 말끝" },
  { label: "대답을 끌어낸다", pattern: /대답을 끌어낸다/gu, replacement: "대답을 끌어냈다" },
  { label: "짧은 질문을 던진다", pattern: /짧은 질문을 던진다/gu, replacement: "짧은 질문을 던졌다" },
  { label: "사이에 침묵을 세운다", pattern: /사이에 침묵을 세운다/gu, replacement: "사이에 침묵을 세웠다" },
  { label: "숨 고른 표정", pattern: /숨을 고르고 향한 표정을 정돈했다/gu, replacement: "숨을 고르고 표정을 정돈했다" },
  { label: "골라야 했다", pattern: /골라야 했다/gu, replacement: "가늠했다" },
  { label: "정해야 했다", pattern: /정해야 했다/gu, replacement: "정했다" },
  { label: "확인해야 했다", pattern: /확인해야 했다/gu, replacement: "확인했다" },
  { label: "감춰야 했다", pattern: /감춰야 했다/gu, replacement: "감췄다" },
  { label: "앞세워야 했다", pattern: /앞세워야 했다/gu, replacement: "앞세웠다" },
  { label: "나눠야 했다", pattern: /나눠야 했다/gu, replacement: "나눴다" },
  { label: "바꿔야 했다", pattern: /바꿔야 했다/gu, replacement: "바꾸었다" },
  { label: "덮어야 했다", pattern: /덮어야 했다/gu, replacement: "덮었다" },
  { label: "붙여야 했다", pattern: /붙여야 했다/gu, replacement: "붙였다" },
  { label: "남겨야 했다", pattern: /남겨야 했다/gu, replacement: "남겼다" },
  { label: "빠진 빠진 줄", pattern: /빠진 빠진 줄/gu, replacement: "빠진 줄" },
  { label: "빈 명단 빈자리", pattern: /빈 명단의 빈자리가/gu, replacement: "명단의 빈자리가" },
  { label: "빈 부르지 않은 이름", pattern: /빈 부르지 않은 이름이/gu, replacement: "부르지 않은 이름이" },
];

const INTERNAL_MARKER_PATTERN = /->|신뢰 축|\bstate\b|\bdelta\b|\bsource\b|act_ch|sourceActionLogId/giu;

const FINAL_CLEANUP_RULES: ReplacementRule[] = [
  { label: "빠진 빠진 줄 final", pattern: /빠진 빠진 줄/gu, replacement: "빠진 줄" },
  { label: "빈 명단 빈자리 final", pattern: /빈 명단의 빈자리가/gu, replacement: "명단의 빈자리가" },
  { label: "빈 부르지 않은 이름 final", pattern: /빈 부르지 않은 이름이/gu, replacement: "부르지 않은 이름이" },
  { label: "중복 빈칸 final", pattern: /빈 빈칸/gu, replacement: "빈칸" },
  { label: "다음 손짓 조사 final", pattern: /([가-힣]+는)\s+다음 손짓은/gu, replacement: "$1 다음 손짓을" },
  { label: "잔 가장자리 너머 final", pattern: /잔 가장자리 너머로 시선을 두었다/gu, replacement: "잔 끝을 따라 시선을 비껴 두었다" },
  { label: "로그식 의무 final", pattern: /해야 했다/gu, replacement: "했다" },
];

const OCCURRENCE_VARIANT_RULES: VariantRule[] = [
  {
    label: "감시자 얼굴",
    pattern: /허가 뒤에 붙을 감시자의 얼굴을 떠올렸다/gu,
    variants: [
      "허가 뒤에 누구의 눈이 붙을지 먼저 떠올렸다",
      "열린 문 뒤의 감시자를 계산했다",
      "허락보다 먼저 감시의 방향을 재었다",
      "문턱이 열릴 때 따라붙을 시선을 떠올렸다",
    ],
  },
  {
    label: "뒤따 위험",
    pattern: /허락할 명분과 뒤따를 위험을 함께 재었다/gu,
    variants: [
      "허락의 이유와 그 뒤의 위험을 함께 재었다",
      "문을 여는 핑계와 닫아야 할 위험을 나란히 놓았다",
      "허락이 만든 틈과 그 틈의 값을 계산했다",
      "들여보낸 뒤 감당할 시선을 먼저 따졌다",
    ],
  },
  {
    label: "열어 줄 문",
    pattern: /열어 줄 문과 막아야 할 시선을 나란히 놓았다/gu,
    variants: [
      "열어 줄 곳과 돌려세울 눈길을 갈라 놓았다",
      "문턱의 안쪽과 바깥쪽을 따로 셈했다",
      "허락할 문과 숨겨야 할 방향을 나누었다",
      "들일 사람과 막을 시선을 동시에 떠올렸다",
    ],
  },
  {
    label: "권한 조건",
    pattern: /한 걸음의 권한에 조건을 붙여야 했다/gu,
    variants: [
      "그 한 걸음에도 값을 붙였다",
      "허락 하나마다 돌아갈 길을 남겼다",
      "권한은 열되 손잡이는 놓지 않았다",
      "문턱을 열어도 감시의 끈은 남겼다",
    ],
  },
  {
    label: "되묻 시선",
    pattern: /되묻는 시선 앞에서 질문의 근거를 감췄다/gu,
    variants: [
      "되묻는 눈앞에서 물음의 출처를 접어 두었다",
      "되돌아온 시선에 근거 대신 예법을 내세웠다",
      "캐묻는 눈을 피해 질문의 시작점을 지웠다",
      "시선이 돌아오자 근거를 말끝 뒤에 숨겼다",
    ],
  },
  {
    label: "감출 우회로",
    pattern: /질문의 출처를 감출 우회로가 필요했다/gu,
    variants: [
      "어디서 들었는지부터 숨겼다",
      "물음의 시작점을 다른 이름 뒤에 감췄다",
      "근거 대신 예법으로 길을 돌렸다",
      "질문이 온 방향을 바꿔 보였다",
    ],
  },
  {
    label: "다른 이름",
    pattern: /끝나지 않은 대답을 다른 이름 아래 숨겼다/gu,
    variants: [
      "멈춘 대답을 다른 장부의 빈칸에 접어 두었다",
      "끝나지 않은 말을 다음 확인자의 이름 뒤로 밀었다",
      "남은 대답을 아직 부르지 않은 이름에 묶었다",
      "대답의 빈자리를 다른 사람의 침묵 속에 숨겼다",
    ],
  },
  {
    label: "단서 하나",
    pattern: /눈에 띄지 않는 단서 하나가 방 안에 남았다/gu,
    variants: [
      "보이지 않는 흔적 하나가 방 안에 가라앉았다",
      "아무도 집지 않은 단서가 문가에 남았다",
      "작은 균열 하나가 말없이 자리를 지켰다",
      "닫히지 않은 흔적 하나가 다음 문턱을 기다렸다",
    ],
  },
  {
    label: "빠진 이름",
    pattern: /빠진 이름부터 다시 확인해야 했다/gu,
    variants: [
      "비어 있는 줄부터 다시 짚었다",
      "사라진 이름의 자리를 먼저 확인했다",
      "명단의 빈칸을 다음 질문으로 남겼다",
      "빠진 줄이 어디서 생겼는지 되짚었다",
    ],
  },
  {
    label: "장부 빈칸",
    pattern: /대답 대신 장부의 빈칸을 기억했다/gu,
    variants: [
      "말보다 장부의 빈자리를 먼저 기억했다",
      "대답은 놓아두고 비어 있는 줄을 붙잡았다",
      "그 말의 빈칸을 장부 끝에 겹쳐 보았다",
      "입보다 기록이 먼저 흔들린다고 보았다",
    ],
  },
  {
    label: "잔 가장자리",
    pattern: /잔 가장자리 너머로 [가-힣]+ 쪽으로 시선을 (?:둔다|두었다)/gu,
    replaceFirst: true,
    variants: [
      "잔 너머로 시선을 낮게 흘렸다",
      "잔 끝을 따라 시선을 비껴 두었다",
      "식은 잔을 사이에 두고 눈길을 눌렀다",
      "잔의 물기 너머로 상대의 움직임을 살폈다",
      "찻잔의 얇은 그림자 뒤로 눈길을 숨겼다",
    ],
  },
  {
    label: "창틀 그림자",
    pattern: /창틀 그림자가 [가-힣]+ 쪽으로 길게 기울었다/gu,
    variants: [
      "창틀 그림자가 바닥으로 길게 밀렸다",
      "커튼 그림자가 문턱을 비껴갔다",
      "창가의 그늘이 두 사람 사이를 가늘게 갈랐다",
      "낮은 빛이 벽면을 따라 느리게 흘렀다",
    ],
  },
  {
    label: "드러난 버릇",
    pattern: /드러난 버릇을 손끝 아래로 감췄다/gu,
    variants: [
      "읽힌 손짓을 조용히 접어 넣었다",
      "드러난 습관을 손끝으로 눌러 숨겼다",
      "방금 들킨 버릇을 다른 표정 아래 묻었다",
      "손끝의 흔들림을 늦게 거두었다",
    ],
  },
  {
    label: "다른 신호",
    pattern: /읽힌 습관을 다른 신호로 덮(?:어야 했|었)다/gu,
    replaceFirst: true,
    variants: [
      "읽힌 버릇 위에 다른 신호를 씌웠다",
      "일부러 다른 손짓을 보였다",
      "방금 보인 습관을 미끼로 바꾸었다",
      "상대가 읽은 방향을 틀었다",
      "들킨 버릇을 다른 표정 아래 묻었다",
    ],
  },
  {
    label: "정식 허가",
    pattern: /정식 허가를 요구했다/gu,
    variants: [
      "명분을 갖춘 허락을 요구했다",
      "절차를 앞세워 문을 열라고 요구했다",
      "물러서지 않고 허가의 말을 끌어냈다",
      "공식적인 허락을 끝까지 요구했다",
    ],
  },
  {
    label: "예법 접근 허락",
    pattern: /예법을 지키며 접근 허락을 구했다/gu,
    variants: [
      "절차를 갖춰 문턱의 허락을 청했다",
      "예법을 앞세워 들어갈 명분을 만들었다",
      "허락의 형식을 갖춰 한 걸음 다가섰다",
      "공식적인 말투로 문을 열어 달라고 했다",
    ],
  },
  {
    label: "접근 허락",
    pattern: /접근 허락을 구했다/gu,
    variants: [
      "문턱의 허락을 청했다",
      "한 걸음 다가설 명분을 구했다",
      "들어갈 수 있는 선을 물었다",
      "허락의 범위를 확인했다",
    ],
  },
  {
    label: "이름 하나 주어",
    pattern: /이름 하나가/gu,
    variants: [
      "빈칸 하나가",
      "빠진 줄 하나가",
      "부르지 않은 이름이",
      "명단의 빈자리가",
    ],
  },
  {
    label: "이름 하나 목적어",
    pattern: /이름 하나를/gu,
    variants: [
      "빈칸 하나를",
      "빠진 줄 하나를",
      "부르지 않은 이름을",
      "명단의 빈자리를",
    ],
  },
  {
    label: "남은 이름 다음 질문",
    pattern: /남은 이름 하나가 다음 질문으로 넘어갔다/gu,
    variants: [
      "비어 있는 줄 하나가 다음 확인으로 넘어갔다",
      "부르지 않은 이름이 다음 문턱에 남았다",
      "명단의 빈자리가 다음 질문을 불렀다",
      "빠진 줄 하나가 다시 사람들 사이로 돌아왔다",
    ],
  },
  {
    label: "대답 대신 되묻는 시선",
    pattern: /대답 대신 되묻는 시선을 건넸다/gu,
    variants: [
      "답하지 않고 되묻는 눈길을 돌렸다",
      "대답보다 먼저 질문의 방향을 되돌렸다",
      "말 대신 되묻는 표정을 남겼다",
      "대답할 자리를 비워 두고 시선을 돌려보냈다",
    ],
  },
  {
    label: "공개 답변 회피",
    pattern: /[가-힣]+의 질문에 공개 답변과 회피 중 하나를 골라야 했다/gu,
    variants: [
      "답할지 비껴갈지 가늠했다",
      "공개적으로 말할지 침묵할지 골랐다",
      "대답의 문을 열지 닫을지 재었다",
      "말을 내놓는 순간의 값을 계산했다",
    ],
  },
  {
    label: "공개 답변 회피 가늠",
    pattern: /[가-힣]+의 질문에 공개 답변과 회피 중 하나를 가늠했다/gu,
    replaceFirst: true,
    variants: [
      "답을 내놓기 전에 잔 가장자리를 한 번 눌렀다",
      "말문을 열 듯하다가 시선을 먼저 돌렸다",
      "대답할 자리를 비워 둔 채 숨을 골랐다",
      "질문을 받은 방향 대신 문가의 그림자를 보았다",
      "말을 삼키고 손끝으로 잔 받침을 밀었다",
      "대답 대신 턱 끝의 각도만 바꾸었다",
    ],
  },
  {
    label: "질문 흘렸다",
    pattern: /질문을 흘렸다/gu,
    variants: [
      "질문을 비껴 냈다",
      "물음을 다른 쪽으로 돌렸다",
      "대답 대신 질문의 방향을 틀었다",
      "묻는 말을 웃음 아래로 흘려보냈다",
    ],
  },
  {
    label: "대답 남기지 않고",
    pattern: /대답을 남기지 않고/gu,
    variants: [
      "대답을 삼킨 채",
      "말을 끝내 비워 둔 채",
      "답할 자리를 비워 두고",
      "대답 대신 침묵을 세우고",
    ],
  },
  {
    label: "물러서지 않고",
    pattern: /물러서지 않고/gu,
    variants: [
      "한 걸음도 물리지 않고",
      "자리를 지킨 채",
      "시선을 피하지 않고",
      "물러날 뜻이 없다는 듯",
    ],
  },
  {
    label: "부드러운 말투",
    pattern: /부드러운 말투로/gu,
    variants: [
      "나긋한 목소리로",
      "웃음을 얇게 남기고",
      "낮고 매끄러운 말로",
      "상냥한 표정을 앞세워",
    ],
  },
  {
    label: "봉인 반응",
    pattern: /봉인이 손등 가까이에서 희미하게 반응했다/gu,
    variants: [
      "봉인 끈이 손등 가까이에서 희미하게 떨렸다",
      "서류의 봉인이 손끝 아래에서 낮게 흔들렸다",
      "닫힌 봉인 위로 흐린 빛이 스쳤다",
      "봉인의 끝이 손등 앞에서 잠깐 멈칫했다",
    ],
  },
  {
    label: "라엘 카이젠 의심",
    pattern: /라엘과 카이젠 사이에 말로 풀 수 없는 의심이 남았다/gu,
    variants: [
      "두 황자 사이에 말로 풀 수 없는 의심이 남았다",
      "라엘은 카이젠을 믿지 못한 채 눈을 거두었다",
      "카이젠 쪽으로 향한 라엘의 침묵이 더 차가워졌다",
      "형제 사이의 거리는 조금 더 벌어졌다",
    ],
  },
  {
    label: "세레나 카이젠 의심",
    pattern: /세레나와 카이젠 사이에 말로 풀 수 없는 의심이 남았다/gu,
    variants: [
      "세레나는 카이젠의 침묵을 쉽게 믿지 못했다",
      "카이젠을 향한 세레나의 눈빛이 한층 조심스러워졌다",
      "두 사람 사이에 남은 의심이 말보다 먼저 굳었다",
      "세레나와 카이젠은 서로의 위치만 다시 가늠했다",
    ],
  },
  {
    label: "한 걸음 물러서기",
    pattern: /여기서는 한 걸음 물러서는 편이 낫습니다/gu,
    variants: [
      "지금은 한 발 물리는 쪽이 안전합니다",
      "여기서 더 밀면 말이 기록으로 남습니다",
      "이 자리에서는 거리를 두는 편이 낫습니다",
      "지금은 물러설 명분을 남겨 두세요",
    ],
  },
  {
    label: "눈 떼지 않고",
    pattern: /[가-힣]+에게서 눈을 떼지 않고/gu,
    variants: [
      "시선을 낮게 고정한 채",
      "상대의 손끝을 살피며",
      "눈길을 느리게 거두며",
      "표정의 끝을 놓치지 않으려",
    ],
  },
  {
    label: "앞에 선 채",
    pattern: /[가-힣]+ 앞에 선 채/gu,
    variants: [
      "문턱 가까이 서서",
      "한 걸음 앞에서",
      "서로의 거리를 재며",
      "반쯤 몸을 돌린 채",
    ],
  },
];

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function normalizeParagraphEndings(text: string): string {
  return text
    .split(/\n\n/gu)
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("#")) return trimmed;
      return /[.!?。！？]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function applyOccurrenceVariants(
  text: string,
  replacements: z.infer<typeof EpisodeProsePolishReplacementSchema>[],
): string {
  let output = text;
  for (const rule of OCCURRENCE_VARIANT_RULES) {
    let occurrence = 0;
    let changed = 0;
    output = output.replace(rule.pattern, (match) => {
      if (occurrence === 0 && !rule.replaceFirst) {
        occurrence += 1;
        return match;
      }
      const variantIndex = rule.replaceFirst ? occurrence : occurrence - 1;
      const replacement = rule.variants[variantIndex % rule.variants.length] ?? match;
      occurrence += 1;
      changed += 1;
      return replacement;
    });
    if (changed > 0) {
      replacements.push({
        pattern: `${rule.label}:occurrence`,
        replacement: "variant",
        count: changed,
      });
    }
  }
  return output;
}

export function polishEpisodeDraftProse(text: string): EpisodeProsePolishResult {
  let output = text;
  const replacements: z.infer<typeof EpisodeProsePolishReplacementSchema>[] = [];

  for (const rule of REPLACEMENT_RULES) {
    const count = countMatches(output, rule.pattern);
    if (count === 0) continue;
    output = output.replace(rule.pattern, rule.replacement);
    replacements.push({
      pattern: rule.label,
      replacement: rule.replacement,
      count,
    });
  }

  output = applyOccurrenceVariants(output, replacements);

  for (const rule of FINAL_CLEANUP_RULES) {
    const count = countMatches(output, rule.pattern);
    if (count === 0) continue;
    output = output.replace(rule.pattern, rule.replacement);
    replacements.push({
      pattern: rule.label,
      replacement: rule.replacement,
      count,
    });
  }

  output = normalizeParagraphEndings(output)
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n");

  const report = EpisodeProsePolishReportSchema.parse({
    inputCharacterCount: text.length,
    outputCharacterCount: output.length,
    changedReplacementCount: replacements.reduce((sum, replacement) => sum + replacement.count, 0),
    replacements,
    internalMarkerCount: countMatches(output, INTERNAL_MARKER_PATTERN),
  });

  return { text: `${output.trim()}\n`, report };
}
