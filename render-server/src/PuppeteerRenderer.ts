import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs-extra';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { AudioTimeline, TimelineEvent } from './TTSService.js';

// Add ffmpeg to PATH for Puppeteer screencast
const ffmpegDir = path.dirname(ffmpegInstaller.path);
process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;

// ── Existing interfaces (kept for backward compatibility) ──

export interface RenderSettings {
  width: number;
  height: number;
  fps: number;
  outputFormat: 'mp4' | 'webm';
  testDurationMs?: number;  // Optional: limit render duration for testing
}

export interface QuizData {
  id: string;
  name: string;
  items: Array<{
    id: string;
    question: string;
    questionTTS?: string;
    answer: boolean;
    explanation: string;
    explanationTTS?: string;
    explanations?: Array<{ content: string; tts?: string }>;
    singleLineQuestion?: boolean;
  }>;
}

export type ProgressCallback = (progress: {
  phase: string;
  current: number;
  total: number;
  percentage: number;
}) => void;

// ── New interfaces for smart keyframe capture ──

export interface CaptureSegment {
  type: 'static' | 'animated';
  startMs: number;
  endMs: number;
  durationMs: number;
  // For static: single frame path
  framePath?: string;
  // For animated: directory of frames and count
  framesDir?: string;
  frameCount?: number;
  framePattern?: string; // e.g. 'frame_%06d.jpg'
}

export interface SmartCaptureResult {
  segments: CaptureSegment[];
  totalDurationMs: number;
  captureWidth: number;
  captureHeight: number;
}

// ── Phase classification ──

const STATIC_PHASES: Set<TimelineEvent['type']> = new Set([
  'intro',
  'question_tts',
  'answer_reveal',
  'explanation_tts',
]);

const ANIMATED_PHASES: Set<TimelineEvent['type']> = new Set([
  'timer',
]);

// ── Multi-worker parallel capture helpers ──

const DEFAULT_WORKER_COUNT = 3; // 3 parallel browsers for animated capture

interface WorkerBrowser {
  browser: Browser;
  page: Page;
}

async function createWorker(captureWidth: number, captureHeight: number): Promise<WorkerBrowser> {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-gpu-rasterization',
      `--window-size=${captureWidth},${captureHeight}`,
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: captureWidth,
    height: captureHeight,
    deviceScaleFactor: 1,
  });

  return { browser, page };
}

async function closeWorker(worker: WorkerBrowser): Promise<void> {
  try { await worker.page.close(); } catch { /* ignore */ }
  try { await worker.browser.close(); } catch { /* ignore */ }
}

async function captureFrameRange(
  worker: WorkerBrowser,
  startFrame: number,
  endFrame: number, // exclusive
  segStartMs: number,
  frameIntervalMs: number,
  framesDir: string,
): Promise<number> {
  let captured = 0;
  for (let f = startFrame; f < endFrame; f++) {
    const currentTimeMs = segStartMs + f * frameIntervalMs;

    await worker.page.evaluate((time) => {
      window.__SET_TIME__(time);
    }, currentTimeMs);

    await new Promise(resolve => setTimeout(resolve, 5));

    const frameNumber = String(f).padStart(6, '0');
    const framePath = path.join(framesDir, `frame_${frameNumber}.jpg`);

    await worker.page.screenshot({
      path: framePath,
      type: 'jpeg',
      quality: 85,
      fullPage: false,
    });

    captured++;
  }
  return captured;
}

// ── Renderer ──

