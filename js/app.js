/**
 * App initialization and routing.
 */
const App = (() => {
    let _currentChapterId = null;

    async function init() {
        UI.init();
        Progress.load();

        try {
            await ContentLoader.load();
        } catch (e) {
            document.body.innerHTML = '<p style="padding:2rem;color:red;">Failed to load content. Make sure data/content.json exists.</p>';
            return;
        }

        setupEvents();
        Sync.setupUnloadSync();

        // Check for returning student
        const name = Progress.getStudentName();
        if (name) {
            showDashboard();
            Sync.pullProgress();
        } else {
            UI.showScreen('welcome');
        }

        // Handle hash routing
        handleHash();
        window.addEventListener('hashchange', handleHash);
    }

    function setupEvents() {
        // Welcome screen
        const nameInput = document.getElementById('student-name');
        const startBtn = document.getElementById('btn-start');
        nameInput.value = Progress.getStudentName() || '';
        nameInput.addEventListener('input', () => {
            startBtn.disabled = nameInput.value.trim().length === 0;
        });
        startBtn.addEventListener('click', () => {
            Progress.setStudentName(nameInput.value.trim());
            showDashboard();
        });
        // Enter key on name input
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && nameInput.value.trim()) {
                Progress.setStudentName(nameInput.value.trim());
                showDashboard();
            }
        });

        // Dashboard
        document.getElementById('btn-review-all').addEventListener('click', () => {
            const chapters = ContentLoader.getChapters();
            const session = QuizEngine.buildSession(chapters);
            _currentChapterId = null;
            UI.startStudySession(session);
            window.location.hash = 'study';
        });

        // Chapter detail
        document.getElementById('btn-back-dashboard').addEventListener('click', () => {
            showDashboard();
        });
        document.getElementById('btn-study-chapter').addEventListener('click', () => {
            if (_currentChapterId) {
                const chapter = ContentLoader.getChapter(_currentChapterId);
                const session = QuizEngine.buildSession(chapter);
                UI.startStudySession(session);
                window.location.hash = 'study';
            }
        });

        // Study session
        document.getElementById('btn-back-chapter').addEventListener('click', () => {
            if (_currentChapterId) {
                showChapter(_currentChapterId);
            } else {
                showDashboard();
            }
        });
        document.getElementById('btn-next').addEventListener('click', () => {
            UI.nextQuestion();
        });

        // Summary
        document.getElementById('btn-continue-studying').addEventListener('click', () => {
            if (_currentChapterId) {
                const chapter = ContentLoader.getChapter(_currentChapterId);
                const session = QuizEngine.buildSession(chapter);
                UI.startStudySession(session);
            } else {
                const chapters = ContentLoader.getChapters();
                const session = QuizEngine.buildSession(chapters);
                UI.startStudySession(session);
            }
        });
        document.getElementById('btn-back-to-dashboard').addEventListener('click', showDashboard);

        // Keyboard
        document.addEventListener('keydown', UI.handleKeydown);
    }

    function showDashboard() {
        _currentChapterId = null;
        UI.renderDashboard();
        UI.showScreen('dashboard');
        window.location.hash = 'dashboard';
    }

    function showChapter(chapterId) {
        _currentChapterId = chapterId;
        const chapter = ContentLoader.getChapter(chapterId);
        if (!chapter) return showDashboard();
        UI.renderChapterDetail(chapter);
        UI.showScreen('chapter');
        window.location.hash = `chapter/${chapterId}`;
    }

    function handleHash() {
        const hash = window.location.hash.replace('#', '');
        if (!hash || hash === 'welcome') return;
        if (hash === 'dashboard' && Progress.getStudentName()) {
            showDashboard();
        } else if (hash.startsWith('chapter/')) {
            const chId = hash.split('/')[1];
            showChapter(chId);
        }
    }

    return { init, showDashboard, showChapter };
})();

document.addEventListener('DOMContentLoaded', App.init);
