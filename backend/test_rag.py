"""Test the RAG engine and show full error details."""
import traceback
from rag_engine import RAGEngine

print("=" * 50)
print("  RAG Engine Debug Test")
print("=" * 50)

try:
    engine = RAGEngine()
    print(f"\nReady: {engine.is_ready()}")
    
    if engine.is_ready():
        print("\nAsking: 'Can I claim compound interest?'")
        try:
            # Manual test to see the exact error
            docs = engine.vectorstore.similarity_search("Can I claim compound interest?", k=2)
            print(f"  FAISS search OK — found {len(docs)} docs")
            
            context = "\n\n".join([d.page_content[:100] for d in docs])
            print(f"  Context preview: {context[:150]}...")
            
            # Test Gemini call
            response = engine.model.generate_content("Say hello in one word")
            print(f"  Gemini test OK — response: {response.text}")
            
            # Now test full ask()
            result = engine.ask("Can I claim compound interest?")
            print(f"\n  Success: {result['success']}")
            print(f"  Answer: {result['answer'][:300]}")
        except Exception as e:
            print(f"\n  ERROR: {type(e).__name__}: {e}")
            traceback.print_exc()

except Exception as e:
    print(f"\nInit ERROR: {type(e).__name__}: {e}")
    traceback.print_exc()
