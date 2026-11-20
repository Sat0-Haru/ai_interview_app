'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

// 会話履歴の型定義
interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
  responseTime?: number;
}

// 最終フィードバックの型定義
interface FeedbackResult {
  score: number;
  summary: string;
  good_points: string[];
  improvement_points: string[];
  processing_time?: number;
  isMock?: boolean;
}

const INITIAL_QUESTION = '面接官：簡単に自己紹介をお願いします。';

// バックエンド未接続・エラー時の仮フィードバックデータ
const MOCK_FEEDBACK: FeedbackResult = {
  score: 82,
  summary:
    '全体を通して落ち着いて質問の意図を汲み取り、論理的に回答できています。特に自身の経験に基づいた具体例が分かりやすく、面接官に良い印象を与えています。結論ファーストの意識をさらに高めると、より説得力が増します。',
  good_points: [
    '質問に対して結論から簡潔に答えようとする姿勢が見られ、話の全体像が掴みやすかったです。',
    '過去の経験や具体的なエピソードを交えて説明できており、説得力がありました。',
  ],
  improvement_points: [
    '一部の回答で背景説明が少し長くなる傾向があるため、1回答あたり1分〜1分半程度を目安に要約するとさらに良くなります。',
    '取り組みの結果得られた定量的な成果（数値や具体的な変化）をもう一言添えると、アピール力が一層高まります。',
  ],
  processing_time: 0.0,
  isMock: true,
};

