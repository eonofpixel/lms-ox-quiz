import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { parseExcelFile, type ParseResult } from '../../services/ExcelParser';
import { useQuizStore } from '../../hooks/useQuizStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';

interface ExcelUploaderProps {
  onSuccess?: () => void;
}

export function ExcelUploader({ onSuccess }: ExcelUploaderProps) {
  const { addQuizSet } = useQuizStore();
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [quizName, setQuizName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setFileName(file.name);
    setIsProcessing(true);
    setParseResult(null);

    try {
      const result = await parseExcelFile(file);
      setParseResult(result);

      // Auto-fill quiz name from file name
      if (!quizName) {
        const nameWithoutExt = file.name.replace(/\.(xlsx?|xls)$/i, '');
        setQuizName(nameWithoutExt);
      }
    } catch (error) {
      setParseResult({
        success: false,
        items: [],
        errors: [(error as Error).message],
        warnings: [],
      });
    } finally {
      setIsProcessing(false);
    }
  }, [quizName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const handleSave = async () => {
    if (!parseResult?.success || !quizName.trim()) return;

    setIsSaving(true);
    try {
      await addQuizSet(quizName.trim(), parseResult.items);
      onSuccess?.();
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setParseResult(null);
    setQuizName('');
    setFileName(null);
  };

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${isDragActive
            ? 'border-orange-500 bg-orange-50'
            : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/50'
          }
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center">
          {isProcessing ? (
            <>
              <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600">파일 분석 중...</p>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-orange-400 mb-4" />
              <p className="text-gray-700 font-medium mb-1">
                {isDragActive ? '파일을 놓으세요' : '엑셀 파일을 드래그하거나 클릭하세요'}
              </p>
              <p className="text-sm text-gray-500">
                .xlsx, .xls 파일 지원
              </p>
            </>
          )}
        </div>
      </div>

      {/* Parse Result */}
      {parseResult && (
        <div className="space-y-4">
          {/* File Info */}
          <div className="flex items-center gap-2 text-gray-600">
            <FileSpreadsheet className="w-5 h-5" />
            <span>{fileName}</span>
          </div>

          {/* Success */}
          {parseResult.success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">
                  {parseResult.items.length}개 문제를 찾았습니다
                </span>
              </div>
            </div>
          )}

          {/* Errors */}
          {parseResult.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 mb-2">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">오류</span>
              </div>
              <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                {parseResult.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {parseResult.warnings.length > 0 && parseResult.success && (
            <details className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <summary className="flex items-center gap-2 text-yellow-700 cursor-pointer">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">
                  경고 {parseResult.warnings.length}개
                </span>
              </summary>
              <ul className="mt-2 list-disc list-inside text-sm text-yellow-600 space-y-1 max-h-32 overflow-y-auto">
                {parseResult.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Quiz Name Input */}
          {parseResult.success && (
            <div className="space-y-2">
              <Label htmlFor="quiz-name">퀴즈 세트 이름</Label>
              <Input
                id="quiz-name"
                value={quizName}
                onChange={(e) => setQuizName(e.target.value)}
                placeholder="퀴즈 세트 이름을 입력하세요"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={handleReset} className="flex-1">
              다시 선택
            </Button>
            {parseResult.success && (
              <Button
                onClick={handleSave}
                disabled={!quizName.trim() || isSaving}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isSaving ? '저장 중...' : '저장하기'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
