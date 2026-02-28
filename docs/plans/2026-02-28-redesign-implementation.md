# SOCI 101 Exam Review Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the exam review app with two clear paths (Chapters / Practice Exams), ONYEN-based identity, new visual design, and simplified UX — removing XP, streaks, leaderboard, speed round, marathon, and all "mastery" language.

**Architecture:** Same zero-dependency vanilla JS with IIFE modules. Six files change substantially (index.html, both CSS files, app.js, ui.js, quiz-engine.js). Progress.js gets ONYEN support and XP/streak removal. Sync.js is gutted. ContentLoader stays as-is.

**Tech Stack:** Vanilla JS, CSS custom properties, Google Fonts, GitHub Pages deployment.

**Design doc:** `docs/plans/2026-02-28-redesign-design.md`

---

## Task 1: Update Progress module — ONYEN support, remove XP/streak

**Files:**
- Modify: `js/progress.js`

**Step 1: Modify Progress module**

Replace the student identity and remove gamification:

```javascript
// In getDefault(), replace:
return {
    studentName: '',
    onyen: '',
    concepts: {},
    questions: {},
    lastSync: null,
    skippedConcepts: {},
};

// Replace setStudentName/getStudentName with:
function setStudent(name, onyen) {
    getData().studentName = name;
    getData().onyen = onyen;
    save();
}

function getStudentName() {
    return getData().studentName;
}

function getOnyen() {
    return getData().onyen;
}
```

Remove these functions entirely:
- `addXP`, `getXP` (lines 137-151)
- `updateDailyStreak`, `getDailyStreak` (lines 155-180)
- `XP_PER_LEVEL`, `STREAK_MULTIPLIERS` constants (lines 9-10)

Update `getChapterStats` (line 206): rename `mastered` to `learned` in the returned object.

Update the return statement to export `setStudent`, `getOnyen` instead of `setStudentName`, and remove `addXP`, `getXP`, `updateDailyStreak`, `getDailyStreak`, `XP_PER_LEVEL`.

Change localStorage key to be ONYEN-based:
```javascript
const STORAGE_KEY_PREFIX = 'soci101_';
// In load(): use STORAGE_KEY_PREFIX + stored onyen, with fallback to 'soci101_exam_review' for migration
```

Replace `isConceptMastered` → `isConceptLearned` (rename only, same logic).

Update `getChapterStats` return value: `mastered` → `learned`.

**Step 2: Verify no runtime errors**

Run: `python3 -m http.server 8000` and open browser console.
Expected: App will break (other modules reference removed functions). That's fine — we'll fix in subsequent tasks.

**Step 3: Commit**

```bash
git add js/progress.js
git commit -m "refactor: update Progress module — ONYEN identity, remove XP/streak, rename mastered→learned"
```

---

## Task 2: Update QuizEngine — add practice exam builder, remove speed/marathon

**Files:**
- Modify: `js/quiz-engine.js`

**Step 1: Add chapterId to all question objects**

In `makeLevel1Question`, `makeLevel2Question`, and `makeLevel3FromData`, add `chapterId: chapter.id` to the returned object. For `makeLevel3FromData`, add a `chapter` parameter.

**Step 2: Add `buildPracticeExam` method**

```javascript
/**
 * Build a practice exam: proportional questions from exam chapters.
 * Returns questions with chapterId for per-chapter scoring.
 */
function buildPracticeExam(chapters, size) {
    if (!Array.isArray(chapters)) chapters = [chapters];
    size = size || 50;
    const allQuestions = [];

    for (const chapter of chapters) {
        for (const concept of chapter.concepts) {
            if (Progress.isConceptSkipped(concept.id)) continue;
            const hasL3 = concept.level3_question_ids.length > 0;

            // Add one question per level the concept has
            allQuestions.push(makeLevel1Question(chapter, concept));
            allQuestions.push(makeLevel2Question(chapter, concept));

            if (hasL3) {
                const qIds = concept.level3_question_ids;
                const randomId = qIds[Math.floor(Math.random() * qIds.length)];
                const qData = chapter.chapter_questions.find(cq => cq.id === randomId);
                if (qData) allQuestions.push(makeLevel3FromData(qData, concept, chapter));
            }
        }
    }

    shuffle(allQuestions);
    return allQuestions.slice(0, size);
}
```

**Step 3: Remove `buildSpeedSession` and `buildMarathonSession`**

Delete lines 279-319.

Update the return statement:
```javascript
return { buildSession, buildExamSession, buildPracticeExam, recordAnswer, setSessionSize, getSessionSize };
```

**Step 4: Update level labels**

