import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useQuizStore } from '../../hooks/useQuizStore';
import { QuizSetCard } from './QuizSetCard';
import { QuizEditDialog } from './QuizEditDialog';
import { Button } from '../ui/button';
import { Plus, Video, Upload, FolderPlus, Folder, ArrowLeft, Trash2, FolderInput, CheckSquare, X, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { QuizItem } from '../../types/quiz';
import type { QuizThemeId } from '../../types/theme';

// 기본 퀴즈 데이터
const defaultQuizItem: QuizItem = {
  id: uuidv4(),
  question: '작업 시작 전 안전보호구를 반드시 착용해야 한다.',
  questionTTS: '작업 시작 전 안전보호구를 반드시 착용해야 한다.',
  answer: true,
  explanation: '안전모, 안전화, 보안경 등 작업에 맞는 안전보호구 착용은 산업안전보건법에 명시된 필수 안전수칙입니다.',
  explanationTTS: '안전모, 안전화, 보안경 등 작업에 맞는 안전보호구 착용은 산업안전보건법에 명시된 필수 안전수칙입니다.',
  explanations: [{
    content: '안전모, 안전화, 보안경 등 작업에 맞는 안전보호구 착용은 산업안전보건법에 명시된 필수 안전수칙입니다.',
    tts: '안전모, 안전화, 보안경 등 작업에 맞는 안전보호구 착용은 산업안전보건법에 명시된 필수 안전수칙입니다.',
  }],
};

export function QuizListPage() {
  const navigate = useNavigate();
  const {
    quizSets, quizFolders, isLoading, error,
    loadQuizSets, addQuizSet, updateQuizSet,
    addFolder, renameFolder, deleteFolder,
    deleteQuizSets, moveQuizSets,
  } = useQuizStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder & selection state
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState('');

  useEffect(() => {
    loadQuizSets();
  }, [loadQuizSets]);

  // Filter quiz sets for current folder
  const currentQuizSets = quizSets.filter(qs =>
    currentFolderId ? qs.folderId === currentFolderId : !qs.folderId
  );

  // Current folder info
  const currentFolder = currentFolderId
    ? quizFolders.find(f => f.id === currentFolderId)
    : undefined;

  // Select all toggle
  const allSelected = currentQuizSets.length > 0 && currentQuizSets.every(qs => selectedIds.has(qs.id));

  // --- Selection handlers ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentQuizSets.map(qs => qs.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // --- Folder navigation ---
  const enterFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
    exitSelectionMode();
  };

  const goToRoot = () => {
    setCurrentFolderId(undefined);
    exitSelectionMode();
  };

  // --- Folder CRUD ---
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await addFolder(newFolderName.trim());
    setNewFolderName('');
    setNewFolderDialogOpen(false);
  };

  const handleRenameFolder = async (id: string) => {
    if (!renamingFolderName.trim()) return;
    await renameFolder(id, renamingFolderName.trim());
    setRenamingFolderId(null);
    setRenamingFolderName('');
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('이 보관함을 삭제하시겠습니까? 퀴즈는 메인 목록으로 이동됩니다.')) return;
    await deleteFolder(folderId);
    if (currentFolderId === folderId) goToRoot();
  };

  // --- Bulk actions ---
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개 퀴즈를 삭제하시겠습니까?`)) return;
    await deleteQuizSets(Array.from(selectedIds));
    exitSelectionMode();
  };

  const handleBulkMove = async (targetFolderId: string | undefined) => {
    if (selectedIds.size === 0) return;
    await moveQuizSets(Array.from(selectedIds), targetFolderId);
    setMoveDialogOpen(false);
    exitSelectionMode();
  };

  // --- Quiz CRUD ---
  const handleCreateQuiz = async (name: string, item: QuizItem, theme: QuizThemeId, introBadgeText?: string, introSubtitle?: string) => {
    const newQuizSet = await addQuizSet(name, [item], undefined, theme);
    if (introBadgeText || introSubtitle) {
      await updateQuizSet(newQuizSet.id, { introBadgeText, introSubtitle });
    }
    // If inside a folder, assign the quiz to this folder
    if (currentFolderId) {
      await updateQuizSet(newQuizSet.id, { folderId: currentFolderId });
    }
    setCreateDialogOpen(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Support both wrapped and raw formats
      const quizSet = data.quizSet || data;
      if (!quizSet.name || !quizSet.items || !Array.isArray(quizSet.items)) {
        alert('올바른 퀴즈 파일이 아닙니다.');
        return;
      }

      // Validate items
      for (const item of quizSet.items) {
        if (!item.question || item.answer === undefined) {
          alert('퀴즈 항목에 필수 필드(question, answer)가 없습니다.');
          return;
        }
      }

      // Generate new IDs to avoid collisions
      const newItems = quizSet.items.map((item: any) => ({
        ...item,
        id: uuidv4(),
      }));

      const newQuizSet = await addQuizSet(
        quizSet.name,
        newItems,
        quizSet.description,
        quizSet.theme
      );

      // Preserve intro text fields from imported data
      if (quizSet.introBadgeText || quizSet.introSubtitle) {
        await updateQuizSet(newQuizSet.id, {
          introBadgeText: quizSet.introBadgeText,
          introSubtitle: quizSet.introSubtitle,
        });
      }

      // If inside a folder, assign the imported quiz to this folder
      if (currentFolderId) {
        await updateQuizSet(newQuizSet.id, { folderId: currentFolderId });
      }

      alert(`"${quizSet.name}" 퀴즈를 가져왔습니다.`);
    } catch (err) {
      alert('파일을 읽을 수 없습니다. JSON 형식인지 확인해주세요.');
    }

    // Reset input
    e.target.value = '';
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
          <div className="flex items-center gap-3 mb-2">
            {currentFolder && (
              <button onClick={goToRoot} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-6 h-6" />
              </button>
            )}
            <h1 className="text-3xl font-bold text-gray-800">
              {currentFolder ? currentFolder.name : 'OX 퀴즈 관리'}
            </h1>
          </div>
          <p className="text-gray-600">
            {currentFolder ? `${currentQuizSets.length}개 퀴즈` : '퀴즈를 만들고 비디오로 렌더링하세요.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          {!selectionMode ? (
            <>
              <Button onClick={() => setCreateDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-2" />새 퀴즈 만들기
              </Button>
              <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="border-orange-300 text-orange-600 hover:bg-orange-50">
                <Upload className="w-4 h-4 mr-2" />가져오기
              </Button>
              {!currentFolder && (
                <Button variant="outline" onClick={() => setNewFolderDialogOpen(true)} className="border-orange-300 text-orange-600 hover:bg-orange-50">
                  <FolderPlus className="w-4 h-4 mr-2" />보관함 만들기
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate('/render')} className="border-orange-300 text-orange-600 hover:bg-orange-50">
                <Video className="w-4 h-4 mr-2" />렌더링 대기열
              </Button>
              {currentQuizSets.length > 0 && (
                <Button variant="outline" onClick={() => setSelectionMode(true)} className="border-gray-300 text-gray-600 hover:bg-gray-50 ml-auto">
                  <CheckSquare className="w-4 h-4 mr-2" />선택
                </Button>
              )}
            </>
          ) : (
            <>
              {/* Selection mode toolbar */}
              <Button variant="outline" onClick={toggleSelectAll} className={`${allSelected ? 'bg-orange-100 border-orange-400' : ''}`}>
                <CheckSquare className="w-4 h-4 mr-2" />
                {allSelected ? '전체 해제' : '전체 선택'}
              </Button>
              <span className="flex items-center text-sm text-gray-600 px-2">
                {selectedIds.size}개 선택됨
              </span>
              {selectedIds.size > 0 && (
                <>
                  <Button variant="outline" onClick={() => setMoveDialogOpen(true)} className="border-blue-300 text-blue-600 hover:bg-blue-50">
                    <FolderInput className="w-4 h-4 mr-2" />보관함으로 이동
                  </Button>
                  <Button variant="outline" onClick={handleBulkDelete} className="border-red-300 text-red-600 hover:bg-red-50">
                    <Trash2 className="w-4 h-4 mr-2" />삭제
                  </Button>
                </>
              )}
              <Button variant="ghost" onClick={exitSelectionMode} className="ml-auto">
                <X className="w-4 h-4 mr-2" />취소
              </Button>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Folders Grid (only on root) */}
        {!currentFolder && quizFolders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">보관함</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {quizFolders.map(folder => {
                const count = quizSets.filter(qs => qs.folderId === folder.id).length;
                return (
                  <div
                    key={folder.id}
                    className="bg-white rounded-xl border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer p-4 flex items-center gap-3 group"
                    onClick={() => enterFolder(folder.id)}
                  >
                    <Folder className="w-8 h-8 text-orange-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {renamingFolderId === folder.id ? (
                        <input
                          autoFocus
                          value={renamingFolderName}
                          onChange={e => setRenamingFolderName(e.target.value)}
                          onBlur={() => handleRenameFolder(folder.id)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(folder.id); if (e.key === 'Escape') setRenamingFolderId(null); }}
                          onClick={e => e.stopPropagation()}
                          className="w-full text-sm font-medium border-b border-orange-400 outline-none bg-transparent"
                        />
                      ) : (
                        <p className="text-sm font-medium text-gray-800 truncate">{folder.name}</p>
                      )}
                      <p className="text-xs text-gray-500">{count}개 퀴즈</p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setRenamingFolderId(folder.id); setRenamingFolderName(folder.name); }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Edit className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="p-1 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quiz Sets Grid */}
        {currentQuizSets.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="w-24 h-24 mx-auto mb-6 bg-orange-100 rounded-full flex items-center justify-center">
              <Plus className="w-12 h-12 text-orange-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              {currentFolder ? '이 보관함이 비어있습니다' : '아직 퀴즈가 없습니다'}
            </h2>
            <p className="text-gray-500 mb-6">
              {currentFolder ? '퀴즈를 이 보관함으로 이동하거나 새로 만드세요.' : '새 퀴즈를 만들어 시작하세요.'}
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" />새 퀴즈 만들기
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentQuizSets.map(quizSet => (
              <QuizSetCard
                key={quizSet.id}
                quizSet={quizSet}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(quizSet.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}

        {/* Move to Folder Dialog */}
        {moveDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setMoveDialogOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-96 max-w-[90vw]" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">보관함으로 이동</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {currentFolderId && (
                  <button
                    onClick={() => handleBulkMove(undefined)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-orange-50 text-left"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-700">메인 목록</span>
                  </button>
                )}
                {quizFolders.filter(f => f.id !== currentFolderId).map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => handleBulkMove(folder.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-orange-50 text-left"
                  >
                    <Folder className="w-5 h-5 text-orange-400" />
                    <span className="font-medium text-gray-700">{folder.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {quizSets.filter(qs => qs.folderId === folder.id).length}개
                    </span>
                  </button>
                ))}
                {quizFolders.length === 0 && !currentFolderId && (
                  <p className="text-center text-gray-500 py-4">보관함이 없습니다. 먼저 보관함을 만드세요.</p>
                )}
              </div>
              <div className="flex justify-end mt-4">
                <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>닫기</Button>
              </div>
            </div>
          </div>
        )}

        {/* New Folder Dialog */}
        {newFolderDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setNewFolderDialogOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-96 max-w-[90vw]" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">새 보관함</h3>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
                placeholder="보관함 이름"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 mb-4 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
              />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>취소</Button>
                <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="bg-orange-500 hover:bg-orange-600 text-white">만들기</Button>
              </div>
            </div>
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
