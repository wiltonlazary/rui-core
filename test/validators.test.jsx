// rui-core/form validators: each rule's pass and fail cases, its default
// message, a named error returned as is, and the defaults seen through $form.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $dispose } from 'rrx-core';
import { $form, required, email, emailTest, pattern, range, length, same } from 'rui-core/form';

describe('required', () => {
  const rule = required();
  it('fails empty values with the default message', () => {
    for (const value of ['', '  ', ' \n', '  ', [], null, undefined, NaN]) {
      assert.equal(rule(value, {}, 'f'), 'Fill this in', `empty: ${JSON.stringify(value)}`);
    }
  });
  it('passes answers, false and 0 included', () => {
    for (const value of [false, 0, 'x', {}, [0]]) assert.equal(rule(value, {}, 'f'), null);
  });
  it('returns a named error as is', () => {
    assert.equal(required('Needed')('', {}, 'f'), 'Needed');
    const error = { code: 'empty' };
    assert.equal(required(error)(null, {}, 'f'), error);
    assert.equal(required(0)(null, {}, 'f'), 0);
  });
});

describe('email and emailTest', () => {
  it('accepts an address shape', () => {
    assert.equal(emailTest('ana@studio.io'), true);
    assert.equal(emailTest('kim@mail.example.org'), true);
  });
  it('rejects broken shapes and non-strings', () => {
    for (const text of ['ana @studio.io', 'ana@studio', 'a@b@studio.io', '@studio.io', 'a@b..io', 'a@.io', 'a@io.']) {
      assert.equal(emailTest(text), false, text);
    }
    assert.equal(emailTest(/** @type {any} */ (42)), false);
    assert.equal(emailTest(/** @type {any} */ (null)), false);
  });
  it('email fails what emailTest rejects', () => {
    assert.equal(email()('ana@studio.io', {}, 'f'), null);
    assert.equal(email()('ana@studio', {}, 'f'), 'Not an email address');
    assert.equal(email('Needs an @')('ana', {}, 'f'), 'Needs an @');
  });
});

describe('pattern', () => {
  it('passes a match and fails the rest', () => {
    const rule = pattern(/^\d{3}$/);
    assert.equal(rule('123', {}, 'f'), null);
    assert.equal(rule('12a', {}, 'f'), 'Wrong format');
    assert.equal(rule(123, {}, 'f'), 'Wrong format', 'a number is not text');
    assert.equal(pattern(/x/, 'No x')('y', {}, 'f'), 'No x');
  });
  it('answers the same every call with a global or sticky pattern', () => {
    for (const regex of [/ab/g, /ab/y]) {
      const rule = pattern(regex);
      assert.equal(rule('ab', {}, 'f'), null);
      assert.equal(rule('ab', {}, 'f'), null);
    }
  });
});

describe('range', () => {
  it('holds both bounds inclusive and reads numeric text', () => {
    const rule = range(5, 10);
    for (const value of [5, 10, 7.5, '10', ' 7 ']) assert.equal(rule(value, {}, 'f'), null, String(value));
    for (const value of [4, 11, '', '  ', 'x', NaN, null, undefined, true]) {
      assert.equal(rule(value, {}, 'f'), 'From 5 to 10', String(value));
    }
  });
  it('leaves a side open and names the bounds it has', () => {
    assert.equal(range(1, undefined)(1e9, {}, 'f'), null);
    assert.equal(range(1, undefined)(0, {}, 'f'), '1 or more');
    assert.equal(range(1, Infinity)(0, {}, 'f'), '1 or more', 'Infinity counts as open');
    assert.equal(range(undefined, 3)(-50, {}, 'f'), null);
    assert.equal(range(undefined, 3)(4, {}, 'f'), '3 or less');
    assert.equal(range(1, 2, 'Out')(3, {}, 'f'), 'Out');
  });
});

