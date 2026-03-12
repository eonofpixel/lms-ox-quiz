import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fsExtra from 'fs-extra';
import { RenderQueueProcessor } from './RenderQueueProcessor.js';

const PORT = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Render queue processor
const renderQueue = new RenderQueueProcessor(io);

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/render', async (req, res) => {
  try {
    const { quizSetId, quizData, settings } = req.body;

    if (!quizSetId || !quizData) {
      return res.status(400).json({ error: 'quizSetId and quizData are required' });
    }

    const jobId = await renderQueue.addJob({
      quizSetId,
      quizData,
      settings: {
        width: settings?.width || 3840,
        height: settings?.height || 2160,
        fps: settings?.fps || 25,  // 4K 25fps
        outputFormat: 'mp4',
        testDurationMs: settings?.testDurationMs,  // Optional: limit render to X ms for testing
      },
    });

    res.json({ jobId, message: 'Render job added to queue' });
  } catch (error) {
    console.error('Error adding render job:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/render/:jobId', (req, res) => {
  const { jobId } = req.params;
  const status = renderQueue.getJobStatus(jobId);

  if (!status) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(status);
});

app.delete('/api/render/:jobId', (req, res) => {
  const { jobId } = req.params;
  const success = renderQueue.cancelJob(jobId);

  if (!success) {
    return res.status(404).json({ error: 'Job not found or already completed' });
  }

  res.json({ message: 'Job cancelled' });
});

// Settings API
app.get('/api/settings', (req, res) => {
  res.json({
    outputDir: renderQueue.getOutputDir(),
  });
});

app.put('/api/settings', async (req, res) => {
  try {
    const { outputDir } = req.body;
    if (!outputDir) {
      return res.status(400).json({ error: 'outputDir is required' });
    }
    await renderQueue.setOutputDir(outputDir);
    res.json({ message: 'Settings updated', outputDir: renderQueue.getOutputDir() });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Browse for folder (native OS dialog via temp .ps1 file)
app.post('/api/settings/browse', async (req, res) => {
  const scriptPath = path.join(os.tmpdir(), `browse-folder-${Date.now()}.ps1`);
  try {
    const currentDir = renderQueue.getOutputDir().replace(/\//g, '\\');
    const psScript = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '[System.Windows.Forms.Application]::EnableVisualStyles()',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      `$dialog.Description = "렌더링 출력 폴더 선택"`,
      `$dialog.SelectedPath = "${currentDir}"`,
      '$dialog.ShowNewFolderButton = $true',
      `if ($dialog.ShowDialog() -eq 'OK') { Write-Output $dialog.SelectedPath }`,
    ].join('\n');

    await fsExtra.writeFile(scriptPath, psScript, 'utf-8');

    const result = execSync(`powershell -STA -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      encoding: 'utf-8',
      timeout: 120000,
      windowsHide: false,
    }).trim();

    if (result) {
      res.json({ selectedPath: result });
    } else {
      res.json({ selectedPath: null });
    }
  } catch (err) {
    console.error('Browse folder error:', err);
    res.json({ selectedPath: null });
  } finally {
    fsExtra.remove(scriptPath).catch(() => {});
  }
});

// WebSocket events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe', (jobId: string) => {
    socket.join(`job:${jobId}`);
    console.log(`Client ${socket.id} subscribed to job ${jobId}`);
  });

  socket.on('unsubscribe', (jobId: string) => {
    socket.leave(`job:${jobId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server with initialization
async function startServer() {
  try {
    console.log('Initializing TTS and sound effects...');
    await renderQueue.initialize();
    console.log('Initialization complete!');

    httpServer.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🎬 Quiz Video Render Server                                ║
║                                                              ║
║   Server running at: http://localhost:${PORT}                  ║
║   WebSocket enabled for real-time progress updates           ║
║   TTS (Edge TTS) and sound effects ready!                    ║
║                                                              ║
║   API Endpoints:                                             ║
║   - GET  /api/health        Health check                     ║
║   - POST /api/render        Start a new render job           ║
║   - GET  /api/render/:id    Get job status                   ║
║   - DELETE /api/render/:id  Cancel a job                     ║
║   - GET  /api/settings     Get settings                      ║
║   - PUT  /api/settings     Update settings                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown - close browser on exit
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await renderQueue.shutdown();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export { app, io };
