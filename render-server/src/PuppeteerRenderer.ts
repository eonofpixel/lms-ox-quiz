import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs-extra';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { AudioTimeline } from './TTSService.js';

// Add ffmpeg to PATH for Puppeteer screencast
const ffmpegDir = path.dirname(ffmpegInstaller.path);
process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;

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
  }>;
}

export type ProgressCallback = (progress: {
  phase: string;
  current: number;
  total: number;
  percentage: number;
}) => void;

export class PuppeteerRenderer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(width: number = 1920, height: number = 1080): Promise<void> {
    console.log('Launching Puppeteer browser...');

    this.browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode for better screencast support
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--autoplay-policy=no-user-gesture-required',
        '--enable-gpu-rasterization',
        '--enable-accelerated-video-decode',
        `--window-size=${width},${height}`,
      ],
    });

    this.page = await this.browser.newPage();

    await this.page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
    });

    console.log(`Browser initialized with viewport ${width}x${height}`);
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

  // Fast controlled frame capture - no real-time waiting
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
      timeline: audioTimeline.timeline.map(event => ({
        type: event.type,
        startMs: event.startMs,
        endMs: event.endMs,
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
          quality: 95,
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

  // Alternative: Use JPEG for even faster capture (smaller files, faster I/O)
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
      timeline: audioTimeline.timeline.map(event => ({
        type: event.type,
        startMs: event.startMs,
        endMs: event.endMs,
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
          quality: 95,
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

  // Optimized frame capture using parallel processing
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
      timeline: audioTimeline.timeline.map(event => ({
        type: event.type,
        startMs: event.startMs,
        endMs: event.endMs,
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

      // Very minimal delay for React update (reduced from 8ms to 5ms)
      await new Promise(resolve => setTimeout(resolve, 5));

      const frameNumber = String(frameCount).padStart(6, '0');
      const framePath = path.join(outputDir, `frame_${frameNumber}.jpg`);

      // Capture with optimized settings
      await this.page.screenshot({
        path: framePath,
        type: 'jpeg',
        quality: 90, // Slightly lower quality for faster I/O
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
