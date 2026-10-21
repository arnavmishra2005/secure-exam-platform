// Whether an exam is running right now. Kept apart from the IPC handlers so
// every guard (keys, focus, display, quit, navigation) can read it without
// importing each other.

let examActive = false;
let examSubmitted = false;
let quitting = false;

/** True only while a student has an exam in progress. */
export function isSecurityActive(): boolean {
  return examActive && !examSubmitted && !quitting;
}

export function isExamActive(): boolean {
  return examActive;
}

export function isExamSubmitted(): boolean {
  return examSubmitted;
}

/** Called when the exam screen locks the window (true) or the exam ends (false). */
export function setExamActive(active: boolean): void {
  examActive = active;
  if (active) examSubmitted = false; // a new exam in the same app session must lock again
}

export function setExamSubmitted(): void {
  examSubmitted = true;
  examActive = false;
}

export function setQuitting(value: boolean): void {
  quitting = value;
}
