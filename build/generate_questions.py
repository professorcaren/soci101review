#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["anthropic"]
# ///
"""Generate Level 3 application/analysis questions for concepts missing them.

Uses Claude Sonnet API to create multiple-choice questions based on textbook content.
Outputs questions in the existing md-questions format for the existing pipeline.

Usage:
    ANTHROPIC_API_KEY=sk-... uv run build/generate_questions.py
"""

import json
import os
import re
import sys
import time

import anthropic

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

CONTENT_PATH = os.path.join(PROJECT_ROOT, "data/content.json")
MD_QUESTIONS_DIR = os.path.join(PROJECT_ROOT, "Old-games/yaq3/md-questions")
TEXTBOOK_DIR = "/Users/nealcaren/Dropbox/soci101-2026s/rw"

# Maps vocab chapter names to textbook filenames
TEXTBOOK_MAP = {
    "Sociological Perspective": "01-sociology-and-the-real-world.md",
    "Research Methods": "02-studying-social-life:-sociological-research-methods.md",
    "Culture": "03-culture.md",
    "Socialization": "04-socialization,-interaction,-and-the-self.md",
    "Groups": "05-separate-and-together-life-in-groups.md",
    "Deviance": "06-deviance.md",
    "Social Stratification": "07-social-class:-the-structure-of-inequality.md",
    "Race and Ethnicity": "08-race-and-ethnicity-as-lived-experience.md",
    "Gender": "09-constructing-gender-and-sexuality.md",
    "Religion": "10-social-institutions:-politics,-education,-and-religion.md",
    "Social Institutions": "10-social-institutions:-politics,-education,-and-religion.md",
    "Economy and Work": "11-the-economy-and-work.md",
    "Family": "12-life-at-home:-families-and-relationships.md",
    "Media": "13-leisure-and-media.md",
    "Health": "14-health-and-illness.md",
    "Population": "15-populations,-cities,-and-the-environment.md",
}

