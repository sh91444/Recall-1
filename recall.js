/* =========================================================
   RECALL DATA
========================================================= */

const defaultData = {

    cards: [],

    xp: 0,

    streak: 0,

    lastStudyDate: null,

    todayDate: null,

    todayCardIds: [],

    completedToday: []

};


let data = {
    ...defaultData
};


let reviewQueue = [];

let currentCard = null;
const AI_API_URL =
    "https://recall-ai-api.sho591820.workers.dev/";



/* =========================================================
   STORAGE
========================================================= */

function saveData() {

    localStorage.setItem(
        "recall-data",
        JSON.stringify(data)
    );

}


function loadData() {

    const raw =
        localStorage.getItem(
            "recall-data"
        );


    if (!raw) {
        return;
    }


    try {

        const parsed =
            JSON.parse(raw);


        data.cards =
            Array.isArray(parsed.cards)
                ? parsed.cards
                : [];


        data.xp =
            typeof parsed.xp === "number" &&
                Number.isFinite(parsed.xp)
                ? Math.max(0, parsed.xp)
                : 0;


        data.streak =
            typeof parsed.streak === "number" &&
                Number.isFinite(parsed.streak)
                ? Math.max(0, parsed.streak)
                : 0;


        data.lastStudyDate =
            typeof parsed.lastStudyDate === "string"
                ? parsed.lastStudyDate
                : null;


        data.todayDate =
            typeof parsed.todayDate === "string"
                ? parsed.todayDate
                : null;


        data.todayCardIds =
            Array.isArray(parsed.todayCardIds)
                ? parsed.todayCardIds
                : [];


        data.completedToday =
            Array.isArray(parsed.completedToday)
                ? parsed.completedToday
                : [];


        migrateOldCards();

    }

    catch (error) {

        console.error(
            "Ошибка данных Recall:",
            error
        );


        data = {
            ...defaultData
        };

    }

}



/* =========================================================
   CARDS & LESSONS STORAGE VALIDATION
========================================================= */

function migrateOldCards() {

    if (!Array.isArray(data.cards)) {
        data.cards = [];
        return;
    }

    const validOptions = ["A", "B", "C", "D"];
    const sanitized = [];

    data.cards.forEach(card => {

        if (!card || typeof card !== "object") {
            return;
        }

        const id =
            Number(card.id) ||
            (Date.now() + Math.random());

        const subject =
            typeof card.subject === "string" && card.subject.trim()
                ? card.subject.trim()
                : (typeof card.topic === "string" && card.topic.trim()
                    ? card.topic.trim()
                    : "Без предмета");

        const title =
            typeof card.title === "string" && card.title.trim()
                ? card.title.trim()
                : (typeof card.question === "string" && card.question.trim()
                    ? card.question.trim()
                    : "Без названия");

        const examDate =
            typeof card.examDate === "string" && card.examDate
                ? card.examDate
                : null;

        const interval =
            Number(card.interval) || 0;

        const stability =
            Number(card.stability) || 1;

        const repetitions =
            Number(card.repetitions) || 0;

        const reviews =
            Number(card.reviews) || 0;

        const correctReviews =
            Number(card.correctReviews) || 0;

        const due =
            isValidDate(card.due)
                ? card.due
                : new Date().toISOString();

        const createdAt =
            isValidDate(card.createdAt)
                ? card.createdAt
                : new Date().toISOString();

        if (card.type === "lesson") {

            const rawNotes =
                Array.isArray(card.notes)
                    ? card.notes
                    : [];

            const notes =
                rawNotes
                    .filter(n => typeof n === "string" && n.trim())
                    .map(n => String(n).trim());

            const rawQuestions =
                Array.isArray(card.questions)
                    ? card.questions
                    : [];

            const questions =
                rawQuestions
                    .filter(q => {
                        if (!q || typeof q !== "object") return false;
                        if (typeof q.question !== "string" || !q.question.trim()) return false;
                        if (!q.options || typeof q.options !== "object") return false;
                        for (const opt of validOptions) {
                            if (typeof q.options[opt] !== "string" || !q.options[opt].trim()) {
                                return false;
                            }
                        }
                        if (!validOptions.includes(q.correct)) return false;
                        return true;
                    })
                    .map(q => ({
                        question: String(q.question).trim(),
                        options: {
                            A: String(q.options.A).trim(),
                            B: String(q.options.B).trim(),
                            C: String(q.options.C).trim(),
                            D: String(q.options.D).trim()
                        },
                        correct: q.correct,
                        explanation: typeof q.explanation === "string"
                            ? q.explanation.trim()
                            : ""
                    }));

            sanitized.push({
                id,
                type: "lesson",
                subject,
                title,
                examDate,
                notes,
                questions,
                lastScore:
                    typeof card.lastScore === "number" && Number.isFinite(card.lastScore)
                        ? Math.max(0, card.lastScore)
                        : 0,
                lastPercentage:
                    typeof card.lastPercentage === "number" && Number.isFinite(card.lastPercentage)
                        ? Math.max(0, card.lastPercentage)
                        : 0,
                interval,
                stability,
                repetitions,
                reviews,
                correctReviews,
                due,
                createdAt,
                source: card.source || "ai-topic"
            });

        } else {

            sanitized.push({
                id,
                type: "card",
                subject,
                title,
                page: card.page ? String(card.page) : "",
                examDate,
                question: card.question ? String(card.question) : title,
                answer: card.answer ? String(card.answer) : "",
                interval,
                stability,
                repetitions,
                reviews,
                correctReviews,
                due,
                createdAt
            });

        }

    });

    data.cards = sanitized;

}


/* =========================================================
   AI LESSON RESPONSE VALIDATION
========================================================= */

