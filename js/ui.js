/**
 * DOM manipulation and screen rendering.
 */
const UI = (() => {
    const screens = {};

    let _sessionQuestions = [];
    let _sessionIndex = 0;
    let _sessionCorrect = 0;
    let _answered = false;
    let _sessionLevelUps = [];
    let _examTestMode = false;
    let _examStudyMode = false;
    let _examResults = [];
    let _currentExamId = null;

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

    // --- Home Screen ---

    function renderHome() {
        const chapters = ContentLoader.getChapters();
        let totalLearned = 0;
        let totalConcepts = 0;
        for (const ch of chapters) {
            const stats = Progress.getChapterStats(ch);
            totalLearned += stats.learned;
            totalConcepts += stats.total;
        }

        // Greeting
        const name = Progress.getStudentName();
        const greetingEl = document.getElementById('home-greeting');
        if (name) {
            greetingEl.innerHTML = 'Hi, ' + escapeHtml(name) + '! <a id="link-not-you">Not you?</a>';
        } else {
            greetingEl.textContent = '';
        }

        // Chapters card progress
        const chaptersProgress = document.getElementById('home-chapters-progress');
        const pct = totalConcepts > 0 ? Math.round((totalLearned / totalConcepts) * 100) : 0;
        const fillClass = pct === 100 ? ' complete' : '';
        chaptersProgress.innerHTML =
            totalLearned + ' of ' + totalConcepts + ' concepts learned' +
            '<div class="progress-bar"><div class="progress-fill' + fillClass + '" style="width:' + pct + '%"></div></div>';

        // Exam list
        const examList = document.getElementById('home-exam-list');
        examList.innerHTML = '';
        for (const exam of App.EXAMS) {
            const row = document.createElement('div');
            row.className = 'home-exam-row';
            row.dataset.examId = exam.id;
            row.innerHTML =
                '<span class="home-exam-row-name">' + exam.name + '</span>' +
                '<span class="home-exam-row-arrow">&rsaquo;</span>';
            examList.appendChild(row);
        }
    }

    // --- Chapters List ---

    function renderChaptersList() {
        const list = document.getElementById('chapters-list');
        list.innerHTML = '';
        const chapters = ContentLoader.getChapters();

        for (const ch of chapters) {
            const stats = Progress.getChapterStats(ch);
            const row = document.createElement('div');
            row.className = 'chapter-list-row' + (stats.pct === 100 ? ' complete' : '');
            row.dataset.chapterId = ch.id;

            const fillClass = stats.pct === 100 ? ' complete' : '';
            row.innerHTML =
                '<div class="chapter-list-info">' +
                    '<div class="chapter-list-name">' + ch.name + '</div>' +
                    '<div class="chapter-list-stats">' + stats.learned + '/' + stats.total + ' learned</div>' +
                '</div>' +
                '<div class="chapter-list-bar">' +
                    '<div class="progress-bar"><div class="progress-fill' + fillClass + '" style="width:' + stats.pct + '%"></div></div>' +
                '</div>';

            list.appendChild(row);
        }
    }

    // --- Chapter Detail ---

    function renderChapterDetail(chapter) {
        document.getElementById('chapter-title').textContent = chapter.name;
        const stats = Progress.getChapterStats(chapter);
        const bar = document.querySelector('#chapter-progress-bar .progress-fill');
        bar.style.width = stats.pct + '%';
        bar.className = 'progress-fill' + (stats.pct === 100 ? ' complete' : '');

        const statsText = stats.learned === stats.total
            ? 'All ' + stats.total + ' concepts learned!'
            : stats.learned + ' of ' + stats.total + ' concepts learned';
        document.getElementById('chapter-stats').textContent = statsText;

        // Update toggle label
        document.getElementById('toggle-concepts-label').textContent =
            'Show all ' + chapter.concepts.length + ' concepts';

        const list = document.getElementById('concept-list');
        list.innerHTML = '';

        // Legend
        const legend = document.createElement('div');
        legend.className = 'level-legend';
        legend.innerHTML =
            '<span class="level-legend-item"><span class="level-dot done"></span> Learned</span>' +
            '<span class="level-legend-item"><span class="level-dot active"></span> Practicing</span>' +
            '<span class="level-legend-item"><span class="level-dot"></span> Not started</span>';
        list.appendChild(legend);

        // Skipped count
        const skippedCount = Progress.getSkippedCount(chapter);
        if (skippedCount > 0) {
            const skippedLabel = document.createElement('div');
            skippedLabel.className = 'skipped-count';
            skippedLabel.textContent = skippedCount + ' term' + (skippedCount > 1 ? 's' : '') + ' skipped';
            list.appendChild(skippedLabel);
        }

        // Sort concepts: in-progress first, then not started, then learned, skipped last
        const sorted = [...chapter.concepts].sort((a, b) => {
            const order = (c) => {
                if (Progress.isConceptSkipped(c.id)) return 3;
                const hasL3 = c.level3_question_ids.length > 0;
                const level = Progress.getCurrentLevel(c.id, hasL3);
                if (level === 0) return 2; // learned
                if (Progress.isConceptStarted(c.id)) return 0; // in-progress
                return 1; // not started
            };
            return order(a) - order(b);
        });

        for (const concept of sorted) {
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
                const levelNames = { 1: 'Term \u2192 Definition', 2: 'Definition \u2192 Term', 3: 'Application' };
                dotsHtml += '<div class="' + dotClass + '" title="Level ' + lvl + ': ' + levelNames[lvl] + '"></div>';
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

            // Term container
            const termContainer = document.createElement('div');
            termContainer.className = 'concept-term-container';

            const cp = Progress.getConceptProgress(concept.id);
            const totalAttempts = cp.level1.attempts + cp.level2.attempts + cp.level3.attempts;
            const totalCorrect = cp.level1.correct + cp.level2.correct + cp.level3.correct;
            const isTroubleSpot = totalAttempts >= 3 && (totalCorrect / totalAttempts) < 0.5;

            let termHtml = '<span class="concept-term">' + escapeHtml(concept.term);
            if (isTroubleSpot) {
                termHtml += ' <span class="trouble-dot" title="Trouble spot">\u25cf</span>';
            }
            termHtml += '</span>';

            termContainer.innerHTML = termHtml;
            row.appendChild(termContainer);

            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'concept-levels';
            dotsContainer.innerHTML = dotsHtml;
            row.appendChild(dotsContainer);

            list.appendChild(row);
        }
    }

    // --- Exam Prep ---

    function renderExamPrep(examId, examChapters) {
        _currentExamId = examId;
        const exam = App.EXAMS.find(e => e.id === examId);
        document.getElementById('exam-title').textContent = exam ? exam.name : 'Exam ' + examId;

        // Compute aggregate stats
        let totalLearned = 0, totalConcepts = 0;
        let totalProgressSum = 0, totalLevelsTotal = 0;
        for (const ch of examChapters) {
            const stats = Progress.getChapterStats(ch);
            totalLearned += stats.learned;
            totalConcepts += stats.total;
            totalProgressSum += stats.levelsDone;
            totalLevelsTotal += stats.levelsTotal;
        }
        const pct = totalLevelsTotal > 0 ? Math.round((totalProgressSum / totalLevelsTotal) * 100) : 0;

        const bar = document.querySelector('#exam-progress-bar .progress-fill');
        bar.style.width = pct + '%';
        bar.className = 'progress-fill' + (pct === 100 ? ' complete' : '');
        document.getElementById('exam-stats').textContent =
            totalLearned + ' of ' + totalConcepts + ' concepts learned';

        // Question count
        document.getElementById('exam-question-count').textContent =
            '50 questions from all chapters';

        // Chapter list
        const listEl = document.getElementById('exam-chapter-list');
        listEl.innerHTML = '';
        for (const ch of examChapters) {
            const stats = Progress.getChapterStats(ch);
            const row = document.createElement('div');
            row.className = 'chapter-list-row' + (stats.pct === 100 ? ' complete' : '');
            row.dataset.chapterId = ch.id;
            const fillClass = stats.pct === 100 ? ' complete' : '';
            row.innerHTML =
                '<div class="chapter-list-info">' +
                    '<div class="chapter-list-name">' + ch.name + '</div>' +
                    '<div class="chapter-list-stats">' + stats.learned + '/' + stats.total + ' learned</div>' +
                '</div>' +
                '<div class="chapter-list-bar">' +
                    '<div class="progress-bar"><div class="progress-fill' + fillClass + '" style="width:' + stats.pct + '%"></div></div>' +
                '</div>';
            listEl.appendChild(row);
        }
    }

    // --- Study Session ---

    function startStudySession(questions, options) {
        options = options || {};
        _examTestMode = !!options.examTestMode;
        _examStudyMode = !!options.examStudyMode;
        _currentExamId = options.examId || null;
        _sessionQuestions = questions;
        _sessionIndex = 0;
        _sessionCorrect = 0;
        _sessionLevelUps = [];
        _answered = false;
        _examResults = [];

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
            'Question ' + (_sessionIndex + 1) + ' of ' + _sessionQuestions.length;

        document.getElementById('question-level').textContent = q.levelLabel;
        document.getElementById('question-text').innerHTML = q.text;

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

        // Track level-ups
        if (wasCorrect && Progress.isLevelPassed(q.conceptId, q.level)) {
            const chapters = ContentLoader.getChapters();
            for (const ch of chapters) {
                const concept = ch.concepts.find(c => c.id === q.conceptId);
                if (concept) {
                    const hasL3 = concept.level3_question_ids.length > 0;
                    const currentLevel = Progress.getCurrentLevel(concept.id, hasL3);
                    if (currentLevel === 0) {
                        // Just became learned
                        _sessionLevelUps.push({ term: concept.term, level: q.level, learned: true });
                    } else {
                        _sessionLevelUps.push({ term: concept.term, level: q.level, learned: false });
                    }
                    break;
                }
            }
        }

        // Track exam results
        if (_examTestMode || _examStudyMode) {
            _examResults.push({
                question: q,
                selectedIndex: selectedIndex,
                wasCorrect: wasCorrect,
                chapterId: q.chapterId,
            });
        }

        Sync.onAnswer();

        if (_examTestMode) {
            // Neutral highlight, auto-advance
            const btns = document.querySelectorAll('#choices .choice-btn');
            btns[selectedIndex].classList.add('selected-neutral');
            setTimeout(() => nextQuestion(), 300);
            return;
        }

        // Normal or exam study mode: show feedback
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

        const feedback = document.getElementById('feedback');
        const feedbackText = document.getElementById('feedback-text');
        feedback.classList.remove('hidden', 'correct', 'incorrect');
        if (wasCorrect) {
            feedback.classList.add('correct');
            feedbackText.textContent = 'Correct!';
        } else {
            feedback.classList.add('incorrect');
            if (q._term && q._definition) {
                if (q.level === 1) {
                    feedbackText.innerHTML = 'The definition of <strong>' + escapeHtml(q._term) + '</strong> is: ' + escapeHtml(q._definition);
                } else if (q.level === 2) {
                    feedbackText.innerHTML = 'That definition refers to <strong>' + escapeHtml(q._term) + '</strong>: ' + escapeHtml(q._definition);
                } else {
                    feedbackText.innerHTML = 'The correct answer is: ' + escapeHtml(q.choices[q.correctIndex]) + '. This relates to <strong>' + escapeHtml(q._term) + '</strong>: ' + escapeHtml(q._definition);
                }
            } else {
                feedbackText.textContent = 'Incorrect. The answer is: ' + q.choices[q.correctIndex];
            }
        }

        document.getElementById('btn-next').classList.remove('hidden');
    }

    function nextQuestion() {
        _sessionIndex++;
        if (_sessionIndex >= _sessionQuestions.length) {
            renderSessionSummary();
        } else {
            renderQuestion();
        }
    }

    // --- Session Summary / Exam Report ---

    function renderSessionSummary() {
        showScreen('summary');
        const contentEl = document.getElementById('summary-content');
        const total = _sessionQuestions.length;

        if ((_examTestMode || _examStudyMode) && _currentExamId) {
            // Exam report
            renderExamReport(contentEl, total);
        } else {
            // Normal session summary
            renderNormalSummary(contentEl, total);
        }

        Sync.pushProgress();
    }

    function renderExamReport(contentEl, total) {
        const exam = App.EXAMS.find(e => e.id === _currentExamId);
        const examName = exam ? exam.name : 'Exam';
        const pct = total > 0 ? Math.round((_sessionCorrect / total) * 100) : 0;

        let html = '<h2>' + examName + ' Report</h2>';
        html += '<div class="summary-score">' + _sessionCorrect + '/' + total + '</div>';
        html += '<div class="summary-details">' + pct + '% correct</div>';

        // Chapter breakdown
        const byChapter = {};
        for (const r of _examResults) {
            if (!byChapter[r.chapterId]) {
                byChapter[r.chapterId] = { correct: 0, total: 0 };
            }
            byChapter[r.chapterId].total++;
            if (r.wasCorrect) byChapter[r.chapterId].correct++;
        }

        html += '<div class="exam-report-breakdown"><h3>By Chapter</h3>';
        const chapters = ContentLoader.getChapters();
        for (const chId of Object.keys(byChapter)) {
            const ch = chapters.find(c => c.id === chId);
            const chName = ch ? ch.name : chId;
            const s = byChapter[chId];
            const chPct = Math.round((s.correct / s.total) * 100);
            const perfectClass = chPct === 100 ? ' perfect' : '';
            html += '<div class="exam-report-row">' +
                '<span class="exam-report-chapter">' + chName + '</span>' +
                '<span class="exam-report-score' + perfectClass + '">' + s.correct + '/' + s.total + ' (' + chPct + '%)</span>' +
                '</div>';
        }
        html += '</div>';

        // Buttons
        const missedCount = _examResults.filter(r => !r.wasCorrect).length;
        html += '<div class="summary-actions">';
        if (missedCount > 0) {
            html += '<button id="btn-review-missed" class="btn btn-primary">Review Missed (' + missedCount + ')</button>';
        }
        html += '<button id="btn-back-to-exam" class="btn btn-secondary">Back to ' + examName + '</button>';
        html += '</div>';

        contentEl.innerHTML = html;
    }

    function renderNormalSummary(contentEl, total) {
        let html = '<h2>Session Complete</h2>';

        if (total === 0) {
            html += '<div class="summary-details">All concepts learned and no reviews are due. Nice work!</div>';
        } else {
            const pct = Math.round((_sessionCorrect / total) * 100);
            html += '<div class="summary-score">' + _sessionCorrect + '/' + total + '</div>';
            html += '<div class="summary-details">' + pct + '% correct</div>';
        }

        // Level-ups
        if (_sessionLevelUps.length > 0) {
            html += '<div class="summary-levelups">';
            for (const lu of _sessionLevelUps) {
                if (lu.learned) {
                    html += '<div class="summary-levelup">\u2713 ' + escapeHtml(lu.term) + ' \u2014 Learned!</div>';
                } else {
                    const levelNames = { 1: 'Term Recognition', 2: 'Definition Recognition', 3: 'Application' };
                    html += '<div class="summary-levelup">\u2713 ' + escapeHtml(lu.term) + ' \u2014 ' + (levelNames[lu.level] || 'Level ' + lu.level) + ' passed</div>';
                }
            }
            html += '</div>';
        }

        // Buttons
        html += '<div class="summary-actions">';
        html += '<button id="btn-keep-studying" class="btn btn-primary">Keep Studying</button>';
        html += '<button id="btn-back-from-summary" class="btn btn-secondary">Back to Chapter</button>';
        html += '</div>';

        contentEl.innerHTML = html;
    }

    function getMissedQuestions() {
        return _examResults.filter(r => !r.wasCorrect).map(r => r.question);
    }

    function getCurrentExamId() {
        return _currentExamId;
    }

    function isExamMode() {
        return _examTestMode || _examStudyMode;
    }

    // --- Identity Modal ---

    function showIdentityModal() {
        document.getElementById('identity-modal').classList.remove('hidden');
        const nameInput = document.getElementById('input-name');
        const onyenInput = document.getElementById('input-onyen');
        nameInput.value = Progress.getStudentName() || '';
        onyenInput.value = Progress.getOnyen() || '';
        updateIdentityButton();
    }

    function hideIdentityModal() {
        document.getElementById('identity-modal').classList.add('hidden');
    }

    function updateIdentityButton() {
        const nameInput = document.getElementById('input-name');
        const onyenInput = document.getElementById('input-onyen');
        const btn = document.getElementById('btn-identity-save');
        btn.disabled = !(nameInput.value.trim() && onyenInput.value.trim());
    }

    // --- Keyboard shortcut ---
    function handleKeydown(e) {
        if (e.key === 'Enter' && _answered && !document.getElementById('btn-next').classList.contains('hidden')) {
            nextQuestion();
        }
    }

    // --- Utility ---
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    return {
        init, showScreen,
        renderHome, renderChaptersList, renderChapterDetail, renderExamPrep,
        startStudySession, nextQuestion, handleKeydown,
        renderSessionSummary,
        showIdentityModal, hideIdentityModal, updateIdentityButton,
        getMissedQuestions, getCurrentExamId, isExamMode,
    };
})();
