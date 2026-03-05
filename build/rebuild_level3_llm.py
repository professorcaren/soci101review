#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["anthropic"]
# ///
"""Rebuild level3_question_ids using Claude API to determine relevance.

For each question, asks Claude which concepts (plural) the question is relevant
to — not just the primary link, but any concept a student could practice by
answering the question. Rebuilds level3_question_ids from the results.

Usage:
    ANTHROPIC_API_KEY=sk-... uv run build/rebuild_level3_llm.py
"""

import json
import os
import re
import sys
import time

import anthropic

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
CONTENT_PATH = os.path.join(DATA_DIR, "content.json")
MAPPING_PATH = os.path.join(SCRIPT_DIR, "question_concept_mapping.json")

BATCH_SIZE = 10
RATE_LIMIT_DELAY = 0.5


def build_concept_list(concepts):
    lines = []
    for c in concepts:
        lines.append(f"- {c['id']}: {c['term']} — {c['definition']}")
    return "\n".join(lines)


def build_question_list(questions):
    lines = []
    for q in questions:
        choices_str = " | ".join(
            f"{'[CORRECT] ' if i == q['correct'] else ''}{ch}"
            for i, ch in enumerate(q["choices"])
        )
        lines.append(
            f"Q{q['id']}\n"
            f"  Question: {q['question']}\n"
            f"  Choices: {choices_str}"
        )
    return "\n\n".join(lines)


def query_batch(client, chapter_name, concepts, questions):
    """Ask Claude which concepts each question is relevant to."""
    concept_list = build_concept_list(concepts)
    question_list = build_question_list(questions)

    prompt = f"""You are helping build a study app for introductory sociology. For each question below, determine ALL concepts from the chapter that the question is relevant to — meaning a student who answers this question is practicing or demonstrating knowledge of that concept.

Include a concept if:
- The question primarily tests that concept
- The question requires understanding of that concept to answer correctly
- The question illustrates or applies that concept

Do NOT include a concept just because a related word appears in the text. The question must meaningfully engage with the concept.

Chapter: {chapter_name}

Concepts in this chapter:
{concept_list}

Questions:
{question_list}

For each question, respond with EXACTLY one line in this format:
Q<id>: <concept_id_1>, <concept_id_2>, ...

List the PRIMARY concept first, then any secondary concepts. If only one concept is relevant, list just that one.
Example:
Q123: ch07_t05, ch07_t12, ch07_t01
Q124: ch07_t12"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )

    results = {}
    text = response.content[0].text
    valid_ids = {c["id"] for c in concepts}

    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or not line.startswith("Q"):
            continue
        parts = line.split(":", 1)
        if len(parts) != 2:
            continue
        qid_str = parts[0].strip().lstrip("Q")
        try:
            qid = int(qid_str)
        except ValueError:
            continue
        concept_ids = [c.strip() for c in parts[1].split(",")]
        concept_ids = [c for c in concept_ids if c in valid_ids]
        if concept_ids:
            results[qid] = concept_ids

    return results


def main():
    client = anthropic.Anthropic()

    manifest_path = os.path.join(DATA_DIR, "chapters.json")
    with open(manifest_path) as f:
        manifest = json.load(f)

    # Full mapping: question_id -> [concept_ids]
    full_mapping = {}

    for ch_info in manifest:
        ch_path = os.path.join(DATA_DIR, f"{ch_info['id']}.json")
        with open(ch_path) as f:
            chapter = json.load(f)

        concepts = chapter["concepts"]
        questions = chapter["chapter_questions"]

        if not questions:
            print(f"{ch_info['id']} {ch_info['name']}: no questions, skipping")
            continue

        print(f"{ch_info['id']} {ch_info['name']}: mapping {len(questions)} questions...", end="", flush=True)

        chapter_mapping = {}
        for i in range(0, len(questions), BATCH_SIZE):
            batch = questions[i:i + BATCH_SIZE]
            results = query_batch(client, ch_info["name"], concepts, batch)
            chapter_mapping.update(results)
            print(".", end="", flush=True)

            if i + BATCH_SIZE < len(questions):
                time.sleep(RATE_LIMIT_DELAY)

        # Rebuild level3_question_ids
        for concept in chapter["concepts"]:
            concept["level3_question_ids"] = []

        concepts_by_id = {c["id"]: c for c in chapter["concepts"]}
        mapped = 0
        for q in questions:
            concept_ids = chapter_mapping.get(q["id"], [])
            if not concept_ids and q.get("linked_concept_id"):
                # Fallback to linked_concept_id if LLM didn't return anything
                concept_ids = [q["linked_concept_id"]]
            for cid in concept_ids:
                if cid in concepts_by_id:
                    concepts_by_id[cid]["level3_question_ids"].append(q["id"])
                    mapped += 1

        # Save mapping
        for qid, cids in chapter_mapping.items():
            full_mapping[str(qid)] = cids

        # Write per-chapter file
        with open(ch_path, "w") as f:
            json.dump(chapter, f, indent=2)

        zero = sum(1 for c in chapter["concepts"] if not c["level3_question_ids"])
        under3 = sum(1 for c in chapter["concepts"] if 0 < len(c["level3_question_ids"]) < 3)
        print(f" {mapped} links, {zero} at 0, {under3} under 3")

    # Save full mapping for reference
    with open(MAPPING_PATH, "w") as f:
        json.dump(full_mapping, f, indent=2)

    # Rebuild content.json
    with open(CONTENT_PATH) as f:
        content = json.load(f)

    for ch_info in manifest:
        ch_path = os.path.join(DATA_DIR, f"{ch_info['id']}.json")
        with open(ch_path) as f:
            chapter = json.load(f)
        for i, ch in enumerate(content["chapters"]):
            if ch["id"] == ch_info["id"]:
                content["chapters"][i] = chapter
                break

    with open(CONTENT_PATH, "w") as f:
        json.dump(content, f, indent=2)

    # Summary
    print("\n--- Summary ---")
    zero_concepts = []
    under3_concepts = []
    for ch in content["chapters"]:
        for c in ch["concepts"]:
            n = len(c["level3_question_ids"])
            if n == 0:
                zero_concepts.append((c["id"], c["term"]))
            elif n < 3:
                under3_concepts.append((c["id"], c["term"], n))

    print(f"Concepts with 0 questions: {len(zero_concepts)}")
    for cid, term in zero_concepts:
        print(f"  {cid} {term}")
    print(f"\nConcepts with 1-2 questions: {len(under3_concepts)}")
    for cid, term, n in under3_concepts:
        print(f"  {cid} {term} ({n})")
    print(f"\nMapping saved to {MAPPING_PATH}")


if __name__ == "__main__":
    main()
