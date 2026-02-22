# Product Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the SOCI 101 Exam Review app from a developer prototype into a polished, phone-first dark-mode study tool with XP, streaks, leaderboard, term skipping, exam mode, and smarter sessions.

**Architecture:** Vanilla JS overhaul — keep existing module pattern (App, ContentLoader, Progress, QuizEngine, UI, Sync). Add new CSS theme, extend Progress with XP/streak/skip tracking, enhance QuizEngine with session size and exam mode, upgrade UI rendering, and expand Sync/Apps Script for leaderboard.

**Tech Stack:** Vanilla JS (ES6 modules pattern), CSS custom properties, Google Apps Script, localStorage.

---

### Task 1: Dark Theme CSS Foundation

**Files:**
- Modify: `css/style.css` (full rewrite of `:root` variables and base styles)
- Modify: `css/components.css` (update all component colors to use dark tokens)

**Step 1: Replace CSS variables in style.css**

Replace the `:root` block in `css/style.css` with:

```css
:root {
    /* Dark theme */
    --color-bg: #0d1117;
    --color-surface: #161b22;
    --color-surface-hover: #1c2129;
    --color-text: #e6edf3;
    --color-text-secondary: #8b949e;
    --color-primary: #58a6ff;
    --color-primary-hover: #79b8ff;
    --color-success: #3fb950;
    --color-success-bg: rgba(63, 185, 80, 0.15);
    --color-error: #f85149;
    --color-error-bg: rgba(248, 81, 73, 0.15);
    --color-border: #30363d;
    --color-progress-bg: #21262d;
    --color-level-locked: #484f58;
    --color-level-active: #58a6ff;
    --color-level-done: #3fb950;
    --color-xp: #d2a8ff;
    --color-streak: #f0883e;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.4);
    --transition: 0.2s ease;
}
```

**Step 2: Update body and surface styles**

In `css/style.css`, update `body` background and text to use the new vars. The welcome form input should use `var(--color-surface)` background and `var(--color-text)` color. The `.welcome-form input:focus` border-color stays `var(--color-primary)`.

**Step 3: Update components.css for dark mode**

