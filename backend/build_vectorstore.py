# ============================================================
#  build_vectorstore.py  —  One-Time Knowledge Base Indexer
#  Run this ONCE to build the FAISS vector store from legal docs.
#
#  Usage:
#    set GEMINI_API_KEY=your-api-key-here
#    python build_vectorstore.py
#
#  This reads all .txt files from knowledge_base/ folder,
#  splits them into chunks, generates embeddings via Gemini,
#  and saves the FAISS index to vectorstore/ folder.
# ============================================================

import os
import sys
from langchain_community.document_loaders import TextLoader, DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS

# ─────────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────────

KNOWLEDGE_DIR   = os.path.join(os.path.dirname(__file__), "knowledge_base")
VECTORSTORE_DIR = os.path.join(os.path.dirname(__file__), "vectorstore")

# Chunking parameters — tuned for legal documents
CHUNK_SIZE    = 1000    # characters per chunk
CHUNK_OVERLAP = 200     # overlap between chunks (helps maintain context)


def build_vectorstore():
    """
    Main function to build the FAISS vector store.
    
    Process:
    1. Load all .txt files from knowledge_base/
    2. Split documents into overlapping chunks
    3. Generate embeddings using Google Gemini
    4. Store vectors in FAISS index
    5. Save index to disk for reuse
    """
    
    # ── Step 0: Check API key ──
    api_key = os.environ.get("GEMINI_API_KEY", "AIzaSyAB9DWdLgXQVcPgSUXj0m3vOnAhgZ6sUV4")
    if not api_key:
        print("❌ ERROR: GEMINI_API_KEY environment variable is not set!")
        print("")
        print("   To fix this:")
        print("   1. Get a free API key at: https://aistudio.google.com/apikeys")
        print("   2. Set it:")
        print("      Windows:  set GEMINI_API_KEY=your-key-here")
        print("      Linux:    export GEMINI_API_KEY=your-key-here")
        print("   3. Run this script again")
        sys.exit(1)

    # ── Step 1: Check knowledge_base folder ──
    if not os.path.exists(KNOWLEDGE_DIR):
        print(f"❌ ERROR: Knowledge base folder not found at {KNOWLEDGE_DIR}")
        sys.exit(1)

    txt_files = [f for f in os.listdir(KNOWLEDGE_DIR) if f.endswith(".txt")]
    if not txt_files:
        print(f"❌ ERROR: No .txt files found in {KNOWLEDGE_DIR}")
        sys.exit(1)

    print("=" * 55)
    print("  Digital-Vakeel — Building Vector Store")
    print("=" * 55)
    print(f"\n📁 Knowledge base: {KNOWLEDGE_DIR}")
    print(f"📄 Files found: {len(txt_files)}")
    for f in txt_files:
        size = os.path.getsize(os.path.join(KNOWLEDGE_DIR, f))
        print(f"   - {f} ({size:,} bytes)")

    # ── Step 2: Load documents ──
    print(f"\n📖 Loading documents...")
    
    documents = []
    for filename in txt_files:
        filepath = os.path.join(KNOWLEDGE_DIR, filename)
        try:
            loader = TextLoader(filepath, encoding="utf-8")
            docs = loader.load()
            documents.extend(docs)
            print(f"   ✅ Loaded: {filename} ({len(docs)} document(s))")
        except Exception as e:
            print(f"   ❌ Failed to load {filename}: {e}")

    if not documents:
        print("❌ No documents loaded. Check file encoding (must be UTF-8).")
        sys.exit(1)

    print(f"\n   Total documents loaded: {len(documents)}")

    # ── Step 3: Split into chunks ──
    print(f"\n✂️  Splitting into chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})...")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],  # split at natural boundaries
    )

    chunks = text_splitter.split_documents(documents)
    print(f"   Total chunks created: {len(chunks)}")

    # Show sample chunk
    if chunks:
        print(f"\n   📝 Sample chunk (first 200 chars):")
        print(f"   \"{chunks[0].page_content[:200]}...\"")

    # ── Step 4: Generate embeddings & build FAISS index ──
    print(f"\n🧠 Generating embeddings with Google Gemini...")
    print(f"   This may take a minute...")

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=api_key,
    )

    vectorstore = FAISS.from_documents(chunks, embeddings)
    print(f"   ✅ FAISS index built with {len(chunks)} vectors")

    # ── Step 5: Save to disk ──
    print(f"\n💾 Saving vector store to {VECTORSTORE_DIR}...")
    
    os.makedirs(VECTORSTORE_DIR, exist_ok=True)
    vectorstore.save_local(VECTORSTORE_DIR)

    print(f"   ✅ Saved successfully!")

    # ── Step 6: Verify ──
    print(f"\n🔍 Verifying vector store...")
    
    test_store = FAISS.load_local(
        VECTORSTORE_DIR,
        embeddings,
        allow_dangerous_deserialization=True,
    )
    test_results = test_store.similarity_search("What is Section 16?", k=2)
    
    print(f"   ✅ Verification passed! Test query returned {len(test_results)} results")
    print(f"\n   Test query: 'What is Section 16?'")
    for i, doc in enumerate(test_results):
        source = os.path.basename(doc.metadata.get("source", "unknown"))
        print(f"   Result {i+1} ({source}): \"{doc.page_content[:100]}...\"")

    print(f"\n{'=' * 55}")
    print(f"  ✅ Vector store built successfully!")
    print(f"  📊 {len(chunks)} chunks indexed from {len(txt_files)} documents")
    print(f"  📁 Saved to: {VECTORSTORE_DIR}")
    print(f"  🚀 You can now start the Flask server with RAG enabled!")
    print(f"{'=' * 55}")


if __name__ == "__main__":
    build_vectorstore()