export default function InterviewPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [question, setQuestion] = useState(INITIAL_QUESTION);
  const [loading, setLoading] = useState(false);

  // これまでの質問と回答の履歴
  const [history, setHistory] = useState<ChatMessage[]>([
    { role: 'ai', text: INITIAL_QUESTION },
  ]);

  // 面接終了・フィードバック用の状態
  const [isFinished, setIsFinished] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);

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
    if (!recognitionRef.current || isFinished) return;

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
    const confirmReset = window.confirm('面接を最初からやり直しますか？現在のやり取りと評価はリセットされます。');
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
      setIsFinished(false);
      setIsFinishing(false);
      setFeedback(null);
    }
  };

  // 回答送信処理（最新の会話履歴全体をバックエンドへ送信）
  const handleSubmitAnswer = async () => {
    if (!transcript.trim() || isFinished) return;
    const submittedAnswer = transcript.trim();

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    setLoading(true);
    setTranscript('');

    // 最新のユーザー回答を含めた履歴配列を作成
    const updatedHistory: ChatMessage[] = [
      ...history,
      { role: 'user', text: submittedAnswer },
    ];
    setHistory(updatedHistory);

    try {
      const response = await fetch('http://localhost:8000/api/interview/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          answer: submittedAnswer,
          history: updatedHistory.map((item) => ({
            role: item.role,
            text: item.text,
          })),
        }),
      });

      if (!response.ok) throw new Error('API通信エラー');

      const data = await response.json();

      if (data.next_question) {
        setQuestion(data.next_question);
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

  // 面接終了・総合フィードバック取得処理
  const handleFinishInterview = async () => {
    const confirmFinish = window.confirm('面接を終了し、これまでのやり取りから総合フィードバックを作成しますか？');
    if (!confirmFinish) return;

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    setIsFinishing(true);

    try {
      const response = await fetch('http://localhost:8000/api/interview/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: history.map((item) => ({
            role: item.role,
            text: item.text,
          })),
        }),
      });

      if (!response.ok) throw new Error('フィードバック取得エラー');

      const data: FeedbackResult = await response.json();
      setFeedback({ ...data, isMock: false });
      setIsFinished(true);
    } catch (error) {
      console.warn('バックエンドからフィードバックを取得できなかったため、仮のフィードバックを表示します:', error);
      setFeedback(MOCK_FEEDBACK);
      setIsFinished(true);
    } finally {
      setIsFinishing(false);
    }
  };

  // ユーザーが1回以上回答しているか判定
  const hasUserAnswered = history.some((item) => item.role === 'user');

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-50 text-slate-800 p-4 lg:p-6 flex flex-col">
      {/* ヘッダー領域 */}
      <div className="max-w-6xl w-full mx-auto flex justify-between items-center border-b border-slate-200 pb-3 mb-4 shrink-0">
        <div className="w-36 hidden sm:block"></div>
        <h1 className="text-xl font-bold text-slate-900">
          AI模擬面接アプリ
        </h1>
        <button
          onClick={handleResetInterview}
          className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-sm flex items-center gap-1.5 hover:text-red-600 hover:border-red-200"
        >
          <span>🔄</span> 面接を最初からやり直す
        </button>
      </div>

      {/* メインコンテンツ領域（高さを画面内に固定） */}
      <div className="max-w-6xl w-full mx-auto flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        
        {/* 左側〜中央：カメラ映像 ＆ 会話履歴 */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {/* カメラ映像（高さ固定） */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
            <div className="relative bg-slate-100 rounded-lg overflow-hidden aspect-video max-h-48 w-full border border-slate-200 shadow-sm">
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

            <div className="relative bg-black rounded-lg overflow-hidden aspect-video max-h-48 w-full border border-slate-200 shadow-sm">
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

          {/* 現在の質問ハイライト（面接中のみ表示・高さ固定） */}
          {!isFinished && (
            <div className="bg-white p-3.5 rounded-lg border-l-4 border-l-blue-600 border border-slate-200 shadow-sm shrink-0">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-xs font-semibold text-blue-600 tracking-wider uppercase">
                  現在の質問
                </h2>
                <span className="text-xs text-slate-400">
                  全 {Math.ceil(history.length / 2)} 問目
                </span>
              </div>
              <p className="text-sm font-medium text-slate-900 line-clamp-2">{question}</p>
            </div>
          )}

          {/* これまでの面接履歴（残り高さをすべて使い、枠内スクロールに固定） */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex-1 min-h-[240px] lg:min-h-0 flex flex-col">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100 shrink-0">
              <h2 className="text-xs font-semibold text-slate-500 tracking-wider uppercase">
                これまでのやり取り（履歴）
              </h2>
              <span className="text-xs text-slate-400">スクロールして過去を確認</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
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

              <div ref={historyEndRef} />
            </div>
          </div>
        </div>

        {/* 右側：回答入力・音声操作 または 最終フィードバック結果（高さ固定） */}
        <div className="flex flex-col gap-4 min-h-0">
          {!isFinished ? (
            <>
              {/* 回答入力カード */}
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex-1 min-h-[260px] lg:min-h-0 flex flex-col">
                <div className="flex justify-between items-center mb-2 shrink-0">
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
                  disabled={loading || isFinishing}
                  placeholder="「音声入力」で話すか、ここに直接入力してください..."
                  className="flex-1 w-full bg-slate-50 p-3 rounded text-sm text-slate-800 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none overflow-y-auto disabled:opacity-60"
                />

                <div className="flex gap-2 mt-3 shrink-0">
                  <button
                    onClick={toggleRecording}
                    disabled={loading || isFinishing}
                    className={`flex-1 py-2 px-3 rounded text-sm font-medium transition shadow-sm disabled:opacity-50 ${
                      isRecording
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isRecording ? '🎤 録音停止' : '🎙️ 音声入力'}
                  </button>

                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!transcript.trim() || loading || isFinishing}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2 px-4 rounded text-sm font-medium transition shadow-sm"
                  >
                    {loading ? '質問作成中...' : '送信する'}
                  </button>
                </div>
              </div>

              {/* 面接終了・評価ボタンカード */}
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm shrink-0">
                <p className="text-xs text-slate-500 mb-2.5 leading-relaxed">
                  十分な質問に回答したら、面接を終了してこれまでのやり取りの総合フィードバックを受け取れます。
                </p>
                <button
                  onClick={handleFinishInterview}
                  disabled={!hasUserAnswered || loading || isFinishing}
                  className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition shadow-sm bg-slate-800 hover:bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {isFinishing ? '総合フィードバックを生成中...' : '🏁 面接を終了して評価を見る'}
                </button>
              </div>
            </>
          ) : (
            /* 面接終了後の総合フィードバック表示パネル */
            feedback && (
              <div className="bg-white p-5 rounded-lg border-t-4 border-t-indigo-600 border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-3 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">
                        面接総合フィードバック
                      </h2>
                      {feedback.isMock && (
                        <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                          仮データ表示中
                        </span>
                      )}
                    </div>
                    {feedback.processing_time !== undefined && !feedback.isMock && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        ⚡ 生成時間: {feedback.processing_time}秒
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">総合スコア</span>
                    <span className="text-2xl font-extrabold text-indigo-600">
                      {feedback.score}
                      <span className="text-xs font-normal text-slate-400"> / 100点</span>
                    </span>
                  </div>
                </div>

                {/* スクロール可能なフィードバック本体 */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                  {/* 総評 */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      総評
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded border border-slate-100">
                      {feedback.summary}
                    </p>
                  </div>

                  {/* 良かった点 */}
                  <div>
                    <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <span>👍</span> 良かった点
                    </h3>
                    <ul className="space-y-1.5">
                      {feedback.good_points.map((point, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-700 bg-emerald-50/60 border border-emerald-100 px-3 py-2 rounded leading-relaxed"
                        >
                          • {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 改善点 */}
                  <div>
                    <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <span>💡</span> 改善アドバイス
                    </h3>
                    <ul className="space-y-1.5">
                      {feedback.improvement_points.map((point, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-700 bg-amber-50/60 border border-amber-100 px-3 py-2 rounded leading-relaxed"
                        >
                          • {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <button
                  onClick={handleResetInterview}
                  className="mt-3 w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-sm shrink-0"
                >
                  もう一度最初から練習する
                </button>
              </div>
            )
          )}
        </div>

      </div>
    </div>
  );
}