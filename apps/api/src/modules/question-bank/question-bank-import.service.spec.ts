import { BadRequestException } from '@nestjs/common';
import { QuestionDifficulty, QuestionStatus, QuestionType } from '@secure-exam/types';
import { parseImportCsv } from './question-bank-import.service';

const HEADER = 'text,type,marks,negative_marks,difficulty,topic,tags,status,option1,option2,option3,option4,correct';

describe('parseImportCsv', () => {
  it('parses MCQ rows with metadata and tags', () => {
    const csv = `${HEADER}\n"2 + 2 = ?",MCQ_SINGLE,1,0.25,easy,Arithmetic,"math; Basics |math",ready,3,4,5,,2\n`;
    const { rows, errors } = parseImportCsv(csv);

    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      text: '2 + 2 = ?',
      type: QuestionType.MCQ_SINGLE,
      marks: 1,
      negativeMarks: 0.25,
      difficulty: QuestionDifficulty.EASY,
      topicName: 'Arithmetic',
      status: QuestionStatus.READY,
      tags: ['math', 'basics'],
    });
    expect(rows[0].options).toEqual([
      { text: '3', isCorrect: false, order: 0 },
      { text: '4', isCorrect: true, order: 1 },
      { text: '5', isCorrect: false, order: 2 },
    ]);
  });

  it('keeps "correct" pointing at the right option when a column is skipped', () => {
    const { rows } = parseImportCsv(`${HEADER}\nPick,MCQ_MULTI,2,,,,,,A,,C,D,1;3\n`);
    expect(rows[0].options.map((o) => [o.text, o.isCorrect])).toEqual([
      ['A', true],
      ['C', true],
      ['D', false],
    ]);
  });

  it('fills True/False and accepts correct = true/false', () => {
    const { rows } = parseImportCsv('text,type,marks,correct\nSky is blue,TRUE_FALSE,1,true\n');
    expect(rows[0].options).toEqual([
      { text: 'True', isCorrect: true, order: 0 },
      { text: 'False', isCorrect: false, order: 1 },
    ]);
    expect(rows[0].status).toBe(QuestionStatus.READY);
  });

  it('reports bad rows by line number and keeps the good ones', () => {
    const csv = [
      'text,type,marks,option1,option2,correct',
      'ok,MCQ_SINGLE,1,a,b,1',
      'code,CODING,5,,,',
      ',MCQ_SINGLE,1,a,b,1',
      'two right,MCQ_SINGLE,1,a,b,1;2',
      'bad ref,MCQ_SINGLE,1,a,b,3',
      'bad marks,MCQ_SINGLE,lots,a,b,1',
    ].join('\n');
    const { rows, errors } = parseImportCsv(csv);
    expect(rows.map((r) => r.text)).toEqual(['ok']);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);
    expect(errors[0].message).toMatch(/coding questions can't be imported/);
    expect(errors[2].message).toMatch(/exactly one correct/);
  });

  it('rejects a file without the required columns', () => {
    expect(() => parseImportCsv('text,marks\nx,1\n')).toThrow(BadRequestException);
    expect(() => parseImportCsv('text,type,marks\n')).toThrow('at least one data row');
  });
});
