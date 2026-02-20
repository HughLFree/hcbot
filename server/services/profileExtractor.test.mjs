import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfile, parseSetProfileInput } from './profileExtractor.mjs';

test('parseSetProfileInput: supports command prefix with spaces and colon', () => {
  const result = parseSetProfileInput('  setprofile: 我叫hehe，住在上海  ');
  assert.equal(result.matched, true);
  assert.equal(result.content, '我叫hehe，住在上海');
});

test('parseSetProfileInput: command is case-insensitive and must be at line start', () => {
  const matched = parseSetProfileInput('SETPROFILE I like coffee');
  assert.equal(matched.matched, true);
  assert.equal(matched.content, 'I like coffee');

  const notMatched = parseSetProfileInput('hello setprofile I like coffee');
  assert.equal(notMatched.matched, false);
  assert.equal(notMatched.content, '');
});

test('mergeProfile: null fields do not override, arrays are merged and de-duplicated', () => {
  const oldProfile = {
    common_name: 'OldName',
    language: '中文',
    location: null,
    identity: '学生',
    likes: ['兔子', '你', 'LIAM'],
    dislikes: ['熬夜'],
  };

  const newProfile = {
    common_name: null,
    language: 'English',
    location: 'Shanghai',
    identity: null,
    likes: ['liam', '兔子', '  ', '@bot', '你@liam', '咖啡'],
    dislikes: ['熬夜', 'Spam', 'spam', 'you'],
  };

  const merged = mergeProfile(oldProfile, newProfile, 'Tester', 1739952000);

  assert.equal(merged.common_name, 'OldName');
  assert.equal(merged.language, 'English');
  assert.equal(merged.location, 'Shanghai');
  assert.equal(merged.identity, '学生');
  assert.deepEqual(merged.likes, ['兔子', 'LIAM', '咖啡']);
  assert.deepEqual(merged.dislikes, ['熬夜', 'Spam']);
  assert.equal(merged.display_name, 'Tester');
  assert.equal(merged.updated_at, 1739952000);
});

