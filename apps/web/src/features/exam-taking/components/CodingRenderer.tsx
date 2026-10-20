// Owner: Person B. CODING entry of questionRenderers.registry: adapts the
// exam page's renderer contract to B's CodingQuestionView.
//
// Drafts go through the exam's own saveAnswer() (store -> offline store ->
// sync engine), so they survive offline and are graded after the attempt
// ends even when the student never presses the editor's Submit.

import { CodingQuestionView, type CodingQuestionViewProps } from '@secure-exam/exam-content-ui';
import { Suspense, useCallback } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useAnswer } from '../hooks/useAnswer';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import type { QuestionRendererProps } from '../questionRenderers.registry';
import { useExamStore } from '../store/examStore';

// Person C's Electron app provides window.desktop.runCode; in a browser there is
// none and Run uses the server (allowed in development, see GET /coding/config).
// Wire `localRunner={desktopLocalRunner()}` here once C's preload script exists.
const LOCAL_RUNNER: CodingQuestionViewProps['localRunner'] = undefined;

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
        localRunner={LOCAL_RUNNER}
        onBlockedPaste={() => console.warn('[exam] external paste blocked in the code editor')}
      />
    </Suspense>
  );
}
