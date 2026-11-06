from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI(title="AI Interview App API")

# Gemini API クライアント初期化
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
    reply: str
    next_question: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "FastAPI サーバーが正常に起動しています"}

@app.post("/api/interview/answer", response_model=AnswerResponse)
def process_answer(request: AnswerRequest):
    if not client:
        print("Warning: GEMINI_API_KEY が設定されていないためモック応答を返します。")
        return AnswerResponse(
            reply="（APIキー未設定）回答を受け取りました。結論から明確に話せており素晴らしいです！",
            next_question="これまでにチームで最も困難を乗り越えた経験について教えてください。"
        )

    prompt = f"""
あなたはIT企業のベテラン採用面接官です。
応募者の回答を評価し、適切なフィードバックと関連する「次の質問」を生成してください。

【現在の質問】
{request.question}

【応募者の回答】
{request.answer}

必ず以下のJSONフォーマットのみを出力してください。余計な解説やMarkdownの装飾は含めないでください。
{{
  "reply": "応募者へのフィードバック文",
  "next_question": "次に投げかける面接の質問文"
}}
"""

    # 試行するモデルの候補リスト（混雑時は自動で次のモデルを試す）
    candidate_models = [
        'gemini-3.8-flash',
        'gemini-3.5-flash',
        'gemini-flash-latest',
    ]

    for model_name in candidate_models:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction="あなたは実践的で建設的なアドバイスを行うAI面接官です。",
                    response_mime_type="application/json",
                ),
            )

            data = json.loads(response.text)
            return AnswerResponse(
                reply=data.get("reply", "回答を受け取りました。"),
                next_question=data.get("next_question", "次の質問を用意しています。")
            )

        except Exception as e:
            print(f"Model {model_name} failed with error: {e}")
            # 503 などの場合は次のモデルを試行
            continue

    # すべてのモデルでエラーが発生した場合のフォールバック
    return AnswerResponse(
        reply="現在サーバーが混雑しています。回答を受け取りましたので、続けて次の質問にお答えください。",
        next_question="これまでの開発経験で一番こだわったポイントは何ですか？"
    )