Replace "mastery" language in level labels:
```javascript
// In makeLevel1Question:
levelLabel: 'Term Recognition',

// In makeLevel2Question:
levelLabel: 'Definition Recognition',

// In makeLevel3FromData:
levelLabel: 'Application',
```

**Step 5: Commit**

```bash
git add js/quiz-engine.js
git commit -m "refactor: add buildPracticeExam, remove speed/marathon, add chapterId tracking"
```

---

## Task 3: Gut Sync module

**Files:**
- Modify: `js/sync.js`

**Step 1: Replace with no-op stubs**

The sync module is referenced by other code. Replace with stubs so nothing breaks:

```javascript
/**
 * Sync module — stubbed out (leaderboard removed).
 */
const Sync = (() => {
    function onAnswer() {}
    function pushProgress() {}
    function pullProgress() {}
    function setupUnloadSync() {}
    return { onAnswer, pushProgress, pullProgress, setupUnloadSync };
})();
```

**Step 2: Commit**

```bash
git add js/sync.js
git commit -m "refactor: gut Sync module — leaderboard and cloud sync removed"
```

---

## Task 4: Rewrite index.html — new screen structure

**Files:**
- Modify: `index.html`

**Step 1: Replace the entire HTML body**

New screen structure (5 screens + identity modal):

```html
<!-- Identity Modal (first visit) -->
<div id="identity-modal" class="modal-overlay hidden">...</div>

<!-- Home Screen -->
<div id="screen-home" class="screen active">...</div>

<!-- Chapters List Screen -->
<div id="screen-chapters" class="screen">...</div>

<!-- Chapter Detail Screen -->
<div id="screen-chapter" class="screen">...</div>

<!-- Exam Prep Screen -->
<div id="screen-exam" class="screen">...</div>

<!-- Study Session Screen -->
<div id="screen-study" class="screen">...</div>

<!-- Session Summary / Exam Report Screen -->
<div id="screen-summary" class="screen">...</div>
```

Remove: stats-bar, xp-flyup, screen-welcome, screen-leaderboard, screen-dashboard.
Remove: btn-review-all, btn-study-selected, btn-leaderboard, btn-exam-mode, btn-speed-round, btn-marathon, btn-end-marathon.

Add: identity modal with name + ONYEN fields, home screen with two path cards, chapters list, exam prep screen with test/study mode buttons.

Update Google Fonts link to include chosen fonts (keep DM Serif Display + Source Sans 3 — they fit the academic aesthetic well; the current choices are already good).

Full HTML content provided in implementation.

**Step 2: Commit**

```bash
git add index.html
git commit -m "refactor: rewrite HTML — new 5-screen structure with identity modal"
```

---

## Task 5: Rewrite CSS — new visual design

**Files:**
- Modify: `css/style.css`
- Modify: `css/components.css`

**Step 1: Update style.css**

Keep the warm academic palette but refine:
- Remove `--color-xp`, `--color-streak` variables
- Keep `--color-primary` (rust/terracotta), `--color-success` (green), `--color-error` (red)
- Add modal overlay styles
- Update welcome/screen styles for new structure
- Add home screen card styles
- Add nav header style (persistent, with app title + user greeting)

**Step 2: Update components.css**

Remove:
- Stats bar styles (lines 280-312)
- XP flyup styles (lines 314-330)
- Leaderboard styles (lines 345-387)
- Chapter card checkbox styles (lines 108-121)
- Study Selected button (lines 123-132)
- Chapter mode buttons (lines 488-494)
- End marathon button (lines 496-500)
- Timer warning (lines 482-486)
- Summary XP/streak styles (lines 448-455)

Add:
- Home screen path cards (two large, equal-weight cards)
- Chapters list (simple rows, not grid cards)
- Exam prep screen (exam header + practice exam section + chapter list)
- Exam report (chapter breakdown table)
- Identity modal styles
- Nav header styles
- Chapter row in chapters list (simpler than current card)

Keep (with updates):
- Button base styles
- Progress bars
- Level dots
- Concept list / concept row
- Choice buttons
- Feedback styles
- Summary card

**Step 3: Commit**

```bash
git add css/style.css css/components.css
git commit -m "refactor: rewrite CSS — new visual design, remove gamification styles"
```

---

## Task 6: Rewrite UI module — new screen rendering

**Files:**
- Modify: `js/ui.js`

**Step 1: Rewrite the UI module**

Replace the entire module with new rendering functions:

