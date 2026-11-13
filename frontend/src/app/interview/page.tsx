'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

// 会話履歴の型定義
interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
  responseTime?: number;
}

const INITIAL_QUESTION = '面接官：簡単に自己紹介をお願いします。';

export default function InterviewPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [question, setQuestion] = useState(INITIAL_QUESTION);
  const [loading, setLoading] = useState(false);

  // これまでの質問と回答の履歴
  const [history, setHistory] = useState<ChatMessage[]>([
    { role: 'ai', text: INITIAL_QUESTION },
  ]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Webカメラ起動
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('カメラの起動に失敗しました:', err);
      }
    }
    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 2. 音声認識初期化
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript((prev) => prev + currentTranscript);
        };

        recognition.onerror = (event: any) => {
          console.error('音声認識エラー:', event.error);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // 3. 履歴が更新されたら自動で一番下へスクロール
  useEffect(() => {
    if (history.length > 0) {
      historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [history]);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  // 面接リセット処理
  const handleResetInterview = async () => {
    const confirmReset = window.confirm('面接を最初からやり直しますか？現在のやり取りはリセットされます。');
    if (!confirmReset) return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    let initialQ = INITIAL_QUESTION;
    try {
      const response = await fetch('http://localhost:8000/api/interview/reset', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        initialQ = data.initial_question || INITIAL_QUESTION;
      }
    } catch (error) {
      console.error('リセットエラー:', error);
    } finally {
      setQuestion(initialQ);
      setHistory([{ role: 'ai', text: initialQ }]);
      setTranscript('');
    }
  };

  // 回答送信処理
  const handleSubmitAnswer = async () => {
    if (!transcript.trim()) return;
    const submittedAnswer = transcript.trim();

    setLoading(true);
    setTranscript('');

    // まずユーザーの回答を履歴に追加
    setHistory((prev) => [...prev, { role: 'user', text: submittedAnswer }]);

    try {
      const response = await fetch('http://localhost:8000/api/interview/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer: submittedAnswer }),
      });

      if (!response.ok) throw new Error('API通信エラー');

      const data = await response.json();

      if (data.next_question) {
        setQuestion(data.next_question);
        // AIの次の質問を履歴に追加
        setHistory((prev) => [
          ...prev,
          {
            role: 'ai',
            text: data.next_question,
            responseTime: data.processing_time,
          },
        ]);
      }
    } catch (error) {
      console.error('送信エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      {/* ヘッダー領域 */}
      <div className="max-w-6xl mx-auto flex justify-between items-center border-b border-slate-200 pb-3 mb-6">
        <div className="w-36 hidden sm:block"></div>
        <h1 className="text-xl font-bold text-slate-900">
          AI オンライン面接練習ルーム
        </h1>
        <button
          onClick={handleResetInterview}
          className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-sm flex items-center gap-1.5 hover:text-red-600 hover:border-red-200"
        >
          <span>🔄</span> 面接を最初からやり直す
        </button>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側〜中央：カメラ映像 ＆ 会話履歴 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* カメラ映像 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative bg-slate-100 rounded-lg overflow-hidden aspect-video border border-slate-200 shadow-sm">
              <Image
                src="/interviewer.png"
                alt="AI面接官"
                fill
                className="object-cover"
                priority
              />
              <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm px-3 py-1 text-xs rounded-md text-slate-700 font-medium border border-slate-200 shadow-sm">
                AI 面接官
              </div>
            </div>

            <div className="relative bg-black rounded-lg overflow-hidden aspect-video border border-slate-200 shadow-sm">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
              <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm px-3 py-1 text-xs rounded-md text-white font-medium">
                あなた（応募者）
              </div>
            </div>
          </div>

          {/* 現在の質問ハイライト */}
          <div className="bg-white p-4 rounded-lg border-l-4 border-l-blue-600 border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-xs font-semibold text-blue-600 tracking-wider uppercase">
                現在の質問
              </h2>
              <span className="text-xs text-slate-400">
                全 {Math.ceil(history.length / 2)} 問目
              </span>
            </div>
            <p className="text-base font-medium text-slate-900">{question}</p>
          </div>

          {/* これまでの面接履歴（スクロールしてさかのぼり可能） */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
              <h2 className="text-xs font-semibold text-slate-500 tracking-wider uppercase">
                これまでのやり取り（履歴）
              </h2>
              <span className="text-xs text-slate-400">スクロールして過去を確認</span>
            </div>

            <div className="max-h-64 overflow-y-auto pr-2 space-y-3">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    item.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-medium text-slate-500">
                      {item.role === 'ai' ? 'AI 面接官' : 'あなた'}
                    </span>
                    {item.responseTime !== undefined && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        ⚡ {item.responseTime}s
                      </span>
                    )}
                  </div>
                  <div
                    className={`rounded-lg px-3.5 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                      item.role === 'ai'
                        ? 'bg-slate-100 text-slate-800 border border-slate-200'
                        : 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                    }`}
                  >
                    {item.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-start">
                  <div className="bg-slate-100 text-slate-500 text-xs px-3.5 py-2 rounded-lg border border-slate-200 animate-pulse">
                    AI 面接官が次の質問を考えています...
                  </div>
                </div>
              )}

              {/* 自動スクロール用のアンカー */}
              <div ref={historyEndRef} />
            </div>
          </div>
        </div>

        {/* 右側：回答入力・音声操作 */}
        <div className="flex flex-col gap-4">
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[320px]">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xs font-semibold text-emerald-600 tracking-wider uppercase">
                あなたの回答
              </h2>
              {transcript && (
                <button
                  onClick={() => setTranscript('')}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  クリア
                </button>
              )}
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="「音声入力」で話すか、ここに直接入力してください..."
              className="flex-1 w-full bg-slate-50 p-3 rounded text-sm text-slate-800 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={toggleRecording}
                className={`flex-1 py-2 px-3 rounded text-sm font-medium transition shadow-sm ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isRecording ? '🎤 録音停止' : '🎙️ 音声入力'}
              </button>

              <button
                onClick={handleSubmitAnswer}
                disabled={!transcript.trim() || loading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2 px-4 rounded text-sm font-medium transition shadow-sm"
              >
                {loading ? '質問作成中...' : '送信する'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}