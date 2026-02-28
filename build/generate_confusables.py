#!/usr/bin/env python3
"""Generate confusable concept IDs based on definition similarity.

For each concept, computes Jaccard similarity of definition words against
all other concepts in the same chapter. Also boosts similarity for terms
that share words. Stores top 5 confusable concept IDs on each concept
in content.json.
"""

import json
import os
import re
import string

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CONTENT_PATH = os.path.join(PROJECT_ROOT, "data/content.json")

STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "that", "which",
    "who", "whom", "this", "these", "those", "it", "its", "as", "if",
    "when", "than", "because", "while", "where", "how", "not", "no",
    "so", "up", "out", "about", "into", "over", "after", "between",
    "through", "during", "before", "above", "below", "each", "every",
    "both", "few", "more", "most", "other", "some", "such", "only",
    "same", "also", "then", "just", "any", "all", "very", "often",
    "their", "they", "them", "what",
}


def tokenize(text):
    """Lowercase, remove punctuation, split into word set minus stop words."""
    text = text.lower()
    text = text.translate(str.maketrans("", "", string.punctuation))
    words = set(text.split()) - STOP_WORDS
    return words


def jaccard(set_a, set_b):
    """Jaccard similarity between two sets."""
    if not set_a and not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) if union else 0.0


def term_word_overlap(term_a, term_b):
    """Bonus for terms sharing words (e.g., 'Primary Deviance' / 'Secondary Deviance')."""
    words_a = set(term_a.lower().split())
    words_b = set(term_b.lower().split())
    shared = words_a & words_b
    if not shared:
        return 0.0
    # Bonus proportional to overlap
    return len(shared) / max(len(words_a), len(words_b))


def compute_confusables(concepts, top_n=5):
    """For each concept, find the top_n most confusable other concepts."""
    # Pre-tokenize definitions
    def_tokens = {c["id"]: tokenize(c["definition"]) for c in concepts}

    confusable_map = {}
    for concept in concepts:
        scores = []
        for other in concepts:
            if other["id"] == concept["id"]:
                continue
            def_sim = jaccard(def_tokens[concept["id"]], def_tokens[other["id"]])
            term_bonus = term_word_overlap(concept["term"], other["term"]) * 0.3
            score = def_sim + term_bonus
            scores.append((other["id"], score))

        scores.sort(key=lambda x: x[1], reverse=True)
        confusable_map[concept["id"]] = [cid for cid, s in scores[:top_n] if s > 0]

    return confusable_map


def main():
    with open(CONTENT_PATH) as f:
        content = json.load(f)

    total_added = 0
    for chapter in content["chapters"]:
        concepts = chapter["concepts"]
        if len(concepts) < 2:
            for c in concepts:
                c["confusable_ids"] = []
            continue

        confusable_map = compute_confusables(concepts)
        for concept in concepts:
            concept["confusable_ids"] = confusable_map.get(concept["id"], [])
            total_added += len(concept["confusable_ids"])

    with open(CONTENT_PATH, "w") as f:
        json.dump(content, f, indent=2)

    # Update per-chapter files
    data_dir = os.path.dirname(CONTENT_PATH)
    for chapter in content["chapters"]:
        ch_path = os.path.join(data_dir, f"{chapter['id']}.json")
        with open(ch_path, "w") as f:
            json.dump(chapter, f, indent=2)

    # Summary
    total_concepts = sum(len(ch["concepts"]) for ch in content["chapters"])
    with_confusables = sum(
        1 for ch in content["chapters"]
        for c in ch["concepts"]
        if c.get("confusable_ids")
    )
    print(f"Generated confusables for {total_concepts} concepts:")
    print(f"  {with_confusables} concepts have confusable terms")
    print(f"  {total_added} total confusable links")
    for ch in content["chapters"]:
        avg = (
            sum(len(c["confusable_ids"]) for c in ch["concepts"]) / len(ch["concepts"])
            if ch["concepts"]
            else 0
        )
        print(f"  {ch['id']} {ch['name']}: avg {avg:.1f} confusables per concept")


if __name__ == "__main__":
    main()
