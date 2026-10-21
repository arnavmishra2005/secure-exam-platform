import assert from 'node:assert';

function evaluateExit(isExamSubmitted, pin, exitPin) {
  if (!isExamSubmitted && pin !== exitPin) {
    return { ok: false, reason: 'Wrong PIN' };
  }
  return { ok: true };
}

// 1. Active exam without PIN -> blocked
assert.deepStrictEqual(evaluateExit(false, undefined, '1234'), { ok: false, reason: 'Wrong PIN' });
assert.deepStrictEqual(evaluateExit(false, 'wrong', '1234'), { ok: false, reason: 'Wrong PIN' });

// 2. Active exam with correct PIN -> allowed
assert.deepStrictEqual(evaluateExit(false, '1234', '1234'), { ok: true });

// 3. Submitted exam without PIN -> allowed
assert.deepStrictEqual(evaluateExit(true, undefined, '1234'), { ok: true });
assert.deepStrictEqual(evaluateExit(true, '', '1234'), { ok: true });

// 4. Submitted exam with PIN -> allowed
assert.deepStrictEqual(evaluateExit(true, '1234', '1234'), { ok: true });

console.log('✅ All exit policy checks passed successfully.');

