import { io, Socket } from 'socket.io-client';
import type { QuizSet, RenderJob } from '../types/quiz';

const RENDER_SERVER_URL = 'http://localhost:3001';

export interface RenderJobUpdate {
  id: string;
  quizSetId: string;
  status: 'pending' | 'recording_tts' | 'rendering' | 'encoding' | 'completed' | 'failed';
  progress: number;
  currentStep?: string;
  outputPath?: string;
  error?: string;
}

type JobUpdateCallback = (job: RenderJobUpdate) => void;

class RenderClient {
  private socket: Socket | null = null;
  private callbacks: Map<string, JobUpdateCallback> = new Map();
  private globalCallback: ((jobs: RenderJobUpdate[]) => void) | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(RENDER_SERVER_URL, {
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('Connected to render server');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Render server connection error:', error);
        reject(error);
      });

      this.socket.on('job:update', (job: RenderJobUpdate) => {
        const callback = this.callbacks.get(job.id);
        if (callback) {
          callback(job);
        }
      });

      this.socket.on('jobs:update', (jobs: RenderJobUpdate[]) => {
        if (this.globalCallback) {
          this.globalCallback(jobs);
        }
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${RENDER_SERVER_URL}/api/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async startRender(quizSet: QuizSet, options?: { testDurationMs?: number }): Promise<string> {
    const response = await fetch(`${RENDER_SERVER_URL}/api/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quizSetId: quizSet.id,
        quizData: {
          id: quizSet.id,
          name: quizSet.name,
          items: quizSet.items,
        },
        settings: {
          width: 3840,
          height: 2160,
          fps: 25,
          testDurationMs: options?.testDurationMs,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start render');
    }

    const { jobId } = await response.json();

    // Subscribe to job updates
    if (this.socket) {
      this.socket.emit('subscribe', jobId);
    }

    return jobId;
  }

  // Shortcut for 1-second test render
  async startTestRender(quizSet: QuizSet): Promise<string> {
    return this.startRender(quizSet, { testDurationMs: 1000 });
  }

  async getJobStatus(jobId: string): Promise<RenderJobUpdate | null> {
    try {
      const response = await fetch(`${RENDER_SERVER_URL}/api/render/${jobId}`);
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const response = await fetch(`${RENDER_SERVER_URL}/api/render/${jobId}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  subscribeToJob(jobId: string, callback: JobUpdateCallback): void {
    this.callbacks.set(jobId, callback);
    if (this.socket) {
      this.socket.emit('subscribe', jobId);
    }
  }

  unsubscribeFromJob(jobId: string): void {
    this.callbacks.delete(jobId);
    if (this.socket) {
      this.socket.emit('unsubscribe', jobId);
    }
  }

  onJobsUpdate(callback: (jobs: RenderJobUpdate[]) => void): void {
    this.globalCallback = callback;
  }
}

export const renderClient = new RenderClient();
