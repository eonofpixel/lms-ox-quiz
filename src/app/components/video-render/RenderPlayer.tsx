import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { getThemeColors, QuizThemeId } from '../../types/theme';

// 다중 해설 아이템
interface ExplanationItem {
  content: string;
  tts?: string;
  singleLine?: boolean;
}

// Timeline event types
interface TimelineEvent {
  type: 'intro' | 'question_tts' | 'timer' | 'answer_reveal' | 'explanation_tts';
  startMs: number;
  endMs: number;
  explanationIndex?: number; // 다중 해설 인덱스
}

interface QuizData {
  question: string;
  questionTTS?: string;
  answer: boolean;
  explanation: string;
  explanationTTS?: string;
  explanations?: ExplanationItem[]; // 다중 해설 지원
  singleLineQuestion?: boolean; // 질문 1줄 고정
  timeline?: TimelineEvent[];
  theme?: QuizThemeId;
  introBadgeText?: string;
  introSubtitle?: string;
}

// Determine current phase and state based on time
type Phase = 'intro' | 'question' | 'timer' | 'answer' | 'explanation';

interface RenderState {
  phase: Phase;
  timerValue: number; // seconds remaining for timer display
  timerProgress: number; // 0-1 progress for progress bar
  currentExplanationIndex: number; // 현재 표시할 해설 인덱스
  totalExplanations: number; // 전체 해설 개수
}

function calculateRenderState(currentTimeMs: number, timeline: TimelineEvent[]): RenderState {
  const introEvent = timeline.find(e => e.type === 'intro');
  const questionEvent = timeline.find(e => e.type === 'question_tts');
  const timerEvent = timeline.find(e => e.type === 'timer');
  const answerEvent = timeline.find(e => e.type === 'answer_reveal');

  // 모든 해설 이벤트 가져오기 (다중 해설 지원)
  const explanationEvents = timeline.filter(e => e.type === 'explanation_tts');
  const totalExplanations = Math.max(1, explanationEvents.length);

  // Default timings if not found
  const introEnd = introEvent?.endMs ?? 3000;
  const questionEnd = questionEvent?.endMs ?? 7000;
  const timerStart = timerEvent?.startMs ?? questionEnd;
  const timerEnd = timerEvent?.endMs ?? 12000;
  const answerEnd = answerEvent?.endMs ?? 13000;

  const timerDurationMs = timerEnd - timerStart;
  const timerDurationSec = Math.ceil(timerDurationMs / 1000);

  if (currentTimeMs < introEnd) {
    return { phase: 'intro', timerValue: timerDurationSec, timerProgress: 0, currentExplanationIndex: 0, totalExplanations };
  }

  if (currentTimeMs < timerStart) {
    return { phase: 'question', timerValue: timerDurationSec, timerProgress: 0, currentExplanationIndex: 0, totalExplanations };
  }

  if (currentTimeMs < timerEnd) {
    const elapsed = currentTimeMs - timerStart;
    const progress = elapsed / timerDurationMs;
    const remaining = Math.ceil((timerDurationMs - elapsed) / 1000);
    return { phase: 'timer', timerValue: Math.max(0, remaining), timerProgress: progress, currentExplanationIndex: 0, totalExplanations };
  }

  if (currentTimeMs < answerEnd) {
    return { phase: 'answer', timerValue: 0, timerProgress: 1, currentExplanationIndex: 0, totalExplanations };
  }

  // 해설 단계: 현재 어떤 해설을 표시할지 계산
  let currentExplanationIndex = 0;
  for (let i = 0; i < explanationEvents.length; i++) {
    const event = explanationEvents[i];
    if (currentTimeMs >= event.startMs && currentTimeMs < event.endMs) {
      currentExplanationIndex = event.explanationIndex ?? i;
      break;
    } else if (currentTimeMs >= event.endMs) {
      // 이 해설 이벤트가 끝났으면 다음 해설로 (마지막 해설이면 그대로 유지)
      currentExplanationIndex = event.explanationIndex ?? i;
    }
  }

  return { phase: 'explanation', timerValue: 0, timerProgress: 1, currentExplanationIndex, totalExplanations };
}

// Declare global window property for Puppeteer communication
declare global {
  interface Window {
    __RENDER_READY__: boolean;
    __SET_TIME__: (ms: number) => void;
  }
}

