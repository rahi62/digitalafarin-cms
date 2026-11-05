import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginRetrySeconds, loginRetryMessage } from '../src/lib/login-errors.ts';

test('login retry advice accepts only bounded positive integer seconds', () => {
  assert.equal(loginRetrySeconds('17'), 17);
  assert.equal(loginRetrySeconds('99999'), 3600);
  for (const value of [null, '', '-2', '0', 'Infinity', '3.5', '<script>', '9'.repeat(100)]) {
    assert.equal(loginRetrySeconds(value), 60);
  }
  assert.equal(loginRetryMessage(17), 'تلاش‌های ورود بیش از حد مجاز است. پس از 17 ثانیه دوباره تلاش کنید.');
});
