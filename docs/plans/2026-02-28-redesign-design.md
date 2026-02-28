# SOCI 101 Exam Review — Redesign Design Document

Date: 2026-02-28

## Problem

Students struggle to figure out the current app. The dashboard presents 16 chapter cards with checkboxes, multiple study modes (Speed Round, Marathon, Exam Mode), XP/streaks/leaderboard, and no clear guidance on what to do. The app needs two clear paths: study individual chapters (when assigned) and prepare for exams (which bundle chapters together).

## Design Decisions

### Identity
- First visit: modal asks for **Name** (display) and **ONYEN** (unique identifier)
- Returning visit: "Hi, [Name]!" with "Not you?" link to switch
- State keyed by ONYEN in localStorage

### Terminology
- Replace all instances of "mastery/mastered" with "learned"
- Level states: not started → practicing → learned

### What's Removed
- Welcome screen (replaced by first-visit modal)
- Leaderboard screen and Google Sheets sync UI
- XP system, streak tracking, stats bar
- Speed Round, Marathon, per-chapter Exam Mode
- Multi-chapter checkbox selection, "Study Selected", "Review All"
- All "mastery" language

### What's Added
- Home screen with two clear paths (Chapters / Practice Exams)
- Exam Prep screen (one per exam) with chapter progress + practice exam launcher
- Practice Exam with two modes: Test Mode (no feedback) and Study Mode (with feedback)
- Exam Report: score breakdown by chapter after practice exams
- "Review Missed Questions" flow after practice exams

### Exam Definitions
- **Exam 1**: Sociological Perspective, Research Methods, Culture, Socialization, Groups, Deviance
- **Exam 2**: Social Stratification, Race and Ethnicity, Gender, Religion, Social Institutions, Economy and Work
- **Exam 3**: Family, Media, Health, Population

## Information Architecture

```
HOME (#home)
  ├─ CHAPTERS (#chapters)
  │   └─ CHAPTER DETAIL (#chapter/{id})
  │       └─ STUDY SESSION (#study) → SUMMARY
  │
  └─ EXAM PREP (#exam/{n})
      ├─ Practice Exam (Test or Study Mode)
      │   └─ EXAM REPORT
      └─ Chapter list → CHAPTER DETAIL (#chapter/{id})
```

5 screens total (down from 6). Home is always one tap away via header.

## Screen Details

### Home (#home)
- App title + "Hi, [Name]!" with "Not you?" link
- Two large cards, equal visual weight:
  - **Chapters**: "Study by topic" + aggregate progress (e.g. "42/138 learned" with progress bar)
  - **Practice Exams**: Links to exam picker showing Exam 1 / Exam 2 / Exam 3

### Chapters List (#chapters)
- Breadcrumb: ← Home
- Simple list, one row per chapter
- Each row: chapter title, fraction learned (e.g. "12/33 learned"), thin progress bar
- Tap row → chapter detail

### Chapter Detail (#chapter/{id})
- Breadcrumb: ← Chapters
- Chapter title + overall progress (fraction + bar + percentage)
- Study button + session size picker (5, 10, 20)
- Concept list with:
  - Level dots (○ not started, ● practicing, ✓ learned) — 2 or 3 dots per concept depending on L3 availability
  - Skip/unskip button per concept
  - Confusable hints (italic, small)
  - Trouble spot indicator (concepts with <50% accuracy after 3+ attempts)
- Small level legend at bottom

### Exam Prep (#exam/{n})
- Breadcrumb: ← Home
- Exam title + overall progress across exam's chapters
- Practice Exam section (prominent):
  - Two buttons: **Test Mode** (no feedback during exam) and **Study Mode** (feedback after each question)
  - Note: "50 questions from all chapters"
  - Both modes available immediately — not gated behind chapter progress
- Chapter list below: each exam chapter with progress, tappable → chapter detail

### Practice Exam Flow
- Questions drawn proportionally from all exam chapters
- Mixed L1/L2/L3 questions, shuffled
- **Test Mode**: no feedback, neutral highlight on answer, auto-advance
- **Study Mode**: feedback after each question (correct answer + explanation), manual advance
- Both end with Exam Report

### Exam Report
- Overall score: X/Y (percentage)
- Chapter-by-chapter breakdown with score and percentage per chapter
- "Review Missed Questions" button → starts a study session with only the questions answered incorrectly
- "Back to Exam [N]" button → returns to exam prep screen

### Study Session (#study)
- Same question rendering as current (L1: term→def, L2: def→term, L3: application MCQ)
- Same distractor selection logic (confusables prioritized)
- Cleaner visual treatment — no XP flyups or streak indicators
- Progress indicator: "Question 5 of 10"
- Feedback on correct/incorrect (in normal study and exam study mode)
- No feedback in exam test mode

### Session Summary
- Shows X/Y correct
- Lists level-ups: "Culture: not started → practicing"
- "Keep Studying" and "Back to [Chapter/Exam]" buttons

## Visual Design Direction

**Aesthetic: Clean academic** — trustworthy, calm, scholarly without being stuffy.

### Typography
- Distinctive serif for headings (chapter titles, exam names)
- Clean sans-serif for body text and UI
- Google Fonts loaded (specific fonts chosen during implementation)

### Color Palette
- Muted, warm tones as base (off-whites, tans)
- Single strong accent color for interactive elements (buttons, active states)
- Green for "learned" states
- Red for incorrect answers
- Neutral grays for secondary text, borders, backgrounds
- No purple XP colors or orange streak badges

### Layout
- Generous whitespace
- Single-column on mobile, max-width container (~600px) on desktop
- Cards with subtle borders rather than heavy shadows

### Progress Indicators
- Simple fraction text: "12/23 learned"
- Thin progress bars (6px)
- Level dots: small, understated (○ ● ✓)

### Tone
- Direct, encouraging without being patronizing
- "You've learned 12 of 23 concepts" not "Great job! You're 52% there!"

## Data Model Changes

### Exam Configuration
Add exam definitions — can be hardcoded in JS or added to a config file:

```javascript
const EXAMS = [
  { id: 1, name: 'Exam 1', chapters: ['ch01','ch02','ch03','ch04','ch05','ch06'] },
  { id: 2, name: 'Exam 2', chapters: ['ch07','ch08','ch09','ch10','ch11','ch12'] },
  { id: 3, name: 'Exam 3', chapters: ['ch13','ch14','ch15','ch16'] }
];
```

### localStorage Schema
- Key changes from student name to ONYEN-based
- Store both name and ONYEN
- Progress data structure stays the same (concept-level tracking, SM-2 intervals)
- Remove XP and streak fields from state

### Quiz Engine
- New `buildPracticeExam(examChapters, size)` method
  - Draws questions proportionally from each chapter
  - Mixes all three levels
  - Shuffles
  - Returns array of size questions (default 50)
- Track per-question chapter association for score breakdown
- "Review Missed" builds session from incorrect answers only

## Technical Approach
- Stay zero-dependency, vanilla JS
- Same IIFE module pattern
- Rewrite `index.html` screen structure
- Rewrite `css/style.css` and `css/components.css` for new visual design
- Modify `js/app.js` for new routing and event wiring
- Modify `js/ui.js` for new screen rendering
- Modify `js/quiz-engine.js` for practice exam building
- Modify `js/progress.js` to remove XP/streak, add ONYEN keying
- `js/content-loader.js` and `js/sync.js` — minimal changes (sync may be gutted)
