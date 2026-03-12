import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { QuizSet, QuizFolder, QuizItem, RenderJob, RenderSettings, DEFAULT_RENDER_SETTINGS } from '../types/quiz';
import type { QuizThemeId } from '../types/theme';
import * as db from '../services/QuizDatabase';

interface QuizStore {
  // State
  quizSets: QuizSet[];
  quizFolders: QuizFolder[];
  renderJobs: RenderJob[];
  selectedQuizSetId: string | null;
  isLoading: boolean;
  error: string | null;

  // Quiz Set Actions
  loadQuizSets: () => Promise<void>;
  addQuizSet: (name: string, items: QuizItem[], description?: string, theme?: QuizThemeId) => Promise<QuizSet>;
  updateQuizSet: (id: string, updates: Partial<Pick<QuizSet, 'name' | 'description' | 'items' | 'theme' | 'introBadgeText' | 'introSubtitle' | 'folderId'>>) => Promise<void>;
  deleteQuizSet: (id: string) => Promise<void>;
  deleteQuizSets: (ids: string[]) => Promise<void>;
  moveQuizSets: (ids: string[], folderId: string | undefined) => Promise<void>;
  selectQuizSet: (id: string | null) => void;

  // Folder Actions
  loadFolders: () => Promise<void>;
  addFolder: (name: string) => Promise<QuizFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  // Render Job Actions
  loadRenderJobs: () => Promise<void>;
  createRenderJob: (quizSetId: string) => Promise<RenderJob>;
  updateRenderJob: (id: string, updates: Partial<RenderJob>) => Promise<void>;
  deleteRenderJob: (id: string) => Promise<void>;

  // Utility
  getQuizSetById: (id: string) => QuizSet | undefined;
  clearError: () => void;
}

export const useQuizStore = create<QuizStore>((set, get) => ({
  // Initial State
  quizSets: [],
  quizFolders: [],
  renderJobs: [],
  selectedQuizSetId: null,
  isLoading: false,
  error: null,

  // Quiz Set Actions
  loadQuizSets: async () => {
    set({ isLoading: true, error: null });
    try {
      const quizSets = await db.getAllQuizSets();
      const quizFolders = await db.getAllQuizFolders();
      console.log('[QuizStore] loadQuizSets result:', quizSets.length, 'sets', quizSets);
      set({ quizSets, quizFolders, isLoading: false });
    } catch (error) {
      console.error('[QuizStore] loadQuizSets error:', error);
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  addQuizSet: async (name, items, description, theme) => {
    const newQuizSet: QuizSet = {
      id: uuidv4(),
      name,
      description,
      theme,
      items: items.map(item => ({
        ...item,
        id: item.id || uuidv4(),
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.saveQuizSet(newQuizSet);
    set(state => ({
      quizSets: [newQuizSet, ...state.quizSets],
    }));

    return newQuizSet;
  },

  updateQuizSet: async (id, updates) => {
    const quizSet = get().quizSets.find(qs => qs.id === id);
    if (!quizSet) throw new Error('Quiz set not found');

    const updatedQuizSet: QuizSet = {
      ...quizSet,
      ...updates,
      updatedAt: new Date(),
    };

    await db.saveQuizSet(updatedQuizSet);
    set(state => ({
      quizSets: state.quizSets.map(qs => (qs.id === id ? updatedQuizSet : qs)),
    }));
  },

  deleteQuizSet: async (id) => {
    await db.deleteQuizSet(id);
    set(state => ({
      quizSets: state.quizSets.filter(qs => qs.id !== id),
      selectedQuizSetId: state.selectedQuizSetId === id ? null : state.selectedQuizSetId,
    }));
  },

  deleteQuizSets: async (ids) => {
    for (const id of ids) {
      await db.deleteQuizSet(id);
    }
    set(state => ({
      quizSets: state.quizSets.filter(qs => !ids.includes(qs.id)),
      selectedQuizSetId: state.selectedQuizSetId && ids.includes(state.selectedQuizSetId) ? null : state.selectedQuizSetId,
    }));
  },

  moveQuizSets: async (ids, folderId) => {
    const currentSets = get().quizSets;
    const updatedSets = [...currentSets];
    for (const id of ids) {
      const idx = updatedSets.findIndex(qs => qs.id === id);
      if (idx !== -1) {
        updatedSets[idx] = { ...updatedSets[idx], folderId, updatedAt: new Date() };
        await db.saveQuizSet(updatedSets[idx]);
      }
    }
    set({ quizSets: updatedSets });
  },

  selectQuizSet: (id) => {
    set({ selectedQuizSetId: id });
  },

  // Folder Actions
  loadFolders: async () => {
    try {
      const quizFolders = await db.getAllQuizFolders();
      set({ quizFolders });
    } catch (error) {
      console.error('[QuizStore] loadFolders error:', error);
    }
  },

  addFolder: async (name) => {
    const newFolder: QuizFolder = {
      id: uuidv4(),
      name,
      createdAt: new Date(),
    };
    await db.saveQuizFolder(newFolder);
    set(state => ({
      quizFolders: [newFolder, ...state.quizFolders],
    }));
    return newFolder;
  },

  renameFolder: async (id, name) => {
    const folder = get().quizFolders.find(f => f.id === id);
    if (!folder) throw new Error('Folder not found');
    const updated = { ...folder, name };
    await db.saveQuizFolder(updated);
    set(state => ({
      quizFolders: state.quizFolders.map(f => f.id === id ? updated : f),
    }));
  },

  deleteFolder: async (id) => {
    await db.deleteQuizFolder(id);
    // Refresh quiz sets since their folderId may have changed
    const quizSets = await db.getAllQuizSets();
    set(state => ({
      quizFolders: state.quizFolders.filter(f => f.id !== id),
      quizSets,
    }));
  },

  // Render Job Actions
  loadRenderJobs: async () => {
    try {
      const renderJobs = await db.getAllRenderJobs();
      set({ renderJobs });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createRenderJob: async (quizSetId) => {
    const quizSet = get().quizSets.find(qs => qs.id === quizSetId);
    if (!quizSet) throw new Error('Quiz set not found');

    const newJob: RenderJob = {
      id: uuidv4(),
      quizSetId,
      quizSetName: quizSet.name,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
    };

    await db.saveRenderJob(newJob);
    set(state => ({
      renderJobs: [newJob, ...state.renderJobs],
    }));

    return newJob;
  },

  updateRenderJob: async (id, updates) => {
    const job = get().renderJobs.find(j => j.id === id);
    if (!job) throw new Error('Render job not found');

    const updatedJob: RenderJob = {
      ...job,
      ...updates,
    };

    await db.saveRenderJob(updatedJob);
    set(state => ({
      renderJobs: state.renderJobs.map(j => (j.id === id ? updatedJob : j)),
    }));
  },

  deleteRenderJob: async (id) => {
    await db.deleteRenderJob(id);
    set(state => ({
      renderJobs: state.renderJobs.filter(j => j.id !== id),
    }));
  },

  // Utility
  getQuizSetById: (id) => {
    return get().quizSets.find(qs => qs.id === id);
  },

  clearError: () => {
    set({ error: null });
  },
}));
