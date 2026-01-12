import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QuizScreen } from './QuizScreen';
import { IntroScreen } from './IntroScreen';
import { SelectionScreen } from './SelectionScreen';

export interface QuizItem {
  id: number;
  question: string;
  questionTTS?: string;
  answer: boolean;
  explanation: string;
  explanationTTS?: string;
}

// 퀴즈 데이터 1 (기존)
const initialQuizData1: QuizItem[] = [
  {
    id: 1,
    question: "작업 시작 전 안전보호구를 반드시 착용해야 한다.",
    questionTTS: "작업 시작 전 안전보호구를 반드시 착용해야 한다.",
    answer: true,
    explanation: "안전모, 안전화, 보안경 등 작업에 맞는 안전보호구 착용은 산업안전보건법에 명시된 필수 안전수칙입니다.",
    explanationTTS: "안전모, 안전화, 보안경 등 작업에 맞는 안전보호구 착용은 산업안전보건법에 명시된 필수 안전수칙입니다."
  }
];

// 퀴즈 데이터 2 (새로운 내용)
const initialQuizData2: QuizItem[] = [
  {
    id: 1,
    question: "정리정돈은 모든 작업이 끝난 후에 한 번에 실시하는 것이 효율적이다.",
    questionTTS: "정리정돈은 모든 작업이 끝난 후에 한 번에 실시하는 것이 효율적이다.",
    answer: false,
    explanation: "정리정돈은 작업 전, 작업 중, 작업 후 수시로 실시하여 불안전한 상태를 제거하고 사고를 예방해야 합니다.",
    explanationTTS: "정리정돈은 작업 전, 작업 중, 작업 후 수시로 실시하여 불안전한 상태를 제거하고 사고를 예방해야 합니다."
  }
];

export function LegacyQuizPlayer() {
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);
  const [quizData1, setQuizData1] = useState<QuizItem[]>(initialQuizData1);
  const [quizData2, setQuizData2] = useState<QuizItem[]>(initialQuizData2);
  const [hasStarted, setHasStarted] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleUpdateQuizData = (courseId: number, newData: QuizItem) => {
    if (courseId === 1) {
      setQuizData1([newData]);
    } else {
      setQuizData2([newData]);
    }
  };


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

  const handleSelectQuiz = (id: number) => {
    setSelectedQuizId(id);
  };

  const handleStart = () => {
    setHasStarted(true);
  };

  const handleRestart = () => {
    setHasStarted(false);
  };

  const handleHome = () => {
    setSelectedQuizId(null);
    setHasStarted(false);
  };

  const currentQuizData = selectedQuizId === 2 ? quizData2 : quizData1;

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-900 flex items-center justify-center">
       {/* Scale Container Wrapper */}
      <div
        ref={containerRef}
        className="relative shadow-[0_0_100px_rgba(255,165,0,0.1)] overflow-hidden"
        style={{
          width: 1280,
          height: 720,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          backgroundColor: '#fff7ed' // orange-50 equivalent
        }}
      >
        {/* Global Static Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-gradient-to-br from-orange-100 via-amber-100 to-orange-50">
          <div className="absolute -top-20 -left-20 w-[600px] h-[600px] bg-orange-300/30 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-amber-300/30 rounded-full blur-[100px]" />
          <div className="absolute -bottom-40 left-1/3 w-[700px] h-[700px] bg-orange-200/40 rounded-full blur-[120px]" />
          <div className="absolute inset-0 bg-white/20 backdrop-blur-[1px]" />
        </div>

        <div className="w-full h-full overflow-hidden relative z-10">
          <AnimatePresence mode="wait">
            {selectedQuizId === null ? (
               <motion.div
                key="selection"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: 1.1,
                  transition: { duration: 0.5 }
                }}
                className="w-full h-full"
              >
                <SelectionScreen
                  onSelect={handleSelectQuiz}
                  quizData1={quizData1}
                  quizData2={quizData2}
                  onUpdateQuiz={handleUpdateQuizData}
                />
              </motion.div>
            ) : !hasStarted ? (
              <motion.div
                key="intro"
                initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                exit={{
                  opacity: 0,
                  scale: 1.1,
                  rotateY: 15,
                  transition: { duration: 0.6, ease: "easeInOut" }
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-full h-full"
              >
                <IntroScreen onStart={handleStart} totalQuizzes={currentQuizData.length} />
              </motion.div>
            ) : (
              <motion.div
                key="quiz"
                initial={{ opacity: 0, x: 100, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  x: -100,
                  scale: 0.95,
                  transition: { duration: 0.4, ease: "easeInOut" }
                }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full h-full"
              >
                <QuizScreen
                  quiz={currentQuizData[0]}
                  onRestart={handleRestart}
                  onHome={handleHome}
                  quizNumber={1}
                  totalQuizzes={currentQuizData.length}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
