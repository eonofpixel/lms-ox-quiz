import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QuizListPage } from './components/quiz-list/QuizListPage';
import { QuizPlayer } from './components/quiz-player/QuizPlayer';
import { RenderQueuePage } from './components/video-render/RenderQueuePage';
import { RenderPlayer } from './components/video-render/RenderPlayer';
import { LegacyQuizPlayer } from './components/LegacyQuizPlayer';

export default function App() {
  return (
    <>
      <Toaster position="top-center" richColors />
      <Routes>
        {/* Main quiz list page */}
        <Route path="/" element={<QuizListPage />} />

        {/* Quiz preview player */}
        <Route path="/preview/:quizSetId" element={<QuizPlayer />} />

        {/* Render queue */}
        <Route path="/render" element={<RenderQueuePage />} />

        {/* Render player - for Puppeteer capture */}
        <Route path="/render-player" element={<RenderPlayer />} />

        {/* Legacy player for backwards compatibility */}
        <Route path="/legacy" element={<LegacyQuizPlayer />} />
      </Routes>
    </>
  );
}
