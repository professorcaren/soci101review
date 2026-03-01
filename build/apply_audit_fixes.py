#!/usr/bin/env python3
"""Apply audit fixes from audit_report.json to per-chapter JSON and content.json.

Reads the audit report, updates linked_concept_id on each mismatched question,
rebuilds level3_question_ids arrays, and writes updated files.

Usage:
    python3 build/apply_audit_fixes.py
"""

import json
import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
REPORT_PATH = os.path.join(SCRIPT_DIR, "audit_report.json")
CONTENT_PATH = os.path.join(DATA_DIR, "content.json")


def find_term_in_text(term, text):
    """Check if a vocab term appears in text (case-insensitive, word boundary)."""
    term_lower = term.lower().strip()
    text_lower = text.lower().strip()
    if len(term_lower) < 3:
        return False
    pattern = r'\b' + re.escape(term_lower) + r'\b'
    if re.search(pattern, text_lower):
        return True
    paren_match = re.match(r'^(.+?)\s*\(([^)]+)\)\s*$', term_lower)
    if paren_match:
        base = paren_match.group(1).strip()
        abbrev = paren_match.group(2).strip()
        if len(base) >= 3 and re.search(r'\b' + re.escape(base) + r'\b', text_lower):
            return True
        if len(abbrev) >= 2 and re.search(r'\b' + re.escape(abbrev) + r'\b', text_lower):
            return True
    if '/' in term_lower:
        for part in term_lower.split('/'):
            part = part.strip()
            if len(part) >= 3 and re.search(r'\b' + re.escape(part) + r'\b', text_lower):
                return True
    return False


def rebuild_level3_ids(chapter):
    """Rebuild level3_question_ids arrays via text matching."""
    for concept in chapter["concepts"]:
        concept["level3_question_ids"] = []

    for q in chapter["chapter_questions"]:
        full_text = q["question"] + " " + " ".join(q["choices"])
        for concept in chapter["concepts"]:
            if find_term_in_text(concept["term"], full_text):
                concept["level3_question_ids"].append(q["id"])


def main():
    if not os.path.exists(REPORT_PATH):
        print(f"No audit report found at {REPORT_PATH}")
        print("Run audit_question_links.py first.")
        return

    with open(REPORT_PATH) as f:
        mismatches = json.load(f)

    if not mismatches:
        print("No mismatches to fix.")
        return

    # Group by chapter
    fixes_by_chapter = {}
    for m in mismatches:
        fixes_by_chapter.setdefault(m["chapter"], []).append(m)

    affected_chapters = {}
    total_fixed = 0

    for ch_id, fixes in sorted(fixes_by_chapter.items()):
        ch_path = os.path.join(DATA_DIR, f"{ch_id}.json")
        with open(ch_path) as f:
            chapter = json.load(f)

        questions_by_id = {q["id"]: q for q in chapter["chapter_questions"]}
        concepts_by_id = {c["id"]: c for c in chapter["concepts"]}

        ch_fixed = 0
        for fix in fixes:
            q = questions_by_id.get(fix["question_id"])
            if q is None:
                print(f"  WARNING: Q{fix['question_id']} not found in {ch_id}")
                continue

            new_link = fix["suggested_link"]
            # Validate the suggested concept exists in this chapter
            if new_link and new_link not in concepts_by_id:
                print(f"  WARNING: Q{fix['question_id']} suggested {new_link} not in {ch_id}, skipping")
                continue

            old_link = q["linked_concept_id"]
            q["linked_concept_id"] = new_link
            old_term = concepts_by_id[old_link]["term"] if old_link and old_link in concepts_by_id else "none"
            new_term = concepts_by_id[new_link]["term"] if new_link and new_link in concepts_by_id else "none"
            print(f"  Q{fix['question_id']}: {old_link} ({old_term}) -> {new_link} ({new_term})")
            ch_fixed += 1

        # Rebuild level3_question_ids
        rebuild_level3_ids(chapter)

        # Write per-chapter file
        with open(ch_path, "w") as f:
            json.dump(chapter, f, indent=2)

        affected_chapters[ch_id] = chapter
        total_fixed += ch_fixed
        print(f"  {ch_id}: {ch_fixed} fixes applied")

    # Rebuild content.json with all chapters (including unmodified ones)
    with open(CONTENT_PATH) as f:
        content = json.load(f)

    for i, ch in enumerate(content["chapters"]):
        if ch["id"] in affected_chapters:
            content["chapters"][i] = affected_chapters[ch["id"]]

    with open(CONTENT_PATH, "w") as f:
        json.dump(content, f, indent=2)

    print(f"\nApplied {total_fixed} fixes across {len(affected_chapters)} chapters")
    print(f"Updated: {', '.join(sorted(affected_chapters.keys()))}")
    print(f"Wrote: {CONTENT_PATH}")


if __name__ == "__main__":
    main()