function validateLessonResponse(result) {

    if (!result || typeof result !== "object") {
        return {
            valid: false,
            error: "Ответ AI пуст или имеет неверный формат."
        };
    }

    if (typeof result.title !== "string" || !result.title.trim()) {
        return {
            valid: false,
            error: "Заголовок темы (title) отсутствует или не является строкой."
        };
    }

    if (!Array.isArray(result.notes) || result.notes.length === 0) {
        return {
            valid: false,
            error: "Конспект (notes) должен быть непустым массивом строк."
        };
    }

    for (let i = 0; i < result.notes.length; i++) {
        if (typeof result.notes[i] !== "string" || !result.notes[i].trim()) {
            return {
                valid: false,
                error: `Пункт конспекта #${i + 1} пуст или некорректен.`
            };
        }
    }

    if (!Array.isArray(result.questions)) {
        return {
            valid: false,
            error: "Вопросы (questions) должны быть массивом."
        };
    }

    if (result.questions.length !== 5) {
        return {
            valid: false,
            error: `Должно быть ровно 5 вопросов (получено: ${result.questions.length}).`
        };
    }

    const validKeys = ["A", "B", "C", "D"];

    for (let i = 0; i < result.questions.length; i++) {

        const q = result.questions[i];

        if (!q || typeof q !== "object") {
            return {
                valid: false,
                error: `Вопрос #${i + 1} имеет неверный формат.`
            };
        }

        if (typeof q.question !== "string" || !q.question.trim()) {
            return {
                valid: false,
                error: `Текст вопроса #${i + 1} пуст.`
            };
        }

        if (!q.options || typeof q.options !== "object") {
            return {
                valid: false,
                error: `Варианты ответов в вопросе #${i + 1} отсутствуют.`
            };
        }

        for (const key of validKeys) {
            if (typeof q.options[key] !== "string" || !q.options[key].trim()) {
                return {
                    valid: false,
                    error: `В вопросе #${i + 1} отсутствует вариант ${key}.`
                };
            }
        }

        if (!validKeys.includes(q.correct)) {
            return {
                valid: false,
                error: `В вопросе #${i + 1} указан некорректный правильный ответ (${q.correct}). Допустимы A, B, C или D.`
            };
        }

        if (typeof q.explanation !== "string") {
            return {
                valid: false,
                error: `Объяснение (explanation) к вопросу #${i + 1} должно быть строкой.`
            };
        }

    }

    return {
        valid: true
    };

}



/* =========================================================
   DATE HELPERS
========================================================= */

function isValidDate(value) {

    return (
        value &&
        !Number.isNaN(
            new Date(value)
                .getTime()
        )
    );

}


function getTodayKey() {

    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            now.getDate()
        ).padStart(
            2,
            "0"
        );


    return `${year}-${month}-${day}`;

}


function isYesterday(
    oldDate,
    today
) {

    const first =
        new Date(
            oldDate +
            "T00:00:00"
        );


    const second =
        new Date(
            today +
            "T00:00:00"
        );


    return (
        second - first ===
        86400000
    );

}


function daysUntil(
    dateString
) {

    if (!dateString) {
        return null;
    }


    const today =
        new Date();


    today.setHours(
        0,
        0,
        0,
        0
    );


    const target =
        new Date(
            dateString +
            "T00:00:00"
        );


    return Math.ceil(
        (
            target -
            today
        ) /
        86400000
    );

}



/* =========================================================
   TODAY
========================================================= */

function prepareToday() {

    const today =
        getTodayKey();


    if (
        data.todayDate === today
    ) {
        return;
    }


    data.todayDate =
        today;


    data.completedToday =
        [];


    data.todayCardIds =
        getDueCards()
            .map(
                card =>
                    card.id
            );


    saveData();

}


function addCardToToday(id) {

    if (
        !data.todayCardIds
            .includes(id)
    ) {

        data.todayCardIds
            .push(id);

    }

}


function markCardCompleted(id) {

    if (
        !data.completedToday
            .includes(id)
    ) {

        data.completedToday
            .push(id);

    }

}



/* =========================================================
   CREATE CARD
========================================================= */

document
    .getElementById(
        "addCardForm"
    )
    .addEventListener(
        "submit",
        event => {

            event.preventDefault();


            const subject =
                document
                    .getElementById(
                        "subjectInput"
                    )
                    .value
                    .trim();


            const title =
                document
                    .getElementById(
                        "titleInput"
                    )
                    .value
                    .trim();


            const page =
                document
                    .getElementById(
                        "pageInput"
                    )
                    .value
                    .trim();


            const examDate =
                document
                    .getElementById(
                        "examInput"
                    )
                    .value ||
                null;


            const question =
                document
                    .getElementById(
                        "questionInput"
                    )
                    .value
                    .trim();


            const answer =
                document
                    .getElementById(
                        "answerInput"
                    )
                    .value
                    .trim();


            const id =
                Date.now();


            const card = {

                id,

                subject,

                title,

                page,

                examDate,

                question,

                answer,

                interval: 0,

                stability: 1,

                repetitions: 0,

                reviews: 0,

                correctReviews: 0,

                due:
                    new Date()
                        .toISOString(),

                createdAt:
                    new Date()
                        .toISOString()

            };


            data.cards.push(
                card
            );


            prepareToday();


            addCardToToday(
                id
            );


            saveData();


            event.target
                .reset();


            updateEverything();

        }
    );



/* =========================================================
   DUE CARDS
========================================================= */

function getDueCards() {

    const now =
        Date.now();


    return data.cards
        .filter(card => {

            return (
                new Date(
                    card.due
                )
                    .getTime()
                <= now
            );

        })
        .sort(
            (a, b) => {

                return (
                    new Date(a.due) -
                    new Date(b.due)
                );

            }
        );

}



/* =========================================================
   REVIEW
========================================================= */

function openReview() {

    switchPage(
        "review"
    );


    startReview();

}


function startReview() {

    reviewQueue =
        getDueCards();


    showNextCard();

}