export class PuppeteerRenderer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private captureWidth: number = 1920;
  private captureHeight: number = 1080;
  private outputWidth: number = 3840;
  private outputHeight: number = 2160;

  /**
   * Initialize the browser with capture resolution.
   * Captures at half the output resolution for speed (1920x1080 by default).
   * The actual output resolution (3840x2160) is handled by FFmpeg upscaling.
   */
  async initialize(outputWidth: number = 3840, outputHeight: number = 2160): Promise<void> {
    // Capture at half resolution for speed
    const captureWidth = Math.ceil(outputWidth / 2);   // 1920
    const captureHeight = Math.ceil(outputHeight / 2);  // 1080

    this.outputWidth = outputWidth;
    this.outputHeight = outputHeight;
    this.captureWidth = captureWidth;
    this.captureHeight = captureHeight;

    console.log(`Launching Puppeteer browser (capture: ${captureWidth}x${captureHeight}, output: ${outputWidth}x${outputHeight})...`);

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--autoplay-policy=no-user-gesture-required',
        '--enable-gpu-rasterization',
        '--enable-accelerated-video-decode',
        `--window-size=${captureWidth},${captureHeight}`,
      ],
    });

    this.page = await this.browser.newPage();

    await this.page.setViewport({
      width: captureWidth,
      height: captureHeight,
      deviceScaleFactor: 1,
    });

    console.log(`Browser initialized with viewport ${captureWidth}x${captureHeight}`);
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log('Browser closed');
  }

  // ── New primary method: Smart Keyframe Capture ──

  /**
   * Captures frames intelligently based on timeline phases.
   *
   * Static phases (intro, question_tts, answer_reveal, explanation_tts) get a single screenshot.
   * Animated phases (timer) get frame-by-frame capture at the configured fps.
   * Gaps between phases are treated as static, holding the last frame of the previous phase.
   */
  async captureSmartKeyframes(
    appUrl: string,
    quizData: QuizData,
    settings: RenderSettings,
    audioTimeline: AudioTimeline,
    outputDir: string,
    onProgress?: ProgressCallback
  ): Promise<SmartCaptureResult> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    await fs.ensureDir(outputDir);

    const quizItem = quizData.items[0];
    if (!quizItem) {
      throw new Error('No quiz items found');
    }

    const totalDurationMs = audioTimeline.totalDurationMs;

    // Build render URL with quiz data AND timeline info
    const quizDataParam = encodeURIComponent(JSON.stringify({
      question: quizItem.question,
      questionTTS: quizItem.questionTTS || quizItem.question,
      answer: quizItem.answer,
      explanation: quizItem.explanation,
      explanationTTS: quizItem.explanationTTS || quizItem.explanation,
      explanations: quizItem.explanations,
      singleLineQuestion: quizItem.singleLineQuestion,
      timeline: audioTimeline.timeline.map(event => ({
        type: event.type,
        startMs: event.startMs,
        endMs: event.endMs,
        explanationIndex: event.explanationIndex,
      })),
    }));

    const renderUrl = `${appUrl}/render-player?data=${quizDataParam}`;
    console.log('Navigating to render-player...');

    await this.page.goto(renderUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Wait for React to be ready
    await this.page.waitForFunction(() => window.__RENDER_READY__ === true, { timeout: 10000 });
    console.log('RenderPlayer is ready');

    // ── Build segment plan from timeline events + gaps ──
    const timelineEvents = audioTimeline.timeline;
    const segmentPlan: Array<{
      type: 'static' | 'animated';
      startMs: number;
      endMs: number;
      label: string;
    }> = [];

    let lastEndMs = 0;

    for (let i = 0; i < timelineEvents.length; i++) {
      const event = timelineEvents[i];

      // Handle gap before this event (treat as static)
      if (event.startMs > lastEndMs) {
        segmentPlan.push({
          type: 'static',
          startMs: lastEndMs,
          endMs: event.startMs,
          label: `gap_before_${event.type}`,
        });
      }

      // The event itself
      const isAnimated = ANIMATED_PHASES.has(event.type);
      segmentPlan.push({
        type: isAnimated ? 'animated' : 'static',
        startMs: event.startMs,
        endMs: event.endMs,
        label: event.type,
      });

      lastEndMs = event.endMs;
    }

    // Handle trailing gap (after last event until totalDurationMs)
    if (lastEndMs < totalDurationMs) {
      segmentPlan.push({
        type: 'static',
        startMs: lastEndMs,
        endMs: totalDurationMs,
        label: 'trailing',
      });
    }

    // ── Count total work for progress reporting ──
    const frameIntervalMs = 1000 / settings.fps;
    let totalWork = 0;
    for (const seg of segmentPlan) {
      if (seg.type === 'static') {
        totalWork += 1;
      } else {
        totalWork += Math.ceil((seg.endMs - seg.startMs) / frameIntervalMs);
      }
    }

    let completedWork = 0;
    const startTime = Date.now();
    const segments: CaptureSegment[] = [];

    console.log(`Smart keyframe capture: ${segmentPlan.length} segments, ~${totalWork} captures (vs ${Math.ceil(totalDurationMs / frameIntervalMs)} brute-force frames)`);

    onProgress?.({
      phase: 'capturing',
      current: 0,
      total: totalWork,
      percentage: 0,
    });

    // ── Capture each segment ──
    for (let segIdx = 0; segIdx < segmentPlan.length; segIdx++) {
      const seg = segmentPlan[segIdx];
      const durationMs = seg.endMs - seg.startMs;

      // Skip zero-duration segments
      if (durationMs <= 0) {
        console.log(`Segment ${segIdx} [${seg.label}]: SKIPPED (zero duration)`);
        continue;
      }

      if (seg.type === 'static') {
        // ── Static: capture one frame at middle of phase ──
        const captureTimeMs = seg.startMs + durationMs / 2;
        const framePath = path.join(outputDir, `segment_${segIdx}_static.jpg`);

        await this.page.evaluate((time) => {
          window.__SET_TIME__(time);
        }, captureTimeMs);

        await new Promise(resolve => setTimeout(resolve, 8));

        await this.page.screenshot({
          path: framePath,
          type: 'jpeg',
          quality: 85,
          fullPage: false,
        });

        segments.push({
          type: 'static',
          startMs: seg.startMs,
          endMs: seg.endMs,
          durationMs,
          framePath,
        });

        completedWork += 1;

        console.log(`Segment ${segIdx} [${seg.label}]: STATIC ${durationMs}ms -> 1 frame`);

      } else {
        // ── Animated: capture frame by frame ──
        const framesDir = path.join(outputDir, `segment_${segIdx}_frames`);
        await fs.ensureDir(framesDir);

        const frameCount = Math.ceil(durationMs / frameIntervalMs);
        let captured = 0;

        for (let f = 0; f < frameCount; f++) {
          const currentTimeMs = seg.startMs + f * frameIntervalMs;

          await this.page.evaluate((time) => {
            window.__SET_TIME__(time);
          }, currentTimeMs);

          await new Promise(resolve => setTimeout(resolve, 5));

          const frameNumber = String(f).padStart(6, '0');
          const framePath = path.join(framesDir, `frame_${frameNumber}.jpg`);

          await this.page.screenshot({
            path: framePath,
            type: 'jpeg',
            quality: 85,
            fullPage: false,
          });

          captured++;
          completedWork++;

          // Report progress every 30 animated frames
          if (captured % 30 === 0) {
            const percentage = Math.round((completedWork / totalWork) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            const fps = completedWork / elapsed;
            onProgress?.({
              phase: 'capturing',
              current: completedWork,
              total: totalWork,
              percentage,
            });
            console.log(`  Animated frame ${captured}/${frameCount} (overall ${percentage}%) - ${fps.toFixed(1)} fps`);
          }
        }

        segments.push({
          type: 'animated',
          startMs: seg.startMs,
          endMs: seg.endMs,
          durationMs,
          framesDir,
          frameCount: captured,
          framePattern: 'frame_%06d.jpg',
        });

        console.log(`Segment ${segIdx} [${seg.label}]: ANIMATED ${durationMs}ms -> ${captured} frames`);
      }

      // Report overall progress after each segment
      const percentage = Math.round((completedWork / totalWork) * 100);
      onProgress?.({
        phase: 'capturing',
        current: completedWork,
        total: totalWork,
        percentage,
      });
    }

    const totalTime = (Date.now() - startTime) / 1000;
    const bruteForceFrames = Math.ceil(totalDurationMs / frameIntervalMs);
    const actualCaptures = completedWork;
    const savings = ((1 - actualCaptures / bruteForceFrames) * 100).toFixed(1);

    console.log(`Smart capture complete: ${actualCaptures} captures in ${totalTime.toFixed(1)}s (saved ${savings}% vs ${bruteForceFrames} brute-force frames)`);

    return {
      segments,
      totalDurationMs,
      captureWidth: this.captureWidth,
      captureHeight: this.captureHeight,
    };
  }

  // ── Multi-worker parallel capture for animated segments ──

  /**
   * Enhanced version of captureSmartKeyframes that uses multiple browser instances
   * to capture animated segments in parallel.
   *
   * Static segments remain single-threaded (1 frame each, very fast).
   * Animated segments (e.g. timer phase) are split across N worker browsers
   * for parallel frame capture.
   */
  async captureSmartKeyframesParallel(
    appUrl: string,
    quizData: QuizData,
    settings: RenderSettings,
    audioTimeline: AudioTimeline,
    outputDir: string,
    onProgress?: ProgressCallback,
    workerCount: number = DEFAULT_WORKER_COUNT,
  ): Promise<SmartCaptureResult> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    await fs.ensureDir(outputDir);

    const quizItem = quizData.items[0];
    if (!quizItem) {
      throw new Error('No quiz items found');
    }

    const totalDurationMs = audioTimeline.totalDurationMs;

    // Build render URL with quiz data AND timeline info
    const quizDataParam = encodeURIComponent(JSON.stringify({
      question: quizItem.question,
      questionTTS: quizItem.questionTTS || quizItem.question,
      answer: quizItem.answer,
      explanation: quizItem.explanation,
      explanationTTS: quizItem.explanationTTS || quizItem.explanation,
      explanations: quizItem.explanations,
      singleLineQuestion: quizItem.singleLineQuestion,
      timeline: audioTimeline.timeline.map(event => ({
        type: event.type,
        startMs: event.startMs,
        endMs: event.endMs,
        explanationIndex: event.explanationIndex,
      })),
    }));

    const renderUrl = `${appUrl}/render-player?data=${quizDataParam}`;
    console.log('Navigating to render-player (parallel mode)...');

    await this.page.goto(renderUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Wait for React to be ready
    await this.page.waitForFunction(() => window.__RENDER_READY__ === true, { timeout: 10000 });
    console.log('RenderPlayer is ready');

    // ── Build segment plan from timeline events + gaps ──
    const timelineEvents = audioTimeline.timeline;
    const segmentPlan: Array<{
      type: 'static' | 'animated';
      startMs: number;
      endMs: number;
      label: string;
    }> = [];

    let lastEndMs = 0;

    for (let i = 0; i < timelineEvents.length; i++) {
      const event = timelineEvents[i];

      // Handle gap before this event (treat as static)
      if (event.startMs > lastEndMs) {
        segmentPlan.push({
          type: 'static',
          startMs: lastEndMs,
          endMs: event.startMs,
          label: `gap_before_${event.type}`,
        });
      }

      // The event itself
      const isAnimated = ANIMATED_PHASES.has(event.type);
      segmentPlan.push({
        type: isAnimated ? 'animated' : 'static',
        startMs: event.startMs,
        endMs: event.endMs,
        label: event.type,
      });

      lastEndMs = event.endMs;
    }

    // Handle trailing gap (after last event until totalDurationMs)
    if (lastEndMs < totalDurationMs) {
      segmentPlan.push({
        type: 'static',
        startMs: lastEndMs,
        endMs: totalDurationMs,
        label: 'trailing',
      });
    }

    // ── Count total work for progress reporting ──
    const frameIntervalMs = 1000 / settings.fps;
    let totalWork = 0;
    for (const seg of segmentPlan) {
      if (seg.type === 'static') {
        totalWork += 1;
      } else {
        totalWork += Math.ceil((seg.endMs - seg.startMs) / frameIntervalMs);
      }
    }

    let completedWork = 0;
    const startTime = Date.now();
    const segments: CaptureSegment[] = [];

    // Check if any animated segments exist to decide on parallelization
    const hasAnimatedSegments = segmentPlan.some(s => s.type === 'animated');
    const effectiveWorkerCount = hasAnimatedSegments ? Math.max(1, workerCount) : 1;

    console.log(`Smart parallel capture: ${segmentPlan.length} segments, ~${totalWork} captures, ${effectiveWorkerCount} workers`);

    onProgress?.({
      phase: 'capturing',
      current: 0,
      total: totalWork,
      percentage: 0,
    });

    // ── Capture each segment ──
    for (let segIdx = 0; segIdx < segmentPlan.length; segIdx++) {
      const seg = segmentPlan[segIdx];
      const durationMs = seg.endMs - seg.startMs;

      // Skip zero-duration segments
      if (durationMs <= 0) {
        console.log(`Segment ${segIdx} [${seg.label}]: SKIPPED (zero duration)`);
        continue;
      }

      if (seg.type === 'static') {
        // ── Static: capture one frame at middle of phase (main browser) ──
        const captureTimeMs = seg.startMs + durationMs / 2;
        const framePath = path.join(outputDir, `segment_${segIdx}_static.jpg`);

        await this.page.evaluate((time) => {
          window.__SET_TIME__(time);
        }, captureTimeMs);

        await new Promise(resolve => setTimeout(resolve, 8));

        await this.page.screenshot({
          path: framePath,
          type: 'jpeg',
          quality: 85,
          fullPage: false,
        });

        segments.push({
          type: 'static',
          startMs: seg.startMs,
          endMs: seg.endMs,
          durationMs,
          framePath,
        });

        completedWork += 1;

        console.log(`Segment ${segIdx} [${seg.label}]: STATIC ${durationMs}ms -> 1 frame`);

      } else {
        // ── Animated: parallel frame capture with worker browsers ──
        const framesDir = path.join(outputDir, `segment_${segIdx}_frames`);
        await fs.ensureDir(framesDir);

        const frameCount = Math.ceil(durationMs / frameIntervalMs);

        // Decide whether parallelization is worthwhile
        const useParallel = effectiveWorkerCount > 1 && frameCount >= 30;

        if (!useParallel) {
          // Single-threaded fallback: use main browser
          console.log(`Segment ${segIdx} [${seg.label}]: ANIMATED ${durationMs}ms -> ${frameCount} frames (single-threaded, ${frameCount < 30 ? 'too few frames' : '1 worker'})`);

          let captured = 0;
          for (let f = 0; f < frameCount; f++) {
            const currentTimeMs = seg.startMs + f * frameIntervalMs;

            await this.page.evaluate((time) => {
              window.__SET_TIME__(time);
            }, currentTimeMs);

            await new Promise(resolve => setTimeout(resolve, 5));

            const frameNumber = String(f).padStart(6, '0');
            const framePath = path.join(framesDir, `frame_${frameNumber}.jpg`);

            await this.page.screenshot({
              path: framePath,
              type: 'jpeg',
              quality: 85,
              fullPage: false,
            });

            captured++;
            completedWork++;

            if (captured % 30 === 0) {
              const percentage = Math.round((completedWork / totalWork) * 100);
              onProgress?.({
                phase: 'capturing',
                current: completedWork,
                total: totalWork,
                percentage,
              });
            }
          }

          segments.push({
            type: 'animated',
            startMs: seg.startMs,
            endMs: seg.endMs,
            durationMs,
            framesDir,
            frameCount: captured,
            framePattern: 'frame_%06d.jpg',
          });

        } else {
          // Parallel capture with worker browsers
          console.log(`Segment ${segIdx} [${seg.label}]: ANIMATED ${durationMs}ms -> ${frameCount} frames (${effectiveWorkerCount} workers in parallel)`);

          // Calculate frame ranges for each worker
          const framesPerWorker = Math.ceil(frameCount / effectiveWorkerCount);
          const workerRanges: Array<{ startFrame: number; endFrame: number }> = [];

          for (let w = 0; w < effectiveWorkerCount; w++) {
            const startFrame = w * framesPerWorker;
            const endFrame = Math.min(startFrame + framesPerWorker, frameCount);
            if (startFrame < frameCount) {
              workerRanges.push({ startFrame, endFrame });
            }
          }

          // Worker browser management with guaranteed cleanup
          const workers: WorkerBrowser[] = [];
          try {
            // Launch worker browsers in parallel
            console.log(`  Launching ${workerRanges.length} worker browsers...`);
            workers.push(...await Promise.all(
              workerRanges.map(() => createWorker(this.captureWidth, this.captureHeight))
            ));

            // Navigate all workers to the render URL and wait for ready
            console.log(`  Navigating workers to render URL...`);
            await Promise.all(
              workers.map(async (worker) => {
                await worker.page.goto(renderUrl, {
                  waitUntil: 'networkidle0',
                  timeout: 30000,
                });
                await worker.page.waitForFunction(
                  () => window.__RENDER_READY__ === true,
                  { timeout: 10000 }
                );
              })
            );

            // Capture frames in parallel across all workers
            console.log(`  Starting parallel frame capture...`);
            const progressTracker = { captured: 0 };

            const capturePromises = workerRanges.map(async (range, workerIdx) => {
              const worker = workers[workerIdx];
              const captured = await captureFrameRange(
                worker,
                range.startFrame,
                range.endFrame,
                seg.startMs,
                frameIntervalMs,
                framesDir,
              );

              progressTracker.captured += captured;
              completedWork += captured;

              const percentage = Math.round((completedWork / totalWork) * 100);
              onProgress?.({
                phase: 'capturing',
                current: completedWork,
                total: totalWork,
                percentage,
              });

              console.log(`  Worker ${workerIdx}: captured frames ${range.startFrame}-${range.endFrame - 1} (${captured} frames)`);
              return captured;
            });

            const workerResults = await Promise.all(capturePromises);
            const totalCaptured = workerResults.reduce((sum, c) => sum + c, 0);

            segments.push({
              type: 'animated',
              startMs: seg.startMs,
              endMs: seg.endMs,
              durationMs,
              framesDir,
              frameCount: totalCaptured,
              framePattern: 'frame_%06d.jpg',
            });

            console.log(`Segment ${segIdx} [${seg.label}]: ANIMATED ${durationMs}ms -> ${totalCaptured} frames (parallel complete)`);
          } finally {
            // Always close all worker browsers, even on error
            console.log(`  Closing worker browsers...`);
            await Promise.all(workers.map(w => closeWorker(w)));
          }
        }
      }

      // Report overall progress after each segment
      const percentage = Math.round((completedWork / totalWork) * 100);
      onProgress?.({
        phase: 'capturing',
        current: completedWork,
        total: totalWork,
        percentage,
      });
    }

    const totalTime = (Date.now() - startTime) / 1000;
    const bruteForceFrames = Math.ceil(totalDurationMs / frameIntervalMs);
    const actualCaptures = completedWork;
    const savings = ((1 - actualCaptures / bruteForceFrames) * 100).toFixed(1);

    console.log(`Smart parallel capture complete: ${actualCaptures} captures in ${totalTime.toFixed(1)}s (saved ${savings}% vs ${bruteForceFrames} brute-force frames)`);

    return {
      segments,
      totalDurationMs,
      captureWidth: this.captureWidth,
      captureHeight: this.captureHeight,
    };
  }

  // ── Deprecated methods (kept for backward compatibility) ──

  /** @deprecated Use captureSmartKeyframes instead */
  async captureFramesWithTimeline(
    appUrl: string,
    quizData: QuizData,
    settings: RenderSettings,
    audioTimeline: AudioTimeline,
    outputDir: string,
    onProgress?: ProgressCallback
  ): Promise<{ framesDir: string; frameCount: number; totalDurationMs: number }> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    await fs.ensureDir(outputDir);

    const quizItem = quizData.items[0];
    if (!quizItem) {
      throw new Error('No quiz items found');
    }

    // Use testDurationMs if provided, otherwise use full duration
    const fullDurationMs = audioTimeline.totalDurationMs;
    const renderDurationMs = settings.testDurationMs || fullDurationMs;
    const frameIntervalMs = 1000 / settings.fps;
    const totalFrames = Math.ceil(renderDurationMs / frameIntervalMs);

    if (settings.testDurationMs) {
      console.log(`TEST MODE: Rendering only ${settings.testDurationMs}ms (${totalFrames} frames) instead of full ${fullDurationMs}ms`);
    }
    console.log(`Starting controlled frame capture: ${totalFrames} frames, ${renderDurationMs}ms duration, ${settings.fps}fps`);

    // Build render URL with quiz data AND timeline info
    const quizDataParam = encodeURIComponent(JSON.stringify({
      question: quizItem.question,
      questionTTS: quizItem.questionTTS || quizItem.question,
      answer: quizItem.answer,
      explanation: quizItem.explanation,
      explanationTTS: quizItem.explanationTTS || quizItem.explanation,
      explanations: quizItem.explanations,
      singleLineQuestion: quizItem.singleLineQuestion,
      timeline: audioTimeline.timeline.map(event => ({
        type: event.type,
        startMs: event.startMs,
        endMs: event.endMs,
        explanationIndex: event.explanationIndex,
      })),
    }));

    const renderUrl = `${appUrl}/render-player?data=${quizDataParam}`;
    console.log(`Navigating to render-player...`);

    await this.page.goto(renderUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for React to be ready
    await this.page.waitForFunction(() => window.__RENDER_READY__ === true, { timeout: 10000 });
    console.log('RenderPlayer is ready');

    let frameCount = 0;
    const startTime = Date.now();

    onProgress?.({
      phase: 'capturing',
      current: 0,
      total: totalFrames,
      percentage: 0,
    });

    console.log('Starting fast controlled frame capture...');

    // Capture frames by setting time directly - no waiting
    while (frameCount < totalFrames) {
      const currentTimeMs = frameCount * frameIntervalMs;

      // Set the time in the React component
      await this.page.evaluate((time) => {
        window.__SET_TIME__(time);
      }, currentTimeMs);

      // Minimal delay for React state update
      await new Promise(resolve => setTimeout(resolve, 8));

      const frameNumber = String(frameCount).padStart(6, '0');
      const framePath = path.join(outputDir, `frame_${frameNumber}.jpg`);

      try {
        // Use JPEG for much faster capture (10x smaller files than PNG)
        await this.page.screenshot({
          path: framePath,
          type: 'jpeg',
          quality: 85,
          fullPage: false,
        });
      } catch (error) {
        console.error(`Failed to capture frame ${frameCount}:`, error);
      }

      frameCount++;

      // Report progress every 60 frames
      if (frameCount % 60 === 0 || frameCount === totalFrames) {
        const percentage = Math.round((frameCount / totalFrames) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const fps = frameCount / elapsed;
        onProgress?.({
          phase: 'capturing',
          current: frameCount,
          total: totalFrames,
          percentage,
        });
        console.log(`Captured ${frameCount}/${totalFrames} frames (${percentage}%) - ${fps.toFixed(1)} fps`);
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`Frame capture complete: ${frameCount} frames in ${totalTime.toFixed(1)}s (${(frameCount / totalTime).toFixed(1)} fps)`);

    return {
      framesDir: outputDir,
      frameCount,
      totalDurationMs: renderDurationMs,
    };
  }

  /** @deprecated Use captureSmartKeyframes instead */
  async captureFramesFast(
    appUrl: string,
    quizData: QuizData,
    settings: RenderSettings,
    audioTimeline: AudioTimeline,
    outputDir: string,
    onProgress?: ProgressCallback
  ): Promise<{ framesDir: string; frameCount: number; totalDurationMs: number }> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    await fs.ensureDir(outputDir);

    const quizItem = quizData.items[0];
    if (!quizItem) {
      throw new Error('No quiz items found');
    }

    const totalDurationMs = audioTimeline.totalDurationMs;
    const frameIntervalMs = 1000 / settings.fps;
    const totalFrames = Math.ceil(totalDurationMs / frameIntervalMs);

    console.log(`Starting FAST frame capture: ${totalFrames} frames, ${totalDurationMs}ms duration`);

    const quizDataParam = encodeURIComponent(JSON.stringify({
      question: quizItem.question,
      questionTTS: quizItem.questionTTS || quizItem.question,
      answer: quizItem.answer,
      explanation: quizItem.explanation,
      explanationTTS: quizItem.explanationTTS || quizItem.explanation,
      explanations: quizItem.explanations,
      singleLineQuestion: quizItem.singleLineQuestion,
      timeline: audioTimeline.timeline.map(event => ({
        type: event.type,
        startMs: event.startMs,
        endMs: event.endMs,
        explanationIndex: event.explanationIndex,
      })),
    }));

    const renderUrl = `${appUrl}/render-player?data=${quizDataParam}`;
    await this.page.goto(renderUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await this.page.waitForFunction(() => window.__RENDER_READY__ === true, { timeout: 10000 });

    let frameCount = 0;
    const startTime = Date.now();
    const batchSize = 10; // Process in batches for progress updates

    while (frameCount < totalFrames) {
      const batchEnd = Math.min(frameCount + batchSize, totalFrames);

      for (let i = frameCount; i < batchEnd; i++) {
        const currentTimeMs = i * frameIntervalMs;

        await this.page.evaluate((time) => {
          window.__SET_TIME__(time);
        }, currentTimeMs);

        // Minimal delay for render
        await new Promise(resolve => setTimeout(resolve, 3));

        const frameNumber = String(i).padStart(6, '0');
        const framePath = path.join(outputDir, `frame_${frameNumber}.jpg`);

        await this.page.screenshot({
          path: framePath,
          type: 'jpeg',
          quality: 85,
          fullPage: false,
        });
      }

      frameCount = batchEnd;

      const percentage = Math.round((frameCount / totalFrames) * 100);
      onProgress?.({
        phase: 'capturing',
        current: frameCount,
        total: totalFrames,
        percentage,
      });
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`Fast capture complete: ${frameCount} frames in ${totalTime.toFixed(1)}s`);

    return {
      framesDir: outputDir,
      frameCount,
      totalDurationMs,
    };
  }

  async captureScreenshot(url: string, outputPath: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    await this.page.goto(url, { waitUntil: 'networkidle0' });
    await this.page.screenshot({ path: outputPath, fullPage: false });
    console.log(`Screenshot saved to: ${outputPath}`);
  }

  /** @deprecated Use captureSmartKeyframes instead */
  async recordVideoOptimized(
    appUrl: string,
    quizData: QuizData,
    settings: RenderSettings,
    audioTimeline: AudioTimeline,
    outputDir: string,
    onProgress?: ProgressCallback
  ): Promise<{ framesDir: string; frameCount: number; totalDurationMs: number }> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    await fs.ensureDir(outputDir);

    const quizItem = quizData.items[0];
    if (!quizItem) {
      throw new Error('No quiz items found');
    }

    const fullDurationMs = audioTimeline.totalDurationMs;
    const renderDurationMs = settings.testDurationMs || fullDurationMs;
    const frameIntervalMs = 1000 / settings.fps;
    const totalFrames = Math.ceil(renderDurationMs / frameIntervalMs);

    console.log(`Starting OPTIMIZED frame capture: ${totalFrames} frames, ${renderDurationMs}ms duration`);
    if (settings.testDurationMs) {
      console.log(`TEST MODE: Capturing only ${settings.testDurationMs}ms instead of full ${fullDurationMs}ms`);
    }

    // Build render URL
    const quizDataParam = encodeURIComponent(JSON.stringify({
      question: quizItem.question,
      questionTTS: quizItem.questionTTS || quizItem.question,
      answer: quizItem.answer,
      explanation: quizItem.explanation,
      explanationTTS: quizItem.explanationTTS || quizItem.explanation,
      explanations: quizItem.explanations,
      singleLineQuestion: quizItem.singleLineQuestion,
      timeline: audioTimeline.timeline.map(event => ({
        type: event.type,
        startMs: event.startMs,
        endMs: event.endMs,
        explanationIndex: event.explanationIndex,
      })),
    }));

    const renderUrl = `${appUrl}/render-player?data=${quizDataParam}`;
    console.log('Navigating to render-player...');

    await this.page.goto(renderUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    await this.page.waitForFunction(() => window.__RENDER_READY__ === true, { timeout: 10000 });
    console.log('RenderPlayer is ready');

    let frameCount = 0;
    const startTime = Date.now();

    onProgress?.({
      phase: 'capturing',
      current: 0,
      total: totalFrames,
      percentage: 0,
    });

    // Optimized capture: minimal delay, JPEG quality balance
    while (frameCount < totalFrames) {
      const currentTimeMs = frameCount * frameIntervalMs;

      // Set time directly
      await this.page.evaluate((time) => {
        window.__SET_TIME__(time);
      }, currentTimeMs);

      // Very minimal delay for React update
      await new Promise(resolve => setTimeout(resolve, 5));

      const frameNumber = String(frameCount).padStart(6, '0');
      const framePath = path.join(outputDir, `frame_${frameNumber}.jpg`);

      // Capture with optimized settings
      await this.page.screenshot({
        path: framePath,
        type: 'jpeg',
        quality: 85,
        fullPage: false,
        optimizeForSpeed: true,
      });

      frameCount++;

      // Progress every 30 frames
      if (frameCount % 30 === 0 || frameCount === totalFrames) {
        const percentage = Math.round((frameCount / totalFrames) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const fps = frameCount / elapsed;
        onProgress?.({
          phase: 'capturing',
          current: frameCount,
          total: totalFrames,
          percentage,
        });
        console.log(`Captured ${frameCount}/${totalFrames} (${percentage}%) - ${fps.toFixed(1)} fps`);
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`Capture complete: ${frameCount} frames in ${totalTime.toFixed(1)}s (${(frameCount / totalTime).toFixed(1)} fps)`);

    return {
      framesDir: outputDir,
      frameCount,
      totalDurationMs: renderDurationMs,
    };
  }
}

// Type declaration for window
declare global {
  interface Window {
    __RENDER_READY__: boolean;
    __SET_TIME__: (ms: number) => void;
  }
}
