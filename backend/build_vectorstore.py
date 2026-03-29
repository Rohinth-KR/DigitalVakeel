# ============================================================
#  build_vectorstore.py  —  One-Time Knowledge Base Indexer
#  Run this ONCE to build the FAISS vector store from legal docs.
#
#  Usage:
#    python build_vectorstore.py
#
#  Uses HuggingFace embeddings (100% local, no API key needed)
#  NO Gemini dependency!
# ============================================================

import os
import sys
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

# ─────────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────────

KNOWLEDGE_DIR   = os.path.join(os.path.dirname(__file__), "knowledge_base")
VECTORSTORE_DIR = os.path.join(os.path.dirname(__file__), "vectorstore")

# Same embedding model as rag_engine.py — MUST match!
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Chunking parameters
CHUNK_SIZE    = 1000
CHUNK_OVERLAP = 200


def build_vectorstore():
    """Build the FAISS vector store using local HuggingFace embeddings."""

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
    print("  (Using HuggingFace local embeddings)")
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
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = text_splitter.split_documents(documents)
    print(f"   Total chunks created: {len(chunks)}")

    if chunks:
        print(f"\n   📝 Sample chunk (first 200 chars):")
        print(f"   \"{chunks[0].page_content[:200]}...\"")

    # ── Step 4: Generate embeddings & build FAISS index ──
    print(f"\n🧠 Generating embeddings with HuggingFace ({EMBEDDING_MODEL})...")
    print(f"   This runs locally — no API calls needed!")

    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
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
    print(f"  🚀 You can now start the Flask server!")
    print(f"{'=' * 55}")


if __name__ == "__main__":
    build_vectorstore()
