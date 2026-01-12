import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import PQueue from 'p-queue';
import { PuppeteerRenderer, type RenderSettings, type QuizData } from './PuppeteerRenderer.js';
import { FFmpegAssembler } from './FFmpegAssembler.js';
import { TTSService, type AudioTimeline } from './TTSService.js';
import { SoundEffectsGenerator, type SoundEffects, generateTimerAudio } from './SoundEffects.js';

export interface RenderJobInput {
  quizSetId: string;
  quizData: QuizData;
  settings: RenderSettings;
}

export interface RenderJobStatus {
  id: string;
  quizSetId: string;
  status: 'pending' | 'recording_tts' | 'rendering' | 'encoding' | 'completed' | 'failed';
  progress: number;
  currentStep?: string;
  outputPath?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export class RenderQueueProcessor {
  private queue: PQueue;
  private jobs: Map<string, RenderJobStatus> = new Map();
  private io: SocketIOServer;
  private renderer: PuppeteerRenderer;
  private assembler: FFmpegAssembler;
  private ttsService: TTSService;
  private soundEffectsGenerator: SoundEffectsGenerator;
  private outputDir: string;
  private soundEffectsDir: string;
  private soundEffects: SoundEffects | null = null;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.queue = new PQueue({ concurrency: 1 }); // Process one job at a time
    this.renderer = new PuppeteerRenderer();
    this.assembler = new FFmpegAssembler();
    this.ttsService = new TTSService();
    this.outputDir = path.join(os.homedir(), 'QuizVideoOutput');
    this.soundEffectsDir = path.join(this.outputDir, 'sound_effects');
    this.soundEffectsGenerator = new SoundEffectsGenerator(this.soundEffectsDir);

    fs.ensureDirSync(this.outputDir);
  }

  async initialize(): Promise<void> {
    // Initialize TTS service
    await this.ttsService.initialize();

    // Generate sound effects (cached)
    this.soundEffects = await this.soundEffectsGenerator.generateAll();

    console.log('RenderQueueProcessor initialized with TTS and sound effects');
  }

  async addJob(input: RenderJobInput): Promise<string> {
    const jobId = uuidv4();

    const job: RenderJobStatus = {
      id: jobId,
      quizSetId: input.quizSetId,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);
    this.emitJobUpdate(job);

    // Add to queue
    this.queue.add(async () => {
      await this.processJob(jobId, input);
    });

    return jobId;
  }