function showNextCard() {

    const area =
        document.getElementById(
            "reviewArea"
        );


    if (
        reviewQueue.length === 0
    ) {

        currentCard =
            null;


        document.getElementById(
            "reviewStatus"
        ).textContent =
            "Очередь завершена";


        area.innerHTML = `

            <div class="empty">

                <div class="empty-icon">
                    🎉
                </div>

                <h3>
                    Всё выполнено
                </h3>

                <p>
                    Следующие темы появятся,
                    когда наступит время повторения.
                </p>

                <br>

                <button
                    class="button"
                    id="backHomeButton"
                >
                    На главную
                </button>

            </div>

        `;


        document
            .getElementById(
                "backHomeButton"
            )
            .addEventListener(
                "click",
                () => {

                    switchPage(
                        "dashboard"
                    );

                }
            );


        updateEverything();

        return;

    }


    currentCard =
        reviewQueue.shift();


    document.getElementById(
        "reviewStatus"
    ).textContent =
        `${reviewQueue.length + 1} осталось`;


    if (currentCard.type === "lesson") {

        const examBadge =
            currentCard.examDate
                ? `
                    <span class="badge exam-badge">
                        🎯
                        ${formatDate(
                    currentCard.examDate
                )}
                    </span>
                `
                : "";

        area.innerHTML = `
            <div class="flashcard">
                <div class="badge-row">
                    <span class="badge">
                        ${escapeHTML(
            currentCard.subject
        )}
                    </span>

                    <span class="badge ai-badge">
                        🤖 AI-урок
                    </span>

                    ${examBadge}
                </div>

                <div class="card-title-small">
                    Повторение темы
                </div>

                <div class="question">
                    🧠 ${escapeHTML(
            currentCard.title
        )}
                </div>

                <div class="meta" style="margin-top: 14px; font-size: 14px;">
                    5 вопросов · ≈ 3 минуты
                </div>

                <div style="margin-top: 25px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button id="startLessonReviewQuizButton" class="button" style="min-width: 140px;">
                        Повторить
                    </button>
                    <button id="viewLessonNotesReviewButton" class="button secondary" style="min-width: 140px;">
                        📘 Конспект
                    </button>
                </div>
            </div>
        `;

        document
            .getElementById("startLessonReviewQuizButton")
            .addEventListener("click", () => {
                const quiz = runQuiz({
                    questions: currentCard.questions,
                    targetContainer: area,
                    onComplete: ({ score, percentage, rating }) => {
                        currentCard.lastScore = score;
                        currentCard.lastPercentage = percentage;
                        applyRatingToItem(currentCard, rating);
                        currentCard = null;
                        showNextCard();
                    }
                });
                quiz.start();
            });

        document
            .getElementById("viewLessonNotesReviewButton")
            .addEventListener("click", () => {
                openLessonNotesModal(currentCard);
            });

        return;

    }


    const pageBadge =
        currentCard.page
            ? `
                <span class="badge page-badge">

                    📖 стр.
                    ${escapeHTML(
                currentCard.page
            )
            }

                </span>
            `
            : "";


    const examBadge =
        currentCard.examDate
            ? `
                <span class="badge exam-badge">

                    🎯
                    ${formatDate(
                currentCard.examDate
            )
            }

                </span>
            `
            : "";


    area.innerHTML = `

        <div class="flashcard">

            <div class="badge-row">

                <span class="badge">

                    ${escapeHTML(
        currentCard.subject
    )
        }

                </span>

                ${pageBadge}

                ${examBadge}

            </div>


            <div class="card-title-small">

                ${escapeHTML(
            currentCard.title
        )
        }

            </div>


            <div class="question">

                ${escapeHTML(
            currentCard.question
        )
        }

            </div>


            <div
                id="currentAnswer"
                class="answer"
            >

                ${escapeHTML(
            currentCard.answer
        )
        }

            </div>

        </div>


        <button
            id="showAnswerButton"
            class="button"
            style="width:100%;"
        >
            Показать ответ
        </button>


        <div
            id="ratingButtons"
            class="rating-buttons"
        >

            <button
                class="rating again"
                data-rating="again"
            >

                <strong>
                    😵 Забыл
                </strong>

                <span>
                    скоро снова
                </span>

            </button>


            <button
                class="rating hard"
                data-rating="hard"
            >

                <strong>
                    😕 Тяжело
                </strong>

                <span>
                    короткий интервал
                </span>

            </button>


            <button
                class="rating good"
                data-rating="good"
            >

                <strong>
                    🙂 Нормально
                </strong>

                <span>
                    обычный интервал
                </span>

            </button>


            <button
                class="rating easy"
                data-rating="easy"
            >

                <strong>
                    😎 Легко
                </strong>

                <span>
                    длинный интервал
                </span>

            </button>

        </div>

    `;


    document
        .getElementById(
            "showAnswerButton"
        )
        .addEventListener(
            "click",
            showAnswer
        );


    document
        .querySelectorAll(
            "[data-rating]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    reviewCard(
                        button.dataset.rating
                    );

                }
            );

        });

}


function showAnswer() {

    document
        .getElementById(
            "currentAnswer"
        )
        .classList
        .add(
            "visible"
        );


    document
        .getElementById(
            "showAnswerButton"
        )
        .style
        .display =
        "none";


    document
        .getElementById(
            "ratingButtons"
        )
        .classList
        .add(
            "visible"
        );

}



/* =========================================================
   SPACED REPETITION ENGINE
========================================================= */

