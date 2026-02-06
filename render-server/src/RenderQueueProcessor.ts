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

    // NEW: Initialize browser here for reuse across jobs
    await this.renderer.initialize();

    // Log GPU encoder availability
    const gpuAvailable = FFmpegAssembler.isGpuAvailable();
    console.log(`GPU encoding: ${gpuAvailable ? 'ENABLED (NVENC)' : 'DISABLED (CPU fallback)'}`);

    console.log('RenderQueueProcessor initialized with TTS, sound effects, and browser');
  }

  // NEW: Shutdown method
  async shutdown(): Promise<void> {
    await this.renderer.close();
    console.log('RenderQueueProcessor shut down');
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

      // 다중 해설 지원: explanations 배열이 있으면 사용, 없으면 단일 해설 사용
      let firstExplanationText: string;
      let additionalExplanations: Array<{ content: string; tts?: string }> | undefined;

      if (quizItem.explanations && quizItem.explanations.length > 0) {
        // 다중 해설 모드
        const firstExp = quizItem.explanations[0];
        firstExplanationText = firstExp.tts || firstExp.content;
        if (quizItem.explanations.length > 1) {
          additionalExplanations = quizItem.explanations.slice(1);
        }
      } else {
        // 단일 해설 모드 (하위 호환성)
        firstExplanationText = quizItem.explanationTTS || quizItem.explanation;
      }

      const audioTimeline = await this.ttsService.generateQuizAudio(
        questionText,
        firstExplanationText,
        audioDir,
        additionalExplanations
      );

      job.progress = 10;
      this.emitJobUpdate(job);

      // Phase 2+3: Audio mixing AND Frame capture IN PARALLEL
      job.status = 'rendering';
      job.currentStep = '오디오 믹싱 + 멀티워커 프레임 캡처 병렬 처리 중...';
      this.emitJobUpdate(job);

      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const framesDir = path.join(tempDir, 'frames');

      // Build audio events (same logic as before)
      const audioEvents: Array<{ audioPath: string; startMs: number; volume?: number }> = [];

      const questionTTSEvent = audioTimeline.timeline.find(e => e.type === 'question_tts');
      if (questionTTSEvent && questionTTSEvent.audioPath) {
        audioEvents.push({
          audioPath: questionTTSEvent.audioPath,
          startMs: questionTTSEvent.startMs,
          volume: 4.2,
        });
      }

      const timerEvent = audioTimeline.timeline.find(e => e.type === 'timer');
      if (timerEvent && this.soundEffects) {
        const timerDurationSec = (timerEvent.endMs - timerEvent.startMs) / 1000;
        for (let i = 0; i < timerDurationSec; i++) {
          const isEven = i % 2 === 0;
          audioEvents.push({
            audioPath: isEven ? this.soundEffects.tick : this.soundEffects.tock,
            startMs: timerEvent.startMs + (i * 1000),
            volume: 36.0,
          });
        }
      }

      const answerRevealEvent = audioTimeline.timeline.find(e => e.type === 'answer_reveal');
      if (answerRevealEvent && this.soundEffects) {
        audioEvents.push({
          audioPath: this.soundEffects.timeUp,
          startMs: answerRevealEvent.startMs,
          volume: 30.0,
        });
      }

      // 모든 해설 TTS 이벤트 추가 (다중 해설 지원)
      const explanationTTSEvents = audioTimeline.timeline.filter(e => e.type === 'explanation_tts');
      for (const expEvent of explanationTTSEvents) {
        if (expEvent.audioPath) {
          audioEvents.push({
            audioPath: expEvent.audioPath,
            startMs: expEvent.startMs,
            volume: 4.2,
          });
        }
      }

      const finalAudioPath = path.join(audioDir, 'final_audio.m4a');

      // RUN IN PARALLEL: audio mixing + frame capture (with browser crash recovery)
      // Store promise and suppress unhandled rejection warning
      let audioMixError: Error | undefined;
      const audioMixingPromise = this.assembler.createAudioTimeline(
        audioEvents,
        audioTimeline.totalDurationMs,
        finalAudioPath
      ).catch((err: Error) => {
        audioMixError = err;
      });

      let captureResult;
      try {
        captureResult = await this.renderer.captureSmartKeyframesParallel(
          appUrl,
          input.quizData,
          input.settings,
          audioTimeline,
          framesDir,
          (progress) => {
            job.progress = 15 + Math.round(progress.percentage * 0.55);
            job.currentStep = `프레임 캡처 중: ${progress.current}/${progress.total}`;
            this.emitJobUpdate(job);
          },
          3
        );
      } catch (captureError) {
        // Browser may have crashed - try to recover
        console.warn('Frame capture failed, attempting browser recovery...', (captureError as Error).message);
        try {
          await this.renderer.close();
        } catch {}
        await this.renderer.initialize();
        // Retry once
        captureResult = await this.renderer.captureSmartKeyframesParallel(
          appUrl,
          input.quizData,
          input.settings,
          audioTimeline,
          framesDir,
          (progress) => {
            job.progress = 15 + Math.round(progress.percentage * 0.55);
            job.currentStep = `프레임 캡처 중 (재시도): ${progress.current}/${progress.total}`;
            this.emitJobUpdate(job);
          },
          3
        );
      }

      // Wait for audio mixing and check for errors
      await audioMixingPromise;
      if (audioMixError) {
        throw new Error(`Audio mixing failed: ${audioMixError.message}`);
      }

      job.progress = 70;
      this.emitJobUpdate(job);

      // Phase 4: Encode video with segments + audio (70-100%)
      job.status = 'encoding';
      job.currentStep = '비디오 인코딩 중 (GPU 가속 + 4K 업스케일)...';
      this.emitJobUpdate(job);

      const outputFileName = `${input.quizData.name.replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, outputFileName);

      await this.assembler.assembleFromSegments(
        captureResult.segments,
        {
          fps: input.settings.fps,
          captureWidth: captureResult.captureWidth,
          captureHeight: captureResult.captureHeight,
          outputWidth: input.settings.width,
          outputHeight: input.settings.height,
          outputPath,
          audioPath: finalAudioPath,
        },
        (progress) => {
          job.progress = 70 + Math.round(progress.percentage * 0.30);
          job.currentStep = `비디오 인코딩 중: ${Math.round(progress.percentage)}%`;
          this.emitJobUpdate(job);
        }
      );

      // Cleanup
      await fs.remove(tempDir);

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

      try {
        await fs.remove(tempDir);
      } catch {}
    }
    // NOTE: Do NOT close the browser here - it's reused across jobs
  }

  private emitJobUpdate(job: RenderJobStatus): void {
    this.io.to(`job:${job.id}`).emit('job:update', job);
    this.io.emit('jobs:update', Array.from(this.jobs.values()));
  }
}
