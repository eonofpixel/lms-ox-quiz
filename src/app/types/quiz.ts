// Explanation Item - 개별 해설 항목
export interface ExplanationItem {
  content: string;
  tts?: string; // TTS 대본 (비워두면 content 사용)
  singleLine?: boolean; // 1줄 고정 (자동 폰트 축소)
}

// Quiz Item - 개별 퀴즈 문제
export interface QuizItem {
  id: string;
  question: string;
  questionTTS?: string;
  answer: boolean; // true = O, false = X
  singleLineQuestion?: boolean; // 질문을 1줄로 고정 (자동 폰트 축소)
  // 다중 해설 지원 (신규)
  explanations: ExplanationItem[];
  // 하위 호환성을 위한 단일 해설 필드 (deprecated - explanations 사용 권장)
  explanation: string;
  explanationTTS?: string;
}

// Quiz Set - 퀴즈 세트 (여러 문제 묶음)
export interface QuizSet {
  id: string;
  name: string;
  description?: string;
  theme?: import('./theme').QuizThemeId; // 퀴즈 테마 (기본: 'classic')
  items: QuizItem[];
  createdAt: Date;
  updatedAt: Date;
}

// TTS Audio Data - TTS 녹음 데이터
export interface TTSAudioData {
  id: string;
  quizItemId: string;
  type: 'question' | 'explanation';
  explanationIndex?: number; // 다중 해설인 경우 해설 인덱스 (0부터 시작)
  audioBlob: Blob;
  durationMs: number;
  createdAt: Date;
}

// Render Job - 렌더링 작업
export interface RenderJob {
  id: string;
  quizSetId: string;
  quizSetName: string;
  status: 'pending' | 'recording_tts' | 'rendering' | 'encoding' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStep?: string;
  outputPath?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// Render Settings - 렌더링 설정
export interface RenderSettings {
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  codec: 'h264' | 'h265';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  outputFormat: 'mp4' | 'webm';
}

// Default 4K 25fps settings
export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  resolution: {
    width: 3840,
    height: 2160,
  },
  fps: 25,
  codec: 'h264',
  quality: 'high',
  outputFormat: 'mp4',
};

// Excel Row - 엑셀 파싱 결과
export interface ExcelQuizRow {
  question: string;
  answer: string; // 'O', 'X', 'TRUE', 'FALSE'
  explanation: string;
  questionTTS?: string;
  explanationTTS?: string;
  // 추가 해설 (엑셀에서 explanation2, explanation3 등의 컬럼 지원)
  additionalExplanations?: Array<{ content: string; tts?: string }>;
}

// 개별 해설 타임라인
export interface ExplanationTimeline {
  index: number;
  startMs: number;
  durationMs: number;
}

// Quiz Timeline - 퀴즈 타임라인 계산
export interface QuizTimeline {
  introStartMs: number;
  introDurationMs: number;
  questionTTSStartMs: number;
  questionTTSDurationMs: number;
  timerStartMs: number;
  timerDurationMs: number;
  answerRevealStartMs: number;
  answerRevealDurationMs: number;
  // 단일 해설 (하위 호환성)
  explanationTTSStartMs: number;
  explanationTTSDurationMs: number;
  // 다중 해설 타임라인
  explanationTimelines?: ExplanationTimeline[];
  totalDurationMs: number;
}

// Constants
export const INTRO_DURATION_MS = 3000;
export const TIMER_DURATION_MS = 5000;
export const ANSWER_REVEAL_DURATION_MS = 1000;
export const TTS_DELAY_MS = 1000;
