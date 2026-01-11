from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os, io
import pdfplumber
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from groq import Groq

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY missing")

app = FastAPI(title="ReadLess Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# GLOBAL MEMORY (ChatGPT style)
document_chunks = []
faiss_index = None
chat_history = []

MAX_CHUNKS = 3
MAX_CONTEXT_CHARS = 3000

embedder = SentenceTransformer("all-MiniLM-L6-v2")
llm = Groq(api_key=GROQ_API_KEY)

# Ask AI
def ask_llm(messages):
    res = llm.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.0,
        max_tokens=400
    )
    return res.choices[0].message.content.strip()

# Split document into chunks
def split_chunks(text, size=800):
    words = text.split()
    chunks, current = [], []
    length = 0

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

# Upload PDF
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    global document_chunks, faiss_index, chat_history

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF supported")

    text = ""
    with pdfplumber.open(io.BytesIO(await file.read())) as pdf:
        for page in pdf.pages:
            if page.extract_text():
                text += page.extract_text() + "\n"

    if not text.strip():
        raise HTTPException(400, "No text extracted")

    # Reset memory for new document
    chat_history = []

    # Split and embed
    document_chunks = split_chunks(text)
    vectors = embedder.encode(document_chunks)

    faiss_index = faiss.IndexFlatL2(384)
    faiss_index.add(np.array(vectors))

    # Create summary
    summary_prompt = [
        {"role": "system", "content": "Summarize this document in 3–4 bullet points."},
        {"role": "user", "content": text[:2500]}
    ]

    summary = ask_llm(summary_prompt)

    return {"summary": summary}

# Retrieve relevant document text
def retrieve(question):
    if not faiss_index:
        return ""

    q_vec = embedder.encode([question])
    _, ids = faiss_index.search(np.array(q_vec), MAX_CHUNKS)

    context = ""
    for i in ids[0]:
        if i < len(document_chunks):
            context += document_chunks[i] + "\n\n"

    return context[:MAX_CONTEXT_CHARS]

# Ask Question
@app.post("/ask")
async def ask(request: Request):
    global chat_history

    body = {}
    try:
        body = await request.json()
    except:
        pass

    question = body.get("question") or request.query_params.get("question")
    if not question:
        raise HTTPException(400, "Question required")

    if not faiss_index:
        return {"answer": "Please upload a document first."}

    context = retrieve(question)

    if not context:
        return {"answer": "Not found in document."}

    system_message = {
        "role": "system",
        "content": (
            "You are ReadLess, a document analysis AI. "
            "Answer ONLY from the given document. "
            "If not found, say 'Not found in document'."
        )
    }

    prompt = {
        "role": "user",
        "content": f"""
DOCUMENT:
{context}

QUESTION:
{question}

Answer strictly from the document.
"""
    }

    messages = [system_message] + chat_history + [prompt]

    answer = ask_llm(messages)

    # Save conversation
    chat_history.append({"role": "user", "content": question})
    chat_history.append({"role": "assistant", "content": answer})

    return {"answer": answer}

# Health
@app.get("/health")
def health():
    return {"status": "ok"}