**New functions needed:**
- `renderHome()` — two path cards with aggregate progress
- `renderChaptersList()` — simple chapter list with progress rows
- `renderChapterDetail(chapter)` — keep concept list, remove mode buttons
- `renderExamPrep(examId)` — exam header + practice exam buttons + chapter list
- `renderExamReport(results)` — chapter breakdown score report
- `startStudySession(questions, options)` — simplified (no speed/marathon/XP)
- `renderQuestion()` — same question rendering, no XP flyup
- `handleAnswer(selectedIndex)` — simplified (no XP, no speed auto-advance)
- `renderSessionSummary()` — simplified (no XP, no streak, add level-up labels with "learned" language)
- `showIdentityModal()` / `hideIdentityModal()` — first-visit flow

**Remove:**
- `renderDashboard()` (replaced by `renderHome` + `renderChaptersList`)
- `updateStudySelectedButton()`, `getSelectedChapterIds()`
- `showXPFlyup()`, `updateStatsBar()`
- `renderLeaderboard()`
- Speed mode timer functions
- Marathon mode handling

**Key changes in study session:**
- Track `_examResults` array: `{ question, selectedIndex, wasCorrect, chapterId }` for exam report
- `options.examTestMode` = no feedback, auto-advance
- `options.examStudyMode` = feedback, manual advance
- `options.examId` = which exam (for back-navigation)
- Summary: show "X/Y correct" + level-ups with "learned" language
- Exam report: show chapter breakdown from `_examResults`

**Step 2: Commit**

```bash
git add js/ui.js
git commit -m "refactor: rewrite UI module — new screens, remove gamification"
```

---

## Task 7: Rewrite App module — new routing and events

**Files:**
- Modify: `js/app.js`

**Step 1: Rewrite the App module**

New routing:
```javascript
const EXAMS = [
    { id: 1, name: 'Exam 1', chapters: ['ch01','ch02','ch03','ch04','ch05','ch06'] },
    { id: 2, name: 'Exam 2', chapters: ['ch07','ch08','ch09','ch10','ch11','ch12'] },
    { id: 3, name: 'Exam 3', chapters: ['ch13','ch14','ch15','ch16'] },
];
```

New hash routes: `#home`, `#chapters`, `#chapter/{id}`, `#exam/{n}`, `#study`, `#summary`.

New event wiring:
- Identity modal: name + ONYEN inputs → `Progress.setStudent(name, onyen)`
- Home: chapters card click → `showChapters()`, exams card click → show exam picker
- Chapters list: row click → `showChapter(id)`
- Chapter detail: study button → build session + start, back → `showChapters()`
- Exam prep: test mode → build practice exam + start (examTestMode), study mode → same (examStudyMode), chapter row → `showChapter(id)`
- Study session: back → context-dependent (chapter or exam)
- Summary: keep studying → new session, back → context-dependent
- Exam report: review missed → build session from missed Qs, back to exam → `showExamPrep(id)`

`init()`:
- Check for ONYEN in localStorage
- If found → show home
- If not → show identity modal
- No sync calls

**Step 2: Commit**

```bash
git add js/app.js
git commit -m "refactor: rewrite App module — new routing, exam config, identity flow"
```

---

## Task 8: Integration testing and polish

**Files:**
- All files (bug fixes as needed)

**Step 1: Start local server and test all flows**

Run: `python3 -m http.server 8000`

Test checklist:
- [ ] First visit: identity modal appears, enter name + ONYEN, modal closes, home screen shows
- [ ] Returning visit: home screen shows with greeting, "Not you?" works
- [ ] Home → Chapters: list shows all 16 chapters with progress
- [ ] Chapters → Chapter detail: concept list renders, level dots correct
- [ ] Chapter detail → Study: session builds, questions render, feedback works
- [ ] Study → Summary: score shows, level-ups display with "learned" language
- [ ] Summary → Keep Studying: new session starts
- [ ] Summary → Back to Chapter: returns to chapter detail
- [ ] Home → Practice Exams → Exam 1: exam prep screen shows chapters and progress
- [ ] Exam 1 → Test Mode: questions render, no feedback, auto-advance, exam report at end
- [ ] Exam 1 → Study Mode: questions render, feedback shown, manual advance, exam report at end
- [ ] Exam report: chapter breakdown shows, "Review Missed" works
- [ ] Exam report → Back to Exam: returns to exam prep
- [ ] All navigation: back buttons work, hash routing works, browser back works
- [ ] Mobile: responsive layout works on narrow viewport
- [ ] No console errors throughout

**Step 2: Fix any issues found**

**Step 3: Verify no "mastery" or "mastered" text anywhere**

Run: grep -ri "master" across all JS/HTML/CSS files. Fix any remaining instances.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes and polish for redesign"
```

---

## Task 9: Final review

**Step 1: Run the code-reviewer agent**

Review all changes against the design doc to ensure nothing was missed.

**Step 2: Test one more time end-to-end**

Fresh browser (clear localStorage), walk through both paths completely.
