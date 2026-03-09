import { motion } from 'motion/react';
import { useEffect } from 'react';
import { getThemeColors } from '../types/theme';
import type { QuizThemeId } from '../types/theme';

interface IntroScreenProps {
  onStart: () => void;
  totalQuizzes: number;
  themeId?: QuizThemeId;
}

export function IntroScreen({ onStart, totalQuizzes, themeId }: IntroScreenProps) {
  const themeColors = getThemeColors(themeId);
  useEffect(() => {
    const timer = setTimeout(() => {
      onStart();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onStart]);

  return (
    <div className="w-full h-full p-8 md:p-12 flex flex-col items-center justify-between relative">
      
      {/* 상단: 타이틀 영역 */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center relative z-10 pt-8 flex flex-col items-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6, type: "spring" }}
          className={`inline-flex items-center gap-2 ${themeColors.introBadgeBg} text-white px-5 py-2 rounded-full mb-6 shadow-lg border-2 ${themeColors.introBadgeBorder}`}
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-sm md:text-base font-bold tracking-wider">SAFETY EDUCATION</span>
        </motion.div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-900 mb-2 tracking-tight drop-shadow-sm">
          O·X QUIZ
        </h1>
        <p className="text-lg md:text-2xl text-slate-700 font-bold tracking-wide">
          산업안전보건 교육 평가
        </p>
      </motion.div>

      {/* 중앙: O X 버튼 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.8, type: "spring" }}
        className="flex items-center gap-12 md:gap-20 relative z-10"
      >
        {/* O 버튼 아이콘 */}
        <motion.div
          animate={{ y: [0, -15, 0], rotate: [0, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="relative group"
        >
          <div className="absolute inset-0 bg-red-500/20 rounded-full blur-2xl transform group-hover:scale-110 transition-transform duration-500" />
          <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-white shadow-xl flex items-center justify-center border-8 border-white relative overflow-hidden">
            <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border-[16px] md:border-[24px] border-red-500" />
          </div>
        </motion.div>

        {/* VS 뱃지 */}
        <div className={`text-4xl md:text-6xl font-black ${themeColors.introVsColor} italic tracking-tighter`}>
          VS
        </div>

        {/* X 버튼 아이콘 */}
        <motion.div
          animate={{ y: [0, -15, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="relative group"
        >
          <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl transform group-hover:scale-110 transition-transform duration-500" />
          <div className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-white shadow-xl flex items-center justify-center border-8 border-white relative overflow-hidden">
             <div className="relative w-20 h-20 md:w-28 md:h-28">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16px] md:w-[24px] h-full bg-blue-500 rounded-full rotate-45" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16px] md:w-[24px] h-full bg-blue-500 rounded-full -rotate-45" />
             </div>
          </div>
        </motion.div>
      </motion.div>

      {/* 하단: 시작 버튼 (자동 시작 안내) */}
      <motion.button
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="relative group z-10 mb-8 cursor-default"
      >
        <div className={`absolute -inset-1 bg-gradient-to-r ${themeColors.introStartGlow} rounded-full blur opacity-75 animate-pulse`} />
        <div className={`relative px-12 py-6 ${themeColors.introStartBg} rounded-full leading-none flex items-center gap-4 shadow-xl`}>
          <span className="text-xl md:text-2xl font-black text-white">
            잠시 후 퀴즈가 시작됩니다...
          </span>
        </div>
      </motion.button>
    </div>
  );
}