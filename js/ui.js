/**
 * DOM manipulation and screen rendering.
 */
const UI = (() => {
    const screens = {};

    function init() {
        document.querySelectorAll('.screen').forEach(el => {
            screens[el.id] = el;
        });
    }

    function showScreen(id) {
        Object.values(screens).forEach(el => el.classList.remove('active'));
        const target = screens[`screen-${id}`];
        if (target) {
            target.classList.add('active');
            window.scrollTo(0, 0);
        }
    }

    // --- Dashboard ---

    function renderDashboard() {
        const grid = document.getElementById('chapter-grid');
        grid.innerHTML = '';
        const chapters = ContentLoader.getChapters();

        // Show and update stats bar
        document.getElementById('stats-bar').classList.remove('hidden');
        document.getElementById('stat-xp').textContent = Progress.getXP();
        document.getElementById('stat-streak').textContent = Progress.getDailyStreak();
        let totalMastered = 0;
        for (const ch of chapters) {
            const stats = Progress.getChapterStats(ch);
            totalMastered += stats.mastered;
        }
        document.getElementById('stat-mastered').textContent = totalMastered;

        for (const ch of chapters) {
            const stats = Progress.getChapterStats(ch);
            const card = document.createElement('div');
            card.className = 'chapter-card' + (stats.pct === 100 ? ' mastered' : '');
            card.dataset.chapterId = ch.id;
            const fillClass = stats.pct === 100 ? ' complete' : '';
            const statusText = stats.mastered === stats.total
                ? `All ${stats.total} concepts mastered!`
                : stats.levelsDone > 0
                    ? `${stats.levelsDone}/${stats.levelsTotal} levels passed`
                    : stats.started > 0
                        ? `${stats.started} concept${stats.started === 1 ? '' : 's'} started`
                        : `${stats.total} concepts`;
            card.innerHTML = `
                <div class="chapter-card-title">${ch.name}</div>
                <div class="chapter-card-stats">${statusText}</div>
                <div class="progress-bar"><div class="progress-fill${fillClass}" style="width:${stats.pct}%"></div></div>
            `;
            card.addEventListener('click', () => App.showChapter(ch.id));
            grid.appendChild(card);
        }
    }

    // --- Chapter Detail ---

    function renderChapterDetail(chapter) {
        document.getElementById('chapter-title').textContent = chapter.name;
        const stats = Progress.getChapterStats(chapter);
        const bar = document.querySelector('#chapter-progress-bar .progress-fill');
        bar.style.width = stats.pct + '%';
        bar.className = 'progress-fill' + (stats.pct === 100 ? ' complete' : '');
        const statsText = stats.mastered === stats.total
            ? `All ${stats.total} concepts mastered!`
            : `${stats.levelsDone} of ${stats.levelsTotal} levels passed \u00b7 ${stats.mastered} of ${stats.total} concepts mastered`;
        document.getElementById('chapter-stats').textContent = statsText;

        const list = document.getElementById('concept-list');
        list.innerHTML = '';

        // Add legend
        const legend = document.createElement('div');
        legend.className = 'level-legend';
        legend.innerHTML = `
            <span class="level-legend-item"><span class="level-dot done"></span> Passed</span>
            <span class="level-legend-item"><span class="level-dot active"></span> In progress</span>
            <span class="level-legend-item"><span class="level-dot"></span> Locked</span>
        `;
        list.appendChild(legend);

        // Show skipped count label if any terms are skipped
        const skippedCount = Progress.getSkippedCount(chapter);
        if (skippedCount > 0) {
            const skippedLabel = document.createElement('div');
            skippedLabel.className = 'skipped-count';
            skippedLabel.textContent = skippedCount + ' term' + (skippedCount > 1 ? 's' : '') + ' skipped';
            list.appendChild(skippedLabel);
        }

        for (const concept of chapter.concepts) {
            const hasL3 = concept.level3_question_ids.length > 0;
            const maxLevel = hasL3 ? 3 : 2;
            const currentLevel = Progress.getCurrentLevel(concept.id, hasL3);

            const row = document.createElement('div');
            const isSkipped = Progress.isConceptSkipped(concept.id);
            row.className = 'concept-row' + (isSkipped ? ' skipped' : '');

            let dotsHtml = '';
            for (let lvl = 1; lvl <= maxLevel; lvl++) {
                let dotClass = 'level-dot';
                if (Progress.isLevelPassed(concept.id, lvl)) {
                    dotClass += ' done';
                } else if (lvl === currentLevel) {
                    dotClass += ' active';
                }
                const levelNames = { 1: 'Term → Definition', 2: 'Definition → Term', 3: 'Application' };
                dotsHtml += `<div class="${dotClass}" title="Level ${lvl}: ${levelNames[lvl]}"></div>`;
            }

            // Skip button
            const skipBtn = document.createElement('button');
            skipBtn.className = 'btn-skip';
            skipBtn.textContent = isSkipped ? '\u21a9' : '\u2715';
            skipBtn.title = isSkipped ? 'Restore term' : 'Skip term';
            skipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                Progress.toggleSkipConcept(concept.id);
                renderChapterDetail(chapter);
            });
            row.appendChild(skipBtn);

            // Term container with confusable hints and trouble spot
            const termContainer = document.createElement('div');
            termContainer.className = 'concept-term-container';

            // Check for trouble spot
            const cp = Progress.getConceptProgress(concept.id);
            const totalAttempts = cp.level1.attempts + cp.level2.attempts + cp.level3.attempts;
            const totalCorrect = cp.level1.correct + cp.level2.correct + cp.level3.correct;
            const isTroubleSpot = totalAttempts >= 3 && (totalCorrect / totalAttempts) < 0.5;

            let termHtml = '<span class="concept-term">' + concept.term;
            if (isTroubleSpot) {
                termHtml += ' <span class="trouble-dot" title="Trouble spot">\u25cf</span>';
            }
            termHtml += '</span>';

            // Confusable hints (only for non-skipped)
            if (!isSkipped && concept.confusable_ids && concept.confusable_ids.length > 0) {
                const confusableNames = concept.confusable_ids
                    .slice(0, 3)
                    .map(id => chapter.concepts.find(c => c.id === id))
                    .filter(Boolean)
                    .map(c => c.term);
                if (confusableNames.length > 0) {
                    termHtml += '<div class="confusable-hint">Often confused with: ' + confusableNames.join(', ') + '</div>';
                }
            }

            termContainer.innerHTML = termHtml;
            row.appendChild(termContainer);

            // Level dots
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'concept-levels';
            dotsContainer.innerHTML = dotsHtml;
            row.appendChild(dotsContainer);

            list.appendChild(row);
        }
    }

    // --- Study Session ---

    let _sessionQuestions = [];
    let _sessionIndex = 0;
    let _sessionCorrect = 0;
    let _answered = false;

    function startStudySession(questions) {
        _sessionQuestions = questions;
        _sessionIndex = 0;
        _sessionCorrect = 0;
        if (questions.length === 0) {
            renderSessionSummary();
            return;
        }
        showScreen('study');
        renderQuestion();
    }

    function renderQuestion() {
        _answered = false;
        const q = _sessionQuestions[_sessionIndex];
        document.getElementById('study-progress-label').textContent =
            `${_sessionIndex + 1} / ${_sessionQuestions.length}`;
        document.getElementById('question-level').textContent = q.levelLabel;
        document.getElementById('question-text').textContent = q.text;
        document.getElementById('question-area').dataset.correctIndex = q.correctIndex;

        const feedback = document.getElementById('feedback');
        feedback.classList.add('hidden');
        feedback.className = 'feedback hidden';
        document.getElementById('btn-next').classList.add('hidden');

        const container = document.getElementById('choices');
        container.innerHTML = '';
        q.choices.forEach((choice, idx) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice;
            btn.addEventListener('click', () => handleAnswer(idx));
            container.appendChild(btn);
        });
    }

    function handleAnswer(selectedIndex) {
        if (_answered) return;
        _answered = true;

        const q = _sessionQuestions[_sessionIndex];
        const wasCorrect = QuizEngine.recordAnswer(q, selectedIndex);
        if (wasCorrect) _sessionCorrect++;

        // Highlight choices
        const btns = document.querySelectorAll('#choices .choice-btn');
        btns.forEach((btn, idx) => {
            btn.classList.add('answered');
            if (idx === selectedIndex && wasCorrect) {
                btn.classList.add('selected-correct');
            } else if (idx === selectedIndex && !wasCorrect) {
                btn.classList.add('selected-incorrect');
            }
            if (idx === q.correctIndex && !wasCorrect) {
                btn.classList.add('reveal-correct');
            }
        });

        // Show feedback
        const feedback = document.getElementById('feedback');
        const feedbackText = document.getElementById('feedback-text');
        feedback.classList.remove('hidden', 'correct', 'incorrect');
        if (wasCorrect) {
            feedback.classList.add('correct');
            feedbackText.textContent = 'Correct!';
        } else {
            feedback.classList.add('incorrect');
            feedbackText.textContent = `Incorrect. The answer is: ${q.choices[q.correctIndex]}`;
        }

        document.getElementById('btn-next').classList.remove('hidden');

        // Sync check
        Sync.onAnswer();
    }

    function nextQuestion() {
        _sessionIndex++;
        if (_sessionIndex >= _sessionQuestions.length) {
            renderSessionSummary();
        } else {
            renderQuestion();
        }
    }

    function renderSessionSummary() {
        showScreen('summary');
        const total = _sessionQuestions.length;
        document.getElementById('summary-score').textContent =
            total > 0 ? `${_sessionCorrect}/${total}` : 'No questions available';

        const details = document.getElementById('summary-details');
        if (total === 0) {
            details.innerHTML = 'All concepts in this chapter are mastered and no reviews are due. Nice work!';
        } else {
            const pct = Math.round((_sessionCorrect / total) * 100);
            details.innerHTML = `You answered ${pct}% correctly this session.`;
        }
    }

    // --- XP Flyup ---

    function showXPFlyup(amount) {
        const el = document.getElementById('xp-flyup');
        el.textContent = '+' + amount + ' XP';
        el.classList.remove('hidden');
        el.style.animation = 'none';
        el.offsetHeight; // Trigger reflow
        el.style.animation = '';
        setTimeout(() => el.classList.add('hidden'), 1000);
    }

    // --- Stats Bar Update ---

    function updateStatsBar() {
        document.getElementById('stat-xp').textContent = Progress.getXP();
        document.getElementById('stat-streak').textContent = Progress.getDailyStreak();
    }

    // --- Leaderboard ---

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
            row.innerHTML =
                '<span class="leaderboard-rank ' + (idx < 3 ? 'top-3' : '') + '">' + (idx + 1) + '</span>' +
                '<span class="leaderboard-name ' + (isYou ? 'is-you' : '') + '">' + entry.name + (isYou ? ' (you)' : '') + '</span>' +
                '<span class="leaderboard-xp">' + entry.xp + ' XP</span>' +
                '<span class="leaderboard-mastery">' + entry.mastery + '%</span>';
            listEl.appendChild(row);
        });
    }

    // --- Keyboard shortcut ---
    function handleKeydown(e) {
        if (e.key === 'Enter' && _answered && !document.getElementById('btn-next').classList.contains('hidden')) {
            nextQuestion();
        }
    }

    return {
        init, showScreen,
        renderDashboard, renderChapterDetail,
        startStudySession, nextQuestion, handleKeydown,
        showXPFlyup, updateStatsBar, renderLeaderboard,
    };
})();