describe('length', () => {
  it('checks an exact length, bounds, an open top and a zero bottom', () => {
    assert.equal(length(3)('abc', {}, 'f'), null);
    assert.equal(length(3)('ab', {}, 'f'), '3 characters');
    assert.equal(length(2, 4)('abcd', {}, 'f'), null);
    assert.equal(length(2, 4)('abcde', {}, 'f'), '2 to 4 characters');
    assert.equal(length(2, Infinity)('a'.repeat(500), {}, 'f'), null);
    assert.equal(length(2, Infinity)('a', {}, 'f'), 'At least 2 characters');
    assert.equal(length(0, 3)('', {}, 'f'), null);
    assert.equal(length(0, 3)('abcd', {}, 'f'), 'At most 3 characters');
    assert.equal(length(1)('', {}, 'f'), '1 character', 'one bound shown: singular');
    assert.equal(length(1, Infinity)('', {}, 'f'), 'At least 1 character');
    assert.equal(length(0, 1)('ab', {}, 'f'), 'At most 1 character');
    assert.equal(length(0, 1)(['a', 'b'], {}, 'f'), 'At most 1 item');
    assert.equal(length(1, 2)('abc', {}, 'f'), '1 to 2 characters', 'a range counts to its top');
  });
  it('counts untrimmed unless asked to trim', () => {
    assert.equal(length(5)(' abc ', {}, 'f'), null, "' abc ' has 5");
    assert.equal(length(3, 3, undefined, { trim: true })(' abc ', {}, 'f'), null);
    assert.equal(length(3, 3)(' abc ', {}, 'f'), '3 to 3 characters');
  });
  it('counts graphemes', () => {
    assert.equal(length(1)('👍🏽', {}, 'f'), null);
    assert.equal(length(1)('👨‍👩‍👧‍👦', {}, 'f'), null);
    assert.equal(length(1)('é', {}, 'f'), null);
  });
  it('counts a list by items and fails anything else', () => {
    assert.equal(length(1, 2)(['a', 'b'], {}, 'f'), null);
    assert.equal(length(1, 2)([], {}, 'f'), '1 to 2 items');
    assert.equal(length(2)([1], {}, 'f'), '2 items');
    assert.equal(length(0, 5)(123, {}, 'f'), 'At most 5 characters');
  });
  it('takes the error second in the shorthand, then the options', () => {
    assert.equal(length(6, 'Six digits')('12', {}, 'f'), 'Six digits');
    assert.equal(length(6, 'Six digits')('123456', {}, 'f'), null);
    assert.equal(length(6, 'Six digits', { trim: true })(' 123456 ', {}, 'f'), null);
    assert.equal(length(6, 'Six digits')(' 123456 ', {}, 'f'), 'Six digits');
  });
});

describe('same', () => {
  it('matches the value at a path', () => {
    const values = { pass: 'k3y', a: { list: ['x', 'y'] }, n: NaN };
    assert.equal(same('pass')('k3y', values, 'again'), null);
    assert.equal(same('pass')('key', values, 'again'), 'Does not match');
    assert.equal(same('a.list.1')('y', values, 'f'), null);
    assert.equal(same('a.list.1')('x', values, 'f'), 'Does not match');
    assert.equal(same('n')(NaN, values, 'f'), null, 'NaN matches NaN');
    assert.equal(same('a.gone.deep')(undefined, values, 'f'), null, 'a missing path reads undefined');
    assert.equal(same('a.gone.deep')('', values, 'f'), 'Does not match');
    assert.equal(same('pass', 'Retype it')('', values, 'f'), 'Retype it');
  });
});

describe('rules in $form', () => {
  let R = $root('validators');
  beforeEach(() => {
    R = $root('validators');
  });
  afterEach(() => $dispose(R));

  it('shows the default messages', () => {
    const form = $form(R, {
      values: { name: '', mail: 'nope', seats: 0, code: 'ab', again: 'x', pass: 'y' },
      rules: { name: required(), mail: email(), seats: range(1, 9), code: length(4, 8), again: same('pass') },
    });
    assert.deepEqual(form.validate().errors, {
      name: 'Fill this in',
      mail: 'Not an email address',
      seats: 'From 1 to 9',
      code: '4 to 8 characters',
      again: 'Does not match',
    });
  });
});
