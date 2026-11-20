from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os
import time
from typing import List
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI(title="AI Interview App API")

gemini_api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=gemini_api_key) if gemini_api_key else None

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- リクエスト / レスポンスモデル定義 ---

class AnswerRequest(BaseModel):
    question: str
    answer: str

class AnswerResponse(BaseModel):
    next_question: str
    processing_time: float

class ResetResponse(BaseModel):
    initial_question: str

class ChatMessage(BaseModel):
    role: str
    text: str

class FinishRequest(BaseModel):
    history: List[ChatMessage]

class FeedbackResponse(BaseModel):
    score: int
    summary: str
    good_points: List[str]
    improvement_points: List[str]
    processing_time: float

class NextQuestionSchema(BaseModel):
    next_question: str = Field(description="応募者の回答を踏まえた次の面接質問文")

class FeedbackSchema(BaseModel):
    score: int = Field(description="0から100までの整数による総合評価スコア")
    summary: str = Field(description="面接全体の総評（150〜250文字程度）")
    good_points: List[str] = Field(description="応募者の回答で良かった点のリスト（2〜3個）")
    improvement_points: List[str] = Field(description="今後の改善アドバイスのリスト（2〜3個）")

INITIAL_QUESTION = "面接官：簡単に自己紹介をお願いします。"

# --- エンドポイント ---

@app.get("/")
def read_root():
    return {"status": "ok", "message": "FastAPI サーバーが正常に起動しています"}

@app.post("/api/interview/reset", response_model=ResetResponse)
async def reset_interview():
    return ResetResponse(initial_question=INITIAL_QUESTION)

@app.post("/api/interview/answer", response_model=AnswerResponse)
async def process_answer(request: AnswerRequest):
    start_time = time.time()

    if not client:
        return AnswerResponse(
            next_question="これまでにチームで最も困難を乗り越えた経験について教えてください。",
            processing_time=0.0
        )

    prompt = f"""
あなたは面接官です。応募者の回答を踏まえて、次の質問を1つ作成してください。

【直前の質問】: {request.question}
【応募者の回答】: {request.answer}
"""

    try:
        response = await client.aio.models.generate_content(
            model='gemini-3.5-flash-lite',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="あなたは面接官です。簡潔に次の質問文のみを出力してください。",
                response_mime_type="application/json",
                response_schema=NextQuestionSchema,
                temperature=0.7,
            ),
        )

        elapsed_time = round(time.time() - start_time, 2)
        print(f"[Answer] Gemini 3.5 Flash-Lite Response Time: {elapsed_time}s")
        parsed_data: NextQuestionSchema = response.parsed
        return AnswerResponse(
            next_question=parsed_data.next_question if parsed_data else "これまでにチームで最も困難を乗り越えた経験について教えてください。",
            processing_time=elapsed_time
        )

    except Exception as e:
        elapsed_time = round(time.time() - start_time, 2)
        print(f"[Answer] Gemini API Error ({elapsed_time}s): {e}")
        return AnswerResponse(
            next_question="これまでに直面した技術的な課題と、それをどのように克服したか教えてください。",
            processing_time=elapsed_time
        )

@app.post("/api/interview/finish", response_model=FeedbackResponse)
async def finish_interview(request: FinishRequest):
    start_time = time.time()

    fallback_feedback = FeedbackResponse(
        score=80,
        summary="質問の意図を的確に捉え、落ち着いて回答できています。具体的なエピソードを交えて説明できており、論理的な構成力が見受けられます。",
        good_points=[
            "質問に対して結論から分かりやすく回答しようとしている点",
            "自身の経験に基づいた具体的な行動を説明できている点"
        ],
        improvement_points=[
            "取り組みによって得られた成果や学びを定量的な数値や具体例で補強すると、さらに説得力が高まります",
            "1つの回答が長くなりすぎないよう、要点を簡潔にまとめる意識を持つとより良くなります"
        ],
        processing_time=0.0
    )

    if not client or not request.history:
        return fallback_feedback

    conversation_lines = []
    for msg in request.history:
        speaker = "面接官" if msg.role == "ai" else "応募者"
        conversation_lines.append(f"{speaker}: {msg.text}")
    conversation_text = "\n".join(conversation_lines)

    prompt = f"""
あなたは企業の採用面接官です。以下の模擬面接の会話履歴全体を分析し、応募者に対する総合フィードバックを作成してください。

【面接の会話履歴】
{conversation_text}

【評価の観点】
- 論理構成（結論ファーストで分かりやすいか）
- 具体性（エピソードや根拠が明確か）
- コミュニケーション力（質問の意図に的確に答えているか）

【採点基準（100点満点）】
- 90〜100点: 非常に優秀（即戦力レベルで論理的・具体的）
- 75〜89点: 合格水準（質問の意図を捉え、適切に回答できている）
- 60〜74点: 改善の余地あり（回答が抽象的、または結論が分かりにくい）
- 59点以下: 基準未達（質問に答えられていない、または内容が極端に薄い）
"""

    try:
        response = await client.aio.models.generate_content(
            model='gemini-3.5-flash-lite',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="あなたはプロの採用面接官です。厳格かつ建設的で具体的なフィードバックを出力してください。",
                response_mime_type="application/json",
                response_schema=FeedbackSchema,
                temperature=0.5,
            ),
        )

        elapsed_time = round(time.time() - start_time, 2)
        print(f"[Finish] Gemini 3.5 Flash-Lite Response Time: {elapsed_time}s")
        parsed_data: FeedbackSchema = response.parsed
        if not parsed_data:
            fallback_feedback.processing_time = elapsed_time
            return fallback_feedback

        return FeedbackResponse(
            score=parsed_data.score,
            summary=parsed_data.summary,
            good_points=parsed_data.good_points,
            improvement_points=parsed_data.improvement_points,
            processing_time=elapsed_time
        )

    except Exception as e:
        elapsed_time = round(time.time() - start_time, 2)
        print(f"[Finish] Gemini API Error ({elapsed_time}s): {e}")
        fallback_feedback.processing_time = elapsed_time
        return fallback_feedback