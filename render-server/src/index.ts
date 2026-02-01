import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
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
