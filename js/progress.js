/**
 * Progress tracking with localStorage and SM-2 spaced repetition.
 */
const Progress = (() => {
    const STORAGE_KEY = 'soci101_exam_review';
    const LEVEL1_PASS = 2;  // correct answers to pass Level 1
    const LEVEL2_PASS = 2;  // correct answers to pass Level 2
    const LEVEL3_PASS = 1;  // correct answers to pass Level 3

    function getDefault() {
        return {
            studentName: '',
            concepts: {},      // conceptId -> { level1: {attempts, correct}, level2: {...}, level3: {...} }
            questions: {},     // "questionKey" -> SM-2 data
            lastSync: null,
        };
    }

    let _data = null;

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            _data = raw ? JSON.parse(raw) : getDefault();
        } catch {
            _data = getDefault();
        }
        return _data;
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    }

    function getData() {
        if (!_data) load();
        return _data;
    }

    function setStudentName(name) {
        getData().studentName = name;
        save();
    }

    function getStudentName() {
        return getData().studentName;
    }

    // --- Concept progress ---

    function getConceptProgress(conceptId) {
        const data = getData();
        if (!data.concepts[conceptId]) {
            data.concepts[conceptId] = {
                level1: { attempts: 0, correct: 0 },
                level2: { attempts: 0, correct: 0 },
                level3: { attempts: 0, correct: 0 },
            };
        }
        return data.concepts[conceptId];
    }

    function recordConceptAnswer(conceptId, level, wasCorrect) {
        const cp = getConceptProgress(conceptId);
        const key = `level${level}`;
        cp[key].attempts++;
        if (wasCorrect) cp[key].correct++;
        save();
    }

    function isLevelPassed(conceptId, level) {
        const cp = getConceptProgress(conceptId);
        const key = `level${level}`;
        const threshold = level === 3 ? LEVEL3_PASS : (level === 2 ? LEVEL2_PASS : LEVEL1_PASS);
        return cp[key].correct >= threshold;
    }

    function getCurrentLevel(conceptId, hasLevel3) {
        if (!isLevelPassed(conceptId, 1)) return 1;
        if (!isLevelPassed(conceptId, 2)) return 2;
        if (hasLevel3 && !isLevelPassed(conceptId, 3)) return 3;
        return 0; // mastered
    }

    function isConceptMastered(conceptId, hasLevel3) {
        return getCurrentLevel(conceptId, hasLevel3) === 0;
    }

    function isConceptStarted(conceptId) {
        const cp = getConceptProgress(conceptId);
        return cp.level1.attempts > 0;
    }

    // --- SM-2 Question tracking ---

    function getQuestionSR(questionKey) {
        const data = getData();
        if (!data.questions[questionKey]) {
            data.questions[questionKey] = {
                easeFactor: 2.5,
                interval: 1,
                nextReview: Date.now(),
                timesAnswered: 0,
                timesCorrect: 0,
            };
        }
        return data.questions[questionKey];
    }

    function recordQuestionAnswer(questionKey, wasCorrect) {
        const sr = getQuestionSR(questionKey);
        sr.timesAnswered++;
        if (wasCorrect) sr.timesCorrect++;
        if (wasCorrect) {
            sr.interval = Math.round(sr.interval * sr.easeFactor);
            sr.easeFactor = Math.min(3.0, sr.easeFactor + 0.1);
        } else {
            sr.interval = 1;
            sr.easeFactor = Math.max(1.3, sr.easeFactor - 0.2);
        }
        sr.nextReview = Date.now() + (sr.interval * 24 * 60 * 60 * 1000);
        save();
    }

    function isDueForReview(questionKey) {
        const sr = getQuestionSR(questionKey);
        return Date.now() >= sr.nextReview;
    }

    // --- Chapter stats ---

    function getChapterStats(chapter) {
        let started = 0, mastered = 0;
        let levelsDone = 0, levelsTotal = 0;
        let progressSum = 0; // fractional progress including partial level credit
        const total = chapter.concepts.length;
        for (const concept of chapter.concepts) {
            const hasL3 = concept.level3_question_ids.length > 0;
            const maxLevel = hasL3 ? 3 : 2;
            levelsTotal += maxLevel;
            if (isConceptStarted(concept.id)) started++;
            const cp = getConceptProgress(concept.id);
            for (let lvl = 1; lvl <= maxLevel; lvl++) {
                if (isLevelPassed(concept.id, lvl)) {
                    levelsDone++;
                    progressSum += 1;
                } else if (lvl <= getCurrentLevel(concept.id, hasL3)) {
                    // Partial credit: fraction of correct answers toward threshold
                    const key = `level${lvl}`;
                    const threshold = lvl === 3 ? LEVEL3_PASS : (lvl === 2 ? LEVEL2_PASS : LEVEL1_PASS);
                    const partial = Math.min(cp[key].correct, threshold) / threshold;
                    progressSum += partial;
                }
            }
            if (isConceptMastered(concept.id, hasL3)) mastered++;
        }
        const pct = levelsTotal > 0 ? Math.round((progressSum / levelsTotal) * 100) : 0;
        return { total, started, mastered, levelsDone, levelsTotal, pct };
    }

    // --- Sync data ---

    function getSyncPayload(chapters) {
        const chapterProgress = {};
        for (const ch of chapters) {
            const stats = getChapterStats(ch);
            chapterProgress[ch.id] = stats.pct;
        }
        return {
            studentName: getStudentName(),
            chapterProgress,
            fullData: getData(),
        };
    }

    function mergeRemoteData(remote) {
        // Merge remote progress - keep the higher correct count for each concept/question
        const local = getData();
        if (remote.concepts) {
            for (const [id, rc] of Object.entries(remote.concepts)) {
                const lc = local.concepts[id];
                if (!lc) {
                    local.concepts[id] = rc;
                } else {
                    for (const lvl of ['level1', 'level2', 'level3']) {
                        if (rc[lvl] && rc[lvl].correct > (lc[lvl]?.correct || 0)) {
                            lc[lvl] = rc[lvl];
                        }
                    }
                }
            }
        }
        if (remote.questions) {
            for (const [key, rq] of Object.entries(remote.questions)) {
                const lq = local.questions[key];
                if (!lq || rq.timesAnswered > lq.timesAnswered) {
                    local.questions[key] = rq;
                }
            }
        }
        save();
    }

    return {
        load, save, getData, setStudentName, getStudentName,
        getConceptProgress, recordConceptAnswer,
        isLevelPassed, getCurrentLevel, isConceptMastered, isConceptStarted,
        getQuestionSR, recordQuestionAnswer, isDueForReview,
        getChapterStats, getSyncPayload, mergeRemoteData,
        LEVEL1_PASS, LEVEL2_PASS, LEVEL3_PASS,
    };
})();