function applyRatingToItem(item, rating) {

    if (!item) {
        return;
    }

    item.reviews = (item.reviews || 0) + 1;

    let nextDate = new Date();


    /* FORGOT */

    if (rating === "again") {

        item.stability =
            Math.max(
                0.5,
                (item.stability || 1) * 0.45
            );

        item.interval = 0;

        nextDate.setMinutes(
            nextDate.getMinutes() + 10
        );

        data.xp += 2;

    }


    /* HARD */

    if (rating === "hard") {

        item.correctReviews = (item.correctReviews || 0) + 1;
        item.repetitions = (item.repetitions || 0) + 1;

        item.stability = (item.stability || 1) * 1.25;

        const days =
            (item.interval || 0) < 1
                ? 1
                : Math.max(
                    1,
                    Math.round((item.interval || 0) * 1.3)
                );

        item.interval = days;

        nextDate.setDate(
            nextDate.getDate() + days
        );

        data.xp += 5;

        markCardCompleted(item.id);

    }


    /* GOOD */

    if (rating === "good") {

        item.correctReviews = (item.correctReviews || 0) + 1;
        item.repetitions = (item.repetitions || 0) + 1;

        item.stability = (item.stability || 1) * 1.8;

        let days;

        if (item.repetitions === 1) {
            days = 1;
        } else if (item.repetitions === 2) {
            days = 3;
        } else {
            days = Math.max(
                4,
                Math.round(
                    Math.max(
                        item.interval || 0,
                        item.stability || 1
                    ) * 2
                )
            );
        }

        item.interval = days;

        nextDate.setDate(
            nextDate.getDate() + days
        );

        data.xp += 10;

        markCardCompleted(item.id);

    }


    /* EASY */

    if (rating === "easy") {

        item.correctReviews = (item.correctReviews || 0) + 1;
        item.repetitions = (item.repetitions || 0) + 1;

        item.stability = (item.stability || 1) * 2.4;

        let days;

        if (item.repetitions === 1) {
            days = 3;
        } else {
            days = Math.max(
                7,
                Math.round(
                    Math.max(
                        item.interval || 0,
                        item.stability || 1
                    ) * 2.5
                )
            );
        }

        item.interval = days;

        nextDate.setDate(
            nextDate.getDate() + days
        );

        data.xp += 15;

        markCardCompleted(item.id);

    }


    nextDate = adjustForExam(item, nextDate);

    item.due = nextDate.toISOString();

    updateStreak();

    saveData();

}


function reviewCard(rating) {

    if (!currentCard) {
        return;
    }

    applyRatingToItem(currentCard, rating);

    currentCard = null;

    showNextCard();

}


/* =========================================================
   QUIZ ENGINE
========================================================= */

function runQuiz({ questions, targetContainer, onComplete }) {

    let currentIndex = 0;
    let score = 0;

    function renderQuestion() {

        const q = questions[currentIndex];
        const isLast = currentIndex === questions.length - 1;

        targetContainer.innerHTML = `
            <div class="quiz-panel">
                <div class="quiz-progress">
                    <span>Вопрос ${currentIndex + 1} / ${questions.length}</span>
                    <span>${Math.round(((currentIndex) / questions.length) * 100)}%</span>
                </div>

                <div class="quiz-question">
                    ${escapeHTML(q.question)}
                </div>

                <div class="quiz-options">
                    ${["A", "B", "C", "D"].map(key => {
            return `
                            <button type="button" class="quiz-option" data-option="${key}">
                                <span class="quiz-option-key">${key}</span>
                                <span class="quiz-option-text">${escapeHTML(q.options[key] || "")}</span>
                            </button>
                        `;
        }).join("")}
                </div>

                <div id="quizFeedbackArea" class="quiz-feedback" style="display: none;"></div>
            </div>
        `;

        const options = targetContainer.querySelectorAll(".quiz-option");
        const feedback = targetContainer.querySelector("#quizFeedbackArea");

        options.forEach(btn => {
            btn.addEventListener("click", () => {
                const selectedKey = btn.dataset.option;
                const isCorrect = selectedKey === q.correct;

                if (isCorrect) {
                    score += 1;
                }

                options.forEach(b => {
                    b.disabled = true;
                    if (b.dataset.option === q.correct) {
                        b.classList.add("correct");
                    }
                });

                if (!isCorrect) {
                    btn.classList.add("wrong");
                }

                const statusHtml = isCorrect
                    ? `<div class="correct-answer">✅ Верно</div>`
                    : `<div class="wrong-answer">❌ Неверно</div>`;

                const explanationText = q.explanation
                    ? `<div class="quiz-explanation">${escapeHTML(q.explanation)}</div>`
                    : "";

                feedback.innerHTML = `
                    ${statusHtml}
                    <div class="quiz-correct-ref">
                        <strong>Правильный ответ:</strong> ${escapeHTML(q.correct)}. ${escapeHTML(q.options[q.correct] || "")}
                    </div>
                    ${explanationText}
                    <button type="button" id="quizNextButton" class="button" style="width: 100%; margin-top: 14px;">
                        ${isLast ? "Посмотреть результат" : "Следующий вопрос →"}
                    </button>
                `;

                feedback.style.display = "block";

                targetContainer.querySelector("#quizNextButton").addEventListener("click", () => {
                    if (isLast) {
                        renderResults();
                    } else {
                        currentIndex += 1;
                        renderQuestion();
                    }
                });
            });
        });

    }

    function renderResults() {

        const percentage = Math.round((score / questions.length) * 100);
        const errors = questions.length - score;

        targetContainer.innerHTML = `
            <div class="quiz-result">
                <div class="empty-icon" style="font-size: 52px; margin-bottom: 8px;">🎉</div>
                <h3>Тест завершён</h3>
                <div class="result-score">${score} / ${questions.length}</div>
                <div class="result-percent">${percentage}%</div>

                <div class="result-breakdown">
                    <div>Правильных ответов: <strong style="color: var(--green);">${score}</strong></div>
                    <div>Ошибок: <strong style="color: ${errors > 0 ? 'var(--red)' : 'var(--text)'};">${errors}</strong></div>
                </div>

                <div class="result-rating-prompt">
                    Как хорошо ты знаешь эту тему?
                </div>

                <div class="rating-buttons visible" style="display: grid; width: 100%;">
                    <button class="rating again" data-rating="again">
                        <strong>😵 Забыл</strong>
                        <span>скоро снова</span>
                    </button>
                    <button class="rating hard" data-rating="hard">
                        <strong>😕 Тяжело</strong>
                        <span>короткий интервал</span>
                    </button>
                    <button class="rating good" data-rating="good">
                        <strong>🙂 Нормально</strong>
                        <span>обычный интервал</span>
                    </button>
                    <button class="rating easy" data-rating="easy">
                        <strong>😎 Легко</strong>
                        <span>длинный интервал</span>
                    </button>
                </div>
            </div>
        `;

        targetContainer.querySelectorAll("[data-rating]").forEach(btn => {
            btn.addEventListener("click", () => {
                const rating = btn.dataset.rating;
                if (typeof onComplete === "function") {
                    onComplete({
                        score,
                        percentage,
                        rating
                    });
                }
            });
        });

    }

    return {
        start() {
            renderQuestion();
        }
    };

}


