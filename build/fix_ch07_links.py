#!/usr/bin/env python3
"""Apply known linked_concept_id corrections to ch07.json.

Fixes 30 question-concept links identified by manual spot check,
corrects Q535's factual error, and rebuilds level3_question_ids arrays.
"""

import json
import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CH07_PATH = os.path.join(PROJECT_ROOT, "data", "ch07.json")

# Known linked_concept_id corrections: question_id -> new concept_id
LINK_FIXES = {
    524: "ch07_t04",
    526: "ch07_t04",
    529: "ch07_t07",
    530: "ch07_t07",
    531: "ch07_t07",
    536: "ch07_t10",
    538: "ch07_t15",
    539: "ch07_t13",
    541: "ch07_t24",
    542: "ch07_t24",
    543: "ch07_t24",
    544: "ch07_t25",
    545: "ch07_t25",
    546: "ch07_t25",
    549: "ch07_t27",
    550: "ch07_t28",
    551: "ch07_t29",
    553: "ch07_t30",
    554: "ch07_t30",
    555: "ch07_t30",
    1034: "ch07_t22",
    1036: "ch07_t30",
    1041: "ch07_t30",
    1042: "ch07_t22",
    1043: "ch07_t13",
    1061: "ch07_t05",
    1070: "ch07_t17",
    1073: "ch07_t18",
    1075: "ch07_t18",
}
# Q535 keeps ch07_t10 but gets text fix — not in LINK_FIXES since link unchanged

# Q535 text correction: feudalism factual error
Q535_OLD_TEXT = "military service and crops"
Q535_NEW_TEXT = "labor, rent, and a share of crops"


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


def main():
    with open(CH07_PATH) as f:
        chapter = json.load(f)

    concepts_by_id = {c["id"]: c for c in chapter["concepts"]}
    questions_by_id = {q["id"]: q for q in chapter["chapter_questions"]}

    # Apply linked_concept_id fixes
    fixed_count = 0
    for qid, new_link in LINK_FIXES.items():
        q = questions_by_id.get(qid)
        if q is None:
            print(f"  WARNING: Question {qid} not found in ch07")
            continue
        old_link = q["linked_concept_id"]
        if old_link != new_link:
            old_term = concepts_by_id[old_link]["term"] if old_link and old_link in concepts_by_id else "none"
            new_term = concepts_by_id[new_link]["term"]
            print(f"  Q{qid}: {old_link} ({old_term}) -> {new_link} ({new_term})")
            q["linked_concept_id"] = new_link
            fixed_count += 1
        else:
            print(f"  Q{qid}: already correct ({new_link})")

    # Fix Q535 text
    q535 = questions_by_id.get(535)
    if q535 and Q535_OLD_TEXT in q535["question"]:
        q535["question"] = q535["question"].replace(Q535_OLD_TEXT, Q535_NEW_TEXT)
        print(f"\n  Fixed Q535 text: '{Q535_OLD_TEXT}' -> '{Q535_NEW_TEXT}'")
    elif q535:
        print(f"\n  WARNING: Q535 text fix pattern not found")

    # Rebuild level3_question_ids for all concepts
    # Use text matching (like build_content.py) but with corrected linked_concept_id as primary
    for concept in chapter["concepts"]:
        concept["level3_question_ids"] = []

    for q in chapter["chapter_questions"]:
        full_text = q["question"] + " " + " ".join(q["choices"])
        for concept in chapter["concepts"]:
            if find_term_in_text(concept["term"], full_text):
                concept["level3_question_ids"].append(q["id"])

    # Write back
    with open(CH07_PATH, "w") as f:
        json.dump(chapter, f, indent=2)

    print(f"\nApplied {fixed_count} link fixes to {CH07_PATH}")

    # Summary
    linked = sum(1 for q in chapter["chapter_questions"] if q["linked_concept_id"])
    concepts_with_q = sum(1 for c in chapter["concepts"] if c["level3_question_ids"])
    print(f"  {len(chapter['concepts'])} concepts, {len(chapter['chapter_questions'])} questions")
    print(f"  {linked} linked, {concepts_with_q} concepts with L3 questions")


if __name__ == "__main__":
    main()