Go through every component in `css/components.css`:
- `.btn-secondary`: background `var(--color-surface)`, color `var(--color-text)`, border `var(--color-border)`. Hover: `var(--color-surface-hover)`.
- `.chapter-card`: background `var(--color-surface)`. Hover: `var(--color-surface-hover)`.
- `.concept-row`: background `var(--color-surface)`.
- `.choice-btn`: background `var(--color-surface)`, border `var(--color-border)`, color `var(--color-text)`. Hover: border `var(--color-primary)`, background `rgba(88, 166, 255, 0.1)` (NOT the old #f0f3ff).
- `.btn-knew-it`: background `var(--color-success-bg)`, border `var(--color-success)`. Hover: background `var(--color-success)`.
- `.btn-didnt-know`: background `var(--color-error-bg)`, border `var(--color-error)`. Hover: background `var(--color-error)`.
- `.recall-toggle-slider::after`: background `var(--color-text)` (not hardcoded white).

**Step 4: Verify visually**

Open `index.html` in a browser. Every screen should have dark backgrounds, light text, and blue/green/red accents. No white backgrounds should remain. Fix any missed hardcoded colors.

**Step 5: Commit**

```bash
git add css/style.css css/components.css
git commit -m "feat: dark theme foundation — replace light palette with dark mode"
```

---

### Task 2: Phone-First Layout Adjustments

**Files:**
- Modify: `css/style.css` (container, welcome screen, responsive breakpoints)
- Modify: `css/components.css` (chapter grid, buttons, touch targets)

**Step 1: Remove max-width on mobile, keep on desktop**

In `css/style.css`, change `.container`:
```css
.container {
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    padding: 12px 16px;
}
```

Reduce max-width from 800px to 600px (better for phone-first). The container already works at 100% on mobile.

**Step 2: Increase touch targets**

In `css/components.css`:
- `.choice-btn`: increase padding to `16px 18px`, min-height to `52px`.
- `.btn-primary`: min-height `52px` on mobile.
- `.btn-next`: min-height `52px`.
- Add gap between choice buttons: `.choices` gap from `10px` to `12px`.

**Step 3: Bottom-anchor primary actions on study screen**

In `css/style.css`, add to `.question-area`:
```css
.question-area {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    min-height: calc(100dvh - 80px);
}
.choices {
    flex: 1;
}
.btn-next, .btn-show-answer {
    margin-top: auto;
    position: sticky;
    bottom: 16px;
}
```

This pushes the Next/Show Answer button to the bottom of the viewport — thumb-friendly.

**Step 4: Verify on mobile viewport**

Open Chrome DevTools, toggle device toolbar (iPhone 14 size). Check:
- Welcome screen centered
- Dashboard cards full-width
- Chapter detail scrollable
- Study session: question at top, choices in middle, Next button at bottom
- All buttons easily tappable

**Step 5: Commit**

```bash
git add css/style.css css/components.css
git commit -m "feat: phone-first layout with larger touch targets and sticky actions"
```

---

### Task 3: XP System in Progress Module

**Files:**
- Modify: `js/progress.js` (add XP tracking, streak tracking, skip tracking)

**Step 1: Add XP constants and state to Progress**

Add these constants near the top of the IIFE (after LEVEL3_PASS):
```javascript
const XP_PER_LEVEL = { 1: 10, 2: 20, 3: 30 };
const STREAK_MULTIPLIERS = { 3: 1.5, 5: 2.0 };
```

Extend `getDefault()` to include:
```javascript
{
    studentName: '',
    concepts: {},
    questions: {},
    xp: 0,
    streak: { current: 0, lastStudyDate: null },
    skippedConcepts: {},  // conceptId -> true
    lastSync: null,
}
```

**Step 2: Add XP recording function**

```javascript
function addXP(level, sessionStreak) {
    const base = XP_PER_LEVEL[level] || 10;
    let multiplier = 1;
    for (const [threshold, mult] of Object.entries(STREAK_MULTIPLIERS)) {
        if (sessionStreak >= parseInt(threshold)) multiplier = mult;
    }
    const earned = Math.round(base * multiplier);
    getData().xp = (getData().xp || 0) + earned;
    save();
    return earned;
}

function getXP() {
    return getData().xp || 0;
}
```

**Step 3: Add daily streak functions**

```javascript
function updateDailyStreak() {
    const data = getData();
    const today = new Date().toDateString();
    const streak = data.streak || { current: 0, lastStudyDate: null };
    if (streak.lastStudyDate === today) return; // Already counted today
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (streak.lastStudyDate === yesterday) {
        streak.current++;
    } else if (streak.lastStudyDate !== today) {
        streak.current = 1; // Reset or first day
    }
    streak.lastStudyDate = today;
    data.streak = streak;
    save();
}

function getDailyStreak() {
    const data = getData();
    const streak = data.streak || { current: 0, lastStudyDate: null };
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (streak.lastStudyDate === today || streak.lastStudyDate === yesterday) {
        return streak.current;
    }
    return 0; // Streak broken
}
```

**Step 4: Add skip functions**

```javascript
function isConceptSkipped(conceptId) {
    return !!getData().skippedConcepts?.[conceptId];
}

function toggleSkipConcept(conceptId) {
    const data = getData();
    if (!data.skippedConcepts) data.skippedConcepts = {};
    if (data.skippedConcepts[conceptId]) {
        delete data.skippedConcepts[conceptId];
    } else {
        data.skippedConcepts[conceptId] = true;
    }
    save();
    return data.skippedConcepts[conceptId] || false;
}

function getSkippedCount(chapter) {
    return chapter.concepts.filter(c => isConceptSkipped(c.id)).length;
}
```

**Step 5: Update getChapterStats to exclude skipped concepts**

Modify the loop in `getChapterStats` to skip over concepts where `isConceptSkipped(concept.id)` is true. Reduce `total` accordingly. This shrinks the denominator so skipped terms don't count against progress.

**Step 6: Export new functions**

Add to the return statement:
```javascript
addXP, getXP,
updateDailyStreak, getDailyStreak,
isConceptSkipped, toggleSkipConcept, getSkippedCount,
XP_PER_LEVEL,
```

**Step 7: Commit**

```bash
git add js/progress.js
git commit -m "feat: add XP, daily streak, and term skipping to Progress module"
```

---

### Task 4: QuizEngine Improvements

**Files:**
- Modify: `js/quiz-engine.js` (configurable session size, skip filtering, back-to-back fix, exam mode, weak-area targeting)

**Step 1: Make session size configurable**

Replace `const SESSION_SIZE = 10;` with:
```javascript
let _sessionSize = 10;
function setSessionSize(size) { _sessionSize = size; }
function getSessionSize() { return _sessionSize; }
```

Change `candidates.slice(0, SESSION_SIZE)` to `candidates.slice(0, _sessionSize)`.

**Step 2: Filter skipped concepts in buildSession**

At the start of the inner loop, add:
```javascript
if (Progress.isConceptSkipped(concept.id)) continue;
```

**Step 3: Fix back-to-back same-concept questions**

Replace the `interleave` function with a stricter version:
```javascript
function interleave(questions) {
    // Try to separate same-concept questions
    for (let i = 1; i < questions.length; i++) {
        if (questions[i].conceptId === questions[i - 1].conceptId) {
            // Find a different-concept question to swap with
            let swapped = false;
            for (let j = i + 1; j < questions.length; j++) {
                if (questions[j].conceptId !== questions[i - 1].conceptId &&
                    (j + 1 >= questions.length || questions[j].conceptId !== questions[i + 1]?.conceptId)) {
                    [questions[i], questions[j]] = [questions[j], questions[i]];
                    swapped = true;
                    break;
                }
            }
            // If can't swap, drop the duplicate and we'll have a shorter session
            if (!swapped && questions.length > 3) {
                questions.splice(i, 1);
                i--; // Re-check this position
            }
        }
    }
    return questions;
}
```

**Step 4: Add weak-area sorting**

In `buildSession`, before the existing sort, compute a weakness score per concept:
```javascript
// Add weakness scoring to candidates
for (const q of candidates) {
    const cp = Progress.getConceptProgress(q.conceptId);
    const totalAttempts = cp.level1.attempts + cp.level2.attempts + cp.level3.attempts;
    const totalCorrect = cp.level1.correct + cp.level2.correct + cp.level3.correct;
    q._weaknessScore = totalAttempts > 0 ? (totalAttempts - totalCorrect) / totalAttempts : 0;
}
```

Update `priorityScore` to use weakness as a tiebreaker:
```javascript
function priorityScore(q) {
    if (q._srDue) return 0 - (q._weaknessScore || 0) * 0.1;
    if (q._inProgress) return 1 - (q._weaknessScore || 0) * 0.1;
    return 2;
}
```

**Step 5: Add exam mode builder**

```javascript
function buildExamSession(chapters, size) {
    if (!Array.isArray(chapters)) chapters = [chapters];
    const allQuestions = [];

    for (const chapter of chapters) {
        for (const concept of chapter.concepts) {
            if (Progress.isConceptSkipped(concept.id)) continue;
            // Add one question per level the student has reached
            const hasL3 = concept.level3_question_ids.length > 0;
            const currentLevel = Progress.getCurrentLevel(concept.id, hasL3);
            // Include up to their current level (or all levels if mastered)
            const maxLvl = currentLevel === 0 ? (hasL3 ? 3 : 2) : currentLevel;
            for (let lvl = 1; lvl <= maxLvl; lvl++) {
                if (lvl === 1) allQuestions.push(makeLevel1Question(chapter, concept));
                else if (lvl === 2) allQuestions.push(makeLevel2Question(chapter, concept));
                else if (lvl === 3) {
                    const qIds = concept.level3_question_ids;
                    if (qIds.length > 0) {
                        const randomId = qIds[Math.floor(Math.random() * qIds.length)];
                        const qData = chapter.chapter_questions.find(cq => cq.id === randomId);
                        if (qData) allQuestions.push(makeLevel3FromData(qData, concept));
                    }
                }
            }
        }
    }

    shuffle(allQuestions);
    return allQuestions.slice(0, size || allQuestions.length);
}
```

**Step 6: Export new functions**

Update return statement:
```javascript
return { buildSession, buildExamSession, recordAnswer, setSessionSize, getSessionSize };
```

**Step 7: Commit**

```bash
git add js/quiz-engine.js
git commit -m "feat: configurable session size, skip filtering, exam mode, back-to-back fix"
```

---

### Task 5: UI Overhaul — Dashboard & Stats Bar

**Files:**
- Modify: `index.html` (add stats bar markup, leaderboard screen, session size selector)
- Modify: `js/ui.js` (render stats bar, updated dashboard, XP flyup)
- Modify: `css/components.css` (stats bar, XP flyup, updated dashboard card styles)

**Step 1: Add persistent stats bar to index.html**

Add this after `<body>` and before the first screen div:
```html
<div id="stats-bar" class="stats-bar hidden">
    <div class="stats-bar-inner">
        <span class="stat-item stat-xp">
            <span class="stat-value" id="stat-xp">0</span>
            <span class="stat-label">XP</span>
        </span>
        <span class="stat-item stat-streak">
            <span class="stat-value" id="stat-streak">0</span>
            <span class="stat-label">day streak</span>
        </span>
        <span class="stat-item stat-mastered">
            <span class="stat-value" id="stat-mastered">0</span>
            <span class="stat-label">mastered</span>
        </span>
    </div>
</div>
```

**Step 2: Add XP flyup container**

Add to index.html, after the stats bar:
```html
<div id="xp-flyup" class="xp-flyup hidden"></div>
```

**Step 3: Add leaderboard screen to index.html**

Add after the summary screen:
```html
<div id="screen-leaderboard" class="screen">
    <div class="container">
        <header class="top-bar">
            <button id="btn-back-from-leaderboard" class="btn btn-back">&larr; Back</button>
            <h2>Leaderboard</h2>
            <button id="btn-refresh-leaderboard" class="btn btn-small">Refresh</button>
        </header>
        <div id="leaderboard-list" class="leaderboard-list">
            <p class="text-secondary">Loading...</p>
        </div>
    </div>
</div>
```

**Step 4: Add leaderboard button to dashboard**

In the dashboard's `top-bar-right`, add a leaderboard button before the Review All button:
```html
<button id="btn-leaderboard" class="btn btn-small btn-secondary">Leaderboard</button>
```

**Step 5: Add session size selector to chapter detail**

In the chapter detail `top-bar-right` (before the Study button), add:
```html
<select id="session-size-select" class="session-size-select">
    <option value="5">5 Qs</option>
    <option value="10" selected>10 Qs</option>
    <option value="20">20 Qs</option>
</select>
```

**Step 6: Add exam mode button to chapter detail**

Below the `chapter-stats` paragraph, add:
```html
<button id="btn-exam-mode" class="btn btn-secondary btn-small" style="margin-top:12px;">Exam Mode</button>
```

**Step 7: Style stats bar in components.css**

```css
/* Stats Bar */
.stats-bar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 8px 16px;
}
.stats-bar-inner {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    justify-content: space-around;
    gap: 12px;
}
.stat-item {
    display: flex;
    align-items: baseline;
    gap: 4px;
}
.stat-value {
    font-weight: 700;
    font-size: 1rem;
}
.stat-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
}
.stat-xp .stat-value { color: var(--color-xp); }
.stat-streak .stat-value { color: var(--color-streak); }
.stat-mastered .stat-value { color: var(--color-success); }
```

**Step 8: Style XP flyup**

```css
/* XP Flyup */
.xp-flyup {
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-xp);
    pointer-events: none;
    z-index: 200;
    animation: flyup 1s ease-out forwards;
}
@keyframes flyup {
    0% { opacity: 1; transform: translateX(-50%) translateY(0); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-40px); }
}
```

**Step 9: Style session size select**

```css
/* Session Size Select */
.session-size-select {
    background: var(--color-surface);
    color: var(--color-text);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 40px;
}
```

**Step 10: Style leaderboard**

```css
/* Leaderboard */
.leaderboard-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.leaderboard-row {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    gap: 12px;
}
.leaderboard-rank {
    font-weight: 700;
    font-size: 1rem;
    color: var(--color-text-secondary);
    min-width: 28px;
    text-align: center;
}
.leaderboard-rank.top-3 {
    color: var(--color-streak);
}
.leaderboard-name {
    flex: 1;
    font-weight: 600;
    font-size: 0.9rem;
}
.leaderboard-name.is-you {
    color: var(--color-primary);
}
.leaderboard-xp {
    font-weight: 700;
    color: var(--color-xp);
    font-size: 0.85rem;
}
.leaderboard-mastery {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    min-width: 40px;
    text-align: right;
}
```

**Step 11: Update UI.renderDashboard to show stats bar**

In `js/ui.js`, at the top of `renderDashboard()`:
```javascript
// Update stats bar
document.getElementById('stats-bar').classList.remove('hidden');
document.getElementById('stat-xp').textContent = Progress.getXP();
document.getElementById('stat-streak').textContent = Progress.getDailyStreak();
// Count total mastered across all chapters
const chapters = ContentLoader.getChapters();
let totalMastered = 0;
for (const ch of chapters) {
    const stats = Progress.getChapterStats(ch);
    totalMastered += stats.mastered;
}
document.getElementById('stat-mastered').textContent = totalMastered;
```

**Step 12: Add XP flyup function to UI**

```javascript
function showXPFlyup(amount) {
    const el = document.getElementById('xp-flyup');
    el.textContent = `+${amount} XP`;
    el.classList.remove('hidden');
    // Reset animation
    el.style.animation = 'none';
    el.offsetHeight; // Trigger reflow
    el.style.animation = '';
    setTimeout(() => el.classList.add('hidden'), 1000);
}
```

**Step 13: Integrate XP flyup into handleAnswer**

In `handleAnswer()`, after `if (wasCorrect)`:
```javascript
if (wasCorrect) {
    _sessionCorrect++;
    _sessionConsecutiveCorrect++;
    const earned = Progress.addXP(q.level, _sessionConsecutiveCorrect);
    showXPFlyup(earned);
    updateStatsBar();
} else {
    _sessionConsecutiveCorrect = 0;
}
```

Add `_sessionConsecutiveCorrect` variable alongside the other session vars, initialized to 0 in `startStudySession`.

Do the same in `handleSelfGrade` — if `knewIt` is true, increment streak and award XP; otherwise reset streak.

**Step 14: Add updateStatsBar helper**

```javascript
function updateStatsBar() {
    document.getElementById('stat-xp').textContent = Progress.getXP();
    document.getElementById('stat-streak').textContent = Progress.getDailyStreak();
}
```

**Step 15: Commit**

```bash
git add index.html js/ui.js css/components.css
git commit -m "feat: stats bar, XP flyup, leaderboard screen, session size selector"
```

---

### Task 6: UI — Chapter Detail with Skip Toggles & Confusable Hints

**Files:**
- Modify: `js/ui.js` (renderChapterDetail — add skip buttons, confusable labels, skipped counter)
- Modify: `css/components.css` (skip toggle styles, confusable hint styles, trouble-spot indicator)

**Step 1: Update renderChapterDetail in ui.js**

Replace the concept list rendering loop. For each concept row, add:
1. A skip toggle button (small "x" or eye icon) on the left
2. The term name
3. A "trouble spot" indicator (red dot) if attempts > 0 and correct rate < 50%
4. Confusable hint text below term: "Often confused with: X, Y"
5. Level dots on the right

```javascript
// At top of concept list, before legend:
const skippedCount = Progress.getSkippedCount(chapter);
if (skippedCount > 0) {
    const skippedLabel = document.createElement('div');
    skippedLabel.className = 'skipped-count';
    skippedLabel.textContent = `${skippedCount} term${skippedCount > 1 ? 's' : ''} skipped`;
    list.appendChild(skippedLabel);
}

// Inside concept loop:
const isSkipped = Progress.isConceptSkipped(concept.id);
row.className = 'concept-row' + (isSkipped ? ' skipped' : '');

// Add skip button
const skipBtn = document.createElement('button');
skipBtn.className = 'btn-skip';
skipBtn.textContent = isSkipped ? '↩' : '✕';
skipBtn.title = isSkipped ? 'Restore term' : 'Skip term';
skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    Progress.toggleSkipConcept(concept.id);
    renderChapterDetail(chapter); // Re-render
});

// Add confusable hints (only for non-skipped)
let confusableHtml = '';
if (!isSkipped && concept.confusable_ids && concept.confusable_ids.length > 0) {
    const confusableNames = concept.confusable_ids
        .slice(0, 3) // Show at most 3
        .map(id => chapter.concepts.find(c => c.id === id))
        .filter(Boolean)
        .map(c => c.term);
    if (confusableNames.length > 0) {
        confusableHtml = `<div class="confusable-hint">Often confused with: ${confusableNames.join(', ')}</div>`;
    }
}

// Trouble spot: more than 2 total incorrect attempts
const cp = Progress.getConceptProgress(concept.id);
const totalAttempts = cp.level1.attempts + cp.level2.attempts + cp.level3.attempts;
const totalCorrect = cp.level1.correct + cp.level2.correct + cp.level3.correct;
const isTroubleSpot = totalAttempts >= 3 && (totalCorrect / totalAttempts) < 0.5;

row.innerHTML = '';
row.appendChild(skipBtn);
const termContainer = document.createElement('div');
termContainer.className = 'concept-term-container';
termContainer.innerHTML = `
    <span class="concept-term">${concept.term}${isTroubleSpot ? ' <span class="trouble-dot" title="Trouble spot">●</span>' : ''}</span>
    ${confusableHtml}
`;
row.appendChild(termContainer);
const dotsContainer = document.createElement('div');
dotsContainer.className = 'concept-levels';
dotsContainer.innerHTML = dotsHtml;
row.appendChild(dotsContainer);
```

**Step 2: Style skip button and confusable hints**

Add to `css/components.css`:
```css
/* Skip Button */
.btn-skip {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    min-width: 32px;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.btn-skip:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
}

/* Skipped concept row */
.concept-row.skipped {
    opacity: 0.4;
}
.concept-row.skipped .concept-term {
    text-decoration: line-through;
}

/* Skipped count label */
.skipped-count {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    padding: 6px 14px;
}

/* Confusable hints */
.concept-term-container {
    flex: 1;
    min-width: 0;
}
.confusable-hint {
    font-size: 0.7rem;
    color: var(--color-text-secondary);
    margin-top: 2px;
    font-style: italic;
}

/* Trouble spot indicator */
.trouble-dot {
    color: var(--color-error);
    font-size: 0.6rem;
}
```

**Step 3: Commit**

```bash
git add js/ui.js css/components.css
git commit -m "feat: term skipping, confusable hints, and trouble-spot indicators"
```

---

### Task 7: UI — Study Session & Summary Upgrades

**Files:**
- Modify: `js/ui.js` (enhanced feedback, improved summary with XP/streak/nudge)
- Modify: `css/components.css` (summary card styling)

**Step 1: Enhance wrong-answer feedback**

In `handleAnswer()`, when incorrect, show more context. For L1/L2, show the correct answer definition. For L3, the correct choice is already shown — but we should also note which concept it relates to.

Update the incorrect feedback text:
```javascript
if (!wasCorrect) {
    feedback.classList.add('incorrect');
    if (q.level <= 2) {
        feedbackText.textContent = `The answer is: ${q.choices[q.correctIndex]}`;
    } else {
        feedbackText.textContent = `Incorrect. The correct answer is: ${q.choices[q.correctIndex]}`;
    }
}
```

**Step 2: Track leveled-up concepts during session**

Add a `_sessionLevelUps` array, initialized to `[]` in `startStudySession`. After `recordAnswer`, check if a level was just passed:

```javascript
// After recording answer in handleAnswer/handleSelfGrade:
if (wasCorrect) {
    const hasL3 = /* lookup from content */ true;
    const prevLevel = q.level;
    if (Progress.isLevelPassed(q.conceptId, prevLevel)) {
        const concept = findConceptById(q.conceptId);
        if (concept) {
            _sessionLevelUps.push({ term: concept.term, level: prevLevel });
        }
    }
}
```

Add a helper `findConceptById` that searches ContentLoader chapters.

**Step 3: Upgrade session summary**

Replace `renderSessionSummary` with:
```javascript
function renderSessionSummary() {
    showScreen('summary');
    const total = _sessionQuestions.length;

    // Update daily streak
    if (total > 0) Progress.updateDailyStreak();

    const scoreEl = document.getElementById('summary-score');
    scoreEl.textContent = total > 0 ? `${_sessionCorrect}/${total}` : '';

    const details = document.getElementById('summary-details');
    let html = '';

    if (total === 0) {
        html = 'All concepts mastered and no reviews are due. Nice work!';
    } else {
        const pct = Math.round((_sessionCorrect / total) * 100);
        html += `<div class="summary-stat">${pct}% correct</div>`;

        // XP earned this session
        const xpEarned = _sessionXPEarned || 0;
        if (xpEarned > 0) {
            html += `<div class="summary-stat summary-xp">+${xpEarned} XP earned</div>`;
        }

        // Streak
        const streak = Progress.getDailyStreak();
        if (streak > 1) {
            html += `<div class="summary-stat summary-streak">${streak} day streak!</div>`;
        }

        // Level-ups
        if (_sessionLevelUps.length > 0) {
            html += '<div class="summary-levelups">';
            for (const lu of _sessionLevelUps) {
                html += `<div class="summary-levelup">✓ ${lu.term} — Level ${lu.level} passed</div>`;
            }
            html += '</div>';
        }
    }
    details.innerHTML = html;

    // Update stats bar
    updateStatsBar();

    // Sync at session end
    Sync.pushProgress();
}
```

Add `_sessionXPEarned` variable, initialized to 0 in `startStudySession`, incremented whenever `addXP` is called.

**Step 4: Style summary enhancements**

Add to `css/components.css`:
```css
.summary-stat {
    font-size: 1rem;
    margin-bottom: 4px;
}
.summary-xp {
    color: var(--color-xp);
    font-weight: 700;
}
.summary-streak {
    color: var(--color-streak);
    font-weight: 700;
}
.summary-levelups {
    margin-top: 12px;
    text-align: left;
}
.summary-levelup {
    font-size: 0.9rem;
    color: var(--color-success);
    padding: 4px 0;
}
```

**Step 5: Commit**

```bash
git add js/ui.js css/components.css
git commit -m "feat: enhanced session summary with XP, streaks, and level-ups"
```

---

### Task 8: App Wiring — Events for New Features

**Files:**
- Modify: `js/app.js` (wire session size selector, exam mode button, leaderboard button, new screen routing)

**Step 1: Wire session size selector**

In `setupEvents()`, add:
```javascript
// Session size
const sizeSelect = document.getElementById('session-size-select');
sizeSelect.addEventListener('change', () => {
    QuizEngine.setSessionSize(parseInt(sizeSelect.value));
});
```

**Step 2: Wire exam mode button**

```javascript
document.getElementById('btn-exam-mode').addEventListener('click', () => {
    if (_currentChapterId) {
        const chapter = ContentLoader.getChapter(_currentChapterId);
        const session = QuizEngine.buildExamSession(chapter);
        UI.startStudySession(session, { examMode: true });
        window.location.hash = 'study';
    }
});
```

**Step 3: Wire leaderboard**

```javascript
document.getElementById('btn-leaderboard').addEventListener('click', () => {
    UI.showScreen('leaderboard');
    UI.renderLeaderboard();
    window.location.hash = 'leaderboard';
});
document.getElementById('btn-back-from-leaderboard').addEventListener('click', () => {
    showDashboard();
});
document.getElementById('btn-refresh-leaderboard').addEventListener('click', () => {
    UI.renderLeaderboard();
});
```

**Step 4: Update handleHash for leaderboard**

Add to `handleHash`:
```javascript
else if (hash === 'leaderboard' && Progress.getStudentName()) {
    UI.showScreen('leaderboard');
    UI.renderLeaderboard();
}
```

**Step 5: Hide stats bar on welcome screen**

In `showDashboard` or wherever the welcome screen is shown, toggle the stats bar visibility:
```javascript
// In init, when showing welcome:
document.getElementById('stats-bar').classList.add('hidden');

// In showDashboard:
document.getElementById('stats-bar').classList.remove('hidden');
```

**Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat: wire session size, exam mode, and leaderboard navigation"
```

---

### Task 9: Exam Mode UI

**Files:**
- Modify: `js/ui.js` (exam mode flag, timer, deferred feedback)
- Modify: `css/components.css` (timer styling)

**Step 1: Add exam mode state to UI**

Add near the session state variables:
```javascript
let _examMode = false;
let _examTimer = null;
let _examTimeLeft = 0;
let _examAnswers = []; // Store answers for end-of-exam review
```

Update `startStudySession` signature:
```javascript
function startStudySession(questions, options = {}) {
    _examMode = options.examMode || false;
    // ... existing init ...
    _examAnswers = [];
    if (_examMode) {
        startExamTimer(options.timeLimit || 0);
    }
}
```

**Step 2: Modify renderQuestion for exam mode**

In exam mode, after selecting an answer, do NOT show feedback — just record and advance:
```javascript
function handleAnswer(selectedIndex) {
    if (_answered) return;
    _answered = true;
    const q = _sessionQuestions[_sessionIndex];
    const wasCorrect = QuizEngine.recordAnswer(q, selectedIndex);
    if (wasCorrect) _sessionCorrect++;

    if (_examMode) {
        // Store answer for review at end, advance immediately
        _examAnswers.push({ question: q, selected: selectedIndex, correct: wasCorrect });
        // Brief highlight (200ms) then auto-advance
        const btns = document.querySelectorAll('#choices .choice-btn');
        btns[selectedIndex].classList.add('selected-neutral');
        setTimeout(() => nextQuestion(), 200);
        return;
    }

    // ... existing non-exam feedback logic ...
}
```

**Step 3: Add timer**

```javascript
function startExamTimer(minutes) {
    const timerEl = document.getElementById('study-progress-label');
    if (!minutes) {
        // Untimed — just show question count
        return;
    }
    _examTimeLeft = minutes * 60;
    _examTimer = setInterval(() => {
        _examTimeLeft--;
        const m = Math.floor(_examTimeLeft / 60);
        const s = String(_examTimeLeft % 60).padStart(2, '0');
        timerEl.textContent = `${m}:${s}`;
        if (_examTimeLeft <= 0) {
            clearInterval(_examTimer);
            renderSessionSummary();
        }
    }, 1000);
}
```

Clear timer in `renderSessionSummary`:
```javascript
if (_examTimer) { clearInterval(_examTimer); _examTimer = null; }
```

**Step 4: Style neutral selection for exam mode**

```css
.choice-btn.selected-neutral {
    border-color: var(--color-primary);
    background: rgba(88, 166, 255, 0.15);
}
```

**Step 5: Commit**

```bash
git add js/ui.js css/components.css
git commit -m "feat: exam mode with deferred feedback and optional timer"
```

---

### Task 10: Sync & Leaderboard

**Files:**
- Modify: `js/sync.js` (change sync to session-end only, add leaderboard pull)
- Modify: `apps-script/Code.gs` (add leaderboard endpoint, add XP/streak columns)
- Modify: `js/ui.js` (renderLeaderboard function)

**Step 1: Update sync.js — session-end only**

Replace the `onAnswer` logic:
```javascript
let _hasUnsavedProgress = false;

function onAnswer() {
    _hasUnsavedProgress = true;
    // No longer pushes every N answers
}
```

The push now only happens from `renderSessionSummary` (already added in Task 7) and the unload beacon.

Update `setupUnloadSync` to check `_hasUnsavedProgress`:
```javascript
function setupUnloadSync() {
    window.addEventListener('beforeunload', () => {
        if (!APPS_SCRIPT_URL || !_hasUnsavedProgress) return;
        const payload = Progress.getSyncPayload(ContentLoader.getChapters());
        navigator.sendBeacon(APPS_SCRIPT_URL, JSON.stringify(payload));
        _hasUnsavedProgress = false;
    });
}
```

Update `pushProgress` to reset flag:
```javascript
async function pushProgress() {
    if (!APPS_SCRIPT_URL) return;
    const payload = Progress.getSyncPayload(ContentLoader.getChapters());
    // Add XP and streak to payload
    payload.xp = Progress.getXP();
    payload.streak = Progress.getDailyStreak();
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
        });
        Progress.getData().lastSync = Date.now();
        Progress.save();
        _hasUnsavedProgress = false;
    } catch (e) { /* silent */ }
}
```

**Step 2: Add leaderboard fetch**

```javascript
let _leaderboardCache = null;