  getJobStatus(jobId: string): RenderJobStatus | undefined {
    return this.jobs.get(jobId);
  }

  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return false;
    }

    job.status = 'failed';
    job.error = 'Cancelled by user';
    this.emitJobUpdate(job);
    return true;
  }

  private async processJob(jobId: string, input: RenderJobInput): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const tempDir = path.join(os.tmpdir(), `quiz-render-${jobId}`);
    const audioDir = path.join(tempDir, 'audio');

    try {
      await fs.ensureDir(tempDir);
      await fs.ensureDir(audioDir);

      // Get first quiz item
      const quizItem = input.quizData.items[0];
      if (!quizItem) {
        throw new Error('No quiz items found');
      }

      // Phase 1: Generate TTS audio (10%)
      job.status = 'recording_tts';
      job.startedAt = new Date();
      job.currentStep = 'TTS 오디오 생성 중...';
      job.progress = 0;
      this.emitJobUpdate(job);

      const questionText = quizItem.questionTTS || quizItem.question;
      const explanationText = quizItem.explanationTTS || quizItem.explanation;

      const audioTimeline = await this.ttsService.generateQuizAudio(
        questionText,
        explanationText,
        audioDir
      );

      job.progress = 10;
      this.emitJobUpdate(job);

      // Phase 2: Create full audio track (15%)
      job.currentStep = '오디오 트랙 생성 중...';
      this.emitJobUpdate(job);

      const audioEvents: Array<{ audioPath: string; startMs: number; volume?: number }> = [];

      // Add question TTS (boosted to compensate for amix normalization)
      const questionTTSEvent = audioTimeline.timeline.find(e => e.type === 'question_tts');
      if (questionTTSEvent && questionTTSEvent.audioPath) {
        audioEvents.push({
          audioPath: questionTTSEvent.audioPath,
          startMs: questionTTSEvent.startMs,
          volume: 6.0,  // Boost to compensate for 9-input amix
        });
      }

      // Add timer tick-tock sounds (heavily boosted - 2x previous)
      const timerEvent = audioTimeline.timeline.find(e => e.type === 'timer');
      if (timerEvent && this.soundEffects) {
        const timerDurationSec = (timerEvent.endMs - timerEvent.startMs) / 1000;
        for (let i = 0; i < timerDurationSec; i++) {
          const isEven = i % 2 === 0;
          audioEvents.push({
            audioPath: isEven ? this.soundEffects.tick : this.soundEffects.tock,
            startMs: timerEvent.startMs + (i * 1000),
            volume: 36.0,  // 2x previous (18 * 2)
          });
        }
      }

      // Add time up sound (heavily boosted - 2x previous)
      const answerRevealEvent = audioTimeline.timeline.find(e => e.type === 'answer_reveal');
      if (answerRevealEvent && this.soundEffects) {
        audioEvents.push({
          audioPath: this.soundEffects.timeUp,
          startMs: answerRevealEvent.startMs,
          volume: 30.0,  // 2x previous (15 * 2)
        });
      }

      // Add explanation TTS (boosted to compensate for amix normalization)
      const explanationTTSEvent = audioTimeline.timeline.find(e => e.type === 'explanation_tts');
      if (explanationTTSEvent && explanationTTSEvent.audioPath) {
        audioEvents.push({
          audioPath: explanationTTSEvent.audioPath,
          startMs: explanationTTSEvent.startMs,
          volume: 6.0,  // Boost to compensate for 9-input amix
        });
      }

      const finalAudioPath = path.join(audioDir, 'final_audio.m4a');
      await this.assembler.createAudioTimeline(
        audioEvents,
        audioTimeline.totalDurationMs,
        finalAudioPath
      );

      job.progress = 15;
      this.emitJobUpdate(job);

      // Phase 3: Initialize renderer and record video in real-time (15% - 85%)
      job.status = 'rendering';
      job.currentStep = '렌더러 초기화 중...';
      this.emitJobUpdate(job);

      await this.renderer.initialize(input.settings.width, input.settings.height);

      job.currentStep = '프레임 캡처 중...';
      this.emitJobUpdate(job);

      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const framesDir = path.join(tempDir, 'frames');

      // Capture frames with optimized method
      const captureResult = await this.renderer.recordVideoOptimized(
        appUrl,
        input.quizData,
        input.settings,
        audioTimeline,
        framesDir,
        (progress) => {
          job.progress = 15 + Math.round(progress.percentage * 0.55); // 15-70%
          job.currentStep = `프레임 캡처 중: ${progress.current}/${progress.total}`;
          this.emitJobUpdate(job);
        }
      );

      // Phase 4: Encode video with audio (70% - 100%)
      job.status = 'encoding';
      job.currentStep = '비디오 인코딩 중...';
      this.emitJobUpdate(job);

      const outputFileName = `${input.quizData.name.replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, outputFileName);

      // Assemble frames with audio
      await this.assembler.assembleVideo(
        {
          framesDir: captureResult.framesDir,
          framePattern: 'frame_%06d.jpg',
          fps: input.settings.fps,
          width: input.settings.width,
          height: input.settings.height,
          outputPath,
          audioPath: finalAudioPath,
        },
        (progress) => {
          job.progress = 70 + Math.round(progress.percentage * 0.30); // 70-100%
          job.currentStep = `비디오 인코딩 중: ${Math.round(progress.percentage)}%`;
          this.emitJobUpdate(job);
        }
      );

      // Cleanup temp directory
      await fs.remove(tempDir);

      // Success
      job.status = 'completed';
      job.progress = 100;
      job.outputPath = outputPath;
      job.completedAt = new Date();
      job.currentStep = '완료';
      this.emitJobUpdate(job);

    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      job.currentStep = '오류 발생';
      this.emitJobUpdate(job);
      console.error(`Job ${jobId} failed:`, error);

      // Cleanup on error
      try {
        await fs.remove(tempDir);
      } catch {}
    } finally {
      await this.renderer.close();
    }
  }

  private emitJobUpdate(job: RenderJobStatus): void {
    this.io.to(`job:${job.id}`).emit('job:update', job);
    this.io.emit('jobs:update', Array.from(this.jobs.values()));
  }
}