/* =========================================================
   STUDY MODAL & NEW LESSON FLOW
========================================================= */

function openStudyModal() {
    const modal = document.getElementById("studyModal");
    if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
}

function closeStudyModal() {
    const modal = document.getElementById("studyModal");
    if (modal) {
        modal.style.display = "none";
        const body = document.getElementById("studyModalBody");
        if (body) body.innerHTML = "";
        document.body.style.overflow = "";
    }
}

function openLessonStudyScreen(lessonData) {

    const body = document.getElementById("studyModalBody");
    if (!body) return;

    openStudyModal();

    body.innerHTML = `
        <div class="lesson-panel">
            <div class="lesson-header">
                <div class="badge-row" style="justify-content: flex-start; margin-bottom: 6px;">
                    <span class="badge">${escapeHTML(lessonData.subject)}</span>
                    <span class="badge ai-badge">🤖 AI-урок</span>
                    ${lessonData.examDate ? `<span class="badge exam-badge">🎯 ${formatDate(lessonData.examDate)}</span>` : ""}
                </div>
                <h2>📘 ${escapeHTML(lessonData.title)}</h2>
                <p>Краткий AI-конспект</p>
            </div>

            <div class="lesson-notes">
                ${lessonData.notes.map(note => `
                    <div class="lesson-point">
                        <span class="lesson-point-bullet">•</span>
                        <span>${escapeHTML(note)}</span>
                    </div>
                `).join("")}
            </div>

            <button type="button" id="startLessonQuizBtn" class="button" style="width: 100%; margin-top: 10px;">
                🧠 Проверить себя
            </button>
        </div>
    `;

    document.getElementById("startLessonQuizBtn").addEventListener("click", () => {
        const quiz = runQuiz({
            questions: lessonData.questions,
            targetContainer: body,
            onComplete: ({ score, percentage, rating }) => {
                const newLesson = {
                    id: Date.now(),
                    type: "lesson",
                    subject: lessonData.subject,
                    title: lessonData.title,
                    examDate: lessonData.examDate || null,
                    notes: lessonData.notes,
                    questions: lessonData.questions,
                    lastScore: score,
                    lastPercentage: percentage,
                    interval: 0,
                    stability: 1,
                    repetitions: 0,
                    reviews: 0,
                    correctReviews: 0,
                    due: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    source: "ai-topic"
                };

                data.cards.push(newLesson);
                prepareToday();
                addCardToToday(newLesson.id);
                applyRatingToItem(newLesson, rating);
                closeStudyModal();
                updateEverything();
            }
        });
        quiz.start();
    });

}

function openLessonNotesModal(lesson) {

    const body = document.getElementById("studyModalBody");
    if (!body) return;

    openStudyModal();

    body.innerHTML = `
        <div class="lesson-panel">
            <div class="lesson-header">
                <div class="badge-row" style="justify-content: flex-start; margin-bottom: 6px;">
                    <span class="badge">${escapeHTML(lesson.subject)}</span>
                    <span class="badge ai-badge">🤖 AI-конспект</span>
                    ${lesson.examDate ? `<span class="badge exam-badge">🎯 ${formatDate(lesson.examDate)}</span>` : ""}
                </div>
                <h2>📘 ${escapeHTML(lesson.title)}</h2>
                <p>Конспект темы</p>
            </div>

            <div class="lesson-notes">
                ${(lesson.notes || []).map(note => `
                    <div class="lesson-point">
                        <span class="lesson-point-bullet">•</span>
                        <span>${escapeHTML(note)}</span>
                    </div>
                `).join("")}
            </div>

            <button type="button" id="closeNotesModalBtn" class="button secondary" style="width: 100%; margin-top: 10px;">
                Закрыть
            </button>
        </div>
    `;

    document.getElementById("closeNotesModalBtn").addEventListener("click", closeStudyModal);

}

const closeStudyBtn = document.getElementById("closeStudyModalButton");
if (closeStudyBtn) {
    closeStudyBtn.addEventListener("click", closeStudyModal);
}

const studyBackdrop = document.getElementById("studyModalBackdrop");
if (studyBackdrop) {
    studyBackdrop.addEventListener("click", closeStudyModal);
}

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        const modal = document.getElementById("studyModal");
        if (modal && modal.style.display !== "none") {
            closeStudyModal();
        }
    }
});

/* =========================================================
   STUDY TOPIC FORM HANDLER
========================================================= */

