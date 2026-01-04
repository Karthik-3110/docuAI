from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os, io

import pdfplumber
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from groq import Groq

# OPTIONAL OCR
try:
    from PIL import Image
    import pytesseract
    OCR_AVAILABLE = True
except Exception:
    OCR_AVAILABLE = False

# CONFIG
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY missing")

MAX_CONTEXT_CHARS = 3000   # 🔒 TOKEN SAFETY
MAX_CHUNKS = 3

app = FastAPI(title="DocuAI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "ocr_available": OCR_AVAILABLE
    }

# AI + VECTOR STORE
embedder = SentenceTransformer("all-MiniLM-L6-v2")
index = faiss.IndexFlatL2(384)
chunks_store = []

llm = Groq(api_key=GROQ_API_KEY)

# HELPERS
def ask_llm(prompt: str) -> str:
    try:
        res = llm.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=400
        )
        return res.choices[0].message.content
    except Exception as e:
        return "⚠️ The document is too large to answer this question. Please ask a more specific question."

def split_chunks(text: str, size: int = 800):
    return [text[i:i+size] for i in range(0, len(text), size)]

def index_text(text: str):
    chunks = split_chunks(text)
    vectors = embedder.encode(chunks)
    index.add(np.array(vectors))
    chunks_store.extend(chunks)

def retrieve(question: str):
    q_vec = embedder.encode([question])
    _, ids = index.search(np.array(q_vec), MAX_CHUNKS)

    context = ""
    for i in ids[0]:
        context += chunks_store[i] + "\n"

    return context[:MAX_CONTEXT_CHARS] 


# UPLOAD
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    filename = file.filename.lower()
    text = ""

    # PDF
    if filename.endswith(".pdf"):
        with pdfplumber.open(file.file) as pdf:
            for page in pdf.pages:
                if page.extract_text():
                    text += page.extract_text()

    # TEXT
    elif filename.endswith(".txt"):
        text = (await file.read()).decode("utf-8")

    # IMAGE
    elif filename.endswith((".png", ".jpg", ".jpeg")):
        if not OCR_AVAILABLE:
            raise HTTPException(status_code=400, detail="OCR not available")
        image = Image.open(io.BytesIO(await file.read()))
        text = pytesseract.image_to_string(image)

    else:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text extracted")

    index_text(text)

    summary = ask_llm(
        f"Summarize this document briefly:\n{text[:2000]}"
    )

    return {"summary": summary}

# CHAT (RAG)
@app.post("/ask")
def ask(question: str):
    if not chunks_store:
        raise HTTPException(status_code=400, detail="Upload a document first")

    context = retrieve(question)

    prompt = f"""
Answer ONLY from the document below.
If not found, say "Not found in document".

DOCUMENT:
{context}

QUESTION:
{question}

ANSWER:
"""

    return {"answer": ask_llm(prompt)}