export function RenderPlayer() {
  const [searchParams] = useSearchParams();
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Parse quiz data and timeline from URL
  useEffect(() => {
    const dataParam = searchParams.get('data');
    if (dataParam) {
      try {
        const decoded = decodeURIComponent(dataParam);
        const parsed = JSON.parse(decoded);
        setQuizData({
          question: parsed.question || '',
          questionTTS: parsed.questionTTS || parsed.question || '',
          answer: parsed.answer === true || parsed.answer === 'true',
          explanation: parsed.explanation || '',
          explanationTTS: parsed.explanationTTS || parsed.explanation || '',
          explanations: parsed.explanations || undefined, // 다중 해설 지원
          singleLineQuestion: parsed.singleLineQuestion === true ? true : parsed.singleLineQuestion === false ? false : undefined, // 1줄 고정 (undefined = 자동 감지)
          timeline: parsed.timeline,
          theme: parsed.theme || undefined,
          introBadgeText: parsed.introBadgeText || undefined,
          introSubtitle: parsed.introSubtitle || undefined,
        });

        if (parsed.timeline && Array.isArray(parsed.timeline)) {
          setTimeline(parsed.timeline);
        } else {
          // Default timeline
          setTimeline([
            { type: 'intro', startMs: 0, endMs: 3000 },
            { type: 'question_tts', startMs: 3000, endMs: 7000 },
            { type: 'timer', startMs: 7000, endMs: 12000 },
            { type: 'answer_reveal', startMs: 12000, endMs: 13000 },
            { type: 'explanation_tts', startMs: 13000, endMs: 18000 },
          ]);
        }
      } catch (e) {
        console.error('Failed to parse quiz data:', e);
      }
    }

    // Check for time parameter (for controlled frame capture)
    const timeParam = searchParams.get('time');
    if (timeParam) {
      setCurrentTimeMs(parseInt(timeParam, 10));
    }
  }, [searchParams]);

  // Expose time control function for Puppeteer
  useEffect(() => {
    window.__SET_TIME__ = (ms: number) => {
      setCurrentTimeMs(ms);
    };
    window.__RENDER_READY__ = true;

    return () => {
      window.__RENDER_READY__ = false;
    };
  }, []);

  // Calculate current render state
  const renderState = useMemo(() => {
    return calculateRenderState(currentTimeMs, timeline);
  }, [currentTimeMs, timeline]);

  if (!quizData) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100">
        <div className="text-xl text-gray-600">퀴즈 데이터를 로드 중...</div>
      </div>
    );
  }

  const timerDurationSec = timeline.find(e => e.type === 'timer')
    ? Math.ceil((timeline.find(e => e.type === 'timer')!.endMs - timeline.find(e => e.type === 'timer')!.startMs) / 1000)
    : 5;

  const themeColors = getThemeColors(quizData?.theme);

  // Calculate scale factor based on viewport (base design is 1280x720)
  // For 4K (3840x2160): scale = 3, for 1080p (1920x1080): scale = 1.5
  const baseWidth = 1280;
  const baseHeight = 720;

  return (
    <div className={`w-screen h-screen overflow-hidden bg-gradient-to-br ${themeColors.backgroundGradient}`}>
      {/* Background gradient blobs - scaled for viewport */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className={`absolute -top-20 -left-20 w-[600px] h-[600px] ${themeColors.backgroundBlobA} rounded-full blur-[100px]`} style={{ transform: 'scale(3)' }} />
        <div className={`absolute top-1/2 right-0 w-[500px] h-[500px] ${themeColors.backgroundBlobB} rounded-full blur-[100px]`} style={{ transform: 'scale(3)' }} />
        <div className={`absolute -bottom-40 left-1/3 w-[700px] h-[700px] ${themeColors.backgroundBlobC} rounded-full blur-[120px]`} style={{ transform: 'scale(3)' }} />
        <div className="absolute inset-0 bg-white/20 backdrop-blur-[1px]" />
      </div>

      {/* Content container - scaled from 1280x720 base to fill viewport */}
      <div className="w-full h-full flex items-center justify-center relative z-10">
        <div
          style={{
            width: baseWidth,
            height: baseHeight,
            transform: `scale(${Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight)})`,
            transformOrigin: 'center center',
          }}
          className="relative"
        >
          {renderState.phase === 'intro' ? (
            <IntroScreenStatic themeId={quizData?.theme} introBadgeText={quizData?.introBadgeText} introSubtitle={quizData?.introSubtitle} />
          ) : renderState.phase === 'explanation' ? (
            <ExplanationScreenStatic
              question={quizData.question}
              answer={quizData.answer}
              explanation={quizData.explanation}
              explanations={quizData.explanations}
              currentExplanationIndex={renderState.currentExplanationIndex}
              totalExplanations={renderState.totalExplanations}
              themeId={quizData?.theme}
            />
          ) : (
            <QuizScreenStatic
              question={quizData.question}
              timerValue={renderState.timerValue}
              timerProgress={renderState.timerProgress}
              timerDurationSec={timerDurationSec}
              showAnswer={renderState.phase === 'answer'}
              answer={quizData.answer}
              singleLineQuestion={quizData.singleLineQuestion}
              themeId={quizData?.theme}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Static Intro Screen - matches preview IntroScreen
function IntroScreenStatic({ themeId, introBadgeText, introSubtitle }: { themeId?: QuizThemeId; introBadgeText?: string; introSubtitle?: string }) {
  const themeColors = getThemeColors(themeId);
  return (
    <div className="w-full h-full p-8 md:p-12 flex flex-col items-center justify-between relative">
      {/* Top: Title area - matches preview */}
      <div className="text-center relative z-10 pt-8 flex flex-col items-center">
        <div className={`inline-flex items-center gap-2 ${themeColors.introBadgeBg} text-white px-5 py-2 rounded-full mb-6 shadow-lg border-2 ${themeColors.introBadgeBorder}`}>
          <span className="w-2 h-2 rounded-full bg-white" />
          <span className="text-sm md:text-base font-bold tracking-wider">{introBadgeText || 'SAFETY EDUCATION'}</span>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-900 mb-2 tracking-tight drop-shadow-sm">
          O·X QUIZ
        </h1>
        <p className="text-lg md:text-2xl text-slate-700 font-bold tracking-wide">
          {introSubtitle || (themeId === 'blue' ? '법정 의무교육 평가' : '산업안전보건 교육 평가')}
        </p>
      </div>

      {/* Center: O X icons - matches preview */}
      <div className="flex items-center gap-12 md:gap-20 relative z-10">
        {/* O icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-red-500/20 rounded-full blur-2xl" />
          <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-white shadow-xl flex items-center justify-center border-8 border-white relative overflow-hidden">
            <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border-[16px] md:border-[24px] border-red-500" />
          </div>
        </div>

        {/* VS badge */}
        <div className={`text-4xl md:text-6xl font-black ${themeColors.introVsColor} italic tracking-tighter`}>
          VS
        </div>

        {/* X icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl" />
          <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-white shadow-xl flex items-center justify-center border-8 border-white relative overflow-hidden">
            <div className="relative w-20 h-20 md:w-28 md:h-28">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16px] md:w-[24px] h-full bg-blue-500 rounded-full rotate-45" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16px] md:w-[24px] h-full bg-blue-500 rounded-full -rotate-45" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Start message - matches preview */}
      <div className="relative z-10 mb-8">
        <div className={`absolute -inset-1 bg-gradient-to-r ${themeColors.introStartGlow} rounded-full blur opacity-75`} />
        <div className={`relative px-12 py-6 ${themeColors.introStartBg} rounded-full leading-none flex items-center gap-4 shadow-xl`}>
          <span className="text-xl md:text-2xl font-black text-white">
            잠시 후 퀴즈가 시작됩니다...
          </span>
        </div>
      </div>
    </div>
  );
}

// Helper function for adaptive font sizing based on text length
function getAdaptiveFontClass(text: string, baseClass: string, smallClass: string, tinyClass: string): string {
  if (text.length > 60) return tinyClass;
  if (text.length > 40) return smallClass;
  return baseClass;
}

// Formula-based single-line font size for static renderer (base: 1280x720)
// Card content width ≈ 1280 - 80(p-10) - 64(card p-8) = 1136, but max-w-5xl caps → ~900px usable
function getSingleLineFontSizeStatic(text: string): number {
  const availableWidth = 860; // 보수적 (font-black 한글 고려)
  const koreanChars = text.replace(/[a-zA-Z0-9\s\(\)\.\-\/:,]/g, '').length;
  const otherChars = text.length - koreanChars;
  const prefixWidth = 42; // "Q. " prefix
  let fontSize = 30;
  while (fontSize > 10) {
    const estimatedTextWidth = (koreanChars * 1.0 + otherChars * 0.6) * fontSize + prefixWidth;
    if (estimatedTextWidth <= availableWidth) break;
    fontSize -= 1;
  }
  return fontSize;
}

// 해설용 1줄 고정 폰트 크기 계산 (base: 1280x720)
// 해설 영역: 전체 max-w-4xl 내부, p-8 + p-6 패딩 제외 → 약 780px
function getExplanationSingleLineFontSize(text: string): number {
  const availableWidth = 720; // max-w-4xl(896) - p-8(64) - p-6(48) - safety margin
  // 한글 1.0, 영문/숫자/괄호 0.6 (font-bold 기준, 보수적)
  const koreanChars = text.replace(/[a-zA-Z0-9\s\(\)\.\-\/:,]/g, '').length;
  const otherChars = text.length - koreanChars;
  const estimateWidth = (fontSize: number) =>
    (koreanChars * 1.0 + otherChars * 0.6) * fontSize;
  let fontSize = 24;
  while (fontSize > 10) {
    if (estimateWidth(fontSize) <= availableWidth) break;
    fontSize -= 1;
  }
  return fontSize;
}

// Static Quiz Screen - no animations, controlled by time
interface QuizScreenStaticProps {
  question: string;
  timerValue: number;
  timerProgress: number;
  timerDurationSec: number;
  showAnswer: boolean;
  answer: boolean;
  singleLineQuestion?: boolean;
  themeId?: QuizThemeId;
}

function QuizScreenStatic({ question, timerValue, timerProgress, timerDurationSec, showAnswer, answer, singleLineQuestion, themeId }: QuizScreenStaticProps) {
  const isLowTime = timerValue <= 2;
  const themeColors = getThemeColors(themeId);

  // 질문 1줄 고정 자동 감지
  const effectiveSingleLine = singleLineQuestion === true;

  return (
    <div className="w-full h-full p-6 md:p-10 flex flex-col relative text-slate-900">
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full max-w-5xl mx-auto h-full">
        {/* Timer section - matches preview */}
        <div className="w-full max-w-3xl mx-auto mb-8">
          <div className="flex justify-between items-end mb-2">
            <span className={`${themeColors.timerTextColor} font-bold`}>Time Remaining</span>
            <div className="flex items-center gap-2">
              <Clock className={`w-6 h-6 ${isLowTime ? 'text-red-500' : themeColors.timerLabelColor}`} />
              <span className={`text-2xl font-mono font-black ${isLowTime ? 'text-red-500' : themeColors.timerTextColor}`}>
                00:{timerValue.toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Progress bar - matches preview */}
          <div className="h-4 bg-white/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/20 shadow-inner">
            <div
              className={`h-full rounded-full shadow-md transition-none ${
                isLowTime ? themeColors.progressBarUrgent : themeColors.progressBarNormal
              }`}
              style={{ width: `${timerProgress * 100}%` }}
            />
          </div>
        </div>

        {/* Question card - matches preview */}
        <div className={`w-full ${themeColors.questionCardBg} rounded-2xl p-6 md:p-8 shadow-xl mb-10 text-center relative border-b-4 ${themeColors.questionCardBorder}`}>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/10 to-transparent" />
          {effectiveSingleLine ? (
            <h2
              className={`font-black ${themeColors.questionCardText} drop-shadow-sm relative z-10 overflow-hidden`}
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: `${getSingleLineFontSizeStatic(question)}px`,
                lineHeight: 1.3,
              }}
            >
              <span className={`inline-block mr-3 font-black ${themeColors.questionCardText} opacity-80`}>Q.</span>
              {question}
            </h2>
          ) : (
            <h2 className={`${getAdaptiveFontClass(question, 'text-2xl md:text-3xl', 'text-xl md:text-2xl', 'text-base md:text-lg')} font-black leading-snug break-all whitespace-pre-wrap ${themeColors.questionCardText} drop-shadow-sm relative z-10`}>
              <span className={`inline-block mr-3 font-black ${themeColors.questionCardText} opacity-80`}>Q.</span>
              {question}
            </h2>
          )}
        </div>

        {/* O/X buttons - matches preview */}
        <div className="flex gap-12 md:gap-24">
          <div className="group relative">
            <div className="absolute inset-0 bg-red-500/10 blur-xl rounded-full" />
            <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full bg-white shadow-xl border-4 border-white flex items-center justify-center relative overflow-hidden ${
              showAnswer && answer === true ? 'ring-8 ring-green-500 ring-offset-4' : ''
            }`}>
              <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border-[16px] md:border-[24px] border-red-500" />
            </div>
          </div>

          <div className="group relative">
            <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full" />
            <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full bg-white shadow-xl border-4 border-white flex items-center justify-center relative overflow-hidden ${
              showAnswer && answer === false ? 'ring-8 ring-green-500 ring-offset-4' : ''
            }`}>
              <div className="relative w-20 h-20 md:w-28 md:h-28">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16px] md:w-[24px] h-full bg-blue-500 rounded-full rotate-45" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16px] md:w-[24px] h-full bg-blue-500 rounded-full -rotate-45" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Static Explanation Screen
interface ExplanationScreenStaticProps {
  question: string;
  answer: boolean;
  explanation: string;
  explanations?: ExplanationItem[];
  currentExplanationIndex: number;
  totalExplanations: number;
  themeId?: QuizThemeId;
}

function ExplanationScreenStatic({ question, answer, explanation, explanations, currentExplanationIndex, totalExplanations, themeId }: ExplanationScreenStaticProps) {
  const themeColors = getThemeColors(themeId);
  // 표시할 해설 내용 결정
  const currentExpItem = explanations && explanations.length > 0
    ? explanations[currentExplanationIndex] : null;
  const currentExplanation = currentExpItem?.content || explanation;
  const isSingleLineExplanation = currentExpItem?.singleLine === true;
  const hasMultipleExplanations = totalExplanations > 1;
  return (
    <div className="w-full h-full p-6 md:p-10 flex flex-col items-center justify-center relative text-slate-900">
      {/* Matches preview max-w-4xl */}
      <div className="w-full max-w-4xl z-50 flex items-center justify-center">
        <div className="w-full bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-slate-100 relative">
          {/* Header - matches preview */}
          <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-black text-slate-800">해설</h3>
              {hasMultipleExplanations && (
                <div className={`px-3 py-1 rounded-full text-sm font-bold ${themeColors.explanationBadgeBg} ${themeColors.explanationBadgeText}`}>
                  {currentExplanationIndex + 1} / {totalExplanations}
                </div>
              )}
              <div className="px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-700">
                정답 공개
              </div>
            </div>
          </div>

          {/* Content - matches preview */}
          <div className="p-8 bg-slate-200/50 flex flex-col items-center">
            {/* Answer display - matches preview */}
            <div className="mb-6 flex flex-col items-center gap-2">
              <span className="text-slate-500 font-bold text-sm uppercase tracking-wide">Correct Answer</span>
              <div className="relative">
                {answer ? (
                  <div className="w-20 h-20 rounded-full border-[8px] border-red-500 bg-white shadow-md flex items-center justify-center" />
                ) : (
                  <div className="w-20 h-20 rounded-full border-4 border-white bg-white shadow-md flex items-center justify-center relative">
                    <div className="absolute w-[8px] h-12 bg-blue-500 rounded-full rotate-45" />
                    <div className="absolute w-[8px] h-12 bg-blue-500 rounded-full -rotate-45" />
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 bg-slate-900 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  정답
                </div>
              </div>
            </div>

            <div className="bg-slate-300 rounded-xl p-6 text-center w-full mb-2">
              {isSingleLineExplanation ? (
                <p
                  className="text-slate-900 font-bold leading-relaxed overflow-hidden"
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: `${getExplanationSingleLineFontSize(currentExplanation)}px`,
                    lineHeight: 1.4,
                  }}
                >
                  {currentExplanation}
                </p>
              ) : (
                <p className={`${getAdaptiveFontClass(currentExplanation, 'text-xl md:text-2xl', 'text-lg md:text-xl', 'text-base md:text-lg')} text-slate-900 font-bold leading-relaxed break-keep whitespace-pre-wrap`}>
                  {currentExplanation}
                </p>
              )}
            </div>

            {/* 해설 인디케이터 (다중 해설인 경우) */}
            {hasMultipleExplanations && (
              <div className="flex gap-2 mt-3">
                {Array.from({ length: totalExplanations }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      idx === currentExplanationIndex
                        ? `${themeColors.explanationIndicatorActive} w-4`
                        : idx < currentExplanationIndex
                        ? themeColors.explanationIndicatorDone
                        : 'bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
