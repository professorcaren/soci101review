/**
 * Quiz engine: generates questions, manages study sessions.
 */
const QuizEngine = (() => {
    let _sessionSize = 10;
    function setSessionSize(size) { _sessionSize = size; }
    function getSessionSize() { return _sessionSize; }

    /**
     * Build a study session for a chapter (or all chapters).
     * Returns an array of question objects ready to display.
     *
     * Pacing: concepts can repeat within a session so students can
     * pass a level (which needs 2 correct) in one sitting.
     * - In-progress concepts: min(remaining_to_pass, 2) questions
     * - New concepts: 2 questions each, up to ~5 new concepts
     * - SR review: 1 question each
     */
    function buildSession(chapters) {
        if (!Array.isArray(chapters)) chapters = [chapters];

        const candidates = [];
        const MAX_NEW_CONCEPTS = 5;
        let newConceptCount = 0;

        for (const chapter of chapters) {
            for (const concept of chapter.concepts) {
                if (Progress.isConceptSkipped(concept.id)) continue;
                const hasL3 = concept.level3_question_ids.length > 0;
                const currentLevel = Progress.getCurrentLevel(concept.id, hasL3);

                if (currentLevel === 0) {
                    // Mastered - only add if due for SR review
                    addSRReviewQuestions(candidates, chapter, concept);
                    continue;
                }

                const inProgress = Progress.isConceptStarted(concept.id);

                if (currentLevel === 1) {
                    if (inProgress) {
                        candidates.push(makeLevel1Question(chapter, concept));
                    } else {
                        // New concept — cap how many we introduce
                        if (newConceptCount < MAX_NEW_CONCEPTS) {
                            candidates.push(makeLevel1Question(chapter, concept));
                            newConceptCount++;
                        }
                    }
                } else if (currentLevel === 2) {
                    candidates.push(makeLevel2Question(chapter, concept));
                } else if (currentLevel === 3) {
                    // Pick one random L3 question for this concept
                    const qIds = concept.level3_question_ids;
                    if (qIds.length > 0) {
                        const randomId = qIds[Math.floor(Math.random() * qIds.length)];
                        const qData = chapter.chapter_questions.find(cq => cq.id === randomId);
                        if (qData) {
                            const q = makeLevel3FromData(qData, concept);
                            q._inProgress = inProgress;
                            candidates.push(q);
                        }
                    }
                }
            }
        }

        // Compute weakness scores for tiebreaking
        for (const q of candidates) {
            const cp = Progress.getConceptProgress(q.conceptId);
            const totalAttempts = cp.level1.attempts + cp.level2.attempts + cp.level3.attempts;
            const totalCorrect = cp.level1.correct + cp.level2.correct + cp.level3.correct;
            q._weaknessScore = totalAttempts > 0 ? (totalAttempts - totalCorrect) / totalAttempts : 0;
        }

        // Sort: due SR first, then in-progress, then new — with random tiebreaker
        candidates.sort((a, b) => {
            const diff = priorityScore(a) - priorityScore(b);
            if (Math.abs(diff) < 0.01) return Math.random() - 0.5;
            return diff;
        });

        return candidates.slice(0, _sessionSize);
    }

    function priorityScore(q) {
        // Lower = higher priority
        if (q._srDue) return 0 - (q._weaknessScore || 0) * 0.1;
        if (q._inProgress) return 1 - (q._weaknessScore || 0) * 0.1;
        return 2;
    }

    function addSRReviewQuestions(candidates, chapter, concept) {
        // Check if any level questions are due for review
        for (const level of [1, 2]) {
            const key = `${concept.id}_L${level}`;
            if (Progress.isDueForReview(key)) {
                const q = level === 1
                    ? makeLevel1Question(chapter, concept)
                    : makeLevel2Question(chapter, concept);
                q._srDue = true;
                candidates.push(q);
            }
        }
        // Check L3 questions
        for (const qId of concept.level3_question_ids) {
            const key = `L3_${qId}`;
            if (Progress.isDueForReview(key)) {
                const qData = chapter.chapter_questions.find(cq => cq.id === qId);
                if (qData) {
                    candidates.push({
                        ...makeLevel3FromData(qData, concept),
                        _srDue: true,
                    });
                }
            }
        }
    }

    /**
     * Build an exam session: random questions across all levels, no feedback.
     */
    function buildExamSession(chapters, size) {
        if (!Array.isArray(chapters)) chapters = [chapters];
        const allQuestions = [];

        for (const chapter of chapters) {
            for (const concept of chapter.concepts) {
                if (Progress.isConceptSkipped(concept.id)) continue;
                const hasL3 = concept.level3_question_ids.length > 0;
                const currentLevel = Progress.getCurrentLevel(concept.id, hasL3);
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

    /**
     * Level 1: Given term, pick definition.
     */
    function makeLevel1Question(chapter, concept) {
        const correctDef = concept.definition;
        const distractors = pickDistractors(
            chapter.concepts.filter(c => c.id !== concept.id),
            c => c.definition,
            3,
            concept.confusable_ids
        );
        const choices = shuffle([correctDef, ...distractors]);
        return {
            level: 1,
            levelLabel: 'Level 1 — Term Recognition',
            conceptId: concept.id,
            questionKey: `${concept.id}_L1`,
            text: `What is the best definition of <strong class="term-highlight">${concept.term}</strong>?`,
            choices,
            correctIndex: choices.indexOf(correctDef),
            _inProgress: Progress.isConceptStarted(concept.id),
        };
    }

    /**
     * Level 2: Given definition, pick term.
     */
    function makeLevel2Question(chapter, concept) {
        const correctTerm = concept.term;
        const distractors = pickDistractors(
            chapter.concepts.filter(c => c.id !== concept.id),
            c => c.term,
            3,
            concept.confusable_ids
        );
        const choices = shuffle([correctTerm, ...distractors]);
        return {
            level: 2,
            levelLabel: 'Level 2 — Definition Recognition',
            conceptId: concept.id,
            questionKey: `${concept.id}_L2`,
            text: concept.definition,
            choices,
            correctIndex: choices.indexOf(correctTerm),
            _inProgress: true,
        };
    }

    /**
     * Level 3: Higher-order YAQ3 question.
     */
    function makeLevel3FromData(qData, concept) {
        return {
            level: 3,
            levelLabel: 'Level 3 — Application',
            conceptId: concept.id,
            questionKey: `L3_${qData.id}`,
            text: qData.question,
            choices: qData.choices,
            correctIndex: qData.correct,
            _inProgress: true,
        };
    }

    function pickDistractors(pool, extractor, count, preferredIds) {
        const result = [];
        const usedItems = new Set();

        // Prefer confusable concepts first
        if (preferredIds && preferredIds.length > 0) {
            const preferred = shuffle(
                pool.filter(c => preferredIds.includes(c.id))
            );
            for (const item of preferred) {
                if (result.length >= count) break;
                const val = extractor(item);
                if (!result.includes(val)) {
                    result.push(val);
                    usedItems.add(item.id);
                }
            }
        }

        // Fill remaining slots randomly from pool
        const remaining = shuffle(
            pool.filter(c => !usedItems.has(c.id))
        );
        for (const item of remaining) {
            if (result.length >= count) break;
            const val = extractor(item);
            if (!result.includes(val)) result.push(val);
        }

        // If not enough distractors, pad with placeholders
        while (result.length < count) {
            result.push('(no other option)');
        }
        return result;
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /**
     * Record answer and update both concept progress and SR.
     */
    function recordAnswer(question, selectedIndex) {
        const wasCorrect = selectedIndex === question.correctIndex;
        Progress.recordConceptAnswer(question.conceptId, question.level, wasCorrect);
        Progress.recordQuestionAnswer(question.questionKey, wasCorrect);
        return wasCorrect;
    }

    return { buildSession, buildExamSession, recordAnswer, setSessionSize, getSessionSize };
})();
