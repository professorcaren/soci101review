#!/usr/bin/env python3
"""Build unified content.json from vocabulary.json and questions.json."""

import json
import re
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

VOCAB_PATH = os.path.join(PROJECT_ROOT, "Old-games/soci101-vocab-quiz-html/vocabulary.json")
QUESTIONS_PATH = os.path.join(PROJECT_ROOT, "Old-games/yaq3/questions.json")
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "data/content.json")

# Maps vocab chapter names to YAQ3 chapter names
CHAPTER_MAP = {
    "Sociological Perspective": "01 Perspectives",
    "Research Methods": "02 Methods",
    "Culture": "03 Culture",
    "Socialization": "04 Socialization",
    "Groups": "05 Groups",
    "Deviance": "06 Deviance",
    "Social Stratification": "07 Stratification",
    "Race and Ethnicity": "08 Race & Ethnicity",
    "Gender": "09 Gender",
    "Religion": "10 Religion",
    "Social Institutions": "10 Social Institutions",
    "Economy and Work": "11 Work",
    "Family": "12 Family",
    "Media": "13 Leisure",
    "Health": "14 Health",
    "Population": "15 Population",
}

# Chapter display order
CHAPTER_ORDER = [
    "Sociological Perspective",
    "Research Methods",
    "Culture",
    "Socialization",
    "Groups",
    "Deviance",
    "Social Stratification",
    "Race and Ethnicity",
    "Gender",
    "Religion",
    "Social Institutions",
    "Economy and Work",
    "Family",
    "Media",
    "Health",
    "Population",
]


def make_chapter_id(order):
    return f"ch{order:02d}"


def make_concept_id(chapter_id, term_index):
    return f"{chapter_id}_t{term_index:02d}"


def normalize_for_matching(text):
    """Normalize text for term matching in questions."""
    return text.lower().strip()


def find_term_in_text(term, text):
    """Check if a vocab term appears in question text (case-insensitive, word boundary)."""
    term_lower = normalize_for_matching(term)
    text_lower = normalize_for_matching(text)
    # Use word boundaries for terms with 3+ characters
    if len(term_lower) < 3:
        return False
    pattern = r'\b' + re.escape(term_lower) + r'\b'
    if re.search(pattern, text_lower):
        return True
    # Try matching without parenthetical abbreviations: "Socioeconomic Status (SES)" -> match "socioeconomic status" or "SES"
    paren_match = re.match(r'^(.+?)\s*\(([^)]+)\)\s*$', term_lower)
    if paren_match:
        base = paren_match.group(1).strip()
        abbrev = paren_match.group(2).strip()
        if len(base) >= 3 and re.search(r'\b' + re.escape(base) + r'\b', text_lower):
            return True
        if len(abbrev) >= 2 and re.search(r'\b' + re.escape(abbrev) + r'\b', text_lower):
            return True
    # Try matching slash-separated terms: "Frontstage/Backstage" -> match either part
    if '/' in term_lower:
        for part in term_lower.split('/'):
            part = part.strip()
            if len(part) >= 3 and re.search(r'\b' + re.escape(part) + r'\b', text_lower):
                return True
    return False


def build_content():
    with open(VOCAB_PATH) as f:
        vocab_data = json.load(f)
    with open(QUESTIONS_PATH) as f:
        questions_data = json.load(f)

    # Group YAQ3 questions by chapter
    yaq3_by_chapter = {}
    for q in questions_data:
        ch = q["chapter"]
        yaq3_by_chapter.setdefault(ch, []).append(q)

    chapters = []

    for order_idx, vocab_chapter in enumerate(CHAPTER_ORDER, start=1):
        chapter_id = make_chapter_id(order_idx)
        terms = vocab_data.get(vocab_chapter, [])
        yaq3_chapter = CHAPTER_MAP.get(vocab_chapter)
        yaq3_questions = yaq3_by_chapter.get(yaq3_chapter, []) if yaq3_chapter else []

        # Build concepts from vocab terms
        concepts = []
        for term_idx, term_entry in enumerate(terms, start=1):
            concept_id = make_concept_id(chapter_id, term_idx)
            concepts.append({
                "id": concept_id,
                "term": term_entry["word"],
                "definition": term_entry["definition"],
                "level3_question_ids": [],
            })

        # Link YAQ3 questions to concepts by term matching
        # Sort concepts by term length (longest first) so specific terms
        # like "Mechanical Solidarity" match before generic ones like "Solidarity"
        concepts_by_length = sorted(concepts, key=lambda c: len(c["term"]), reverse=True)

        chapter_questions = []
        for q in yaq3_questions:
            question_text = q["question"]
            # Also check choices for term mentions
            full_text = question_text + " " + " ".join(q["choices"])

            linked_concept_id = None
            for concept in concepts_by_length:
                if find_term_in_text(concept["term"], full_text):
                    if linked_concept_id is None:
                        linked_concept_id = concept["id"]
                    concept["level3_question_ids"].append(q["id"])

            chapter_questions.append({
                "id": q["id"],
                "question": q["question"],
                "choices": q["choices"],
                "correct": q["correct"],
                "linked_concept_id": linked_concept_id,
            })

        chapters.append({
            "id": chapter_id,
            "name": vocab_chapter,
            "order": order_idx,
            "concepts": concepts,
            "chapter_questions": chapter_questions,
        })

    content = {"chapters": chapters}

    data_dir = os.path.dirname(OUTPUT_PATH)
    os.makedirs(data_dir, exist_ok=True)

    # Write monolithic content.json (backward compat)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(content, f, indent=2)

    # Write per-chapter files and manifest
    manifest = [{"id": ch["id"], "name": ch["name"], "order": ch["order"]} for ch in chapters]
    with open(os.path.join(data_dir, "chapters.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    for ch in chapters:
        with open(os.path.join(data_dir, f"{ch['id']}.json"), "w") as f:
            json.dump(ch, f, indent=2)

    # Print summary
    total_terms = sum(len(ch["concepts"]) for ch in chapters)
    total_questions = sum(len(ch["chapter_questions"]) for ch in chapters)
    linked = sum(
        1 for ch in chapters for q in ch["chapter_questions"] if q["linked_concept_id"]
    )
    print(f"Built content.json + {len(chapters)} per-chapter files + chapters.json:")
    print(f"  {len(chapters)} chapters")
    print(f"  {total_terms} vocab terms")
    print(f"  {total_questions} YAQ3 questions")
    print(f"  {linked} questions linked to specific concepts")
    print(f"  {total_questions - linked} chapter-level questions (unlinked)")
    print()
    for ch in chapters:
        linked_count = sum(1 for q in ch["chapter_questions"] if q["linked_concept_id"])
        concepts_with_q = sum(1 for c in ch["concepts"] if c["level3_question_ids"])
        print(
            f"  {ch['id']} {ch['name']}: "
            f"{len(ch['concepts'])} terms, "
            f"{len(ch['chapter_questions'])} questions "
            f"({linked_count} linked to {concepts_with_q} concepts)"
        )


if __name__ == "__main__":
    build_content()
