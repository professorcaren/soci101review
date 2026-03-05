#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["anthropic"]
# ///
"""Drop 4 concepts and generate L3 questions for 6 concepts with zero coverage.

Drops: ch01_t19 (Structural), ch04_t19 (Embodied Status),
       ch10_t13 (Religiosity), ch11_t02 (education)

Generates 3 L3 questions each for:
  ch03_t03 (Material Culture), ch05_t23 (Expert Power),
  ch08_t20 (Assimilation), ch14_t14 (Reinforcement Theory),
  ch14_t17 (Two-Step Flow Model), ch14_t21 (Interpretive Community)

Usage:
    ANTHROPIC_API_KEY=sk-... uv run build/triage_zero_concepts.py
"""

import json
import os
import time

import anthropic

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
CONTENT_PATH = os.path.join(DATA_DIR, "content.json")

DROP_IDS = {"ch01_t19", "ch04_t19", "ch10_t13", "ch11_t02"}

GENERATE_IDS = ["ch03_t03", "ch05_t23", "ch08_t20", "ch14_t14", "ch14_t17", "ch14_t21"]

START_ID = 1503  # next available question ID


def find_max_id(content):
    max_id = 0
    for ch in content["chapters"]:
        for q in ch["chapter_questions"]:
            if q["id"] > max_id:
                max_id = q["id"]
    return max_id


def drop_concepts(content):
    """Remove concepts and their question references."""
    dropped = 0
    for ch in content["chapters"]:
        before = len(ch["concepts"])
        ch["concepts"] = [c for c in ch["concepts"] if c["id"] not in DROP_IDS]
        dropped += before - len(ch["concepts"])
    print(f"Dropped {dropped} concepts: {', '.join(sorted(DROP_IDS))}")
    return content


def generate_questions(client, concept, chapter_name):
    """Generate 3 L3 questions for a concept using Haiku."""
    prompt = f"""Generate exactly 3 multiple-choice application/analysis questions for an introductory sociology course.

Concept: {concept['term']}
Definition: {concept['definition']}
Chapter: {chapter_name}

Requirements:
- Each question must test APPLICATION, not recall (use realistic scenarios)
- Each question must have exactly 4 options
- Exactly one correct answer
- Distractors should be plausible but clearly wrong
- Vary the position of the correct answer

Return ONLY valid JSON — an array of 3 objects, each with:
  "question": string,
  "choices": [string, string, string, string],
  "correct": integer (0-3, index of correct answer)

Example format:
[
  {{
    "question": "A researcher observes X. This best illustrates...",
    "choices": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 2
  }}
]"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text
    # Extract JSON from response
    start = text.index("[")
    end = text.rindex("]") + 1
    return json.loads(text[start:end])


def main():
    client = anthropic.Anthropic()

    with open(CONTENT_PATH) as f:
        content = json.load(f)

    # Phase 1: Drop concepts
    content = drop_concepts(content)

    # Phase 2: Generate questions
    next_id = max(find_max_id(content), START_ID - 1) + 1

    # Build lookup
    concept_map = {}
    for ch in content["chapters"]:
        for c in ch["concepts"]:
            concept_map[c["id"]] = (c, ch)

    for cid in GENERATE_IDS:
        if cid not in concept_map:
            print(f"  WARNING: {cid} not found, skipping")
            continue

        concept, chapter = concept_map[cid]
        print(f"  Generating for {cid} ({concept['term']}) in {chapter['name']}...", end="", flush=True)

        try:
            questions = generate_questions(client, concept, chapter["name"])
        except Exception as e:
            print(f" ERROR: {e}")
            continue

        new_ids = []
        for q_data in questions:
            q_obj = {
                "id": next_id,
                "question": q_data["question"],
                "choices": q_data["choices"],
                "correct": q_data["correct"],
                "linked_concept_id": cid,
            }
            chapter["chapter_questions"].append(q_obj)
            new_ids.append(next_id)
            next_id += 1

        concept["level3_question_ids"] = new_ids
        print(f" IDs {new_ids}")
        time.sleep(0.5)

    # Write per-chapter files
    manifest_path = os.path.join(DATA_DIR, "chapters.json")
    with open(manifest_path) as f:
        manifest = json.load(f)

    chapters_by_id = {ch["id"]: ch for ch in content["chapters"]}
    for ch_info in manifest:
        ch = chapters_by_id.get(ch_info["id"])
        if ch:
            ch_path = os.path.join(DATA_DIR, f"{ch_info['id']}.json")
            with open(ch_path, "w") as f:
                json.dump(ch, f, indent=2)

    # Write content.json
    with open(CONTENT_PATH, "w") as f:
        json.dump(content, f, indent=2)

    print(f"\nDone. Next available ID: {next_id}")


if __name__ == "__main__":
    main()