const studyTopicFormEl = document.getElementById("studyTopicForm");
if (studyTopicFormEl) {
    studyTopicFormEl.addEventListener("submit", async (event) => {
        event.preventDefault();

        const topicInput = document.getElementById("studyTopicInput");
        const subjectInput = document.getElementById("studySubjectInput");
        const examInput = document.getElementById("studyExamInput");
        const submitBtn = document.getElementById("startStudyButton");
        const errorBox = document.getElementById("studyError");

        const topic = topicInput ? topicInput.value.trim() : "";
        const subject = subjectInput ? subjectInput.value.trim() : "";
        const examDate = examInput && examInput.value ? examInput.value : null;

        if (!topic || !subject) return;

        if (errorBox) {
            errorBox.style.display = "none";
            errorBox.textContent = "";
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "✨ AI создаёт урок...";
        }

        try {
            const response = await fetch("https://recall-ai-api.sho591820.workers.dev/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    mode: "topic",
                    topic: topic,
                    subject: subject
                })
            });

            if (!response.ok) {
                let errorMsg = `Ошибка сервера (${response.status})`;

                try {
                    const errorJson = await response.json();

                    if (errorJson?.details) {
                        errorMsg = errorJson.details;
                    } else if (errorJson?.error) {
                        errorMsg = errorJson.error;
                    }

                } catch (_) { }

                throw new Error(errorMsg);
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            const validation = validateLessonResponse(result);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "✨ Начать изучение";
            }

            topicInput.value = "";
            subjectInput.value = "";
            if (examInput) examInput.value = "";

            openLessonStudyScreen({
                title: result.title,
                subject: subject,
                examDate: examDate,
                notes: result.notes,
                questions: result.questions
            });

        } catch (error) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "✨ Начать изучение";
            }
            if (errorBox) {
                errorBox.textContent = error.message || "Не удалось загрузить урок от AI. Пожалуйста, попробуйте снова.";
                errorBox.style.display = "block";
            }
        }
    });
}



/* =========================================================
   EXAM MODE
========================================================= */

function adjustForExam(
    card,
    proposedDate
) {

    /*
        Нет экзамена -
        ничего не меняем.
    */

    if (!card.examDate) {

        return proposedDate;

    }


    const days =
        daysUntil(
            card.examDate
        );


    if (
        days === null ||
        days < 0
    ) {

        return proposedDate;

    }


    const now =
        new Date();


    let maximumDays;


    if (
        days <= 2
    ) {

        maximumDays = 1;

    }

    else if (
        days <= 7
    ) {

        maximumDays = 2;

    }

    else if (
        days <= 21
    ) {

        maximumDays = 5;

    }

    else {

        return proposedDate;

    }


    const forcedDate =
        new Date(now);


    forcedDate.setDate(
        forcedDate.getDate() +
        maximumDays
    );


    if (
        forcedDate <
        proposedDate
    ) {

        return forcedDate;

    }


    return proposedDate;

}



/* =========================================================
   STREAK
========================================================= */

function updateStreak() {

    const today =
        getTodayKey();


    if (
        data.lastStudyDate === today
    ) {

        return;

    }


    if (
        data.lastStudyDate &&
        isYesterday(
            data.lastStudyDate,
            today
        )
    ) {

        data.streak += 1;

    }

    else {

        data.streak = 1;

    }


    data.lastStudyDate =
        today;

}



/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {

    prepareToday();


    const due =
        getDueCards();


    document.getElementById(
        "streakValue"
    ).textContent =
        data.streak;


    document.getElementById(
        "dueValue"
    ).textContent =
        due.length;


    document.getElementById(
        "xpValue"
    ).textContent =
        data.xp;


    document.getElementById(
        "cardsValue"
    ).textContent =
        data.cards.length;


    const description =
        document.getElementById(
            "todayDescription"
        );


    if (
        due.length === 0
    ) {

        description.textContent =
            "На данный момент всё повторено.";

    }

    else {

        description.textContent =
            `Нужно повторить: ${due.length}`;

    }


    const total =
        data.todayCardIds
            .length;


    const completed =
        data.completedToday
            .filter(id => {

                return (
                    data.todayCardIds
                        .includes(id)
                );

            })
            .length;


    let percentage =
        0;


    if (
        total > 0
    ) {

        percentage =
            Math.min(
                100,
                completed /
                total *
                100
            );

    }


    document.getElementById(
        "progressText"
    ).textContent =
        `${completed} / ${total}`;


    document.getElementById(
        "dailyProgress"
    ).style.width =
        percentage + "%";


    renderTodayList(
        due
    );

}



/* =========================================================
   TODAY LIST
========================================================= */

function renderTodayList(
    cards
) {

    const container =
        document.getElementById(
            "todayList"
        );


    if (
        cards.length === 0
    ) {

        container.innerHTML = `

            <div class="empty">

                <div class="empty-icon">
                    ✅
                </div>

                <h3>
                    Сейчас повторений нет
                </h3>

                <p>
                    Можешь добавить новую тему
                    из своей тетради.
                </p>

            </div>

        `;

        return;

    }


    container.innerHTML =
        cards
            .slice(
                0,
                5
            )
            .map(card => {

                const isLesson =
                    card.type === "lesson";

                const page =
                    isLesson
                        ? `<span class="badge ai-badge" style="font-size:11px; padding:2px 8px;">🤖 AI-урок</span> · 🧠 5 вопр.`
                        : (card.page
                            ? `
                                📖 стр.
                                ${escapeHTML(
                                card.page
                            )
                            }
                            `
                            : "📖 конспект");


                const exam =
                    card.examDate
                        ? `
                            <span class="exam-tag">

                                🎯
                                ${formatDate(
                            card.examDate
                        )
                        }

                            </span>
                        `
                        : "";


                const titleHtml =
                    isLesson
                        ? `🧠 ${escapeHTML(card.title)}`
                        : escapeHTML(card.title);


                return `

                    <div class="today-item">

                        <div>

                            <div class="subject">

                                ${escapeHTML(
                    card.subject
                )
                    }

                            </div>


                            <h4>

                                ${titleHtml}

                            </h4>


                            <div class="meta">

                                ${page}

                                ${exam}

                            </div>

                        </div>


                        <button
                            class="button secondary today-review-button"
                        >
                            Повторить
                        </button>

                    </div>

                `;

            })
            .join("");


    document
        .querySelectorAll(
            ".today-review-button"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                openReview
            );

        });

}



/* =========================================================
   UPCOMING
========================================================= */

