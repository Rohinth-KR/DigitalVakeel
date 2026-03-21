# ============================================================
#  rag_engine.py  —  Digital-Vakeel RAG Legal Assistant
#  Uses FAISS + Google Gemini for domain-specific
#  legal Q&A on MSMED Act, RBI guidelines, and MSME Samadhaan.
#
#  Simplified approach: manual retrieval + direct Gemini call
#  (avoids LangChain chain compatibility issues)
# ============================================================

import os
import time
import google.generativeai as genai
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS

# ─────────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────────

VECTORSTORE_DIR = os.path.join(os.path.dirname(__file__), "vectorstore")
API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyAB9DWdLgXQVcPgSUXj0m3vOnAhgZ6sUV4")

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
    
    Simple approach:
    1. User asks a question
    2. FAISS finds the top-4 most relevant text chunks
    3. Chunks are combined into a context string
    4. Google Gemini generates an answer using context + question
    """

    def __init__(self):
        print("🔧 Initializing RAG engine...")

        if not API_KEY:
            raise ValueError("Gemini API key not set!")

        # Configure Gemini — using 2.5-flash-lite (fresh quota)
        genai.configure(api_key=API_KEY)
        self.model = genai.GenerativeModel("gemini-2.5-flash-lite")
        print("   ✅ Gemini model loaded (gemini-2.5-flash-lite)")

        # Load embeddings
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=API_KEY,
        )
        print("   ✅ Embeddings model loaded")

        # Load FAISS vector store
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
        else:
            print(f"   ⚠️  Vector store not found at {VECTORSTORE_DIR}")
            print("      Run: python build_vectorstore.py")

    def _call_gemini_with_retry(self, prompt, max_retries=2):
        """Call Gemini with retry logic for rate limits."""
        for attempt in range(max_retries + 1):
            try:
                response = self.model.generate_content(prompt)
                return response.text
            except Exception as e:
                if ("429" in str(e) or "quota" in str(e).lower()) and attempt < max_retries:
                    wait = 10 * (attempt + 1)  # 10s, 20s
                    print(f"   ⏳ Rate limited. Waiting {wait}s... (attempt {attempt+1}/{max_retries})")
                    time.sleep(wait)
                else:
                    raise

    def is_ready(self):
        """Check if engine is fully ready."""
        return self.vectorstore is not None

    def ask(self, question: str) -> dict:
        """
        Ask a legal question. Returns answer + sources.
        """
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

            # Step 3: Build prompt with context + question
            prompt = f"""{SYSTEM_PROMPT}

Here is relevant information from the legal knowledge base:

{context}

---

User's Question: {question}

Please provide a clear, helpful, and accurate answer based on the information above:"""

            # Step 4: Call Gemini with retry for rate limits
            answer = self._call_gemini_with_retry(prompt)

            return {
                "answer": answer,
                "sources": sources,
                "success": True,
            }

        except Exception as e:
            error_msg = str(e)
            print(f"❌ RAG query error: {error_msg}")
            if "429" in error_msg or "quota" in error_msg.lower():
                return {
                    "answer": "⏳ The AI service is temporarily rate-limited. Please wait 30 seconds and try again. (Free tier quota)",
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
    print("  Digital-Vakeel — RAG Engine Test")
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
