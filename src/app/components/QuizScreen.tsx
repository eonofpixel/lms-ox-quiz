import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Circle, X } from 'lucide-react';

interface Quiz {
  id: number;
  question: string;
  questionTTS?: string;
  answer: boolean;
  explanation: string;
  explanationTTS?: string;
}

interface RenderTiming {
  questionTTSDurationMs: number;
  timerDurationSec: number;
  explanationDelayMs: number;
}

interface QuizScreenProps {
  quiz: Quiz;
  onRestart: () => void;
  onHome?: () => void;
  onExplanationShown?: () => void;
  quizNumber: number;
  totalQuizzes: number;
  isRenderMode?: boolean; // 렌더링 모드 - TTS 대신 고정 타이밍 사용
  renderTiming?: RenderTiming; // 렌더링 모드에서 사용할 타이밍
}

export function QuizScreen({ quiz, onRestart, onHome, onExplanationShown, quizNumber, totalQuizzes, isRenderMode = false, renderTiming }: QuizScreenProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Use render timing if provided, otherwise use defaults
  const timerSeconds = renderTiming?.timerDurationSec ?? 5;
  const [timeLeft, setTimeLeft] = useState(timerSeconds);
  const [isTimerActive, setIsTimerActive] = useState(false); // 초기값 false (TTS 완료 후 시작)
  const [tickTock, setTickTock] = useState(true); // 시계 소리 번갈아가며

  // TTS 함수 (렌더링 모드에서는 시뮬레이션)
  const speak = (text: string, onEnd?: () => void, isQuestion: boolean = true) => {
    // 렌더링 모드에서는 TTS 대신 renderTiming 또는 추정 시간 사용
    if (isRenderMode) {
      let durationMs: number;
      if (renderTiming) {
        // Use timing from audio timeline
        durationMs = isQuestion ? renderTiming.questionTTSDurationMs : renderTiming.explanationDelayMs;
      } else {
        // Fallback: estimate based on text length (약 초당 5글자)
        durationMs = Math.max(2000, (text.length / 5) * 1000);
      }
      setTimeout(() => {
        if (onEnd) onEnd();
      }, durationMs);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // 기존 음성 중지
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR'; // 한국어 설정
      utterance.rate = 1.0; // 속도
      utterance.pitch = 1.0; // 피치

      if (onEnd) {
        utterance.onend = onEnd;
      }

      window.speechSynthesis.speak(utterance);
    } else {
      // TTS 지원 안될 경우 즉시 콜백 실행
      if (onEnd) onEnd();
    }
  };

  // 사운드 생성 함수들 (렌더링 모드에서는 스킵)
  const playTickSound = () => {
    if (isRenderMode) return;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // 기계식 시계 소리 구현 (Tick-Tock)
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // 주파수와 타입 조정으로 나무/금속 질감 표현
    if (tickTock) {
      // Tick (높은 음)
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = 'square'; // 약간의 날카로움
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
    } else {
      // Tock (낮은 음)
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
      oscillator.type = 'square';
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);
    }
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.05);
    
    setTickTock(!tickTock);
  };

  const playTimeUpSound = () => {
    if (isRenderMode) return;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // 3번 반복되는 알람 소리
    for (let i = 0; i < 3; i++) {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 600;
      oscillator.type = 'square';
      
      const startTime = audioContext.currentTime + (i * 0.2);
      gainNode.gain.setValueAtTime(0.3, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.15);
    }
  };

  const playAnswerSound = (isCorrect: boolean) => {
    if (isRenderMode) return;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (isCorrect) {
      // 정답 소리 - 밝은 상승 멜로디 (도-미-솔)
      const frequencies = [523, 659, 784]; // C5, E5, G5
      frequencies.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        
        const startTime = audioContext.currentTime + (i * 0.15);
        gainNode.gain.setValueAtTime(0.4, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.4);
      });
    } else {
      // 오답 소리 - 낮은 부정 사운드
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.6);
      oscillator.type = 'sawtooth';
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.6);
    }
  };

  useEffect(() => {
    // 퀴즈가 변경될 때마다 초기화
    setSelectedAnswer(null);
    setShowAnswer(false);
    setTimeLeft(timerSeconds); // 타이머 초기화
    setIsTimerActive(false); // TTS 완료 전까지 타이머 정지

    // 질문 읽기
    // 화면 전환 후 1초 뒤 시작
    const timer = setTimeout(() => {
        // TTS 텍스트 결정 (우선순위: questionTTS > question)
        const textToRead = quiz.questionTTS || quiz.question;
        speak(textToRead, () => {
          // TTS가 끝나면 타이머 시작
          setIsTimerActive(true);
        }, true); // isQuestion = true
    }, 1000);

    return () => {
        clearTimeout(timer);
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    };
  }, [quiz.id, quiz.question, quiz.questionTTS]);

  useEffect(() => {
    if (!isTimerActive) return;

    if (timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
        // 타이머 틱톡 소리 (모든 초마다)
        playTickSound();
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // 시간이 끝나면 자동으로 정답 선택 및 표시
      setSelectedAnswer(quiz.answer); // 자동으로 정답 선택
      playTimeUpSound();
      setShowAnswer(true);
      if (onExplanationShown) {
        onExplanationShown();
      }
      setIsTimerActive(false);
      
      // 해설 읽기 (1초 딜레이)
      setTimeout(() => {
        const textToRead = quiz.explanationTTS || quiz.explanation;
        speak(textToRead, undefined, false); // isQuestion = false
      }, 1000);
    }
  }, [timeLeft, isTimerActive, quiz.answer, quiz.explanation, quiz.explanationTTS, timerSeconds]);

  const handleAnswerClick = (answer: boolean) => {
    if (showAnswer) return;
    
    // 사용자가 답을 선택하면 즉시 타이머 중지 및 TTS 중단
    setIsTimerActive(false);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    setSelectedAnswer(answer);
    
    // 바로 정답/오답 소리 재생
    const isCorrectAnswer = answer === quiz.answer;
    playAnswerSound(isCorrectAnswer);
    
    // 선택 후 1초 뒤에 정답 표시
    setTimeout(() => {
      setShowAnswer(true);
      if (onExplanationShown) {
        onExplanationShown();
      }
      // 해설 읽기 (1초 딜레이)
      setTimeout(() => {
        const textToRead = quiz.explanationTTS || quiz.explanation;
        speak(textToRead, undefined, false); // isQuestion = false
      }, 1000);
    }, 1000);
  };

  const handleNext = () => {
    onRestart();
  };

  const isCorrect = selectedAnswer === quiz.answer;

  return (
    <div className="w-full h-full p-6 md:p-10 flex flex-col relative text-slate-900">
      
      {/* 전체 콘텐츠 영역 (퀴즈 vs 해설) */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full max-w-5xl mx-auto h-full">
        <AnimatePresence mode="wait">
          {!showAnswer ? (
            <motion.div
              key="quiz-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="w-full flex flex-col items-center justify-center h-full"
            >
              {/* 상단 타이머 및 진행바 (퀴즈 중에만 표시) */}
              <div className="w-full max-w-3xl mx-auto mb-8">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-orange-900 font-bold">Time Remaining</span>
                  <div className="flex items-center gap-2">
                    <Clock className={`w-6 h-6 ${timeLeft <= 2 ? 'text-red-500 animate-pulse' : 'text-orange-600'}`} />
                    <span className={`text-2xl font-mono font-black ${timeLeft <= 2 ? 'text-red-500' : 'text-orange-900'}`}>
                      00:{timeLeft.toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
                
                {/* 프로그레스 바 */}
                <div className="h-4 bg-white/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/20 shadow-inner">
                  <motion.div
                    className={`h-full rounded-full shadow-md ${
                      timeLeft <= 2 ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500'
                    }`}
                    initial={{ width: "0%" }}
                    animate={{ width: `${((5 - timeLeft) / 5) * 100}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </div>
              </div>

              {/* 질문 카드 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full bg-orange-500 rounded-2xl p-6 md:p-8 shadow-xl mb-10 text-center relative overflow-hidden border-b-4 border-orange-700/20"
              >
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/10 to-transparent" />
                <h2 className="text-2xl md:text-3xl font-black leading-tight break-keep whitespace-pre-wrap text-slate-900 drop-shadow-sm">
                  <span className="inline-block mr-3 font-black text-slate-900 opacity-80">Q.</span>
                  {quiz.question}
                </h2>
              </motion.div>

              {/* O/X 버튼 영역 */}
              <div className="flex gap-12 md:gap-24">
                <motion.button
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  animate={selectedAnswer === null ? {
                    scale: [1, 1.05, 1],
                    y: [0, -10, 0]
                  } : {}}
                  transition={{
                    duration: 2,
                    ease: "easeInOut",
                    repeat: Infinity,
                  }}
                  onClick={() => handleAnswerClick(true)}
                  className="group relative"
                >
                  <div className="absolute inset-0 bg-red-500/10 blur-xl rounded-full group-hover:bg-red-500/20 transition-colors" />
                  <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-white shadow-xl border-4 border-white flex items-center justify-center relative overflow-hidden group-hover:border-red-100 transition-colors">
                    <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border-[16px] md:border-[24px] border-red-500" />
                  </div>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  animate={selectedAnswer === null ? {
                    scale: [1, 1.05, 1],
                    y: [0, -10, 0]
                  } : {}}
                  transition={{
                    duration: 2,
                    ease: "easeInOut",
                    repeat: Infinity,
                    delay: 1
                  }}
                  onClick={() => handleAnswerClick(false)}
                  className="group relative"
                >
                  <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full group-hover:bg-blue-500/20 transition-colors" />
                  <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-white shadow-xl border-4 border-white flex items-center justify-center relative overflow-hidden group-hover:border-blue-100 transition-colors">
                    <div className="relative w-20 h-20 md:w-28 md:h-28">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16px] md:w-[24px] h-full bg-blue-500 rounded-full rotate-45" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16px] md:w-[24px] h-full bg-blue-500 rounded-full -rotate-45" />
                    </div>
                  </div>
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="explanation-content"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="w-full max-w-4xl z-50 flex items-center justify-center"
            >
              <div className="w-full bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-slate-100 relative">
                {/* 헤더 */}
                <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                   <div className="flex items-center gap-3">
                     <h3 className="text-2xl font-black text-slate-800">해설</h3>
                     <div className={`px-3 py-1 rounded-full text-sm font-bold ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isCorrect ? '정답입니다' : '오답입니다'}
                     </div>
                   </div>
                </div>

                {/* 내용 */}
                <div className="p-8 bg-slate-200/50 flex flex-col items-center">
                  
                  {/* 정답 표시 */}
                  <div className="mb-6 flex flex-col items-center gap-2">
                    <span className="text-slate-500 font-bold text-sm uppercase tracking-wide">Correct Answer</span>
                    <div 
                      className="relative cursor-default" 
                      onClick={onHome}
                    >
                      {quiz.answer ? (
                        <div className="w-20 h-20 rounded-full border-[8px] border-red-500 bg-white shadow-md flex items-center justify-center">
                          {/* O 표시 */}
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-full border-4 border-white bg-white shadow-md flex items-center justify-center relative">
                          <div className="absolute w-[8px] h-12 bg-blue-500 rounded-full rotate-45" />
                          <div className="absolute w-[8px] h-12 bg-blue-500 rounded-full -rotate-45" />
                        </div>
                      )}
                      
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3, type: "spring" }}
                        className="absolute -bottom-2 -right-2 bg-slate-900 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg"
                      >
                        정답
                      </motion.div>
                    </div>
                  </div>

                  <div className="bg-slate-300 rounded-xl p-6 text-center w-full mb-2">
                    <p className="text-xl md:text-2xl text-slate-900 font-bold leading-relaxed break-keep whitespace-pre-wrap">
                      {quiz.explanation}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}