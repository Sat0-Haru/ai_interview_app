from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
import time
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

class AnswerRequest(BaseModel):
    question: str
    answer: str

class AnswerResponse(BaseModel):
    next_question: str
    processing_time: float

class ResetResponse(BaseModel):
    initial_question: str

# 初期質問
INITIAL_QUESTION = "面接官：簡単に自己紹介をお願いします。"

@app.get("/")
def read_root():
    return {"status": "ok", "message": "FastAPI サーバーが正常に起動しています"}

# 💡 面接初期化エンドポイント
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

必ず以下のJSONフォーマットのみを出力してください。
{{
  "next_question": "次の質問文"
}}
"""

    try:
        response = await client.aio.models.generate_content(
            model='gemini-3.5-flash-lite',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="あなたは面接官です。簡潔に次の質問文のみを出力してください。",
                response_mime_type="application/json",
                temperature=0.7,
            ),
        )

        elapsed_time = round(time.time() - start_time, 2)
        print(f"Gemini 3.5 Flash-Lite Response Time: {elapsed_time}s")

        data = json.loads(response.text)
        return AnswerResponse(
            next_question=data.get("next_question", "これまでにチームで最も困難を乗り越えた経験について教えてください。"),
            processing_time=elapsed_time
        )

    except Exception as e:
        elapsed_time = round(time.time() - start_time, 2)
        print(f"Gemini API Error ({elapsed_time}s): {e}")
        return AnswerResponse(
            next_question="これまでに直面した技術的な課題と、それをどのように克服したか教えてください。",
            processing_time=elapsed_time
        )