function renderUpcoming() {

    const container =
        document.getElementById(
            "upcomingList"
        );


    const today =
        new Date();


    today.setHours(
        0,
        0,
        0,
        0
    );


    const limit =
        new Date(today);


    limit.setDate(
        limit.getDate() +
        14
    );


    const future =
        data.cards
            .filter(card => {

                const due =
                    new Date(
                        card.due
                    );


                return (
                    due >= today &&
                    due <= limit
                );

            })
            .sort(
                (a, b) =>
                    new Date(a.due) -
                    new Date(b.due)
            );


    if (
        future.length === 0
    ) {

        container.innerHTML = `

            <div class="empty">

                <div class="empty-icon">
                    🗓️
                </div>

                <h3>
                    Пока пусто
                </h3>

                <p>
                    Добавь материал -
                    здесь появится расписание.
                </p>

            </div>

        `;

        return;

    }


    const groups = {};


    future.forEach(card => {

        const key =
            getDateKeyFromDate(
                new Date(
                    card.due
                )
            );


        if (!groups[key]) {

            groups[key] = [];

        }


        groups[key].push(
            card
        );

    });


    container.innerHTML =
        Object
            .entries(groups)
            .map(
                ([date, cards]) => {

                    return `

                        <div class="upcoming-day">

                            <div class="upcoming-day-title">

                                ${formatHumanDate(
                        date
                    )
                        }

                                ·

                                ${cards.length
                        }

                            </div>


                            ${cards
                            .map(card => {

                                return `

                                            <div class="upcoming-card">

                                                <strong>

                                                    ${escapeHTML(
                                    card.subject
                                )
                                    }

                                                    -

                                                    ${escapeHTML(
                                        card.title
                                    )
                                    }

                                                </strong>


                                                <p>

                                                    ${card.type === "lesson"
                                        ? "🤖 AI-урок (5 вопр.)"
                                        : (card.page
                                            ? `📖 стр. ${escapeHTML(card.page)}`
                                            : "📖 конспект")
                                    }

                                                    ${card.examDate
                                        ? `
                                                                · 🎯 экзамен
                                                                ${formatDate(
                                            card.examDate
                                        )
                                        }
                                                            `
                                        : ""
                                    }

                                                </p>

                                            </div>

                                        `;

                            })
                            .join("")
                        }

                        </div>

                    `;

                }
            )
            .join("");

}



/* =========================================================
   SUBJECT FILTER
========================================================= */

document
    .getElementById(
        "subjectFilter"
    )
    .addEventListener(
        "change",
        renderCards
    );


function renderSubjectFilter() {

    const select =
        document.getElementById(
            "subjectFilter"
        );


    const selected =
        select.value;


    const subjects =
        [
            ...new Set(
                data.cards
                    .map(
                        card =>
                            card.subject
                    )
            )
        ]
            .sort();


    select.innerHTML = `

        <option value="">
            Все темы
        </option>

        ${subjects
            .map(subject => {

                return `

                        <option
                            value="${escapeHTML(
                    subject
                )
                    }"
                        >

                            ${escapeHTML(
                        subject
                    )
                    }

                        </option>

                    `;

            })
            .join("")
        }

    `;


    if (
        subjects.includes(
            selected
        )
    ) {

        select.value =
            selected;

    }

}



/* =========================================================
   MATERIALS
========================================================= */

function renderCards() {

    const container =
        document.getElementById(
            "cardsList"
        );


    const filter =
        document.getElementById(
            "subjectFilter"
        ).value;


    const cards =
        filter
            ? data.cards
                .filter(
                    card =>
                        card.subject ===
                        filter
                )
            : data.cards;


    document.getElementById(
        "materialsCount"
    ).textContent =
        `${data.cards.length} материалов`;


    if (
        cards.length === 0
    ) {

        container.innerHTML = `

            <div class="empty">

                <div class="empty-icon">
                    📚
                </div>

                <h3>
                    Материалов пока нет
                </h3>

            </div>

        `;

        return;

    }


    container.innerHTML =
        cards
            .map(card => {

                if (card.type === "lesson") {

                    const lastPct =
                        typeof card.lastPercentage === "number"
                            ? card.lastPercentage
                            : 0;

                    const examTag =
                        card.examDate
                            ? `· 🎯 ${formatDate(card.examDate)}`
                            : "";

                    return `

                        <div class="memory-card">

                            <div class="memory-card-content">

                                <div class="subject">

                                    ${escapeHTML(
                        card.subject
                    )}

                                </div>


                                <h4>

                                    ${escapeHTML(
                        card.title
                    )}

                                </h4>


                                <div class="badge-row" style="justify-content: flex-start; margin-bottom: 8px; margin-top: 6px;">

                                    <span class="badge ai-badge">
                                        🤖 AI-урок
                                    </span>

                                    <span class="badge">
                                        🧠 5 вопросов
                                    </span>

                                </div>


                                <div class="meta">

                                    Последний результат: ${lastPct}%

                                    · 🧠 Следующее повторение: ${formatNextReview(
                        card.due
                    )}

                                    ${examTag}

                                </div>

                            </div>


                            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">

                                <button
                                    class="button secondary view-notes-btn"
                                    data-notes-id="${card.id}"
                                >
                                    Конспект
                                </button>

                                <button
                                    class="delete-btn"
                                    data-delete-id="${card.id}"
                                >
                                    Удалить
                                </button>

                            </div>

                        </div>

                    `;

                }


                const accuracy =
                    card.reviews > 0
                        ? Math.round(
                            card.correctReviews /
                            card.reviews *
                            100
                        )
                        : 0;


                return `

                    <div class="memory-card">

                        <div class="memory-card-content">

                            <div class="subject">

                                ${escapeHTML(
                    card.subject
                )
                    }

                            </div>


                            <h4>

                                ${escapeHTML(
                        card.title
                    )
                    }

                            </h4>


                            <p>

                                ${escapeHTML(
                        card.question
                    )
                    }

                            </p>


                            <div class="meta">

                                ${card.page
                        ? `
                                            📖 стр.
                                            ${escapeHTML(
                            card.page
                        )
                        }
                                            ·
                                        `
                        : ""
                    }

                                🧠
                                ${formatNextReview(
                        card.due
                    )
                    }

                                ·

                                точность
                                ${accuracy}%

                                ${card.examDate
                        ? `
                                            · 🎯
                                            ${formatDate(
                            card.examDate
                        )
                        }
                                        `
                        : ""
                    }

                            </div>

                        </div>


                        <button
                            class="delete-btn"
                            data-delete-id="${card.id}"
                        >
                            Удалить
                        </button>

                    </div>

                `;

            })
            .join("");


    document
        .querySelectorAll(
            "[data-notes-id]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const id =
                        Number(
                            button.dataset
                                .notesId
                        );

                    const card =
                        data.cards.find(
                            c => c.id === id
                        );

                    if (card) {
                        openLessonNotesModal(card);
                    }

                }
            );

        });


    document
        .querySelectorAll(
            "[data-delete-id]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    deleteCard(
                        Number(
                            button.dataset
                                .deleteId
                        )
                    );

                }
            );

        });

}



