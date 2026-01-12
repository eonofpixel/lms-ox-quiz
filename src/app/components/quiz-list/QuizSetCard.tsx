import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QuizSet, QuizItem } from '../../types/quiz';
import { useQuizStore } from '../../hooks/useQuizStore';
import { QuizEditDialog } from './QuizEditDialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Play, Video, MoreVertical, Trash2, Edit, Eye } from 'lucide-react';

interface QuizSetCardProps {
  quizSet: QuizSet;
}

export function QuizSetCard({ quizSet }: QuizSetCardProps) {
  const navigate = useNavigate();
  const { deleteQuizSet, updateQuizSet, createRenderJob } = useQuizStore();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteQuizSet(quizSet.id);
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handlePreview = () => {
    navigate(`/preview/${quizSet.id}`);
  };

  const handleRender = async () => {
    await createRenderJob(quizSet.id);
    navigate('/render');
  };

  const handleEditSave = async (name: string, item: QuizItem) => {
    await updateQuizSet(quizSet.id, {
      name,
      items: [item],
    });
    setEditDialogOpen(false);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <>
      <Card className="bg-white hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg font-semibold text-gray-800 line-clamp-1">
                {quizSet.name}
              </CardTitle>
              <CardDescription className="mt-1">
                {quizSet.items.length}개 문제 · {formatDate(quizSet.createdAt)}
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handlePreview}>
                  <Eye className="mr-2 h-4 w-4" />
                  미리보기
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  편집
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="pb-3">
          {/* Preview of first question */}
          {quizSet.items[0] && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 line-clamp-2">
              Q. {quizSet.items[0].question}
            </div>
          )}
        </CardContent>

        <CardFooter className="pt-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handlePreview}
          >
            <Play className="w-4 h-4 mr-1" />
            미리보기
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={handleRender}
          >
            <Video className="w-4 h-4 mr-1" />
            렌더링
          </Button>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>퀴즈 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{quizSet.name}" 퀴즈를 삭제하시겠습니까?
              <br />
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <QuizEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        defaultItem={quizSet.items[0]}
        defaultName={quizSet.name}
        onSave={handleEditSave}
        mode="edit"
      />
    </>
  );
}
