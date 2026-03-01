#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["anthropic"]
# ///
"""Audit linked_concept_id values across all chapters using Claude API.

Sends batches of questions to Claude, asking which concept each question
primarily tests. Outputs mismatches as audit_report.json and audit_report.md.

Usage:
    ANTHROPIC_API_KEY=sk-... uv run build/audit_question_links.py
"""

import json
import os
import sys
import time

import anthropic

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

REPORT_JSON = os.path.join(SCRIPT_DIR, "audit_report.json")
REPORT_MD = os.path.join(SCRIPT_DIR, "audit_report.md")

BATCH_SIZE = 15  # questions per API call
RATE_LIMIT_DELAY = 1.0  # seconds between API calls


def load_chapter(chapter_id):
    path = os.path.join(DATA_DIR, f"{chapter_id}.json")
    with open(path) as f:
        return json.load(f)


def build_concept_list(concepts):
    """Format concepts for the prompt."""
    lines = []
    for c in concepts:
        lines.append(f"- {c['id']}: {c['term']} — {c['definition']}")
    return "\n".join(lines)


def build_question_list(questions, concepts_by_id):
    """Format a batch of questions for the prompt."""
    lines = []
    for q in questions:
        choices_str = " | ".join(
            f"{'[CORRECT] ' if i == q['correct'] else ''}{ch}"
            for i, ch in enumerate(q["choices"])
        )
        current = q["linked_concept_id"] or "none"
        current_term = concepts_by_id[current]["term"] if current in concepts_by_id else "none"
        lines.append(
            f"Q{q['id']} (currently: {current} = {current_term})\n"
            f"  Question: {q['question']}\n"
            f"  Choices: {choices_str}"
        )
    return "\n\n".join(lines)


def audit_batch(client, chapter_name, concepts, questions, concepts_by_id):
    """Send a batch of questions to Claude for audit. Returns list of (qid, suggested_id)."""
    concept_list = build_concept_list(concepts)
    question_list = build_question_list(questions, concepts_by_id)

    prompt = f"""You are auditing a sociology exam review app. For each question below, determine which concept from the chapter it PRIMARILY tests.

Chapter: {chapter_name}

Concepts in this chapter:
{concept_list}

Questions to audit:
{question_list}

For each question, respond with EXACTLY one line in this format:
Q<id>: <concept_id>

Only output the question ID and concept ID, nothing else. If a question doesn't clearly match any concept, use "none".
Example:
Q123: ch07_t05
Q124: ch07_t12
Q125: none"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    results = []
    text = response.content[0].text
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or not line.startswith("Q"):
            continue
        parts = line.split(":", 1)
        if len(parts) != 2:
            continue
        qid_str = parts[0].strip().lstrip("Q")
        suggested = parts[1].strip()
        try:
            qid = int(qid_str)
        except ValueError:
            continue
        results.append((qid, suggested if suggested != "none" else None))

    return results


def main():
    client = anthropic.Anthropic()

    # Load chapter manifest
    manifest_path = os.path.join(DATA_DIR, "chapters.json")
    with open(manifest_path) as f:
        manifest = json.load(f)

    mismatches = []
    total_audited = 0
    total_mismatched = 0

    for ch_info in manifest:
        chapter = load_chapter(ch_info["id"])
        concepts = chapter["concepts"]
        questions = [q for q in chapter["chapter_questions"] if q["linked_concept_id"]]
        concepts_by_id = {c["id"]: c for c in concepts}

        if not questions:
            print(f"{ch_info['id']} {ch_info['name']}: no linked questions, skipping")
            continue

        print(f"{ch_info['id']} {ch_info['name']}: auditing {len(questions)} questions...")

        # Process in batches
        chapter_mismatches = 0
        for i in range(0, len(questions), BATCH_SIZE):
            batch = questions[i:i + BATCH_SIZE]
            results = audit_batch(client, ch_info["name"], concepts, batch, concepts_by_id)

            # Build lookup for this batch
            batch_by_id = {q["id"]: q for q in batch}

            for qid, suggested in results:
                q = batch_by_id.get(qid)
                if q is None:
                    continue
                total_audited += 1
                current = q["linked_concept_id"]
                if suggested != current:
                    current_term = concepts_by_id[current]["term"] if current in concepts_by_id else "none"
                    suggested_term = concepts_by_id[suggested]["term"] if suggested and suggested in concepts_by_id else "none"
                    mismatches.append({
                        "question_id": qid,
                        "chapter": ch_info["id"],
                        "question_text": q["question"],
                        "current_link": current,
                        "suggested_link": suggested,
                        "current_term": current_term,
                        "suggested_term": suggested_term,
                    })
                    chapter_mismatches += 1
                    total_mismatched += 1

            if i + BATCH_SIZE < len(questions):
                time.sleep(RATE_LIMIT_DELAY)

        print(f"  -> {chapter_mismatches} mismatches found")

    # Write JSON report
    with open(REPORT_JSON, "w") as f:
        json.dump(mismatches, f, indent=2)

    # Write markdown report
    with open(REPORT_MD, "w") as f:
        f.write("# Question-Concept Link Audit Report\n\n")
        f.write(f"**Total audited:** {total_audited}  \n")
        f.write(f"**Total mismatches:** {total_mismatched}  \n\n")

        # Group by chapter
        by_chapter = {}
        for m in mismatches:
            by_chapter.setdefault(m["chapter"], []).append(m)

        for ch_id in sorted(by_chapter.keys()):
            items = by_chapter[ch_id]
            f.write(f"## {ch_id} ({len(items)} mismatches)\n\n")
            f.write("| Question | Current | Suggested | Question Text |\n")
            f.write("|----------|---------|-----------|---------------|\n")
            for m in items:
                q_text = m["question_text"][:80] + "..." if len(m["question_text"]) > 80 else m["question_text"]
                q_text = q_text.replace("|", "\\|")
                f.write(
                    f"| Q{m['question_id']} "
                    f"| {m['current_link']} ({m['current_term']}) "
                    f"| {m['suggested_link']} ({m['suggested_term']}) "
                    f"| {q_text} |\n"
                )
            f.write("\n")

    print(f"\nAudit complete: {total_audited} questions, {total_mismatched} mismatches")
    print(f"Reports: {REPORT_JSON}")
    print(f"         {REPORT_MD}")


if __name__ == "__main__":
    main()
