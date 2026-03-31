# ============================================================
#  rag_engine.py  —  Digital-Vakeel RAG Legal Assistant
#  Uses FAISS + Groq LLM + HuggingFace Embeddings
#
#  LLM:        Groq (via OpenAI-compatible API)
#  Embeddings: HuggingFace all-MiniLM-L6-v2 (100% local, free)
#  Vector DB:  FAISS (local)
#
#  NO Gemini dependency!
# ============================================================

import os
import time
from openai import OpenAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

# ─────────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────────

VECTORSTORE_DIR = os.path.join(os.path.dirname(__file__), "vectorstore")

# Groq API — for LLM answer generation
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "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")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODEL = "llama-3.3-70b-versatile"  # powerful and free on Groq

# HuggingFace Embeddings — runs locally, no API key needed
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # small, fast, accurate

# System prompt that shapes the chatbot's personality
SYSTEM_PROMPT = """You are Digital-Vakeel AI, a specialized legal assistant for Indian MSMEs (Micro, Small and Medium Enterprises) dealing with delayed payment issues.

Your expertise covers:
- MSMED Act 2006 (Sections 15, 16, 17, 18, 19, 20, 21, 22)
- RBI bank rates and statutory interest calculations
- MSME Samadhaan portal filing process
- Legal remedies available to MSMEs for payment recovery
- Udyam Registration requirements
- Facilitation Council proceedings

RULES:
1. Always cite the specific Section of the MSMED Act when relevant
2. Provide practical, actionable advice
3. Use Indian Rupee (₹) for all monetary examples
4. When discussing interest rates, always mention: 3× RBI bank rate = 19.5% per annum (current)
5. Be empathetic — MSMEs are small business owners facing real hardship
6. If the question is not related to MSME payments or legal matters, politely redirect
7. Always recommend using Digital-Vakeel's automated tracking when relevant
8. Use simple language — avoid excessive legal jargon
9. Give specific step-by-step guidance when asked about processes
10. When you are not sure, say so — don't make up legal information"""


# ─────────────────────────────────────────────────────────────
#  RAG ENGINE CLASS
# ─────────────────────────────────────────────────────────────

class RAGEngine:
    """
    RAG engine for legal Q&A.
    
    Architecture:
    1. User asks a question
    2. HuggingFace embeddings convert question to vector (local)
    3. FAISS finds the top-4 most relevant text chunks (local)
    4. Groq LLM generates an answer using context + question (API)
    """

    def __init__(self):
        print("🔧 Initializing RAG engine...")

        # ── Groq LLM Client ──
        if not GROQ_API_KEY:
            raise ValueError(
                "Groq API key not set! Get one at https://console.groq.com "
                "and update GROQ_API_KEY in rag_engine.py"
            )

        self.groq_client = OpenAI(
            api_key=GROQ_API_KEY,
            base_url=GROQ_BASE_URL,
        )
        print(f"   ✅ Groq LLM loaded ({GROQ_MODEL})")

        # ── HuggingFace Embeddings (100% local, no API) ──
        self.embeddings = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        print(f"   ✅ HuggingFace embeddings loaded ({EMBEDDING_MODEL})")

        # ── FAISS Vector Store ──
        self.vectorstore = None
        if os.path.exists(VECTORSTORE_DIR):
            try:
                self.vectorstore = FAISS.load_local(
                    VECTORSTORE_DIR,
                    self.embeddings,
                    allow_dangerous_deserialization=True,
                )
                print(f"   ✅ Vector store loaded ({VECTORSTORE_DIR})")
            except Exception as e:
                print(f"   ❌ Failed to load vector store: {e}")
                print("      You may need to rebuild: python build_vectorstore.py")
        else:
            print(f"   ⚠️  Vector store not found at {VECTORSTORE_DIR}")
            print("      Run: python build_vectorstore.py")

    def _call_groq(self, system_prompt, user_prompt, max_retries=2):
        """Call Groq API with retry logic."""
        for attempt in range(max_retries + 1):
            try:
                response = self.groq_client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.3,
                    max_tokens=1024,
                )
                return response.choices[0].message.content
            except Exception as e:
                if ("429" in str(e) or "rate" in str(e).lower()) and attempt < max_retries:
                    wait = 10 * (attempt + 1)
                    print(f"   ⏳ Rate limited. Waiting {wait}s... (attempt {attempt+1}/{max_retries})")
                    time.sleep(wait)
                else:
                    raise

    def is_ready(self):
        """Check if engine is fully ready."""
        return self.vectorstore is not None

    def ask(self, question: str) -> dict:
        """Ask a legal question. Returns answer + sources."""
        if not self.vectorstore:
            return {
                "answer": "Knowledge base not loaded. Run build_vectorstore.py first.",
                "sources": [],
                "success": False,
            }

        try:
            # Step 1: Search FAISS for relevant chunks
            docs = self.vectorstore.similarity_search(question, k=4)

            # Step 2: Build context from retrieved chunks
            context_parts = []
            sources = []
            for doc in docs:
                context_parts.append(doc.page_content)
                source_name = os.path.basename(doc.metadata.get("source", "unknown"))
                snippet = doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content
                sources.append({"document": source_name, "snippet": snippet})

            context = "\n\n---\n\n".join(context_parts)

            # Step 3: Build prompt and call Groq
            user_prompt = f"""Here is relevant information from the legal knowledge base:

{context}

---

User's Question: {question}

Please provide a clear, helpful, and accurate answer based on the information above:"""

            # Step 4: Call Groq LLM
            answer = self._call_groq(SYSTEM_PROMPT, user_prompt)

            return {
                "answer": answer,
                "sources": sources,
                "success": True,
            }

        except Exception as e:
            error_msg = str(e)
            print(f"❌ RAG query error: {error_msg}")
            if "429" in error_msg or "rate" in error_msg.lower() or "quota" in error_msg.lower():
                return {
                    "answer": "⏳ The AI service is temporarily rate-limited. Please wait and try again.",
                    "sources": [],
                    "success": False,
                }
            return {
                "answer": "Sorry, I encountered an error. Please try again.",
                "sources": [],
                "success": False,
            }


# ─────────────────────────────────────────────────────────────
#  SUGGESTED QUESTIONS
# ─────────────────────────────────────────────────────────────

SUGGESTED_QUESTIONS = [
    "What's my right if a buyer delays payment beyond 90 days?",
    "Can I claim compound interest for delayed payment?",
    "What's the process to file on MSME Samadhaan?",
    "What is Section 16 of the MSMED Act?",
    "How is the interest rate calculated for delayed payments?",
    "Do I need Udyam Registration to claim my rights?",
]


# ─────────────────────────────────────────────────────────────
#  QUICK TEST
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 55)
    print("  Digital-Vakeel — RAG Engine Test (Groq)")
    print("=" * 55)

    engine = RAGEngine()
    if engine.is_ready():
        print("\n🧪 Testing...")
        result = engine.ask("What is Section 16 of the MSMED Act?")
        print(f"\n📝 Answer:\n{result['answer']}")
        print(f"\n📚 Sources: {len(result['sources'])}")
        for s in result["sources"]:
            print(f"   - {s['document']}")
    else:
        print("\n⚠️  Not ready. Run build_vectorstore.py first!")
