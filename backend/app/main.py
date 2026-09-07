from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

@app.get("/")
def read_root():
    return {"status": "ok", "message": "FastAPI サーバーが正常に起動しています"}