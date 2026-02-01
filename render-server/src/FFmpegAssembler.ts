import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ---------------------------------------------------------------------------
// NVENC (GPU) encoder detection & config
// ---------------------------------------------------------------------------

/** Cached NVENC availability result (null = not yet checked) */
let _nvencAvailable: boolean | null = null;

function isNvencAvailable(): boolean {
  if (_nvencAvailable !== null) return _nvencAvailable;

  try {
    // Actually try to encode a tiny test frame with NVENC
    // This catches cases where ffmpeg lists h264_nvenc but can't use it
    execSync(
      `"${ffmpegInstaller.path}" -f lavfi -i color=black:s=64x64:d=0.1 -c:v h264_nvenc -preset p4 -f null - 2>&1`,
      {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      }
    );
    _nvencAvailable = true;
    console.log('NVENC encoder: AVAILABLE (GPU acceleration enabled - verified by test encode)');
  } catch {
    _nvencAvailable = false;
    console.log('NVENC encoder: NOT AVAILABLE (test encode failed, using CPU encoding)');
  }

  return _nvencAvailable;
}

interface EncoderConfig {
  codec: string;
  options: string[];
}

/**
 * Return the video codec name and matching output options for H.264 encoding.
 *
 * When NVENC is available the GPU path is used (much faster for 4K).
 * The optional `tune` parameter is only applied for the libx264 CPU path
 * because NVENC does not support `-tune`.
 */
function getVideoEncoderConfig(tune?: 'animation' | 'stillimage'): EncoderConfig {
  if (isNvencAvailable()) {
    // NVENC GPU encoding
    const opts = [
      '-preset p4',          // p4 = balanced speed/quality (p1=fastest, p7=highest quality)
      '-rc vbr',             // Variable bitrate
      '-cq 23',              // Constant quality (similar to CRF 23)
      '-b:v 0',              // Let CQ control quality
      '-pix_fmt yuv420p',
      '-threads 0',
      '-movflags +faststart',
    ];
    return { codec: 'h264_nvenc', options: opts };
  }

  // CPU fallback - libx264
  const opts = [
    '-preset fast',
    '-crf 23',
    '-pix_fmt yuv420p',
    '-threads 0',
    '-movflags +faststart',
  ];
  if (tune) {
    opts.push(`-tune ${tune}`);
  }
  return { codec: 'libx264', options: opts };
}

/**
 * Fast-mode encoder config: NVENC with fastest preset (p1), or libx264 ultrafast.
 */
function getVideoEncoderConfigFast(): EncoderConfig {
  if (isNvencAvailable()) {
    const opts = [
      '-preset p1',          // p1 = fastest NVENC preset
      '-rc vbr',
      '-cq 25',
      '-b:v 0',
      '-pix_fmt yuv420p',
      '-threads 0',
      '-movflags +faststart',
    ];
    return { codec: 'h264_nvenc', options: opts };
  }

  return {
    codec: 'libx264',
    options: [
      '-preset ultrafast',
      '-crf 25',
      '-pix_fmt yuv420p',
      '-threads 0',
      '-movflags +faststart',
    ],
  };
}

export interface AssembleOptions {
  framesDir: string;
  framePattern: string; // e.g., 'frame_%06d.png'
  fps: number;
  width: number;
  height: number;
  outputPath: string;
  audioPath?: string;
}

export type ProgressCallback = (progress: {
  percentage: number;
  timemark?: string;
}) => void;

export interface CaptureSegment {
  type: 'static' | 'animated';
  startMs: number;
  endMs: number;
  durationMs: number;
  framePath?: string;      // For static: single frame path
  framesDir?: string;      // For animated: directory of frames
  frameCount?: number;
  framePattern?: string;   // e.g. 'frame_%06d.jpg'
}

export interface AssembleFromSegmentsOptions {
  fps: number;
  captureWidth: number;    // e.g. 1920 (what was captured)
  captureHeight: number;   // e.g. 1080
  outputWidth: number;     // e.g. 3840 (final 4K)
  outputHeight: number;    // e.g. 2160
  outputPath: string;
  audioPath?: string;
}

export class FFmpegAssembler {
  /** Check if GPU (NVENC) encoding is available */
  static isGpuAvailable(): boolean {
    return isNvencAvailable();
  }

