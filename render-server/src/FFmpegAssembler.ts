import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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

export class FFmpegAssembler {
  async assembleVideo(
    options: AssembleOptions,
    onProgress?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const inputPattern = path.join(options.framesDir, options.framePattern);

      let command = ffmpeg()
        .input(inputPattern)
        .inputFPS(options.fps)
        .videoCodec('libx264')
        .outputOptions([
          // Use 'fast' preset for much faster encoding (was 'slow')
          '-preset fast',
          // CRF 23 is a good balance of quality/speed (was 18)
          '-crf 23',
          '-pix_fmt yuv420p',
          `-s ${options.width}x${options.height}`,
          // Enable multi-threading
          '-threads 0',
          // Tune for animation content
          '-tune animation',
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

      let command = ffmpeg()
        .input(inputPattern)
        .inputFPS(options.fps)
        .videoCodec('libx264')
        .outputOptions([
          // Ultrafast for maximum speed
          '-preset ultrafast',
          '-crf 25',
          '-pix_fmt yuv420p',
          `-s ${options.width}x${options.height}`,
          '-threads 0',
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
      const mixFilter = `[base]${mixInputs.join('')}amix=inputs=${events.length + 1}:duration=first:dropout_transition=0[out]`;
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
}
