// Exams are taken in the Secure Exam app. This mirrors REQUIRE_DESKTOP_CLIENT on the API:
// set VITE_REQUIRE_DESKTOP_EXAM=false (and REQUIRE_DESKTOP_CLIENT=false) to sit one in a browser while developing.
export const REQUIRE_DESKTOP_EXAM = import.meta.env.VITE_REQUIRE_DESKTOP_EXAM !== 'false';

/** secure-exam://exam/<id> opens the installed exam app on that exam. */
export const examAppLink = (examId: string) => `secure-exam://exam/${examId}`;