# Maps chapter names to quiz title names (matching existing md-questions conventions)
QUIZ_TITLE_MAP = {
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

# Output filenames for generated questions
OUTPUT_FILE_MAP = {
    "Sociological Perspective": "01_generated.md",
    "Research Methods": "02_generated.md",
    "Culture": "03_generated.md",
    "Socialization": "04_generated.md",
    "Groups": "05_generated.md",
    "Deviance": "06_generated.md",
    "Social Stratification": "07_generated.md",
    "Race and Ethnicity": "08_generated.md",
    "Gender": "09_generated.md",
    "Religion": "10_religion_generated.md",
    "Social Institutions": "10_institutions_generated.md",
    "Economy and Work": "11_generated.md",
    "Family": "12_generated.md",
    "Media": "13_generated.md",
    "Health": "14_generated.md",
    "Population": "15_generated.md",
}


def find_missing_concepts(content):
    """Find concepts that have no Level 3 questions, grouped by chapter."""
    missing_by_chapter = {}
    for chapter in content["chapters"]:
        missing = []
        for concept in chapter["concepts"]:
            if not concept["level3_question_ids"]:
                missing.append({
                    "term": concept["term"],
                    "definition": concept["definition"],
                })
        if missing:
            missing_by_chapter[chapter["name"]] = missing
    return missing_by_chapter


def load_textbook_chapter(chapter_name):
    """Load the textbook markdown for a given chapter."""
    filename = TEXTBOOK_MAP.get(chapter_name)
    if not filename:
        print(f"  WARNING: No textbook mapping for '{chapter_name}'")
        return None
    filepath = os.path.join(TEXTBOOK_DIR, filename)
    if not os.path.exists(filepath):
        print(f"  WARNING: Textbook file not found: {filepath}")
        return None
    with open(filepath, "r") as f:
        return f.read()


def build_prompt(concepts, textbook_text, chapter_name):
    """Build the prompt for Claude to generate questions."""
    concept_list = "\n".join(
        f"- {c['term']}: {c['definition']}" for c in concepts
    )

    return f"""You are creating exam questions for an introductory sociology course.
For each concept below, generate exactly 3 multiple-choice application/analysis questions.
These should test higher-order thinking — NOT simple recall of definitions.

Good question types:
- "Which scenario best illustrates [concept]?"
- "A researcher observes X. This is an example of..."
- "How would a [theorist] explain [situation]?"
- "What distinguishes [concept A] from [concept B]?"

Bad question types (avoid these):
- "What is the definition of [concept]?" (too simple)
- "Which of the following is true about [concept]?" (vague)

Rules:
- Each question must have exactly 4 choices labeled a) through d)
- Exactly one correct answer, marked with * before the letter
- The correct answer should not always be a) — vary the position
- Include a brief explanation after each question
- Make distractors plausible but clearly wrong
- Questions should reference realistic scenarios when possible
- Each question MUST contain the concept term (or a close variant) in the question text or correct answer so it can be linked back to the concept

Format each question exactly like this (with a blank line between questions):

1. [Question text]
*a) [Correct answer]
b) [Distractor]
c) [Distractor]
d) [Distractor]
**Explanation:** [Brief explanation of why the correct answer is right]

Number questions sequentially starting from 1.

Concepts needing questions (from chapter: {chapter_name}):
{concept_list}

Use the following textbook content as reference material:
{textbook_text}"""


def parse_generated_questions(response_text):
    """Parse Claude's response into structured questions."""
    questions = []
    # Split on question numbers at start of line
    raw_questions = re.split(r'\n(?=\d+\.\s)', response_text)

    for raw in raw_questions:
        raw = raw.strip()
        if not raw:
            continue

        lines = raw.split('\n')
        # First line is the question
        question_match = re.match(r'^\d+\.\s+(.+)', lines[0])
        if not question_match:
            continue
        question_text = question_match.group(1).strip()

        choices = []
        correct_index = None

        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue
            if line.startswith('**Explanation:**'):
                break

            # Check for correct answer (starts with *)
            if line.startswith('*'):
                correct_match = re.match(r'^\*([a-d])\)\s+(.+)', line)
                if correct_match:
                    letter = correct_match.group(1)
                    correct_index = ord(letter) - ord('a')
                    choices.append(correct_match.group(2).strip())
                    continue

            # Regular choice
            choice_match = re.match(r'^([a-d])\)\s+(.+)', line)
            if choice_match:
                choices.append(choice_match.group(2).strip())

        if question_text and len(choices) == 4 and correct_index is not None:
            questions.append({
                "question": question_text,
                "choices": choices,
                "correct": correct_index,
            })
        else:
            print(f"    SKIP: Could not parse question: {question_text[:60]}... "
                  f"(choices={len(choices)}, correct={correct_index})")

    return questions


def format_as_md(questions, quiz_title):
    """Format questions in the existing md-questions format."""
    lines = [f"Quiz title: {quiz_title}", "shuffle answers: true", ""]

    for i, q in enumerate(questions, 1):
        lines.append(f"{i}. {q['question']}")
        for j, choice in enumerate(q["choices"]):
            letter = chr(ord('a') + j)
            prefix = "*" if j == q["correct"] else ""
            lines.append(f"{prefix}{letter}) {choice}")
        lines.append("")

    return "\n".join(lines)


def generate_for_chapter(client, chapter_name, concepts, textbook_text):
    """Generate questions for one chapter's missing concepts via Claude API."""
    print(f"  Generating questions for {len(concepts)} concepts...")

    prompt = build_prompt(concepts, textbook_text, chapter_name)

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = response.content[0].text
    questions = parse_generated_questions(response_text)
    print(f"  Parsed {len(questions)} valid questions "
          f"(expected {len(concepts) * 3})")

    return questions


def main():
    # Check for API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.")
        print("Usage: ANTHROPIC_API_KEY=sk-... python build/generate_questions.py")
        sys.exit(1)

    # Load content
    with open(CONTENT_PATH) as f:
        content = json.load(f)

    # Find gaps
    missing = find_missing_concepts(content)
    total_missing = sum(len(concepts) for concepts in missing.values())
    print(f"Found {total_missing} concepts missing Level 3 questions "
          f"across {len(missing)} chapters.\n")

    if total_missing == 0:
        print("All concepts have Level 3 questions. Nothing to generate.")
        return

    # Initialize API client
    client = anthropic.Anthropic()

    total_generated = 0
    total_failed = 0

    for chapter_name, concepts in sorted(missing.items()):
        print(f"\n{'='*60}")
        print(f"Chapter: {chapter_name} ({len(concepts)} concepts)")
        print(f"{'='*60}")

        # Skip if output file already exists
        output_file = os.path.join(
            MD_QUESTIONS_DIR, OUTPUT_FILE_MAP[chapter_name]
        )
        if os.path.exists(output_file):
            print(f"  SKIPPED: Output file already exists: {OUTPUT_FILE_MAP[chapter_name]}")
            continue

        # Load textbook
        textbook_text = load_textbook_chapter(chapter_name)
        if not textbook_text:
            print("  SKIPPED: No textbook content available.")
            total_failed += len(concepts) * 3
            continue

        # Generate questions
        questions = generate_for_chapter(
            client, chapter_name, concepts, textbook_text
        )

        if not questions:
            print("  FAILED: No valid questions generated.")
            total_failed += len(concepts) * 3
            continue

        # Save to md file
        quiz_title = QUIZ_TITLE_MAP.get(chapter_name, chapter_name)
        md_content = format_as_md(questions, quiz_title)
        output_file = os.path.join(
            MD_QUESTIONS_DIR, OUTPUT_FILE_MAP[chapter_name]
        )
        with open(output_file, "w") as f:
            f.write(md_content)
        print(f"  Saved {len(questions)} questions to {output_file}")

        total_generated += len(questions)

        # Brief pause between API calls to be respectful of rate limits
        time.sleep(2)

    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total questions generated: {total_generated}")
    print(f"Expected: {total_missing * 3}")
    if total_failed:
        print(f"Questions not generated (failures): {total_failed}")
    print(f"\nNext steps:")
    print(f"  1. cd Old-games/yaq3 && python create_questions.py")
    print(f"  2. cd ../.. && python build/build_content.py")
    print(f"  3. Verify all concepts now have Level 3 questions")


if __name__ == "__main__":
    main()