  async assembleVideo(
    options: AssembleOptions,
    onProgress?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const inputPattern = path.join(options.framesDir, options.framePattern);

      const enc = getVideoEncoderConfig('animation');

      let command = ffmpeg()
        .input(inputPattern)
        .inputFPS(options.fps)
        .videoCodec(enc.codec)
        .outputOptions([
          ...enc.options,
          `-s ${options.width}x${options.height}`,
        ]);

      // Add audio if provided
      if (options.audioPath) {
        command = command
          .input(options.audioPath)
          .audioCodec('aac')
          .audioBitrate('192k')
          .outputOptions(['-shortest']);
      }

      command
        .output(options.outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg started:', commandLine);
        })
        .on('progress', (progress) => {
          onProgress?.({
            percentage: progress.percent || 0,
            timemark: progress.timemark,
          });
        })
        .on('end', () => {
          console.log('FFmpeg encoding completed');
          resolve(options.outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .run();
    });
  }

  // Fast encoding variant for quicker turnaround
  async assembleVideoFast(
    options: AssembleOptions,
    onProgress?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const inputPattern = path.join(options.framesDir, options.framePattern);

      const enc = getVideoEncoderConfigFast();

      let command = ffmpeg()
        .input(inputPattern)
        .inputFPS(options.fps)
        .videoCodec(enc.codec)
        .outputOptions([
          ...enc.options,
          `-s ${options.width}x${options.height}`,
        ]);

      if (options.audioPath) {
        command = command
          .input(options.audioPath)
          .audioCodec('aac')
          .audioBitrate('128k')
          .outputOptions(['-shortest']);
      }

      command
        .output(options.outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg FAST started:', commandLine);
        })
        .on('progress', (progress) => {
          onProgress?.({
            percentage: progress.percent || 0,
            timemark: progress.timemark,
          });
        })
        .on('end', () => {
          console.log('FFmpeg FAST encoding completed');
          resolve(options.outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .run();
    });
  }

