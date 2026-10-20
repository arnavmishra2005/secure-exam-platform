// Owner: Person A
// Header-based CSV (same format as the Phase 1 admin portal):
//   collegeId,fullName,email[,password]
// Quoted cells are supported so names may contain commas.

import type { CreateStudentPayload } from '@secure-exam/api-client';

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseStudentsCsv(text: string): CreateStudentPayload[] {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('The file needs a header row and at least one student.');

  const columns = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const idx = {
    collegeId: columns.indexOf('collegeid'),
    fullName: columns.indexOf('fullname'),
    email: columns.indexOf('email'),
    password: columns.indexOf('password'),
  };
  if (idx.collegeId < 0 || idx.fullName < 0 || idx.email < 0) {
    throw new Error('The header must include collegeId, fullName and email.');
  }

  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line);
    const row: CreateStudentPayload = {
      collegeId: cells[idx.collegeId] ?? '',
      fullName: cells[idx.fullName] ?? '',
      email: cells[idx.email] ?? '',
    };
    if (idx.password >= 0 && cells[idx.password]) row.password = cells[idx.password];
    if (!row.collegeId || !row.fullName || !row.email) {
      throw new Error(`Row ${i + 2} is missing collegeId, fullName or email.`);
    }
    return row;
  });
}
