import { useState } from 'react';
import { motion } from 'motion/react';
import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "./ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Button } from "./ui/button";

interface QuizItem {
  id: number;
  question: string;
  questionTTS?: string;
  answer: boolean;
  explanation: string;
  explanationTTS?: string;
}

interface SelectionScreenProps {
  onSelect: (id: number) => void;
  quizData1: QuizItem[];
  quizData2: QuizItem[];
  onUpdateQuiz: (courseId: number, data: QuizItem) => void;
}

export function SelectionScreen({ onSelect, quizData1, quizData2, onUpdateQuiz }: SelectionScreenProps) {
  const [editingCourse1, setEditingCourse1] = useState(quizData1[0]);
  const [editingCourse2, setEditingCourse2] = useState(quizData2[0]);

  const handleSave = () => {
    onUpdateQuiz(1, editingCourse1);
    onUpdateQuiz(2, editingCourse2);
  };

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
          className="inline-flex items-center gap-2 bg-orange-500 text-white px-5 py-2 rounded-full mb-6 shadow-lg border-2 border-orange-400"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-sm md:text-base font-bold tracking-wider">SELECT QUIZ</span>
        </motion.div>
        
        <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-2 tracking-tight drop-shadow-sm">
          퀴즈 선택
        </h1>
        <p className="text-lg md:text-2xl text-slate-700 font-bold tracking-wide">
          진행할 퀴즈를 선택해주세요
        </p>
      </motion.div>

      {/* 중앙: 선택 버튼들 */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="flex gap-8 md:gap-12 relative z-10"
      >
        {[1, 2].map((id) => (
          <motion.button
            key={id}
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(id)}
            className="group relative w-64 h-80 bg-white rounded-3xl shadow-xl flex flex-col items-center justify-center gap-6 overflow-hidden border-4 border-transparent hover:border-orange-300 transition-all duration-300"
          >
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br ${id === 1 ? 'from-orange-100 to-transparent' : 'from-amber-100 to-transparent'}`} />
            
            <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl font-black text-white shadow-lg ${id === 1 ? 'bg-orange-500' : 'bg-amber-500'}`}>
              {id === 1 ? 'A' : 'B'}
            </div>
            
            <div className="text-center relative z-10">
              <h3 className="text-2xl font-black text-slate-800 mb-2">퀴즈 {id === 1 ? 'A' : 'B'}</h3>
              <p className="text-slate-500 font-medium">O/X 퀴즈</p>
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* 하단: 설정 버튼 영역 */}
      <div className="relative z-10 h-16 flex items-center justify-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" className="text-slate-500 hover:text-slate-800 hover:bg-white/50 gap-2">
              <Settings className="w-4 h-4" />
              <span>설정</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl bg-white/95 backdrop-blur-md border-none shadow-2xl sm:max-w-[700px] p-0 overflow-hidden rounded-3xl">
            <div className="bg-slate-900 text-white p-6 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 rounded-full blur-[60px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
               <div className="relative z-10">
                <DialogHeader className="p-0">
                  <DialogTitle className="text-3xl font-black tracking-tight">퀴즈 콘텐츠 설정</DialogTitle>
                  <DialogDescription className="text-slate-300 text-base mt-1">
                    각 퀴즈의 질문, 정답, 해설을 자유롭게 커스터마이징하세요.
                  </DialogDescription>
                </DialogHeader>
               </div>
            </div>

            <div className="p-6 pt-2">
              <Tabs defaultValue="course1" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-slate-100/80 p-1 rounded-2xl">
                  <TabsTrigger 
                    value="course1" 
                    className="rounded-xl text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm transition-all"
                  >
                    퀴즈 A
                  </TabsTrigger>
                  <TabsTrigger 
                    value="course2" 
                    className="rounded-xl text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm transition-all"
                  >
                    퀴즈 B
                  </TabsTrigger>
                </TabsList>

                {/* 과정 1 설정 폼 */}
                <TabsContent value="course1" className="space-y-6 focus-visible:outline-none">
                  <div className="space-y-4 bg-orange-50/50 p-6 rounded-2xl border border-orange-100">
                    <div className="space-y-2">
                      <Label htmlFor="q1" className="text-base font-bold text-slate-800">질문 내용</Label>
                      <Textarea 
                        id="q1" 
                        value={editingCourse1.question}
                        onChange={(e) => setEditingCourse1({...editingCourse1, question: e.target.value})}
                        placeholder="질문을 입력하세요"
                        className="h-24 text-lg border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="q1_tts" className="text-base font-bold text-slate-800">질문 TTS 대본 (읽기 전용)</Label>
                      <Textarea 
                        id="q1_tts" 
                        value={editingCourse1.questionTTS || editingCourse1.question}
                        onChange={(e) => setEditingCourse1({...editingCourse1, questionTTS: e.target.value})}
                        placeholder="질문 음성으로 읽을 내용을 입력하세요 (비워두면 질문 내용과 동일)"
                        className="h-20 text-base border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-base font-bold text-slate-800">정답 선택</Label>
                      <RadioGroup 
                        value={editingCourse1.answer ? "true" : "false"}
                        onValueChange={(val) => setEditingCourse1({...editingCourse1, answer: val === "true"})}
                        className="flex gap-4 pt-1"
                      >
                        <div className="flex-1">
                          <RadioGroupItem value="true" id="c1-true" className="peer sr-only" />
                          <Label 
                            htmlFor="c1-true" 
                            className="flex items-center justify-center w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:bg-green-50 peer-data-[state=checked]:border-green-500 peer-data-[state=checked]:bg-green-50 cursor-pointer transition-all"
                          >
                            <span className="text-xl font-black text-green-600">O (참)</span>
                          </Label>
                        </div>
                        <div className="flex-1">
                          <RadioGroupItem value="false" id="c1-false" className="peer sr-only" />
                          <Label 
                            htmlFor="c1-false" 
                            className="flex items-center justify-center w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:bg-red-50 peer-data-[state=checked]:border-red-500 peer-data-[state=checked]:bg-red-50 cursor-pointer transition-all"
                          >
                            <span className="text-xl font-black text-red-600">X (거짓)</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="exp1" className="text-base font-bold text-slate-800">해설 내용</Label>
                      <Textarea 
                        id="exp1" 
                        value={editingCourse1.explanation}
                        onChange={(e) => setEditingCourse1({...editingCourse1, explanation: e.target.value})}
                        placeholder="해설을 입력하세요"
                        className="min-h-[120px] resize-none text-base border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl p-4 leading-relaxed"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="exp1_tts" className="text-base font-bold text-slate-800">해설 TTS 대본 (읽기 전용)</Label>
                      <Textarea 
                        id="exp1_tts" 
                        value={editingCourse1.explanationTTS || editingCourse1.explanation}
                        onChange={(e) => setEditingCourse1({...editingCourse1, explanationTTS: e.target.value})}
                        placeholder="해설 음성으로 읽을 내용을 입력하세요 (비워두면 해설 내용과 동일)"
                        className="h-20 text-base border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl resize-none"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* 과정 2 설정 폼 */}
                <TabsContent value="course2" className="space-y-6 focus-visible:outline-none">
                  <div className="space-y-4 bg-amber-50/50 p-6 rounded-2xl border border-amber-100">
                    <div className="space-y-2">
                      <Label htmlFor="q2" className="text-base font-bold text-slate-800">질문 내용</Label>
                      <Textarea 
                        id="q2" 
                        value={editingCourse2.question}
                        onChange={(e) => setEditingCourse2({...editingCourse2, question: e.target.value})}
                        placeholder="질문을 입력하세요"
                        className="h-24 text-lg border-slate-200 focus:border-amber-400 focus:ring-amber-400/20 rounded-xl resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="q2_tts" className="text-base font-bold text-slate-800">질문 TTS 대본 (읽기 전용)</Label>
                      <Textarea 
                        id="q2_tts" 
                        value={editingCourse2.questionTTS || editingCourse2.question}
                        onChange={(e) => setEditingCourse2({...editingCourse2, questionTTS: e.target.value})}
                        placeholder="질문 음성으로 읽을 내용을 입력하세요 (비워두면 질문 내용과 동일)"
                        className="h-20 text-base border-slate-200 focus:border-amber-400 focus:ring-amber-400/20 rounded-xl resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-base font-bold text-slate-800">정답 선택</Label>
                      <RadioGroup 
                        value={editingCourse2.answer ? "true" : "false"}
                        onValueChange={(val) => setEditingCourse2({...editingCourse2, answer: val === "true"})}
                        className="flex gap-4 pt-1"
                      >
                        <div className="flex-1">
                          <RadioGroupItem value="true" id="c2-true" className="peer sr-only" />
                          <Label 
                            htmlFor="c2-true" 
                            className="flex items-center justify-center w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:bg-green-50 peer-data-[state=checked]:border-green-500 peer-data-[state=checked]:bg-green-50 cursor-pointer transition-all"
                          >
                            <span className="text-xl font-black text-green-600">O (참)</span>
                          </Label>
                        </div>
                        <div className="flex-1">
                          <RadioGroupItem value="false" id="c2-false" className="peer sr-only" />
                          <Label 
                            htmlFor="c2-false" 
                            className="flex items-center justify-center w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:bg-red-50 peer-data-[state=checked]:border-red-500 peer-data-[state=checked]:bg-red-50 cursor-pointer transition-all"
                          >
                            <span className="text-xl font-black text-red-600">X (거짓)</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="exp2" className="text-base font-bold text-slate-800">해설 내용</Label>
                      <Textarea 
                        id="exp2" 
                        value={editingCourse2.explanation}
                        onChange={(e) => setEditingCourse2({...editingCourse2, explanation: e.target.value})}
                        placeholder="해설을 입력하세요"
                        className="min-h-[120px] resize-none text-base border-slate-200 focus:border-amber-400 focus:ring-amber-400/20 rounded-xl p-4 leading-relaxed"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="exp2_tts" className="text-base font-bold text-slate-800">해설 TTS 대본 (읽기 전용)</Label>
                      <Textarea 
                        id="exp2_tts" 
                        value={editingCourse2.explanationTTS || editingCourse2.explanation}
                        onChange={(e) => setEditingCourse2({...editingCourse2, explanationTTS: e.target.value})}
                        placeholder="해설 음성으로 읽을 내용을 입력하세요 (비워두면 해설 내용과 동일)"
                        className="h-20 text-base border-slate-200 focus:border-amber-400 focus:ring-amber-400/20 rounded-xl resize-none"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-8 gap-3 sm:justify-end">
                <DialogClose asChild>
                  <Button variant="outline" className="h-12 px-6 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-600 font-bold">
                    취소
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={handleSave} className="h-12 px-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-lg shadow-slate-900/20 transition-all hover:scale-105 active:scale-95">
                    저장하기
                  </Button>
                </DialogClose>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
