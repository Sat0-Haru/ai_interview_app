'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

export default function InterviewPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [question, setQuestion] = useState('面接官：簡単に自己紹介をお願いします。');
  const [loading, setLoading] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<any>(null);

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

  // 💡 面接リセット処理
  const handleResetInterview = async () => {
    const confirmReset = window.confirm('面接を最初からやり直しますか？現在のやり取りはリセットされます。');
    if (!confirmReset) return;

    // 録音中なら停止
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    try {
      const response = await fetch('http://localhost:8000/api/interview/reset', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('API通信エラー');

      const data = await response.json();
      setQuestion(data.initial_question || '簡単に自己紹介をお願いします。');
    } catch (error) {
      console.error('リセットエラー:', error);
      setQuestion('簡単に自己紹介をお願いします。');
    } finally {
      // 全状態のリセット
      setTranscript('');
      setResponseTime(null);
    }
  };

  // 3. 回答送信
  const handleSubmitAnswer = async () => {
    if (!transcript.trim()) return;
    setLoading(true);
    setResponseTime(null);

    try {
      const response = await fetch('http://localhost:8000/api/interview/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer: transcript }),
      });

      if (!response.ok) throw new Error('API通信エラー');

      const data = await response.json();

      if (data.processing_time !== undefined) {
        setResponseTime(data.processing_time);
      }

      if (data.next_question) {
        setQuestion(data.next_question);
        setTranscript('');
      }
    } catch (error) {
      console.error('送信エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      {/* ヘッダー領域（タイトル＋画面右上にリセットボタン） */}
      <div className="max-w-6xl mx-auto flex justify-between items-center border-b border-slate-200 pb-3 mb-6">
        <div className="w-24"></div> {/* 左右中央揃え用のスペース */}
        <h1 className="text-xl font-bold text-slate-900">
          AI模擬面接
        </h1>
        {/* 💡 画面右上のリセットボタン */}
        <button
          onClick={handleResetInterview}
          className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-sm flex items-center gap-1.5 hover:text-red-600 hover:border-red-200"
        >
          面接を最初からやり直す
        </button>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側〜中央：カメラ映像領域 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 面接官 */}
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

            {/* 自分 */}
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

          {/* 現在の質問カード ＆ 応答時間表示 */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-xs font-semibold text-blue-600 tracking-wider uppercase">
                現在の質問
              </h2>
              {responseTime !== null && (
                <span className="text-xs text-slate-400 font-mono">
                  質問生成時間: {responseTime}秒
                </span>
              )}
            </div>
            <p className="text-base font-medium text-slate-900">{question}</p>
          </div>
        </div>

        {/* 右側：テキスト入力・修正 */}
        <div className="flex flex-col gap-4">
          
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[280px]">
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