  // Merge video with audio
  async mergeAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v copy',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
        ])
        .output(outputPath)
        .on('progress', (progress) => {
          onProgress?.({
            percentage: progress.percent || 0,
            timemark: progress.timemark,
          });
        })
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        })
        .run();
    });
  }

  // Merge WebM video with audio (re-encodes to H.264 for MP4)
  async mergeWebmWithAudio(
    webmPath: string,
    audioPath: string,
    outputPath: string,
    width: number,
    height: number,
    onProgress?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(webmPath)
        .input(audioPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset fast',
          '-crf 23',
          '-pix_fmt yuv420p',
          `-s ${width}x${height}`,
          '-threads 0',
          '-b:a 192k',
          '-shortest',
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log('FFmpeg WebM merge started:', cmd);
        })
        .on('progress', (progress) => {
          onProgress?.({
            percentage: progress.percent || 0,
            timemark: progress.timemark,
          });
        })
        .on('end', () => {
          console.log('WebM merge completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg WebM merge error:', err);
          reject(err);
        })
        .run();
    });
  }

  // Concatenate multiple audio files
  async concatenateAudio(
    audioFiles: string[],
    outputPath: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Add all input files
      for (const file of audioFiles) {
        command.input(file);
      }

      command
        .complexFilter([
          `concat=n=${audioFiles.length}:v=0:a=1[out]`,
        ])
        .outputOptions(['-map', '[out]'])
        .audioCodec('pcm_s16le') // WAV output
        .output(outputPath)
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        })
        .run();
    });
  }

  // Get video/audio duration
  async getDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(metadata.format.duration || 0);
      });
    });
  }

  // Create mixed audio from timeline events with volume control
  async createAudioTimeline(
    events: Array<{ audioPath: string; startMs: number; volume?: number }>,
    totalDurationMs: number,
    outputPath: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (events.length === 0) {
        // Create silent audio
        ffmpeg()
          .input('anullsrc=r=44100:cl=stereo')
          .inputFormat('lavfi')
          .duration(totalDurationMs / 1000)
          .audioCodec('aac')
          .audioBitrate('192k')
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .run();
        return;
      }

      const command = ffmpeg();

      // Add silence input first (for mixing base)
      command.input('anullsrc=r=44100:cl=stereo').inputFormat('lavfi');

      // Add all audio inputs
      for (const event of events) {
        command.input(event.audioPath);
      }

      // Build complex filter for mixing audio at specific times
      const filterParts: string[] = [];
      const mixInputs: string[] = [];

      // Process the silent base (index 0)
      filterParts.push(`[0]atrim=0:${totalDurationMs / 1000}[base]`);

      // Process each audio event with optional volume adjustment
      events.forEach((event, index) => {
        const inputIndex = index + 1;
        const delayMs = event.startMs;
        const volume = event.volume ?? 1.0;
        const filterName = `a${index}`;

        // Apply volume and delay
        if (volume !== 1.0) {
          filterParts.push(`[${inputIndex}]volume=${volume},adelay=${delayMs}|${delayMs}[${filterName}]`);
        } else {
          filterParts.push(`[${inputIndex}]adelay=${delayMs}|${delayMs}[${filterName}]`);
        }
        mixInputs.push(`[${filterName}]`);
      });

      // Mix all audio tracks together
      // amix normalizes by dividing volume by active input count, causing
      // inconsistent TTS volumes. Compensate by boosting output volume by
      // the number of inputs so that manually-set volumes are preserved.
      const inputCount = events.length + 1;
      const mixFilter = `[base]${mixInputs.join('')}amix=inputs=${inputCount}:duration=first:dropout_transition=0[mixed];[mixed]volume=${inputCount}[out]`;
      filterParts.push(mixFilter);

      command
        .complexFilter(filterParts)
        .outputOptions(['-map', '[out]'])
        .audioCodec('aac')
        .audioBitrate('192k')
        .output(outputPath)
        .on('start', (cmd) => {
          console.log('FFmpeg audio mixing started:', cmd);
        })
        .on('end', () => {
          console.log('Audio timeline created');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg audio error:', err);
          reject(err);
        })
        .run();
    });
  }

  // Generate silence of specified duration
  async generateSilence(durationMs: number, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input('anullsrc=r=44100:cl=stereo')
        .inputFormat('lavfi')
        .duration(durationMs / 1000)
        .audioCodec('aac')
        .audioBitrate('192k')
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  /**
   * Assemble video from smart keyframe segments (mix of static images held for
   * duration and animated frame sequences) with 4K upscaling support.
   *
   * Uses FFmpeg's concat demuxer approach:
   * 1. Create intermediate video clips for each segment
   * 2. Write a concat list file
   * 3. Concatenate all segments with 4K upscale and optional audio
   */
  async assembleFromSegments(
    segments: CaptureSegment[],
    options: AssembleFromSegmentsOptions,
    onProgress?: ProgressCallback
  ): Promise<string> {
    if (segments.length === 0) {
      throw new Error('No segments provided for assembly');
    }

    // Create a temporary working directory for intermediate files
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-segments-'));

    try {
      // Phase 1: Create intermediate clips for each segment
      const segmentPaths: string[] = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentOutputPath = path.join(tempDir, `segment_${String(i).padStart(4, '0')}.mp4`);
        segmentPaths.push(segmentOutputPath);

        onProgress?.({
          percentage: Math.round((i / segments.length) * 50),
          timemark: `Creating segment ${i + 1}/${segments.length}`,
        });

        if (segment.type === 'static') {
          await this.createStaticSegmentClip(
            segment,
            segmentOutputPath,
            options.fps,
            options.captureWidth,
            options.captureHeight
          );
        } else {
          await this.createAnimatedSegmentClip(
            segment,
            segmentOutputPath,
            options.fps,
            options.captureWidth,
            options.captureHeight
          );
        }
      }

      // Phase 2: Write concat file
      const concatFilePath = path.join(tempDir, 'segments.txt');
      const concatContent = segmentPaths
        .map((p) => `file '${p.replace(/\\/g, '/')}'`)
        .join('\n');
      await fs.writeFile(concatFilePath, concatContent, 'utf-8');

      // Phase 3: Concatenate all segments with upscaling and optional audio
      onProgress?.({
        percentage: 55,
        timemark: 'Concatenating segments with 4K upscale...',
      });

      await this.concatAndFinalize(
        concatFilePath,
        options,
        onProgress
      );

      console.log(`Segment assembly completed: ${options.outputPath}`);
      return options.outputPath;
    } finally {
      // Clean up temporary directory
      await fs.remove(tempDir).catch((err: Error) => {
        console.warn('Failed to clean up temp directory:', tempDir, err.message);
      });
    }
  }

  /**
   * Create an intermediate video clip from a static (single-frame) segment.
   * Loops a single image for the segment's duration.
   */
  private createStaticSegmentClip(
    segment: CaptureSegment,
    outputPath: string,
    fps: number,
    width: number,
    height: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!segment.framePath) {
        reject(new Error(`Static segment missing framePath (startMs=${segment.startMs})`));
        return;
      }

      const durationSec = segment.durationMs / 1000;

      const enc = getVideoEncoderConfig('stillimage');

      ffmpeg()
        .input(segment.framePath)
        .inputOptions([
          '-loop 1',
          `-t ${durationSec}`,
        ])
        .videoCodec(enc.codec)
        .outputOptions([
          ...enc.options,
          `-r ${fps}`,
          `-s ${width}x${height}`,
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log(`  Static segment clip (${durationSec.toFixed(2)}s):`, cmd);
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.error(`  Static segment error:`, err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Create an intermediate video clip from an animated (multi-frame) segment.
   * Encodes a sequence of frames at the specified fps.
   */
  private createAnimatedSegmentClip(
    segment: CaptureSegment,
    outputPath: string,
    fps: number,
    width: number,
    height: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!segment.framesDir || !segment.framePattern) {
        reject(
          new Error(
            `Animated segment missing framesDir or framePattern (startMs=${segment.startMs})`
          )
        );
        return;
      }

      const inputPattern = path.join(segment.framesDir, segment.framePattern);

      const enc = getVideoEncoderConfig('animation');

      ffmpeg()
        .input(inputPattern)
        .inputFPS(fps)
        .videoCodec(enc.codec)
        .outputOptions([
          ...enc.options,
          `-s ${width}x${height}`,
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log(`  Animated segment clip (${segment.frameCount ?? '?'} frames):`, cmd);
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.error(`  Animated segment error:`, err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Concatenate intermediate segment clips, apply 4K upscale with lanczos,
   * and optionally merge audio into the final output.
   */
  private concatAndFinalize(
    concatFilePath: string,
    options: AssembleFromSegmentsOptions,
    onProgress?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const needsUpscale =
        options.outputWidth !== options.captureWidth ||
        options.outputHeight !== options.captureHeight;

      const scaleFilter = needsUpscale
        ? `scale=${options.outputWidth}:${options.outputHeight}:flags=lanczos`
        : null;

      let command = ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f concat', '-safe 0']);

      // Add audio input if provided
      if (options.audioPath) {
        command = command.input(options.audioPath);
      }

      const enc = getVideoEncoderConfig('animation');
      const outputOpts: string[] = [...enc.options];
      // Ensure movflags is present (NVENC config includes it; CPU path does not)
      if (!outputOpts.includes('-movflags +faststart')) {
        outputOpts.push('-movflags +faststart');
      }

      if (scaleFilter) {
        outputOpts.push(`-vf ${scaleFilter}`);
      }

      if (options.audioPath) {
        outputOpts.push(
          '-c:a aac',
          '-b:a 192k',
          '-shortest'
        );
      } else {
        outputOpts.push('-an');
      }

      command
        .videoCodec(enc.codec)
        .outputOptions(outputOpts)
        .output(options.outputPath)
        .on('start', (cmd) => {
          console.log('FFmpeg concat + upscale started:', cmd);
        })
        .on('progress', (progress) => {
          // Map concat progress to 55-100% range
          const rawPercent = progress.percent || 0;
          const mappedPercent = 55 + Math.round(rawPercent * 0.45);
          onProgress?.({
            percentage: Math.min(mappedPercent, 100),
            timemark: progress.timemark,
          });
        })
        .on('end', () => {
          console.log('FFmpeg concat + upscale completed');
          resolve(options.outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg concat error:', err);
          reject(err);
        })
        .run();
    });
  }
}
