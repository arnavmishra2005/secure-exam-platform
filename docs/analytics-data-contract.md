# Analytics data contract

Owner: Person A. Covers how results are computed, so Person B's question-wise
analytics and anything else that reads results agree with the Overview and
Students tabs.

## Identifiers

There are two student identifiers, and tables do not all use the same one.

| Column | Holds | Used by |
|---|---|---|
| `students.id` | the Student record | `course_enrollments.studentId`, `exam_registrations.studentId` |
| `users.id` (JWT `sub`) | the login account | `attempts.studentId`, `results.studentId`, `question_scores.studentId`, `exam_extensions.studentId`, `notifications.userId` |

Join them with `students."userId" = users.id`. API inputs that take a student
(`/courses/:id/students`, `/exams/:id/registrations`, `/exams/:id/extensions`)
accept a `students.id`, a `users.id` or a college ID and resolve it on the
server (`UserService.resolveStudents`).

## Who counts

- **Registered**: has a row in `exam_registrations` for the exam. Registration
  comes from an assigned course (`source = COURSE`) or a manual add (`MANUAL`).
- **Started**: has an `attempts` row for the exam.
- **Finalized**: attempt status is `SUBMITTED` or `AUTO_SUBMITTED`, and it has a `results` row.
- **Absent**: registered, with no attempt.

The Students tab lists every registered student, plus anyone who attempted
without a registration (possible for Phase 1 data, or after a registration was
removed). Removing a registration never deletes an attempt.

## Scores

- Each graded question has one `question_scores` row per attempt, keyed by
  `(attemptId, questionId)`, written only through `ScoreRecorder`
  (`apps/api/src/common/scoring`). The latest write wins.
- `results.score` is the sum of the attempt's `question_scores.score`,
  recomputed after every `ScoreRecorder` write.
- `results.maxScore` is the sum of the exam's question marks at submit time.
  Overview uses the current question marks (falling back to `results.maxScore`
  when the exam has no questions any more).

### Objective questions (`source = AUTO_MCQ`)

Graded on `attempt.submitted` by `McqGradingService`:

| Answer | Score | `isCorrect` |
|---|---|---|
| No option selected | `0` | `null` |
| Exactly the correct set (order and duplicates ignored) | `marks` | `true` |
| Anything else, including a partially-correct multi-select | `-negativeMarks` (0 if unset) | `false` |

Totals are not floored at zero.

### Coding questions (`source = AUTO_CODE`, Person B)

Person B's grader records one row per coding question after
`attempt.submitted`, using the last Submit, or the latest saved draft if the
student never pressed Submit.

### Manual changes

`PATCH /submissions/:attemptId/result` overrides `results.score` directly.
A later `ScoreRecorder` write for that attempt (for example
`POST /results/exams/:examId/recompute`) recomputes the sum and replaces the override.

## Statistics (`GET /results/exams/:examId/overview`)

Computed over finalized attempts only.

- `mean`, `median`, `min`, `max`, `standardDeviation`: of raw scores; the
  standard deviation is the population one.
- `passRate`: share of finalized attempts with `score / maxScore × 100 ≥ exam.passPercentage`.
- `histogram`: percentage scores in ten 10-point bands; a band includes its
  lower bound; 100 % falls in the 90–100 band; values outside 0–100 are clamped.
- `averageTimeSeconds`: mean of `submittedAt − startedAt`. Extra time from
  extensions is included, since it is time the student actually used.

## Ranking (`GET /results/exams/:examId/students`)

Standard competition ranking by score, highest first ("1, 2, 2, 4"). Students
with the same score share a rank and are listed fastest first. Only finalized
attempts are ranked; in-progress and not-started students follow, unranked.

## Visibility to students

A student sees a result on their dashboard only after an admin publishes it
(`results.published`). `POST /results/exams/:examId/publish-results`
publishes every unpublished result for the exam and notifies those students.

## Stub columns

`violationCount` (Students tab, monitoring) is `null` until Person C's
client-security module records security events. Treat `null` as "not
tracked", not as zero.
