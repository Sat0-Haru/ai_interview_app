'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

export default function InterviewPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [question, setQuestion] = useState('面接官：簡単に自己紹介をお願いします。');
  const [aiResponse, setAiResponse] = useState('');
  const [loading, setLoading] = useState(false);

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
          setTranscript(currentTranscript);
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
      setTranscript('');
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  // 3. 回答送信
  const handleSubmitAnswer = async () => {
    if (!transcript) return;
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/interview/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer: transcript }),
      });

      if (!response.ok) throw new Error('API通信エラー');

      const data = await response.json();
      setAiResponse(data.reply || '回答を受け取りました。');
    } catch (error) {
      console.error('送信エラー:', error);
      setAiResponse('（モック応答）素晴らしい回答ですね！具体的なエピソードも交えて話せています。');
    } finally {
      setLoading(false);
    }
  };

  return (
    // 💡 背景色を bg-slate-900 から 白（bg-slate-50 / bg-white）に変更
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      <h1 className="text-xl font-bold mb-4 text-center border-b border-slate-200 pb-3 text-slate-900">
        AI面接アプリ
      </h1>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側〜中央：カメラ映像領域（面接官 ＆ 自分） */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 面接官の映像領域 */}
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

            {/* 自分のカメラプレビュー領域 */}
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

          {/* 現在の質問カード */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <h2 className="text-xs font-semibold text-blue-600 mb-1 tracking-wider uppercase">
              現在の質問
            </h2>
            <p className="text-base font-medium text-slate-900">{question}</p>
          </div>
        </div>

        {/* 右側：回答入力・文字起こし ＆ フィードバック表示 */}
        <div className="flex flex-col gap-4">
          
          {/* 音声認識結果 */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[250px]">
            <h2 className="text-xs font-semibold text-emerald-600 mb-2 tracking-wider uppercase">
              あなたの回答
            </h2>
            <div className="flex-1 bg-slate-50 p-3 rounded text-sm text-slate-800 overflow-y-auto border border-slate-200">
              {transcript || (
                <span className="text-slate-400 italic">
                  「録音開始」を押して話すと、ここにリアルタイムで文字起こしされます...
                </span>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={toggleRecording}
                className={`flex-1 py-2 px-3 rounded text-sm font-medium transition shadow-sm ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isRecording ? '🎤 録音停止' : '🎙️ 録音開始'}
              </button>

              <button
                onClick={handleSubmitAnswer}
                disabled={!transcript || loading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2 px-4 rounded text-sm font-medium transition shadow-sm"
              >
                {loading ? '送信中...' : '送信する'}
              </button>
            </div>
          </div>

          {/* AIフィードバック */}
          {aiResponse && (
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <h2 className="text-xs font-semibold text-purple-600 mb-1 tracking-wider uppercase">
                Feedback
              </h2>
              <p className="text-sm text-slate-700">{aiResponse}</p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}