async function fetchLeaderboard() {
    if (!APPS_SCRIPT_URL) return [];
    // Return cache if fresh (within this session)
    if (_leaderboardCache) return _leaderboardCache;
    try {
        const resp = await fetch(`${APPS_SCRIPT_URL}?action=leaderboard`);
        if (resp.ok) {
            _leaderboardCache = await resp.json();
            return _leaderboardCache;
        }
    } catch (e) { /* silent */ }
    return [];
}

function clearLeaderboardCache() {
    _leaderboardCache = null;
}
```

Export: `fetchLeaderboard, clearLeaderboardCache`

**Step 3: Update Code.gs — add leaderboard endpoint**

In `doGet`, check for `action=leaderboard`:
```javascript
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'leaderboard') {
      return getLeaderboard();
    }

    // ... existing name-based lookup ...
  } catch (err) { ... }
}

function getLeaderboard() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Find column indices
  const nameCol = 0;
  const xpCol = headers.indexOf('XP');
  const streakCol = headers.indexOf('Streak');
  const masteryCol = headers.indexOf('Mastery %');

  const leaderboard = data
    .filter(row => row[nameCol])
    .map(row => ({
      name: formatName(row[nameCol]),
      xp: xpCol >= 0 ? (row[xpCol] || 0) : 0,
      streak: streakCol >= 0 ? (row[streakCol] || 0) : 0,
      mastery: masteryCol >= 0 ? (row[masteryCol] || 0) : 0,
    }))
    .sort((a, b) => b.xp - a.xp);

  return ContentService.createTextOutput(JSON.stringify(leaderboard))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
  }
  return parts[0];
}
```

**Step 4: Update Code.gs upsertStudent to include XP, streak, mastery columns**

Update the headers to include XP, Streak, Mastery % columns (after chapter columns, before Full JSON):
```javascript
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ['Name', 'Last Sync'];
    for (let i = 1; i <= NUM_CHAPTERS; i++) {
      headers.push('Ch' + String(i).padStart(2, '0') + ' %');
    }
    headers.push('XP', 'Streak', 'Mastery %', 'Full JSON');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}
