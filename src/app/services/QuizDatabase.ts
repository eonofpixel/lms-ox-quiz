import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { QuizSet, TTSAudioData, RenderJob } from '../types/quiz';

interface QuizDBSchema extends DBSchema {
  quizSets: {
    key: string;
    value: QuizSet;
    indexes: { 'by-name': string; 'by-date': Date };
  };
  ttsAudio: {
    key: string;
    value: TTSAudioData;
    indexes: { 'by-quiz-item': string };
  };
  renderJobs: {
    key: string;
    value: RenderJob;
    indexes: { 'by-status': string; 'by-date': Date };
  };
}

const DB_NAME = 'quiz-video-renderer';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<QuizDBSchema> | null = null;

export async function getDB(): Promise<IDBPDatabase<QuizDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<QuizDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Quiz Sets store
      if (!db.objectStoreNames.contains('quizSets')) {
        const quizStore = db.createObjectStore('quizSets', { keyPath: 'id' });
        quizStore.createIndex('by-name', 'name');
        quizStore.createIndex('by-date', 'createdAt');
      }

      // TTS Audio store
      if (!db.objectStoreNames.contains('ttsAudio')) {
        const ttsStore = db.createObjectStore('ttsAudio', { keyPath: 'id' });
        ttsStore.createIndex('by-quiz-item', 'quizItemId');
      }

      // Render Jobs store
      if (!db.objectStoreNames.contains('renderJobs')) {
        const renderStore = db.createObjectStore('renderJobs', { keyPath: 'id' });
        renderStore.createIndex('by-status', 'status');
        renderStore.createIndex('by-date', 'createdAt');
      }
    },
  });

  return dbInstance;
}

// Quiz Sets CRUD
export async function getAllQuizSets(): Promise<QuizSet[]> {
  const db = await getDB();
  const sets = await db.getAll('quizSets');
  return sets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getQuizSet(id: string): Promise<QuizSet | undefined> {
  const db = await getDB();
  return db.get('quizSets', id);
}

export async function saveQuizSet(quizSet: QuizSet): Promise<void> {
  const db = await getDB();
  await db.put('quizSets', quizSet);
}

export async function deleteQuizSet(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('quizSets', id);

  // Also delete associated TTS audio
  const ttsAudios = await db.getAllFromIndex('ttsAudio', 'by-quiz-item');
  for (const audio of ttsAudios) {
    if (audio.quizItemId.startsWith(id)) {
      await db.delete('ttsAudio', audio.id);
    }
  }
}

// TTS Audio CRUD
export async function saveTTSAudio(audio: TTSAudioData): Promise<void> {
  const db = await getDB();
  await db.put('ttsAudio', audio);
}

export async function getTTSAudio(quizItemId: string, type: 'question' | 'explanation'): Promise<TTSAudioData | undefined> {
  const db = await getDB();
  const all = await db.getAllFromIndex('ttsAudio', 'by-quiz-item', quizItemId);
  return all.find(a => a.type === type);
}

export async function getAllTTSAudioForQuizSet(quizSetId: string): Promise<TTSAudioData[]> {
  const db = await getDB();
  const all = await db.getAll('ttsAudio');
  return all.filter(a => a.quizItemId.startsWith(quizSetId));
}

export async function deleteTTSAudio(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('ttsAudio', id);
}

// Render Jobs CRUD
export async function getAllRenderJobs(): Promise<RenderJob[]> {
  const db = await getDB();
  const jobs = await db.getAll('renderJobs');
  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getRenderJob(id: string): Promise<RenderJob | undefined> {
  const db = await getDB();
  return db.get('renderJobs', id);
}

export async function saveRenderJob(job: RenderJob): Promise<void> {
  const db = await getDB();
  await db.put('renderJobs', job);
}

export async function deleteRenderJob(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('renderJobs', id);
}

export async function getPendingRenderJobs(): Promise<RenderJob[]> {
  const db = await getDB();
  return db.getAllFromIndex('renderJobs', 'by-status', 'pending');
}