/* =========================================================
   DELETE
========================================================= */

function deleteCard(id) {

    const confirmed =
        confirm(
            "Удалить этот материал?"
        );


    if (!confirmed) {
        return;
    }


    data.cards =
        data.cards
            .filter(
                card =>
                    card.id !== id
            );


    data.todayCardIds =
        data.todayCardIds
            .filter(
                cardId =>
                    cardId !== id
            );


    data.completedToday =
        data.completedToday
            .filter(
                cardId =>
                    cardId !== id
            );


    saveData();


    updateEverything();

}



/* =========================================================
   FORMATTING
========================================================= */

function formatNextReview(
    date
) {

    const diff =
        new Date(date) -
        new Date();


    if (
        diff <= 0
    ) {

        return "сейчас";

    }


    const minutes =
        Math.ceil(
            diff /
            60000
        );


    if (
        minutes < 60
    ) {

        return `через ${minutes} мин`;

    }


    const hours =
        Math.ceil(
            minutes /
            60
        );


    if (
        hours < 24
    ) {

        return `через ${hours} ч`;

    }


    const days =
        Math.ceil(
            hours /
            24
        );


    if (
        days === 1
    ) {

        return "завтра";

    }


    return `через ${days} дн.`;

}


function formatDate(
    dateString
) {

    const date =
        new Date(
            dateString +
            (
                dateString.includes("T")
                    ? ""
                    : "T00:00:00"
            )
        );


    return date
        .toLocaleDateString(
            "ru-RU",
            {
                day: "numeric",
                month: "short"
            }
        );

}


function getDateKeyFromDate(
    date
) {

    return [

        date.getFullYear(),

        String(
            date.getMonth() + 1
        )
            .padStart(
                2,
                "0"
            ),

        String(
            date.getDate()
        )
            .padStart(
                2,
                "0"
            )

    ].join("-");

}


function formatHumanDate(
    key
) {

    const today =
        getTodayKey();


    if (
        key === today
    ) {

        return "Сегодня";

    }


    const date =
        new Date(
            key +
            "T00:00:00"
        );


    const tomorrow =
        new Date();


    tomorrow.setDate(
        tomorrow.getDate() +
        1
    );


    if (
        getDateKeyFromDate(
            tomorrow
        ) === key
    ) {

        return "Завтра";

    }


    return date
        .toLocaleDateString(
            "ru-RU",
            {
                weekday: "short",
                day: "numeric",
                month: "short"
            }
        );

}



/* =========================================================
   SAFE HTML
========================================================= */

function escapeHTML(text) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        String(
            text ?? ""
        );


    return div.innerHTML;

}



/* =========================================================
   NAVIGATION
========================================================= */

document
    .querySelectorAll(
        ".nav-btn"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const page =
                    button.dataset.page;


                switchPage(
                    page
                );


                if (
                    page === "review"
                ) {

                    startReview();

                }

            }
        );

    });


function switchPage(
    pageName
) {

    document
        .querySelectorAll(
            ".page"
        )
        .forEach(page => {

            page.classList
                .remove(
                    "active"
                );

        });


    document
        .querySelectorAll(
            ".nav-btn"
        )
        .forEach(button => {

            button.classList
                .remove(
                    "active"
                );

        });


    document
        .getElementById(
            pageName
        )
        .classList
        .add(
            "active"
        );


    const button =
        document.querySelector(
            `[data-page="${pageName}"]`
        );


    if (button) {

        button.classList
            .add(
                "active"
            );

    }


    updateEverything();

}



/* =========================================================
   GREETING
========================================================= */

function updateGreeting() {

    const hour =
        new Date()
            .getHours();


    let greeting;


    if (
        hour < 12
    ) {

        greeting =
            "Доброе утро 👋";

    }

    else if (
        hour < 18
    ) {

        greeting =
            "Добрый день 👋";

    }

    else {

        greeting =
            "Добрый вечер 👋";

    }


    document
        .getElementById(
            "greeting"
        )
        .textContent =
        greeting;

}



/* =========================================================
   MAIN BUTTON
========================================================= */

document
    .getElementById(
        "startReviewButton"
    )
    .addEventListener(
        "click",
        openReview
    );



/* =========================================================
   UPDATE
========================================================= */

function updateEverything() {

    updateGreeting();

    prepareToday();

    updateDashboard();

    renderSubjectFilter();

    renderCards();

    renderUpcoming();

}



/* =========================================================
   SERVICE WORKER
========================================================= */

if (
    "serviceWorker" in navigator
) {

    window.addEventListener(
        "load",
        () => {

            navigator
                .serviceWorker
                .register(
                    "./sw.js"
                )
                .catch(error => {

                    console.error(
                        "Service Worker:",
                        error
                    );

                });

        }
    );

}



/* =========================================================
   START APP
========================================================= */

loadData();

prepareToday();

updateEverything();
