# SOCI 101 Exam Review — Product Redesign Design

**Date:** 2026-02-22
**Status:** Approved
**Approach:** Vanilla JS overhaul (Approach A — build on existing architecture)

## Constraints

- GitHub Pages hosted (static site)
- Google Sheets as backend via Apps Script
- Phone-first, dark mode aesthetic
- Free for now, paywall later
- Zero framework dependencies (vanilla JS, CSS, HTML)

## 1. Visual Design System

### Dark Theme Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#0d1117` | Page background |
| `--color-surface` | `#161b22` | Cards, inputs |
| `--color-text` | `#e6edf3` | Primary text |
| `--color-text-secondary` | `#8b949e` | Muted text |
| `--color-accent` | `#58a6ff` | Interactive elements |
| `--color-success` | `#3fb950` | Correct / mastered |
| `--color-error` | `#f85149` | Incorrect |
| `--color-xp` | `#d2a8ff` | XP / reward highlights |
| `--color-streak` | `#f0883e` | Streak / amber accents |

### Typography

System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`

### Phone-First Layout

- Full-width cards on mobile, no max-width container
- Bottom-anchored action buttons (thumb-friendly)
- Large touch targets: min 48px, 56px on primary actions
- Tap anywhere to advance after feedback

## 2. Progress & Motivation System

### XP Points

- Per correct answer: L1 = 10 XP, L2 = 20 XP, L3 = 30 XP
- Streak multiplier within a session: 3 in a row = 1.5x, 5+ = 2x
- XP displayed in a persistent top bar across all screens
- Animated "+20 XP" flyup on correct answers

### Daily Streaks

- Studied at least 1 session today = streak continues
- Streak counter with icon on dashboard
- Date-based tracking in localStorage

### Mastery Visualization

- Per-concept: 3-segment progress indicator showing L1/L2/L3 status with color fills
- Per-chapter: radial/ring chart showing mastery percentage (replaces flat bar)
- Dashboard hero stats: overall mastery count + total XP at top

### Session Summary Upgrade

- XP earned this session
- Streak status update
- Concepts that leveled up
- "Personal best" callout
- Nudge: "3 concepts close to mastery in Chapter 4"

## 3. Term Skipping

- Each concept row in chapter detail gets a skip toggle
- Skipped terms: grayed out, excluded from sessions, excluded from progress denominator
- "Skipped (N)" counter at top of concept list
- Tap to un-skip at any time
- Stored in localStorage per concept ID

## 4. Smarter Study Sessions

### Weak-Area Targeting

- Session building prioritizes lowest correct-rate concepts
- "Trouble spots" flag on concepts with 2+ incorrect answers

### Exam Mode

- Timed practice mode from chapter or dashboard
- Questions across all levels, randomized
- No feedback until end (simulates exam)
- Timer options: 10 / 20 / 30 min / untimed
- End summary: score + breakdown by chapter and level

### Session Size Flexibility

- Student picks before studying: 5 (quick), 10 (standard), 20 (deep)
- Selection UI on chapter detail screen

### No Back-to-Back Repeats (Bug Fix)

- Hard rule: no two consecutive questions share a concept ID
- If interleaving can't resolve, drop duplicate and backfill from pool
- L3 questions for same concept spaced across session

## 5. Social / Leaderboard (via Google Sheets)

### Class Leaderboard

- Accessible from dashboard as a tab/button
- Shows: rank, student name (first + last initial), total XP, mastery %, streak
- Data fetched via Apps Script `doGet` endpoint (new: returns all students' summary stats)

### Sync Strategy (Minimal Sheets Hits)

- **Push**: Only at session end. Single POST with accumulated progress.
- **Pull leaderboard**: Once on app load, cached for session. Manual refresh button.
- **Unload beacon**: Safety net, fires only if unsaved progress exists.
- No mid-session network calls.

### Instructor Dashboard

- The Google Sheet itself is the instructor view
- Columns: Name, Last Active, Total XP, Overall Mastery %, per-chapter %, streak
- Instructor sorts/filters natively in Sheets

### Privacy

- Leaderboard shows first name + last initial by default

## 6. Better Content Presentation

### Improved Wrong-Answer Feedback

- Show correct definition or key distinction on wrong answer
- Surface Claude-generated explanations for L3 questions

### Confusable Hints

- Chapter detail: "Often confused with: X, Y" under each concept
- Leverages existing `confusable_ids` data

## Non-Goals (Explicitly Out of Scope)

- Authentication / payment / access control
- Framework migration (React, Preact, etc.)
- Server-side infrastructure beyond Google Sheets
- New question types or media (images, audio)
- LMS integration
