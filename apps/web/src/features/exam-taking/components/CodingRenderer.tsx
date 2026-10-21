// Owner: Person B. CODING entry of questionRenderers.registry: adapts the
// exam page's renderer contract to B's CodingQuestionView.
//
// Drafts go through the exam's own saveAnswer() (store -> offline store ->
// sync engine), so they survive offline and are graded after the attempt
// ends even when the student never presses the editor's Submit.

import { CodingQuestionView, desktopLocalRunner } from '@secure-exam/exam-content-ui';
import { Suspense, useCallback } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { desktop } from '../desktop/desktop';
import { useAnswer } from '../hooks/useAnswer';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import type { QuestionRendererProps } from '../questionRenderers.registry';
import { useExamStore } from '../store/examStore';

// In the exam app Run executes on the student's PC through window.desktop.runCode.
// In a browser there is no local runner and Run uses the server (allowed in
// development only, see GET /coding/config).

export function CodingRenderer({ attemptId, question, textResponse, onTextResponseChange, disabled }: QuestionRendererProps) {
  const network = useNetworkStatus();
  const restoreVersion = useExamStore((s) => s.restoreVersion);
  const { saveAnswer } = useAnswer(attemptId);

  const onSaveDraft = useCallback(
    async (code: string) => {
      onTextResponseChange(code);
      await saveAnswer(question.id);
    },
    [onTextResponseChange, saveAnswer, question.id],
  );

  // Reported to the exam app's violation log (a no-op in a browser).
  const onBlockedPaste = useCallback(() => desktop.logViolation('CLIPBOARD_BLOCKED', 'External paste blocked in the code editor'), []);

  return (
    <Suspense fallback={<Spinner label="Loading the code editor" />}>
      <CodingQuestionView
        // Re-seed the editor once saved answers have been restored on page load.
        key={`${question.id}:${restoreVersion}`}
        attemptId={attemptId}
        question={question}
        savedCode={textResponse || null}
        onSaveDraft={onSaveDraft}
        online={network === 'online'}
        readOnly={disabled}
        localRunner={desktopLocalRunner()}
        onBlockedPaste={onBlockedPaste}
      />
    </Suspense>
  );
}
