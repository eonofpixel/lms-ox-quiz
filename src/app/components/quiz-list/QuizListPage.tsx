import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useQuizStore } from '../../hooks/useQuizStore';
import { QuizSetCard } from './QuizSetCard';
import { QuizEditDialog } from './QuizEditDialog';
import { Button } from '../ui/button';
import { Plus, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { QuizItem } from '../../types/quiz';

// 기본 퀴즈 데이터
const defaultQuizItem: QuizItem = {
  id: uuidv4(),
  question: '작업 시작 전 안전보호구를 반드시 착용해야 한다.',
  questionTTS: '작업 시작 전 안전보호구를 반드시 착용해야 한다.',
  answer: true,
  explanation: '안전모, 안전화, 보안경 등 작업에 맞는 안전보호구 착용은 산업안전보건법에 명시된 필수 안전수칙입니다.',
  explanationTTS: '안전모, 안전화, 보안경 등 작업에 맞는 안전보호구 착용은 산업안전보건법에 명시된 필수 안전수칙입니다.',
};

export function QuizListPage() {
  const navigate = useNavigate();
  const { quizSets, isLoading, error, loadQuizSets, addQuizSet } = useQuizStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    loadQuizSets();
  }, [loadQuizSets]);

  const handleCreateQuiz = async (name: string, item: QuizItem) => {
    await addQuizSet(name, [item]);
    setCreateDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-orange-50 to-amber-100">
        <div className="text-xl text-orange-600">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">OX 퀴즈 관리</h1>
          <p className="text-gray-600">퀴즈를 만들고 비디오로 렌더링하세요.</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8">
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            새 퀴즈 만들기
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate('/render')}
            className="border-orange-300 text-orange-600 hover:bg-orange-50"
          >
            <Video className="w-4 h-4 mr-2" />
            렌더링 대기열
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Quiz Sets Grid */}
        {quizSets.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="w-24 h-24 mx-auto mb-6 bg-orange-100 rounded-full flex items-center justify-center">
              <Plus className="w-12 h-12 text-orange-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              아직 퀴즈가 없습니다
            </h2>
            <p className="text-gray-500 mb-6">
              새 퀴즈를 만들어 시작하세요.
            </p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              새 퀴즈 만들기
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizSets.map((quizSet) => (
              <QuizSetCard key={quizSet.id} quizSet={quizSet} />
            ))}
          </div>
        )}

        {/* Create Quiz Dialog */}
        <QuizEditDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          defaultItem={defaultQuizItem}
          onSave={handleCreateQuiz}
          mode="create"
        />
      </div>
    </div>
  );
}
