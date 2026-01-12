// Quiz Item - 개별 퀴즈 문제
export interface QuizItem {
  id: string;
  question: string;
  questionTTS?: string;
  answer: boolean; // true = O, false = X
  explanation: string;
  explanationTTS?: string;
}

// Quiz Set - 퀴즈 세트 (여러 문제 묶음)
export interface QuizSet {
  id: string;
  name: string;
  description?: string;
  items: QuizItem[];
  createdAt: Date;
  updatedAt: Date;
}

// TTS Audio Data - TTS 녹음 데이터
export interface TTSAudioData {
  id: string;
  quizItemId: string;
  type: 'question' | 'explanation';
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
  explanationTTSStartMs: number;
  explanationTTSDurationMs: number;
  totalDurationMs: number;
}

// Constants
export const INTRO_DURATION_MS = 3000;
export const TIMER_DURATION_MS = 5000;
export const ANSWER_REVEAL_DURATION_MS = 1000;
export const TTS_DELAY_MS = 1000;
