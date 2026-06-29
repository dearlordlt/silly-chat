"""Text embeddings via the Ollama OpenAI-compatible /embeddings endpoint.

Used for document RAG: chunks are embedded at ingest, queries at search time, and we
rank by cosine similarity. The embedding model is the admin-configurable ``embed`` role.
"""

from __future__ import annotations

import httpx
import numpy as np

from app.config import get_settings
from app.logging_setup import get_logger

log = get_logger("embeddings")


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Returns one vector per input (order preserved)."""
    if not texts:
        return []
    from app import runtime

    s = get_settings()
    base = s.ollama.base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{base}/embeddings",
            headers={"Authorization": f"Bearer {s.ollama_api_key}"},
            json={"model": runtime.model_for("embed"), "input": texts},
        )
        r.raise_for_status()
        data = r.json()["data"]
    return [item["embedding"] for item in data]


def pack(vec: list[float]) -> bytes:
    """Serialize a vector to bytes for storage (float32)."""
    return np.asarray(vec, dtype=np.float32).tobytes()


def rank(query_vec: list[float], rows: list[tuple[int, bytes]], top_k: int) -> list[int]:
    """Return the indices (first tuple element) of the top_k rows by cosine similarity."""
    if not rows:
        return []
    q = np.asarray(query_vec, dtype=np.float32)
    qn = q / (np.linalg.norm(q) + 1e-8)
    ids = [rid for rid, _ in rows]
    mat = np.stack([np.frombuffer(blob, dtype=np.float32) for _, blob in rows])
    mat = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-8)
    scores = mat @ qn
    order = np.argsort(-scores)[:top_k]
    return [ids[i] for i in order]
