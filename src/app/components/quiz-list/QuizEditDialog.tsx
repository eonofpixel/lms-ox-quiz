import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Button } from '../ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { QuizItem, ExplanationItem } from '../../types/quiz';

interface QuizEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultItem: QuizItem;
  defaultName?: string;
  onSave: (name: string, item: QuizItem) => void;
  mode: 'create' | 'edit';
}

export function QuizEditDialog({
  open,
  onOpenChange,
  defaultItem,
  defaultName = '',
  onSave,
  mode,
}: QuizEditDialogProps) {
  const [quizName, setQuizName] = useState(defaultName);
  const [editingItem, setEditingItem] = useState<QuizItem>(defaultItem);
  const [explanations, setExplanations] = useState<ExplanationItem[]>([]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setQuizName(defaultName || `퀴즈 ${new Date().toLocaleDateString('ko-KR')}`);
      const itemWithId = { ...defaultItem, id: defaultItem.id || uuidv4() };
      setEditingItem(itemWithId);

      // explanations 배열 초기화 (기존 데이터 마이그레이션)
      if (defaultItem.explanations && defaultItem.explanations.length > 0) {
        setExplanations([...defaultItem.explanations]);
      } else {
        // 기존 단일 해설을 배열로 변환
        setExplanations([{
          content: defaultItem.explanation || '',
          tts: defaultItem.explanationTTS || '',
        }]);
      }
    }
  }, [open, defaultItem, defaultName]);

  const handleSave = () => {
    if (!quizName.trim()) return;
    if (explanations.length === 0 || !explanations[0].content.trim()) return;

    // 저장할 QuizItem 구성
    const itemToSave: QuizItem = {
      ...editingItem,
      explanations: explanations.filter(e => e.content.trim()), // 빈 해설 제거
      // 하위 호환성: 첫 번째 해설을 기존 필드에도 저장
      explanation: explanations[0]?.content || '',
      explanationTTS: explanations[0]?.tts || '',
    };
    onSave(quizName.trim(), itemToSave);
  };

  // 해설 추가
  const handleAddExplanation = () => {
    setExplanations([...explanations, { content: '', tts: '' }]);
  };

  // 해설 삭제
  const handleRemoveExplanation = (index: number) => {
    if (explanations.length <= 1) return; // 최소 1개 필수
    setExplanations(explanations.filter((_, i) => i !== index));
  };

  // 해설 업데이트
  const handleUpdateExplanation = (index: number, field: 'content' | 'tts', value: string) => {
    const updated = [...explanations];
    updated[index] = { ...updated[index], [field]: value };
    setExplanations(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white/95 backdrop-blur-md border-none shadow-2xl sm:max-w-[700px] p-0 overflow-hidden rounded-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 relative overflow-hidden sticky top-0 z-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 rounded-full blur-[60px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
          <div className="relative z-10">
            <DialogHeader className="p-0">
              <DialogTitle className="text-3xl font-black tracking-tight">
                {mode === 'create' ? '새 퀴즈 만들기' : '퀴즈 수정'}
              </DialogTitle>
              <DialogDescription className="text-slate-300 text-base mt-1">
                질문, 정답, 해설을 직접 입력하세요.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="p-6 pt-4 space-y-6">
          {/* Quiz Name */}
          <div className="space-y-2">
            <Label htmlFor="quiz-name" className="text-base font-bold text-slate-800">
              퀴즈 이름
            </Label>
            <Input
              id="quiz-name"
              value={quizName}
              onChange={(e) => setQuizName(e.target.value)}
              placeholder="퀴즈 이름을 입력하세요"
              className="h-12 text-lg border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl"
            />
          </div>

          {/* Quiz Content */}
          <div className="space-y-4 bg-orange-50/50 p-6 rounded-2xl border border-orange-100">
            {/* Question */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="question" className="text-base font-bold text-slate-800">
                  질문 내용
                </Label>
                <button
                  type="button"
                  onClick={() => setEditingItem({ ...editingItem, singleLineQuestion: !editingItem.singleLineQuestion })}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    editingItem.singleLineQuestion
                      ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                      : 'bg-white border-slate-300 text-slate-500 hover:border-orange-300 hover:text-orange-500'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${editingItem.singleLineQuestion ? 'bg-white' : 'bg-slate-300'}`} />
                  1줄 고정
                </button>
              </div>
              <Textarea
                id="question"
                value={editingItem.question}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, question: e.target.value })
                }
                placeholder="질문을 입력하세요"
                className="h-24 text-lg border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl resize-none"
              />
            </div>

            {/* Question TTS */}
            <div className="space-y-2">
              <Label htmlFor="questionTTS" className="text-base font-bold text-slate-800">
                질문 TTS 대본 (읽기 전용)
              </Label>
              <Textarea
                id="questionTTS"
                value={editingItem.questionTTS || editingItem.question}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, questionTTS: e.target.value })
                }
                placeholder="질문 음성으로 읽을 내용 (비워두면 질문 내용과 동일)"
                className="h-20 text-base border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-xl resize-none"
              />
            </div>

            {/* Answer */}
            <div className="space-y-2">
              <Label className="text-base font-bold text-slate-800">정답 선택</Label>
              <RadioGroup
                value={editingItem.answer ? 'true' : 'false'}
                onValueChange={(val) =>
                  setEditingItem({ ...editingItem, answer: val === 'true' })
                }
                className="flex gap-4 pt-1"
              >
                <div className="flex-1">
                  <RadioGroupItem value="true" id="answer-true" className="peer sr-only" />
                  <Label
                    htmlFor="answer-true"
                    className="flex items-center justify-center w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:bg-green-50 peer-data-[state=checked]:border-green-500 peer-data-[state=checked]:bg-green-50 cursor-pointer transition-all"
                  >
                    <span className="text-xl font-black text-green-600">O (참)</span>
                  </Label>
                </div>
                <div className="flex-1">
                  <RadioGroupItem value="false" id="answer-false" className="peer sr-only" />
                  <Label
                    htmlFor="answer-false"
                    className="flex items-center justify-center w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:bg-red-50 peer-data-[state=checked]:border-red-500 peer-data-[state=checked]:bg-red-50 cursor-pointer transition-all"
                  >
                    <span className="text-xl font-black text-red-600">X (거짓)</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Multiple Explanations */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-bold text-slate-800">
                  해설 ({explanations.length}개)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddExplanation}
                  className="h-8 px-3 rounded-lg border-orange-300 text-orange-600 hover:bg-orange-50 hover:border-orange-400"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  해설 추가
                </Button>
              </div>

              {explanations.map((exp, index) => (
                <div
                  key={index}
                  className="relative bg-white rounded-xl border border-slate-200 p-4 space-y-3"
                >
                  {/* 해설 번호 및 삭제 버튼 */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-md">
                      해설 {index + 1}
                    </span>
                    {explanations.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveExplanation(index)}
                        className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* 해설 내용 */}
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-slate-600">
                      내용
                    </Label>
                    <Textarea
                      value={exp.content}
                      onChange={(e) => handleUpdateExplanation(index, 'content', e.target.value)}
                      placeholder="해설 내용을 입력하세요"
                      className="min-h-[80px] resize-none text-base border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-lg"
                    />
                  </div>

                  {/* TTS 대본 */}
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-slate-600">
                      TTS 대본 (선택)
                    </Label>
                    <Textarea
                      value={exp.tts || ''}
                      onChange={(e) => handleUpdateExplanation(index, 'tts', e.target.value)}
                      placeholder="음성으로 읽을 내용 (비워두면 해설 내용과 동일)"
                      className="h-16 resize-none text-sm border-slate-200 focus:border-orange-400 focus:ring-orange-400/20 rounded-lg"
                    />
                  </div>
                </div>
              ))}

              {explanations.length === 0 && (
                <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                  해설을 추가해주세요
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="gap-3 sm:justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 px-6 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-600 font-bold"
            >
              취소
            </Button>
            <Button
              onClick={handleSave}
              disabled={!quizName.trim()}
              className="h-12 px-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-lg shadow-slate-900/20 transition-all hover:scale-105 active:scale-95"
            >
              {mode === 'create' ? '만들기' : '저장하기'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
