from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Cyber Mystery Game API")

# React (http://localhost:5173) からの通信を許可する設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FlagSubmission(BaseModel):
    level: str   # "beginner" または "advanced"
    stage_id: int
    answer: str

# サンプル用の正解データ（後でPostgreSQLやdocsのデータに置き換え可能）
SAMPLE_ANSWERS = {
    ("beginner", 1): "phishing@fake-support.com",
    ("advanced", 1): "FLAG{sql_injection_detected}",
}

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Cyber Mystery Backend is running!"}

@app.post("/api/verify")
def verify_flag(submission: FlagSubmission):
    correct_answer = SAMPLE_ANSWERS.get((submission.level, submission.stage_id))
    is_correct = (submission.answer.strip() == correct_answer)
    return {
        "correct": is_correct,
        "message": "Access Granted! 捜査が進展しました。" if is_correct else "Access Denied... 証拠をもう一度確認してください。"
    }