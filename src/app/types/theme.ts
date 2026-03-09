// Quiz Theme - 퀴즈 테마 색상 정의
export type QuizThemeId = 'classic' | 'blue';

export interface QuizThemeColors {
  // 배경
  backgroundGradient: string; // 메인 배경 그라데이션
  backgroundBlobA: string;    // 배경 블롭 A
  backgroundBlobB: string;    // 배경 블롭 B
  backgroundBlobC: string;    // 배경 블롭 C
  backgroundFallback: string; // CSS backgroundColor 폴백

  // 질문 카드
  questionCardBg: string;
  questionCardBorder: string;
  questionCardText: string; // 질문 텍스트 색상

  // 타이머
  timerTextColor: string;
  timerLabelColor: string;
  progressBarNormal: string;
  progressBarUrgent: string;

  // 인트로
  introBadgeBg: string;
  introBadgeBorder: string;
  introVsColor: string;
  introStartBg: string;
  introStartGlow: string;

  // 해설
  explanationBadgeBg: string;
  explanationBadgeText: string;
  explanationIndicatorActive: string;
  explanationIndicatorDone: string;

  // 다이얼로그 (퀴즈 편집)
  dialogAccentBg: string;
  dialogAccentBorder: string;
  dialogFocusBorder: string;
  dialogFocusRing: string;
  dialogSectionBg: string;
  dialogSectionBorder: string;
  dialogBadgeBg: string;
  dialogBadgeText: string;
  dialogHeaderBlob: string;

  // 플레이어 외곽 그림자
  playerShadow: string;
}

export interface QuizTheme {
  id: QuizThemeId;
  name: string;
  description: string;
  previewColors: [string, string, string]; // 미리보기용 3색
  colors: QuizThemeColors;
}

// ==================== 테마 정의 ====================

const classicTheme: QuizTheme = {
  id: 'classic',
  name: '클래식 오렌지',
  description: '따뜻한 오렌지 톤의 기본 테마',
  previewColors: ['#f97316', '#f59e0b', '#fff7ed'],
  colors: {
    backgroundGradient: 'from-orange-100 via-amber-100 to-orange-50',
    backgroundBlobA: 'bg-orange-300/30',
    backgroundBlobB: 'bg-amber-300/30',
    backgroundBlobC: 'bg-orange-200/40',
    backgroundFallback: '#fff7ed',

    questionCardBg: 'bg-orange-500',
    questionCardBorder: 'border-orange-700/20',
    questionCardText: 'text-slate-900',

    timerTextColor: 'text-orange-900',
    timerLabelColor: 'text-orange-600',
    progressBarNormal: 'bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500',
    progressBarUrgent: 'bg-gradient-to-r from-red-500 to-orange-500',

    introBadgeBg: 'bg-orange-500',
    introBadgeBorder: 'border-orange-400',
    introVsColor: 'text-orange-900/10',
    introStartBg: 'bg-orange-600',
    introStartGlow: 'from-orange-400 to-amber-400',

    explanationBadgeBg: 'bg-orange-100',
    explanationBadgeText: 'text-orange-700',
    explanationIndicatorActive: 'bg-orange-500',
    explanationIndicatorDone: 'bg-orange-300',

    dialogAccentBg: 'bg-orange-50/50',
    dialogAccentBorder: 'border-orange-100',
    dialogFocusBorder: 'focus:border-orange-400',
    dialogFocusRing: 'focus:ring-orange-400/20',
    dialogSectionBg: 'bg-orange-50/50',
    dialogSectionBorder: 'border-orange-100',
    dialogBadgeBg: 'bg-orange-100',
    dialogBadgeText: 'text-orange-600',
    dialogHeaderBlob: 'bg-orange-500/20',

    playerShadow: 'shadow-[0_0_100px_rgba(255,165,0,0.1)]',
  },
};

const blueTheme: QuizTheme = {
  id: 'blue',
  name: '블루 네이비',
  description: '깔끔한 블루/네이비 톤 테마',
  previewColors: ['#3b82f6', '#1e3a5f', '#eff6ff'],
  colors: {
    backgroundGradient: 'from-blue-50 via-sky-50 to-slate-100',
    backgroundBlobA: 'bg-blue-300/30',
    backgroundBlobB: 'bg-sky-300/30',
    backgroundBlobC: 'bg-blue-200/40',
    backgroundFallback: '#eff6ff',

    questionCardBg: 'bg-blue-500',
    questionCardBorder: 'border-blue-700/20',
    questionCardText: 'text-white',

    timerTextColor: 'text-blue-900',
    timerLabelColor: 'text-blue-600',
    progressBarNormal: 'bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-400',
    progressBarUrgent: 'bg-gradient-to-r from-red-500 to-blue-500',

    introBadgeBg: 'bg-blue-500',
    introBadgeBorder: 'border-blue-400',
    introVsColor: 'text-blue-900/10',
    introStartBg: 'bg-blue-600',
    introStartGlow: 'from-blue-400 to-sky-400',

    explanationBadgeBg: 'bg-blue-100',
    explanationBadgeText: 'text-blue-700',
    explanationIndicatorActive: 'bg-blue-500',
    explanationIndicatorDone: 'bg-blue-300',

    dialogAccentBg: 'bg-blue-50/50',
    dialogAccentBorder: 'border-blue-100',
    dialogFocusBorder: 'focus:border-blue-400',
    dialogFocusRing: 'focus:ring-blue-400/20',
    dialogSectionBg: 'bg-blue-50/50',
    dialogSectionBorder: 'border-blue-100',
    dialogBadgeBg: 'bg-blue-100',
    dialogBadgeText: 'text-blue-600',
    dialogHeaderBlob: 'bg-blue-500/20',

    playerShadow: 'shadow-[0_0_100px_rgba(59,130,246,0.1)]',
  },
};

// ==================== 테마 레지스트리 ====================

export const QUIZ_THEMES: Record<QuizThemeId, QuizTheme> = {
  classic: classicTheme,
  blue: blueTheme,
};

export const QUIZ_THEME_LIST: QuizTheme[] = Object.values(QUIZ_THEMES);

export function getThemeColors(themeId?: QuizThemeId): QuizThemeColors {
  return QUIZ_THEMES[themeId || 'classic'].colors;
}

export function getTheme(themeId?: QuizThemeId): QuizTheme {
  return QUIZ_THEMES[themeId || 'classic'];
}