```

Update `upsertStudent` to write XP, streak, and overall mastery:
```javascript
function upsertStudent(sheet, data) {
  const name = data.studentName;
  if (!name) return;
  let row = findStudentRow(sheet, name);
  if (!row) row = sheet.getLastRow() + 1;

  const values = [name, new Date().toISOString()];
  for (let i = 1; i <= NUM_CHAPTERS; i++) {
    const chId = 'ch' + String(i).padStart(2, '0');
    values.push(data.chapterProgress[chId] || 0);
  }
  values.push(data.xp || 0);
  values.push(data.streak || 0);
  // Compute overall mastery as average of chapter percentages
  let totalPct = 0;
  for (let i = 1; i <= NUM_CHAPTERS; i++) {
    const chId = 'ch' + String(i).padStart(2, '0');
    totalPct += (data.chapterProgress[chId] || 0);
  }
  values.push(Math.round(totalPct / NUM_CHAPTERS));
  values.push(JSON.stringify(data.fullData));

  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}
```

**Step 5: Add renderLeaderboard to ui.js**

```javascript
async function renderLeaderboard() {
    const listEl = document.getElementById('leaderboard-list');
    listEl.innerHTML = '<p class="text-secondary">Loading...</p>';

    const data = await Sync.fetchLeaderboard();
    if (!data || data.length === 0) {
        listEl.innerHTML = '<p class="text-secondary">No leaderboard data yet. Complete a study session to appear!</p>';
        return;
    }

    const myName = Progress.getStudentName();
    listEl.innerHTML = '';
    data.forEach((entry, idx) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        const isYou = myName && entry.name.startsWith(myName.split(' ')[0]);
        row.innerHTML = `
            <span class="leaderboard-rank ${idx < 3 ? 'top-3' : ''}">${idx + 1}</span>
            <span class="leaderboard-name ${isYou ? 'is-you' : ''}">${entry.name}${isYou ? ' (you)' : ''}</span>
            <span class="leaderboard-xp">${entry.xp} XP</span>
            <span class="leaderboard-mastery">${entry.mastery}%</span>
        `;
        listEl.appendChild(row);
    });
}
```

Export `renderLeaderboard` from UI.

**Step 6: Commit**

```bash
git add js/sync.js js/ui.js apps-script/Code.gs
git commit -m "feat: leaderboard via Google Sheets, session-end-only sync"
```

---

### Task 11: Polish & Integration Testing

**Files:**
- All files (review pass)

**Step 1: Test welcome → dashboard flow**

Open in Chrome mobile viewport. Enter name, verify stats bar appears with 0 XP, 0 streak, 0 mastered.

**Step 2: Test study session**

Pick a chapter, study 5 questions. Verify:
- XP flyup on correct answers
- No back-to-back same-concept questions
- Stats bar updates in real-time
- Streak multiplier kicks in at 3 consecutive correct

**Step 3: Test session summary**

Complete session. Verify:
- Score shown
- XP earned total
- Level-ups listed
- Streak displayed if > 1 day

**Step 4: Test term skipping**

In chapter detail, skip 2 terms. Verify:
- Terms show as grayed out with strikethrough
- Skipped count shown
- Study session excludes those terms
- Chapter progress % recalculates (smaller denominator)

**Step 5: Test exam mode**

Click "Exam Mode" on a chapter. Verify:
- No feedback shown between questions
- Brief highlight then auto-advance
- Summary at end shows results

**Step 6: Test session size**

Change dropdown to 5, start session. Verify only 5 questions appear. Change to 20, verify up to 20 questions.

**Step 7: Test leaderboard**

Click leaderboard button. If no Apps Script URL configured, verify graceful empty state message. If configured, verify data loads and displays.

**Step 8: Test recall mode**

Enable recall toggle, study L2+ question. Verify choices hidden, Show Answer works, self-grade works, XP awarded on "I knew it".

**Step 9: Fix any visual issues**

Check all screens in dark mode for any remaining light-mode artifacts (white backgrounds, dark text on dark background, etc.).

**Step 10: Commit**

```bash
git add -A
git commit -m "fix: polish pass — visual fixes and integration testing cleanup"
```

---

### Task 12: Update getSyncPayload for New Fields

**Files:**
- Modify: `js/progress.js` (include XP and streak in sync payload)

**Step 1: Update getSyncPayload**

The sync payload needs to include XP and streak so the Google Sheet receives them:
```javascript
function getSyncPayload(chapters) {
    const chapterProgress = {};
    for (const ch of chapters) {
        const stats = getChapterStats(ch);
        chapterProgress[ch.id] = stats.pct;
    }
    return {
        studentName: getStudentName(),
        chapterProgress,
        xp: getXP(),
        streak: getDailyStreak(),
        fullData: getData(),
    };
}
```

**Step 2: Commit**

```bash
git add js/progress.js
git commit -m "feat: include XP and streak in sync payload"
```
