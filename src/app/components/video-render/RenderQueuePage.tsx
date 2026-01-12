import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuizStore } from '../../hooks/useQuizStore';
import { renderClient, type RenderJobUpdate } from '../../services/RenderClient';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import {
  ArrowLeft,
  Play,
  Trash2,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Server,
  ServerOff,
} from 'lucide-react';

const statusLabels: Record<RenderJobUpdate['status'], string> = {
  pending: '대기 중',
  recording_tts: 'TTS 녹음 중',
  rendering: '프레임 렌더링 중',
  encoding: '비디오 인코딩 중',
  completed: '완료',
  failed: '실패',
};

export function RenderQueuePage() {
  const navigate = useNavigate();
  const { quizSets, loadQuizSets } = useQuizStore();
  const [jobs, setJobs] = useState<RenderJobUpdate[]>([]);
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const [serverConnected, setServerConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);

  // Auto-hide completed/failed jobs after 5 seconds
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    jobs.forEach(job => {
      if ((job.status === 'completed' || job.status === 'failed') && !hiddenJobIds.has(job.id)) {
        const timer = setTimeout(() => {
          setHiddenJobIds(prev => new Set([...prev, job.id]));
        }, 5000);
        timers.push(timer);
      }
    });

    return () => timers.forEach(t => clearTimeout(t));
  }, [jobs, hiddenJobIds]);

  // Filter out hidden jobs
  const visibleJobs = jobs.filter(j => !hiddenJobIds.has(j.id));

  useEffect(() => {
    loadQuizSets();
    connectToServer();

    return () => {
      renderClient.disconnect();
    };
  }, [loadQuizSets]);

  const connectToServer = async () => {
    setIsConnecting(true);
    try {
      const healthy = await renderClient.checkHealth();
      if (healthy) {
        await renderClient.connect();
        setServerConnected(true);
        renderClient.onJobsUpdate((updatedJobs) => {
          setJobs(updatedJobs);
        });
      } else {
        setServerConnected(false);
      }
    } catch {
      setServerConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartRender = async (quizSetId: string, testMode: boolean = false) => {
    const quizSet = quizSets.find((q) => q.id === quizSetId);
    if (!quizSet) return;

    try {
      const jobId = testMode
        ? await renderClient.startTestRender(quizSet)
        : await renderClient.startRender(quizSet);

      // Subscribe to updates - don't add locally, server will send update via onJobsUpdate
      renderClient.subscribeToJob(jobId, (updatedJob) => {
        setJobs((prev) => {
          const exists = prev.some((j) => j.id === updatedJob.id);
          if (exists) {
            return prev.map((j) => (j.id === updatedJob.id ? updatedJob : j));
          }
          return [updatedJob, ...prev];
        });
      });
    } catch (error) {
      console.error('Failed to start render:', error);
      alert(`렌더링 시작 실패: ${(error as Error).message}`);
    }
  };

  const handleDelete = async (jobId: string) => {
    await renderClient.cancelJob(jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const formatDate = (date?: Date) => {
    if (!date) return '';
    return new Date(date).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: RenderJobUpdate['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'pending':
        return <Play className="w-5 h-5 text-gray-400" />;
      default:
        return <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            목록으로
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800">비디오 렌더링</h1>
            <p className="text-gray-600">4K 60fps H.264 MP4로 렌더링합니다.</p>
          </div>
        </div>

        {/* Server Status */}
        <Card className={`mb-6 ${serverConnected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isConnecting ? (
                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                ) : serverConnected ? (
                  <Server className="w-5 h-5 text-green-600" />
                ) : (
                  <ServerOff className="w-5 h-5 text-red-600" />
                )}
                <div>
                  <p className={`font-medium ${serverConnected ? 'text-green-700' : 'text-red-700'}`}>
                    {isConnecting
                      ? '렌더 서버 연결 중...'
                      : serverConnected
                      ? '렌더 서버 연결됨'
                      : '렌더 서버 연결 안됨'}
                  </p>
                  {!serverConnected && !isConnecting && (
                    <p className="text-sm text-red-600">
                      render-server 폴더에서 <code className="bg-red-100 px-1 rounded">npm run dev</code> 실행 필요
                    </p>
                  )}
                </div>
              </div>
              {!serverConnected && !isConnecting && (
                <Button size="sm" variant="outline" onClick={connectToServer}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  재연결
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Available Quizzes to Render */}
        {serverConnected && quizSets.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">렌더링할 퀴즈 선택</CardTitle>
              <CardDescription>퀴즈를 선택하여 비디오 렌더링을 시작하세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3">
                {quizSets.map((quizSet) => (
                  <div key={quizSet.id} className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-auto p-4 justify-start"
                      onClick={() => handleStartRender(quizSet.id)}
                    >
                      <div className="text-left">
                        <p className="font-medium">{quizSet.name}</p>
                        <p className="text-xs text-gray-500">{quizSet.items.length}개 문제</p>
                      </div>
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-auto px-3 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      onClick={() => handleStartRender(quizSet.id, true)}
                      title="1초 테스트 렌더링"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      테스트
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Render Jobs List */}
        <h2 className="text-lg font-semibold text-gray-800 mb-4">렌더링 작업</h2>
        {visibleJobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Play className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 mb-2">렌더링 작업이 없습니다.</p>
              <p className="text-sm text-gray-500">
                위에서 퀴즈를 선택하여 렌더링을 시작하세요.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleJobs.map((job, index) => {
              const quizSet = quizSets.find((q) => q.id === job.quizSetId);
              const isCompleted = job.status === 'completed';
              const isFailed = job.status === 'failed';
              const isPending = job.status === 'pending';
              const isProcessing = !isCompleted && !isFailed && !isPending;

              return (
                <Card
                  key={job.id}
                  className={`overflow-hidden transition-all duration-300 ${
                    isCompleted ? 'bg-green-50 border-green-200' :
                    isFailed ? 'bg-red-50 border-red-200' :
                    isPending ? 'opacity-70' : ''
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(job.status)}
                        <div>
                          <CardTitle className="text-lg">
                            {quizSet?.name || '알 수 없는 퀴즈'}
                            {isPending && <span className="ml-2 text-sm text-gray-400">#{index + 1} 대기중</span>}
                          </CardTitle>
                          <CardDescription>
                            {isCompleted ? '완료됨' : isFailed ? (job.error || '실패') : statusLabels[job.status]}
                          </CardDescription>
                        </div>
                      </div>
                      {!isCompleted && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(job.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>

                  {/* Progress - only for active jobs */}
                  {isProcessing && (
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-orange-600">{job.currentStep}</span>
                          <span className="text-gray-500">{job.progress}%</span>
                        </div>
                        <Progress value={job.progress} className="h-2" />
                      </div>
                    </CardContent>
                  )}

                  {/* Completed - show output path */}
                  {isCompleted && job.outputPath && (
                    <CardContent className="pt-0">
                      <p className="text-xs text-green-700 break-all">{job.outputPath}</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
