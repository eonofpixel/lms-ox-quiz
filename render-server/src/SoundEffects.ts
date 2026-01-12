import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

export interface SoundEffects {
  tick: string;
  tock: string;
  timeUp: string;
  correctAnswer: string;
  wrongAnswer: string;
}

export class SoundEffectsGenerator {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  async generateAll(): Promise<SoundEffects> {
    await fs.ensureDir(this.outputDir);

    const effects: SoundEffects = {
      tick: path.join(this.outputDir, 'tick.mp3'),
      tock: path.join(this.outputDir, 'tock.mp3'),
      timeUp: path.join(this.outputDir, 'time_up.mp3'),
      correctAnswer: path.join(this.outputDir, 'correct.mp3'),
      wrongAnswer: path.join(this.outputDir, 'wrong.mp3'),
    };

    // Check if effects already exist
    const allExist = await Promise.all(
      Object.values(effects).map(p => fs.pathExists(p))
    );

    if (allExist.every(Boolean)) {
      console.log('Sound effects already exist, skipping generation');
      return effects;
    }

    console.log('Generating sound effects...');

    // Generate each sound effect
    await Promise.all([
      this.generateTick(effects.tick),
      this.generateTock(effects.tock),
      this.generateTimeUp(effects.timeUp),
      this.generateCorrectAnswer(effects.correctAnswer),
      this.generateWrongAnswer(effects.wrongAnswer),
    ]);

    console.log('Sound effects generated');
    return effects;
  }

  // Tick sound - higher pitched click (800Hz)
  private async generateTick(outputPath: string): Promise<void> {
    await this.runFFmpeg([
      '-f', 'lavfi',
      '-i', 'sine=frequency=800:duration=0.05',
      '-af', 'afade=t=out:st=0.03:d=0.02,volume=0.3',
      '-y',
      outputPath
    ]);
  }

  // Tock sound - lower pitched click (600Hz)
  private async generateTock(outputPath: string): Promise<void> {
    await this.runFFmpeg([
      '-f', 'lavfi',
      '-i', 'sine=frequency=600:duration=0.05',
      '-af', 'afade=t=out:st=0.03:d=0.02,volume=0.3',
      '-y',
      outputPath
    ]);
  }

  // Time up sound - triple beep (600Hz)
  private async generateTimeUp(outputPath: string): Promise<void> {
    // Create three beeps with pauses
    await this.runFFmpeg([
      '-f', 'lavfi',
      '-i', 'sine=frequency=600:duration=0.15',
      '-af', 'afade=t=out:st=0.1:d=0.05,volume=0.5',
      '-y',
      path.join(this.outputDir, 'beep_single.mp3')
    ]);

    // Concatenate three beeps with silence
    const beepPath = path.join(this.outputDir, 'beep_single.mp3');
    await this.runFFmpeg([
      '-i', beepPath,
      '-i', beepPath,
      '-i', beepPath,
      '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1[out]',
      '-map', '[out]',
      '-y',
      outputPath
    ]);

    // Cleanup temp file
    await fs.remove(beepPath);
  }

  // Correct answer sound - ascending melody (C-E-G: 523-659-784 Hz)
  private async generateCorrectAnswer(outputPath: string): Promise<void> {
    const notes = [
      { freq: 523, duration: 0.15 }, // C5
      { freq: 659, duration: 0.15 }, // E5
      { freq: 784, duration: 0.3 },  // G5
    ];

    const tempFiles: string[] = [];

    for (let i = 0; i < notes.length; i++) {
      const tempPath = path.join(this.outputDir, `note_${i}.mp3`);
      tempFiles.push(tempPath);
      await this.runFFmpeg([
        '-f', 'lavfi',
        '-i', `sine=frequency=${notes[i].freq}:duration=${notes[i].duration}`,
        '-af', `afade=t=out:st=${notes[i].duration - 0.05}:d=0.05,volume=0.4`,
        '-y',
        tempPath
      ]);
    }

    // Concatenate notes
    await this.runFFmpeg([
      '-i', tempFiles[0],
      '-i', tempFiles[1],
      '-i', tempFiles[2],
      '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1[out]',
      '-map', '[out]',
      '-y',
      outputPath
    ]);

    // Cleanup temp files
    for (const f of tempFiles) {
      await fs.remove(f);
    }
  }

  // Wrong answer sound - descending buzz (300Hz -> 150Hz)
  private async generateWrongAnswer(outputPath: string): Promise<void> {
    await this.runFFmpeg([
      '-f', 'lavfi',
      '-i', 'sine=frequency=300:duration=0.6',
      '-af', 'vibrato=f=10:d=0.5,afade=t=out:st=0.4:d=0.2,volume=0.4',
      '-y',
      outputPath
    ]);
  }

  private runFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });

      // Suppress FFmpeg output
      ffmpeg.stderr.on('data', () => {});
    });
  }
}

// Generate tick-tock pattern for timer (5 seconds)
export async function generateTimerAudio(
  effects: SoundEffects,
  outputPath: string,
  durationSeconds: number = 5
): Promise<void> {
  const tempFiles: string[] = [];

  // Create alternating tick-tock pattern
  for (let i = 0; i < durationSeconds; i++) {
    const isEven = i % 2 === 0;
    const soundFile = isEven ? effects.tick : effects.tock;
    tempFiles.push(soundFile);
  }

  // Create silence file (0.95 seconds - sound takes ~0.05s)
  const silencePath = path.dirname(outputPath) + '/silence.mp3';
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=mono',
      '-t', '0.95',
      '-y',
      silencePath
    ]);
    ffmpeg.on('close', (code) => code === 0 ? resolve() : reject());
    ffmpeg.on('error', reject);
  });

  // Build filter complex for alternating sounds with silence
  const inputs: string[] = [];
  const filterParts: string[] = [];

  for (let i = 0; i < durationSeconds; i++) {
    inputs.push('-i', tempFiles[i]);
    inputs.push('-i', silencePath);
  }

  // Build concat filter
  let concatInputs = '';
  for (let i = 0; i < durationSeconds * 2; i++) {
    concatInputs += `[${i}]`;
  }

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      ...inputs,
      '-filter_complex', `${concatInputs}concat=n=${durationSeconds * 2}:v=0:a=1[out]`,
      '-map', '[out]',
      '-y',
      outputPath
    ]);
    ffmpeg.on('close', (code) => code === 0 ? resolve() : reject());
    ffmpeg.on('error', reject);
  });

  // Cleanup silence file
  await fs.remove(silencePath);
}
