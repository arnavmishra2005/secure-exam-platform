// Exams are taken in the Secure Exam app. This mirrors REQUIRE_DESKTOP_CLIENT on the API:
// set VITE_REQUIRE_DESKTOP_EXAM=false (and REQUIRE_DESKTOP_CLIENT=false) to sit one in a browser while developing.
export const REQUIRE_DESKTOP_EXAM = import.meta.env.VITE_REQUIRE_DESKTOP_EXAM !== 'false';

/** secure-exam://launch/<token> opens the installed exam app, signed in for one exam. The token is single-use. */
export const examAppLink = (launchToken: string) => `secure-exam://launch/${launchToken}`;
