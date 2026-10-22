from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os

# .env ファイルの読み込み
load_dotenv()

app = FastAPI(title="AI Interview App API")

# フロントエンド(Next.js)からのアクセスを許可する設定(CORS)
origins = [
    "http://localhost:3000",  # Next.js の開発用アドレス
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# フロントエンドから送られてくるリクエストデータの型
class AnswerRequest(BaseModel):
    question: str
    answer: str

# バックエンドから返却するレスポンスデータの型
class AnswerResponse(BaseModel):
    reply: str
    next_question: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "FastAPI サーバーが正常に起動しています"}

# 面接の回答を受け取り、フィードバックと次の質問を返すエンドポイント
@app.post("/api/interview/answer", response_model=AnswerResponse)
def process_answer(request: AnswerRequest):
    """
    ユーザーの回答を受け取り、フィードバックと次の質問を返すエンドポイント
    (現在はロジック検証用のモック応答を返します)
    """
    print(f"受け取った質問: {request.question}")
    print(f"受け取った回答: {request.answer}")

    # 仮のロジック（後ほどここにOpenAI API等のLLM呼び出し処理を入れます）
    mock_feedback = (
        f"「{request.answer[:20]}...」という回答ですね。"
        "結論から明確に話せており、素晴らしいです！具体的な数字や実績を少し加えるとさらに良くなります。"
    )
    
    mock_next_question = "これまでにチームで最も困難を乗り越えた経験について教えてください。"

    return AnswerResponse(
        reply=mock_feedback,
        next_question=mock_next_question
    )