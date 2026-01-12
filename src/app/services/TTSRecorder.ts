import { v4 as uuidv4 } from 'uuid';
import type { TTSAudioData, QuizItem } from '../types/quiz';
import * as db from './QuizDatabase';

export interface RecordingProgress {
  current: number;
  total: number;
  currentText: string;
  status: 'idle' | 'recording' | 'completed' | 'error';
  error?: string;
}

export type ProgressCallback = (progress: RecordingProgress) => void;

/**
 * TTS Recorder Service
 *
 * Note: Browser Web Speech API cannot be directly recorded.
 * This implementation uses a workaround by capturing system audio,
 * which requires user permission and may not work in all browsers.
 *
 * For production use, consider:
 * 1. Cloud TTS services (Azure, Google, Naver Clova)
 * 2. Local TTS engines (espeak-ng, Piper TTS)
 */
export class TTSRecorderService {
  private isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  // Check if TTS is supported
  static isSupported(): boolean {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  // Get available voices (preferring Korean)
  static getKoreanVoices(): SpeechSynthesisVoice[] {
    const voices = speechSynthesis.getVoices();
    return voices.filter(voice => voice.lang.startsWith('ko'));
  }

  // Speak text and return duration
  async speakAndGetDuration(text: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!TTSRecorderService.isSupported()) {
        reject(new Error('TTS not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Use Korean voice if available
      const koreanVoices = TTSRecorderService.getKoreanVoices();
      if (koreanVoices.length > 0) {
        utterance.voice = koreanVoices[0];
      }

      const startTime = Date.now();

      utterance.onend = () => {
        const duration = Date.now() - startTime;
        resolve(duration);
      };

      utterance.onerror = (event) => {
        reject(new Error(`TTS error: ${event.error}`));
      };

      speechSynthesis.cancel(); // Cancel any ongoing speech
      speechSynthesis.speak(utterance);
    });
  }

  // Record all TTS for a quiz set
  async recordQuizSetTTS(
    quizSetId: string,
    items: QuizItem[],
    onProgress?: ProgressCallback
  ): Promise<TTSAudioData[]> {
    const results: TTSAudioData[] = [];
    const total = items.length * 2; // question + explanation for each
    let current = 0;

    for (const item of items) {
      // Record question TTS
      const questionText = item.questionTTS || item.question;
      onProgress?.({
        current,
        total,
        currentText: `문제: ${questionText.substring(0, 30)}...`,
        status: 'recording',
      });

      try {
        const questionDuration = await this.speakAndGetDuration(questionText);
        const questionAudio: TTSAudioData = {
          id: uuidv4(),
          quizItemId: `${quizSetId}_${item.id}`,
          type: 'question',
          audioBlob: new Blob(), // Placeholder - actual recording requires system audio capture
          durationMs: questionDuration,
          createdAt: new Date(),
        };
        await db.saveTTSAudio(questionAudio);
        results.push(questionAudio);
      } catch (error) {
        onProgress?.({
          current,
          total,
          currentText: questionText,
          status: 'error',
          error: (error as Error).message,
        });
        throw error;
      }

      current++;

      // Record explanation TTS
      const explanationText = item.explanationTTS || item.explanation;
      onProgress?.({
        current,
        total,
        currentText: `해설: ${explanationText.substring(0, 30)}...`,
        status: 'recording',
      });

      try {
        const explanationDuration = await this.speakAndGetDuration(explanationText);
        const explanationAudio: TTSAudioData = {
          id: uuidv4(),
          quizItemId: `${quizSetId}_${item.id}`,
          type: 'explanation',
          audioBlob: new Blob(),
          durationMs: explanationDuration,
          createdAt: new Date(),
        };
        await db.saveTTSAudio(explanationAudio);
        results.push(explanationAudio);
      } catch (error) {
        onProgress?.({
          current,
          total,
          currentText: explanationText,
          status: 'error',
          error: (error as Error).message,
        });
        throw error;
      }

      current++;
    }

    onProgress?.({
      current: total,
      total,
      currentText: '완료',
      status: 'completed',
    });

    return results;
  }

  // Calculate total timeline for video
  calculateTimeline(items: QuizItem[], ttsData: TTSAudioData[]): number {
    const INTRO_DURATION = 3000;
    const TIMER_DURATION = 5000;
    const ANSWER_REVEAL_DURATION = 1000;
    const TTS_DELAY = 1000;
    const TRANSITION_DURATION = 500;

    let totalDuration = INTRO_DURATION;

    for (const item of items) {
      const questionTTS = ttsData.find(
        t => t.quizItemId.includes(item.id) && t.type === 'question'
      );
      const explanationTTS = ttsData.find(
        t => t.quizItemId.includes(item.id) && t.type === 'explanation'
      );

      // Per question timeline
      totalDuration += TTS_DELAY; // Wait before question TTS
      totalDuration += questionTTS?.durationMs || 2000; // Question TTS
      totalDuration += TIMER_DURATION; // 5 second timer
      totalDuration += ANSWER_REVEAL_DURATION; // Answer reveal
      totalDuration += TTS_DELAY; // Wait before explanation TTS
      totalDuration += explanationTTS?.durationMs || 3000; // Explanation TTS
      totalDuration += TRANSITION_DURATION; // Transition to next
    }

    return totalDuration;
  }
}

export const ttsRecorder = new TTSRecorderService();
