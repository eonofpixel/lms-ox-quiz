import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { QuizScreen } from '../QuizScreen';
import { IntroScreen } from '../IntroScreen';
import { useQuizStore } from '../../hooks/useQuizStore';
import type { QuizItem as QuizItemType } from '../../types/quiz';
import { getThemeColors } from '../../types/theme';
import type { QuizThemeId } from '../../types/theme';
import { Button } from '../ui/button';
import { ArrowLeft } from 'lucide-react';

// 다중 해설 아이템 인터페이스
interface ExplanationItem {
  content: string;
  tts?: string;
}

// Legacy QuizItem interface for compatibility with existing components
interface LegacyQuizItem {
  id: number;
  question: string;
  questionTTS?: string;
  answer: boolean;
  explanation: string;
  explanationTTS?: string;
  explanations?: ExplanationItem[]; // 다중 해설 지원
  singleLineQuestion?: boolean; // 질문 1줄 고정
}

// Convert new QuizItem to legacy format
function toLegacyQuizItem(item: QuizItemType, index: number): LegacyQuizItem {
  return {
    id: index + 1,
    question: item.question,
    questionTTS: item.questionTTS,
    answer: item.answer,
    explanation: item.explanation,
    explanationTTS: item.explanationTTS,
    explanations: item.explanations, // 다중 해설 전달
    singleLineQuestion: item.singleLineQuestion, // 1줄 고정 전달
  };
}

export function QuizPlayer() {
  const { quizSetId } = useParams<{ quizSetId: string }>();
  const navigate = useNavigate();
  const { quizSets, loadQuizSets } = useQuizStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load quiz sets on mount
  useEffect(() => {
    loadQuizSets();
  }, [loadQuizSets]);

  // Find the current quiz set
  const quizSet = quizSets.find(qs => qs.id === quizSetId);
  const themeColors = getThemeColors(quizSet?.theme as QuizThemeId | undefined);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const parentWidth = parent.clientWidth;
          const parentHeight = parent.clientHeight;
          const baseWidth = 1280;
          const baseHeight = 720;

          const scaleX = parentWidth / baseWidth;
          const scaleY = parentHeight / baseHeight;

          setScale(Math.min(scaleX, scaleY));
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleStart = () => {
    setHasStarted(true);
  };

  const handleRestart = () => {
    setHasStarted(false);
    setCurrentIndex(0);
  };

  const handleHome = () => {
    navigate('/');
  };

  const handleNext = () => {
    if (quizSet && currentIndex < quizSet.items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Quiz complete
      handleRestart();
    }
  };

  if (!quizSet) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <p className="text-xl text-gray-600 mb-4">퀴즈를 찾을 수 없습니다.</p>
          <Button onClick={() => navigate('/')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            목록으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const currentQuiz = toLegacyQuizItem(quizSet.items[currentIndex], currentIndex);

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-900 flex items-center justify-center">
      {/* Back Button */}
      <Button
        onClick={() => navigate('/')}
        variant="ghost"
        className="absolute top-4 left-4 z-50 text-white hover:bg-white/10"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        목록
      </Button>

      {/* Scale Container */}
      <div
        ref={containerRef}
        className={`relative ${themeColors.playerShadow} overflow-hidden`}
        style={{
          width: 1280,
          height: 720,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          backgroundColor: themeColors.backgroundFallback,
        }}
      >
        {/* Background */}
        <div className={`absolute inset-0 overflow-hidden pointer-events-none z-0 bg-gradient-to-br ${themeColors.backgroundGradient}`}>
          <div className={`absolute -top-20 -left-20 w-[600px] h-[600px] ${themeColors.backgroundBlobA} rounded-full blur-[100px]`} />
          <div className={`absolute top-1/2 right-0 w-[500px] h-[500px] ${themeColors.backgroundBlobB} rounded-full blur-[100px]`} />
          <div className={`absolute -bottom-40 left-1/3 w-[700px] h-[700px] ${themeColors.backgroundBlobC} rounded-full blur-[120px]`} />
          <div className="absolute inset-0 bg-white/20 backdrop-blur-[1px]" />
        </div>

        <div className="w-full h-full overflow-hidden relative z-10">
          <AnimatePresence mode="wait">
            {!hasStarted ? (
              <motion.div
                key="intro"
                initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                exit={{
                  opacity: 0,
                  scale: 1.1,
                  rotateY: 15,
                  transition: { duration: 0.6, ease: 'easeInOut' },
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="w-full h-full"
              >
                <IntroScreen onStart={handleStart} totalQuizzes={quizSet.items.length} themeId={quizSet?.theme as QuizThemeId | undefined} />
              </motion.div>
            ) : (
              <motion.div
                key={`quiz-${currentIndex}`}
                initial={{ opacity: 0, x: 100, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  x: -100,
                  scale: 0.95,
                  transition: { duration: 0.4, ease: 'easeInOut' },
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="w-full h-full"
              >
                <QuizScreen
                  quiz={currentQuiz}
                  onRestart={handleRestart}
                  onHome={handleHome}
                  quizNumber={currentIndex + 1}
                  totalQuizzes={quizSet.items.length}
                  themeId={quizSet?.theme as QuizThemeId | undefined}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
