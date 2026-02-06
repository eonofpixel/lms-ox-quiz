import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import path from 'path';
import fs from 'fs-extra';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Add ffmpeg to PATH for silent audio generation
const ffmpegDir = path.dirname(ffmpegInstaller.path);
process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;

export interface TTSResult {
  audioPath: string;
  durationMs: number;
}

export interface ExplanationTTSResult extends TTSResult {
  index: number; // 해설 인덱스 (0부터 시작)
}

export interface AudioTimeline {
  questionTTS: TTSResult;
  explanationTTS: TTSResult; // 하위 호환성: 첫 번째 해설
  explanationTTSList?: ExplanationTTSResult[]; // 다중 해설 TTS 목록
  totalDurationMs: number;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  type: 'intro' | 'question_tts' | 'timer' | 'answer_reveal' | 'explanation_tts';
  startMs: number;
  endMs: number;
  audioPath?: string;
  explanationIndex?: number; // 다중 해설인 경우 해설 인덱스
}

export class TTSService {
  private voice: string = 'ko-KR-SunHiNeural'; // 한국어 여성 음성

  constructor() {}

  async initialize(): Promise<void> {
    // Test TTS connection
    console.log('TTS Service initialized with voice:', this.voice);
  }

  async generateTTS(text: string, outputPath: string, retries: number = 3, useFallbackSilence: boolean = false): Promise<TTSResult> {
    let lastError: Error | null = null;
    const outputDir = path.dirname(outputPath);

    for (let attempt = 1; attempt <= retries; attempt++) {
      const tempDir = path.join(outputDir, `tts_temp_${Date.now()}_${attempt}`);

      try {
        // Add delay before each attempt
        if (attempt > 1) {
          console.log(`TTS retry attempt ${attempt}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        await fs.ensureDir(tempDir);

        console.log(`TTS generating: "${text.substring(0, 30)}..."`);

        // Simplified TTS call - exactly like the working direct test
        const tts = new MsEdgeTTS();
        await tts.setMetadata(this.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        await tts.toFile(tempDir, text);

        const generatedFile = path.join(tempDir, 'audio.mp3');

        // Verify file exists and has content
        if (!await fs.pathExists(generatedFile)) {
          throw new Error('No audio file generated');
        }

        const stats = await fs.stat(generatedFile);
        if (stats.size === 0) {
          throw new Error('Audio file is empty');
        }

        console.log(`TTS SUCCESS: ${stats.size} bytes`);

        // Move to final location
        await fs.move(generatedFile, outputPath, { overwrite: true });
        await fs.remove(tempDir);

        // Estimate duration (5 chars/sec for Korean)
        const estimatedDurationMs = Math.max(1000, (text.length / 5) * 1000);

        return {
          audioPath: outputPath,
          durationMs: estimatedDurationMs,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = new Error(errorMessage);
        console.error(`TTS attempt ${attempt}/${retries} failed:`, errorMessage);

        try { await fs.remove(tempDir); } catch {}
      }
    }

    // If fallback is enabled, generate silent audio instead of throwing
    if (useFallbackSilence) {
      console.log(`TTS failed, using silent fallback for: "${text.substring(0, 30)}..."`);
      const estimatedDurationMs = Math.max(1000, (text.length / 5) * 1000);

      // Generate silent audio file using ffmpeg
      const { spawn } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-f', 'lavfi',
          '-i', 'anullsrc=r=44100:cl=stereo',
          '-t', String(estimatedDurationMs / 1000),
          '-acodec', 'libmp3lame',
          '-y',
          outputPath
        ]);
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg failed with code ${code}`));
        });
        ffmpeg.on('error', reject);
      });

      return {
        audioPath: outputPath,
        durationMs: estimatedDurationMs,
      };
    }

    throw new Error(`TTS failed after ${retries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  async generateQuizAudio(
    questionText: string,
    explanationText: string,
    outputDir: string,
    additionalExplanations?: Array<{ content: string; tts?: string }>
  ): Promise<AudioTimeline> {
    await fs.ensureDir(outputDir);

    // Warm up TTS connection with a dummy call first
    console.log('Warming up TTS connection...');
    try {
      const warmupTts = new MsEdgeTTS();
      await warmupTts.setMetadata(this.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const warmupDir = path.join(outputDir, 'warmup');
      await fs.ensureDir(warmupDir);
      await warmupTts.toFile(warmupDir, '테스트');
      await fs.remove(warmupDir);
      console.log('TTS warmup successful');
    } catch (e) {
      console.log('TTS warmup failed (this is expected sometimes)');
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Generating question TTS...');
    const questionTTS = await this.generateTTS(
      questionText,
      path.join(outputDir, 'question.mp3'),
      3,
      true // Use silent fallback if TTS fails
    );

    // Delay between TTS generations to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 모든 해설 TTS 생성 (첫 번째 + 추가 해설)
    const explanationTTSList: ExplanationTTSResult[] = [];

    // 첫 번째 해설
    console.log('Generating explanation TTS (1)...');
    const firstExplanationTTS = await this.generateTTS(
      explanationText,
      path.join(outputDir, 'explanation_0.mp3'),
      3,
      true
    );
    explanationTTSList.push({ ...firstExplanationTTS, index: 0 });

    // 추가 해설들
    if (additionalExplanations && additionalExplanations.length > 0) {
      for (let i = 0; i < additionalExplanations.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // 딜레이
        const exp = additionalExplanations[i];
        const text = exp.tts || exp.content;
        console.log(`Generating explanation TTS (${i + 2})...`);
        const ttsResult = await this.generateTTS(
          text,
          path.join(outputDir, `explanation_${i + 1}.mp3`),
          3,
          true
        );
        explanationTTSList.push({ ...ttsResult, index: i + 1 });
      }
    }

    // 타임라인 계산
    // 인트로(2초) → 문제 TTS → 타이머(5초) → 정답공개(1초) → 해설 TTS들
    const introDuration = 2000;
    const timerDuration = 5000;
    const answerRevealDuration = 1000;
    const transitionBuffer = 300;
    const explanationTransitionBuffer = 800; // 해설 간 전환 버퍼

    const timeline: TimelineEvent[] = [
      {
        type: 'intro',
        startMs: 0,
        endMs: introDuration,
      },
      {
        type: 'question_tts',
        startMs: introDuration + transitionBuffer,
        endMs: introDuration + transitionBuffer + questionTTS.durationMs,
        audioPath: questionTTS.audioPath,
      },
      {
        type: 'timer',
        startMs: introDuration + transitionBuffer + questionTTS.durationMs,
        endMs: introDuration + transitionBuffer + questionTTS.durationMs + timerDuration,
      },
      {
        type: 'answer_reveal',
        startMs: introDuration + transitionBuffer + questionTTS.durationMs + timerDuration,
        endMs: introDuration + transitionBuffer + questionTTS.durationMs + timerDuration + answerRevealDuration,
      },
    ];

    // 해설 TTS 이벤트들 추가
    let currentExplanationStart = introDuration + transitionBuffer + questionTTS.durationMs + timerDuration + answerRevealDuration + transitionBuffer;

    for (const expTTS of explanationTTSList) {
      timeline.push({
        type: 'explanation_tts',
        startMs: currentExplanationStart,
        endMs: currentExplanationStart + expTTS.durationMs,
        audioPath: expTTS.audioPath,
        explanationIndex: expTTS.index,
      });
      currentExplanationStart += expTTS.durationMs + explanationTransitionBuffer;
    }

    const totalDurationMs = timeline[timeline.length - 1].endMs + 1000; // 1초 여유

    console.log(`Audio timeline generated: ${totalDurationMs}ms total (${explanationTTSList.length} explanations)`);

    return {
      questionTTS,
      explanationTTS: firstExplanationTTS, // 하위 호환성
      explanationTTSList,
      totalDurationMs,
      timeline,
    };
  }

  // FFprobe를 사용해 실제 오디오 길이 측정 (더 정확함)
  async getAudioDuration(audioPath: string): Promise<number> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audioPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(output.trim()) * 1000; // ms로 변환
          resolve(duration);
        } else {
          // ffprobe 실패 시 추정값 사용
          resolve(2000);
        }
      });

      ffprobe.on('error', () => {
        resolve(2000);
      });
    });
  }
}
