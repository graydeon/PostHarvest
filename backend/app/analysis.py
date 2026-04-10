import json
import sqlite3
import numpy as np

# Lazy-load heavy models to avoid slow startup
_nlp = None
_sentiment_analyzer = None
_embedding_model = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


def _get_sentiment():
    global _sentiment_analyzer
    if _sentiment_analyzer is None:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        _sentiment_analyzer = SentimentIntensityAnalyzer()
    return _sentiment_analyzer


def _get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model


def extract_entities(text: str) -> list[dict]:
    """Extract named entities from text using spaCy.
    Returns list of {"text": "...", "label": "PERSON|ORG|PRODUCT|..."}
    """
    nlp = _get_nlp()
    doc = nlp(text[:10000])  # Cap input length
    seen = set()
    entities = []
    for ent in doc.ents:
        if ent.label_ in ("PERSON", "ORG", "PRODUCT", "GPE", "MONEY", "EVENT", "WORK_OF_ART"):
            key = (ent.text.strip(), ent.label_)
            if key not in seen and len(ent.text.strip()) > 1:
                seen.add(key)
                entities.append({"text": ent.text.strip(), "label": ent.label_})
    return entities


def analyze_sentiment(text: str) -> dict:
    """Analyze sentiment using VADER.
    Returns {"score": float (-1 to 1), "label": "positive"|"negative"|"neutral"}
    """
    analyzer = _get_sentiment()
    scores = analyzer.polarity_scores(text[:5000])
    compound = scores["compound"]
    if compound >= 0.05:
        label = "positive"
    elif compound <= -0.05:
        label = "negative"
    else:
        label = "neutral"
    return {"score": round(compound, 4), "label": label}


def generate_embedding(text: str) -> bytes:
    """Generate a 384-dim sentence embedding, returned as bytes for SQLite BLOB storage."""
    model = _get_embedding_model()
    vector = model.encode(text[:8000], show_progress_bar=False)
    return np.array(vector, dtype=np.float32).tobytes()


def find_similar_posts(post_id: int, db: sqlite3.Connection, top_n: int = 10) -> list[dict]:
    """Find the most similar posts by cosine similarity of embeddings.
    Returns list of {"post_id": int, "tweet_id": str, "author_handle": str,
                     "text": str, "similarity": float}
    """
    db.row_factory = sqlite3.Row

    # Get the target embedding
    row = db.execute("SELECT vector FROM embeddings WHERE post_id = ?", (post_id,)).fetchone()
    if not row:
        return []
    target = np.frombuffer(row["vector"], dtype=np.float32)

    # Get all other embeddings
    rows = db.execute(
        "SELECT e.post_id, e.vector, p.tweet_id, p.author_handle, p.text "
        "FROM embeddings e JOIN posts p ON e.post_id = p.id "
        "WHERE e.post_id != ?",
        (post_id,),
    ).fetchall()

    if not rows:
        return []

    results = []
    target_norm = np.linalg.norm(target)
    if target_norm == 0:
        return []

    for r in rows:
        vec = np.frombuffer(r["vector"], dtype=np.float32)
        vec_norm = np.linalg.norm(vec)
        if vec_norm == 0:
            continue
        similarity = float(np.dot(target, vec) / (target_norm * vec_norm))
        results.append({
            "post_id": r["post_id"],
            "tweet_id": r["tweet_id"],
            "author_handle": r["author_handle"],
            "text": r["text"][:200],
            "similarity": round(similarity, 4),
        })

    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:top_n]


def cluster_posts(db: sqlite3.Connection, n_clusters: int = 0) -> list[dict]:
    """Cluster all posts by embedding similarity using KMeans.
    If n_clusters is 0, auto-detect using sqrt(n/2) heuristic.
    Returns list of {"cluster": int, "posts": [{"post_id", "tweet_id", "author_handle", "text"}]}
    """
    from sklearn.cluster import KMeans

    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT e.post_id, e.vector, p.tweet_id, p.author_handle, p.text "
        "FROM embeddings e JOIN posts p ON e.post_id = p.id"
    ).fetchall()

    if len(rows) < 3:
        return []

    vectors = np.array([np.frombuffer(r["vector"], dtype=np.float32) for r in rows])

    if n_clusters == 0:
        n_clusters = max(2, min(int(len(rows) ** 0.5), 10))

    n_clusters = min(n_clusters, len(rows))
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = km.fit_predict(vectors)

    clusters = {}
    for i, r in enumerate(rows):
        c = int(labels[i])
        if c not in clusters:
            clusters[c] = []
        clusters[c].append({
            "post_id": r["post_id"],
            "tweet_id": r["tweet_id"],
            "author_handle": r["author_handle"],
            "text": r["text"][:200],
        })

    return [{"cluster": k, "posts": v} for k, v in sorted(clusters.items())]


def analyze_post(post_id: int, db: sqlite3.Connection):
    """Run full analysis on a post: sentiment, entities, embedding.
    Updates the database directly.
    """
    from app.database import get_thread_connection
    db = get_thread_connection()
    db.row_factory = sqlite3.Row
    row = db.execute("SELECT id, text FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not row or not row["text"]:
        return

    text = row["text"]

    # Sentiment
    sent = analyze_sentiment(text)
    db.execute(
        "UPDATE posts SET sentiment_score = ?, sentiment_label = ? WHERE id = ?",
        (sent["score"], sent["label"], post_id),
    )

    # Entities
    entities = extract_entities(text)
    for ent in entities:
        try:
            db.execute(
                "INSERT OR IGNORE INTO entities (post_id, text, label) VALUES (?, ?, ?)",
                (post_id, ent["text"], ent["label"]),
            )
        except sqlite3.IntegrityError:
            pass

    # Embedding
    vector = generate_embedding(text)
    db.execute(
        "INSERT OR REPLACE INTO embeddings (post_id, vector) VALUES (?, ?)",
        (post_id, vector),
    )

    db.commit()
