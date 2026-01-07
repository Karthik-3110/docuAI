from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import Dict, List
from datetime import datetime
import hashlib
import os, io

import pdfplumber
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from groq import Groq

# =========================
# CONFIG
# =========================
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY missing")

MAX_CONTEXT_CHARS = 3000
MAX_CHUNKS = 3

# =========================
# APP
# =========================
app = FastAPI(title="DocuAI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# STORAGE
# =========================
sessions: Dict[str, Dict] = {}
LAST_SESSION_ID: str | None = None   # 🔥 AUTO SESSION FIX

embedder = SentenceTransformer("all-MiniLM-L6-v2")
llm = Groq(api_key=GROQ_API_KEY)

# =========================
# HELPERS
# =========================
def create_session_id() -> str:
    return hashlib.md5(str(datetime.now().timestamp()).encode()).hexdigest()[:12]


def ask_llm(prompt: str) -> str:
    try:
        res = llm.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a document-based assistant. "
                        "Answer ONLY using the document context. "
                        "If the answer is not present, say so clearly."
                    )
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,
            max_tokens=400
        )
        return res.choices[0].message.content.strip()
    except Exception as e:
        print("LLM Error:", e)
        return "I could not generate an answer."


def split_chunks(text: str, size: int = 800) -> List[str]:
    words = text.split()
    chunks, current, length = [], [], 0

    for w in words:
        if length + len(w) > size:
            chunks.append(" ".join(current))
            current = [w]
            length = len(w)
        else:
            current.append(w)
            length += len(w)

    if current:
        chunks.append(" ".join(current))

    return chunks


def index_text(session_id: str, text: str):
    chunks = split_chunks(text)
    index = faiss.IndexFlatL2(384)
    vectors = embedder.encode(chunks)
    index.add(np.array(vectors))

    sessions[session_id] = {
        "chunks": chunks,
        "index": index,
        "created_at": datetime.now().isoformat()
    }


def retrieve(session_id: str, question: str) -> str:
    session = sessions.get(session_id)
    if not session:
        return ""

    q_vec = embedder.encode([question])
    _, ids = session["index"].search(np.array(q_vec), MAX_CHUNKS)

    context = ""
    for i in ids[0]:
        if i < len(session["chunks"]):
            context += session["chunks"][i] + "\n\n"

    return context[:MAX_CONTEXT_CHARS]


# =========================
# UPLOAD
# =========================
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    global LAST_SESSION_ID

    text = ""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF supported")

    with pdfplumber.open(io.BytesIO(await file.read())) as pdf:
        for page in pdf.pages:
            if page.extract_text():
                text += page.extract_text() + "\n"

    if not text.strip():
        raise HTTPException(400, "No text extracted")

    session_id = create_session_id()
    index_text(session_id, text)

    LAST_SESSION_ID = session_id  # 🔥 remember last upload

    summary = ask_llm(
        "Summarize this document in 3–4 bullet points:\n\n" + text[:2500]
    )

    return {
        "session_id": session_id,
        "summary": summary
    }


# =========================
# ASK (AUTO SESSION FIX)
# =========================
@app.post("/ask")
async def ask(request: Request):
    global LAST_SESSION_ID

    body = {}
    try:
        body = await request.json()
    except:
        pass

    question = body.get("question") or request.query_params.get("question")
    session_id = body.get("session_id") or request.query_params.get("session_id")

    # 🔥 AUTO-ATTACH TO LAST SESSION
    if not session_id:
        session_id = LAST_SESSION_ID

    if not question:
        raise HTTPException(400, "Question is required")

    if not session_id or session_id not in sessions:
        return {
            "answer": "Please upload a document before asking questions."
        }

    context = retrieve(session_id, question)

    if not context:
        return {
            "answer": "I do not have enough information about that in the document."
        }

    prompt = f"""
DOCUMENT CONTEXT:
{context}

QUESTION:
{question}

Answer strictly from the document.
"""

    answer = ask_llm(prompt)

    return {
        "answer": answer,
        "session_id": session_id,
        "context_used": True
    }


# =========================
# HEALTH
# =========================
@app.get("/health")
def health():
    return {"status": "ok"}
