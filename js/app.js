/**
 * App initialization, routing, and event wiring.
 */
const EXAMS = [
    { id: 1, name: 'Exam 1', chapters: ['ch01','ch02','ch03','ch04','ch05','ch06'] },
    { id: 2, name: 'Exam 2', chapters: ['ch07','ch08','ch09','ch10','ch11','ch12'] },
    { id: 3, name: 'Exam 3', chapters: ['ch13','ch14','ch15','ch16'] },
];

const App = (() => {
    let _currentChapterId = null;
    let _currentExamId = null;
    let _returnTo = 'home'; // where "back" goes from study/summary

    async function init() {
        UI.init();
        Progress.load();

        try {
            await ContentLoader.load();
        } catch (e) {
            document.body.innerHTML = '<p style="padding:2rem;color:red;">Failed to load content. Make sure data files exist.</p>';
            return;
        }

        setupEvents();
        Sync.setupUnloadSync();

        // Check for returning student
        const onyen = Progress.getOnyen();
        if (onyen) {
            showHome();
            // Silently pull latest progress from cloud (non-blocking)
            Sync.pullProgress().then(() => {
                // Re-render home to reflect any merged remote data
                if (document.getElementById('screen-home').classList.contains('active')) {
                    UI.renderHome();
                }
            });
        } else {
            UI.showIdentityModal();
            showHome();
        }

        handleHash();
        window.addEventListener('hashchange', handleHash);
    }

    function setupEvents() {
        // --- Identity Modal ---
        const nameInput = document.getElementById('input-name');
        const onyenInput = document.getElementById('input-onyen');
        const identityBtn = document.getElementById('btn-identity-save');

        nameInput.addEventListener('input', () => UI.updateIdentityButton());
        onyenInput.addEventListener('input', () => UI.updateIdentityButton());

        identityBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const onyen = onyenInput.value.trim();
            if (name && onyen) {
                Progress.setStudent(name, onyen);
                UI.hideIdentityModal();
                // Try to restore progress from cloud
                await Sync.pullProgress();
                showHome();
            }
        });

        // Enter key on ONYEN input
        onyenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && nameInput.value.trim() && onyenInput.value.trim()) {
                identityBtn.click();
            }
        });

        // --- Home Screen ---
        document.getElementById('card-chapters').addEventListener('click', () => {
            showChapters();
        });

        // Exam rows (delegated)
        document.getElementById('home-exam-list').addEventListener('click', (e) => {
            const row = e.target.closest('.home-exam-row');
            if (row) {
                const examId = parseInt(row.dataset.examId);
                showExamPrep(examId);
            }
        });

        // "Not you?" link (delegated from greeting)
        document.getElementById('home-greeting').addEventListener('click', (e) => {
            if (e.target.id === 'link-not-you') {
                UI.showIdentityModal();
            }
        });

        // --- Chapters List ---
        document.getElementById('btn-back-home-from-chapters').addEventListener('click', () => {
            showHome();
        });

        document.getElementById('chapters-list').addEventListener('click', (e) => {
            const row = e.target.closest('.chapter-list-row');
            if (row) {
                showChapter(row.dataset.chapterId);
            }
        });

        // --- Chapter Detail ---
        document.getElementById('btn-back-chapters').addEventListener('click', () => {
            if (_returnTo === 'exam' && _currentExamId) {
                showExamPrep(_currentExamId);
            } else {
                showChapters();
            }
        });

        document.getElementById('btn-study-chapter').addEventListener('click', () => {
            if (_currentChapterId) {
                const chapter = ContentLoader.getChapter(_currentChapterId);
                const session = QuizEngine.buildSession(chapter);
                _returnTo = 'chapter';
                UI.startStudySession(session);
                window.location.hash = 'study';
            }
        });

        // Session size buttons
        document.getElementById('session-size-options').addEventListener('click', (e) => {
            const btn = e.target.closest('.session-size-btn');
            if (!btn) return;
            document.querySelectorAll('.session-size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            QuizEngine.setSessionSize(parseInt(btn.dataset.value));
        });

        // Toggle concepts list
        document.getElementById('btn-toggle-concepts').addEventListener('click', () => {
            const list = document.getElementById('concept-list');
            const arrow = document.getElementById('toggle-concepts-arrow');
            list.classList.toggle('hidden');
            arrow.classList.toggle('open');
        });

        // --- Exam Prep ---
        document.getElementById('btn-back-home-from-exam').addEventListener('click', () => {
            showHome();
        });

        document.getElementById('btn-test-mode').addEventListener('click', () => {
            if (_currentExamId) {
                startPracticeExam(_currentExamId, true);
            }
        });

        document.getElementById('btn-study-mode').addEventListener('click', () => {
            if (_currentExamId) {
                startPracticeExam(_currentExamId, false);
            }
        });

        document.getElementById('exam-chapter-list').addEventListener('click', (e) => {
            const row = e.target.closest('.chapter-list-row');
            if (row) {
                _returnTo = 'exam';
                showChapter(row.dataset.chapterId);
            }
        });

        // --- Study Session ---
        document.getElementById('btn-back-from-study').addEventListener('click', () => {
            navigateBack();
        });

        document.getElementById('btn-next').addEventListener('click', () => {
            UI.nextQuestion();
        });

        // --- Summary (dynamic buttons, use delegation) ---
        document.getElementById('summary-content').addEventListener('click', (e) => {
            const target = e.target;
            if (target.id === 'btn-keep-studying') {
                if (_currentChapterId) {
                    const chapter = ContentLoader.getChapter(_currentChapterId);
                    const session = QuizEngine.buildSession(chapter);
                    UI.startStudySession(session);
                    window.location.hash = 'study';
                } else {
                    showHome();
                }
            } else if (target.id === 'btn-back-from-summary') {
                if (_currentChapterId) {
                    showChapter(_currentChapterId);
                } else {
                    showHome();
                }
            } else if (target.id === 'btn-review-missed') {
                const missed = UI.getMissedQuestions();
                if (missed.length > 0) {
                    UI.startStudySession(missed, {
                        examStudyMode: true,
                        examId: UI.getCurrentExamId(),
                    });
                    window.location.hash = 'study';
                }
            } else if (target.id === 'btn-back-to-exam') {
                const examId = UI.getCurrentExamId();
                if (examId) {
                    showExamPrep(examId);
                } else {
                    showHome();
                }
            }
        });

        // --- Theme Toggle ---
        document.getElementById('btn-theme-toggle').addEventListener('click', () => {
            const isDark = document.body.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.body.removeAttribute('data-theme');
                localStorage.removeItem('soci101_theme');
            } else {
                document.body.setAttribute('data-theme', 'dark');
                localStorage.setItem('soci101_theme', 'dark');
            }
        });

        // --- Keyboard ---
        document.addEventListener('keydown', UI.handleKeydown);
    }

    function startPracticeExam(examId, testMode) {
        const exam = EXAMS.find(e => e.id === examId);
        if (!exam) return;
        const chapters = exam.chapters.map(id => ContentLoader.getChapter(id)).filter(Boolean);
        const questions = QuizEngine.buildPracticeExam(chapters, 50);
        _returnTo = 'exam';
        UI.startStudySession(questions, {
            examTestMode: testMode,
            examStudyMode: !testMode,
            examId: examId,
        });
        window.location.hash = 'study';
    }

    function showHome() {
        _currentChapterId = null;
        _currentExamId = null;
        _returnTo = 'home';
        UI.renderHome();
        UI.showScreen('home');
        window.location.hash = 'home';
    }

    function showChapters() {
        _currentChapterId = null;
        _returnTo = 'home';
        UI.renderChaptersList();
        UI.showScreen('chapters');
        window.location.hash = 'chapters';
    }

    function showChapter(chapterId) {
        _currentChapterId = chapterId;
        const chapter = ContentLoader.getChapter(chapterId);
        if (!chapter) return showHome();
        UI.renderChapterDetail(chapter);
        // Update back button label based on context
        const backBtn = document.getElementById('btn-back-chapters');
        if (_returnTo === 'exam' && _currentExamId) {
            const exam = EXAMS.find(e => e.id === _currentExamId);
            backBtn.innerHTML = '&larr; ' + (exam ? exam.name : 'Exam');
        } else {
            backBtn.innerHTML = '&larr; Chapters';
        }
        UI.showScreen('chapter');
        window.location.hash = 'chapter/' + chapterId;
    }

    function showExamPrep(examId) {
        _currentExamId = examId;
        const exam = EXAMS.find(e => e.id === examId);
        if (!exam) return showHome();
        const chapters = exam.chapters.map(id => ContentLoader.getChapter(id)).filter(Boolean);
        UI.renderExamPrep(examId, chapters);
        UI.showScreen('exam');
        window.location.hash = 'exam/' + examId;
    }

    function navigateBack() {
        if (_returnTo === 'exam' && _currentExamId) {
            showExamPrep(_currentExamId);
        } else if (_returnTo === 'chapter' && _currentChapterId) {
            showChapter(_currentChapterId);
        } else {
            showHome();
        }
    }

    function handleHash() {
        const hash = window.location.hash.replace('#', '');
        if (!hash) return;

        const onyen = Progress.getOnyen();

        if (hash === 'home') {
            showHome();
        } else if (hash === 'chapters' && onyen) {
            showChapters();
        } else if (hash.startsWith('chapter/') && onyen) {
            const chId = hash.split('/')[1];
            showChapter(chId);
        } else if (hash.startsWith('exam/') && onyen) {
            const examId = parseInt(hash.split('/')[1]);
            showExamPrep(examId);
        }
    }

    return { init, showHome, showChapters, showChapter, showExamPrep, EXAMS };
})();

document.addEventListener('DOMContentLoaded', App.init);
