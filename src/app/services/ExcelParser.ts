import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import type { QuizItem, ExcelQuizRow } from '../types/quiz';

export interface ParseResult {
  success: boolean;
  items: QuizItem[];
  errors: string[];
  warnings: string[];
}

const REQUIRED_COLUMNS = ['question', 'answer', 'explanation'];
const OPTIONAL_COLUMNS = ['questionTTS', 'explanationTTS'];
const VALID_ANSWERS = ['O', 'X', 'TRUE', 'FALSE', 'T', 'F', '1', '0'];

export function parseExcelFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: '',
        });

        const result = parseRows(jsonData);
        resolve(result);
      } catch (error) {
        reject(new Error(`엑셀 파일 파싱 실패: ${(error as Error).message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기 실패'));
    };

    reader.readAsArrayBuffer(file);
  });
}

function parseRows(rows: Record<string, unknown>[]): ParseResult {
  const items: QuizItem[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    errors.push('엑셀 파일에 데이터가 없습니다.');
    return { success: false, items, errors, warnings };
  }

  // Check for required columns
  const firstRow = rows[0];
  const columns = Object.keys(firstRow).map(col => col.toLowerCase().trim());

  for (const required of REQUIRED_COLUMNS) {
    if (!columns.some(col => col === required)) {
      errors.push(`필수 컬럼 '${required}'이(가) 없습니다.`);
    }
  }

  if (errors.length > 0) {
    return { success: false, items, errors, warnings };
  }

  // Parse each row
  rows.forEach((row, index) => {
    const rowNum = index + 2; // Excel rows start at 1, plus header

    const normalizedRow = normalizeRow(row);
    const { item, rowErrors, rowWarnings } = parseRow(normalizedRow, rowNum);

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else if (item) {
      items.push(item);
    }

    warnings.push(...rowWarnings);
  });

  return {
    success: errors.length === 0 && items.length > 0,
    items,
    errors,
    warnings,
  };
}

function normalizeRow(row: Record<string, unknown>): ExcelQuizRow {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().trim();
    normalized[normalizedKey] = String(value ?? '').trim();
  }

  return {
    question: normalized['question'] || '',
    answer: normalized['answer'] || '',
    explanation: normalized['explanation'] || '',
    questionTTS: normalized['questiontts'] || normalized['question_tts'] || undefined,
    explanationTTS: normalized['explanationtts'] || normalized['explanation_tts'] || undefined,
  };
}

function parseRow(row: ExcelQuizRow, rowNum: number): {
  item: QuizItem | null;
  rowErrors: string[];
  rowWarnings: string[];
} {
  const rowErrors: string[] = [];
  const rowWarnings: string[] = [];

  // Validate required fields
  if (!row.question) {
    rowErrors.push(`${rowNum}행: 문제(question)가 비어있습니다.`);
  }

  if (!row.answer) {
    rowErrors.push(`${rowNum}행: 정답(answer)이 비어있습니다.`);
  }

  if (!row.explanation) {
    rowErrors.push(`${rowNum}행: 해설(explanation)이 비어있습니다.`);
  }

  // Validate answer format
  const normalizedAnswer = row.answer.toUpperCase();
  if (!VALID_ANSWERS.includes(normalizedAnswer)) {
    rowErrors.push(`${rowNum}행: 정답은 O, X, TRUE, FALSE 중 하나여야 합니다. (현재: ${row.answer})`);
  }

  // Warnings for optional fields
  if (!row.questionTTS) {
    rowWarnings.push(`${rowNum}행: questionTTS가 없어 question을 TTS에 사용합니다.`);
  }

  if (!row.explanationTTS) {
    rowWarnings.push(`${rowNum}행: explanationTTS가 없어 explanation을 TTS에 사용합니다.`);
  }

  if (rowErrors.length > 0) {
    return { item: null, rowErrors, rowWarnings };
  }

  // Parse answer to boolean
  const answerBool = ['O', 'TRUE', 'T', '1'].includes(normalizedAnswer);

  const item: QuizItem = {
    id: uuidv4(),
    question: row.question,
    questionTTS: row.questionTTS || undefined,
    answer: answerBool,
    explanation: row.explanation,
    explanationTTS: row.explanationTTS || undefined,
  };

  return { item, rowErrors, rowWarnings };
}

// Generate sample Excel template
export function generateTemplateBlob(): Blob {
  const sampleData = [
    {
      question: '산업안전보건법상 근로자는 안전모를 착용해야 한다.',
      answer: 'O',
      explanation: '산업안전보건기준에 관한 규칙 제32조에 따라 근로자는 안전모를 착용해야 합니다.',
      questionTTS: '',
      explanationTTS: '',
    },
    {
      question: '작업장 정리정돈은 퇴근 전에만 하면 된다.',
      answer: 'X',
      explanation: '정리정돈은 작업 전, 중, 후 항시 유지해야 안전사고를 예방할 수 있습니다.',
      questionTTS: '',
      explanationTTS: '',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Quiz');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
