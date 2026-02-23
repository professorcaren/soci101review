#!/usr/bin/env python3
"""
Generate confusable_ids for each concept in content.json.

For each concept, finds the most semantically similar concepts within
the same chapter using TF-IDF cosine similarity on term + definition text.
"""

import json
import math
import re
from collections import Counter
from pathlib import Path

CONTENT_PATH = Path(__file__).parent.parent / "data" / "content.json"
MAX_CONFUSABLES = 4
MIN_SCORE = 0.05  # minimum similarity to be considered confusable

STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "out", "off", "over",
    "under", "again", "further", "then", "once", "and", "but", "or", "nor",
    "not", "so", "yet", "both", "either", "neither", "each", "every", "all",
    "any", "few", "more", "most", "other", "some", "such", "no", "only",
    "own", "same", "than", "too", "very", "just", "because", "if", "when",
    "while", "that", "which", "who", "whom", "this", "these", "those",
    "it", "its", "he", "she", "they", "them", "their", "we", "us", "our",
    "you", "your", "what", "how", "about", "up", "also", "one", "two",
}


def tokenize(text):
    words = re.findall(r"[a-z]+", text.lower())
    return [w for w in words if w not in STOP_WORDS and len(w) > 2]


def build_tfidf(docs):
    """Build TF-IDF vectors for a list of token lists."""
    # Document frequency
    df = Counter()
    for doc in docs:
        df.update(set(doc))
    n = len(docs)

    vectors = []
    for doc in docs:
        tf = Counter(doc)
        total = len(doc) if doc else 1
        vec = {}
        for word, count in tf.items():
            idf = math.log((n + 1) / (df[word] + 1)) + 1
            vec[word] = (count / total) * idf
        vectors.append(vec)
    return vectors


def cosine_sim(a, b):
    keys = set(a) & set(b)
    if not keys:
        return 0.0
    dot = sum(a[k] * b[k] for k in keys)
    mag_a = math.sqrt(sum(v * v for v in a.values()))
    mag_b = math.sqrt(sum(v * v for v in b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def generate_confusables(content):
    for chapter in content["chapters"]:
        concepts = chapter["concepts"]
        if len(concepts) < 2:
            for c in concepts:
                c["confusable_ids"] = []
            continue

        # Build text corpus from term + definition
        docs = []
        for c in concepts:
            text = c["term"] + " " + c["definition"]
            docs.append(tokenize(text))

        vectors = build_tfidf(docs)

        for i, concept in enumerate(concepts):
            scores = []
            for j, other in enumerate(concepts):
                if i == j:
                    continue
                sim = cosine_sim(vectors[i], vectors[j])
                if sim >= MIN_SCORE:
                    scores.append((sim, other["id"]))

            scores.sort(reverse=True)
            concept["confusable_ids"] = [cid for _, cid in scores[:MAX_CONFUSABLES]]


def main():
    with open(CONTENT_PATH) as f:
        content = json.load(f)

    generate_confusables(content)

    # Count results
    total = 0
    with_conf = 0
    for ch in content["chapters"]:
        for c in ch["concepts"]:
            total += 1
            if c.get("confusable_ids"):
                with_conf += 1

    with open(CONTENT_PATH, "w") as f:
        json.dump(content, f, indent=2)

    print(f"Generated confusables: {with_conf}/{total} concepts have confusable_ids")


if __name__ == "__main__":
    main()
