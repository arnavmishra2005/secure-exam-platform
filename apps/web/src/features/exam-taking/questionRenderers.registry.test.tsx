import { QuestionType } from '@secure-exam/types';
import { describe, expect, it } from 'vitest';
import { questionRenderers } from './questionRenderers.registry';

describe('questionRenderers', () => {
  it('has a renderer for every question type, including coding', () => {
    for (const type of Object.values(QuestionType)) {
      expect(questionRenderers[type]).toBeDefined();
    }
  });
});
