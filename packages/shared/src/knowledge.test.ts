import { describe, expect, it } from 'vitest';
import {
  articleRequired,
  cleanQuestions,
  folderChain,
  folderSeen,
  folderTree,
  gradeAnswers,
  type KbFolderFacts,
} from './knowledge.js';

const f = (id: string, parentId: string | null, over: Partial<KbFolderFacts> = {}): KbFolderFacts => ({
  id,
  parentId,
  teams: [],
  reqOn: false,
  reqTeams: [],
  ...over,
});
const folders = [f('a', null), f('b', 'a', { teams: ['t1'] }), f('c', 'b'), f('d', null, { reqOn: true })];

describe('who sees a folder', () => {
  it('shows staff everything and everybody the top level', () => {
    expect(folderSeen(folders, 'c', { staff: true, teamId: null })).toBe(true);
    expect(folderSeen(folders, null, { staff: false, teamId: null })).toBe(true);
  });
  it("hides a team's folder, and everything below it, from other teams", () => {
    expect(folderSeen(folders, 'b', { staff: false, teamId: 't2' })).toBe(false);
    expect(folderSeen(folders, 'c', { staff: false, teamId: 't2' })).toBe(false);
    expect(folderSeen(folders, 'c', { staff: false, teamId: null })).toBe(false);
    expect(folderSeen(folders, 'c', { staff: false, teamId: 't1' })).toBe(true);
    expect(folderSeen(folders, 'a', { staff: false, teamId: 't2' })).toBe(true);
  });
  it('stops at a loop in the folders', () => {
    expect(folderChain([f('x', 'y'), f('y', 'x')], 'x')).toHaveLength(2);
  });
});

describe('required reading', () => {
  it('comes from the article or from a folder above it, for the right teams', () => {
    const art = (folderId: string | null, reqOn = false, reqTeams: string[] = []) => ({ folderId, reqOn, reqTeams });
    expect(articleRequired(folders, art('d'), null)).toBe(true);
    expect(articleRequired(folders, art('a'), 't1')).toBe(false);
    expect(articleRequired(folders, art('a', true, ['t1']), 't1')).toBe(true);
    expect(articleRequired(folders, art('a', true, ['t1']), 't2')).toBe(false);
    const set = [f('e', null, { reqOn: true, reqTeams: ['t1'] }), f('g', 'e')];
    expect(articleRequired(set, art('g'), 't1')).toBe(true);
    expect(articleRequired(set, art('g'), 't2')).toBe(false);
  });
  it('finds a folder with everything below it', () => {
    expect([...folderTree(folders, 'a')].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('lesson tests', () => {
  it('keeps the right answer on its option when empty options are dropped, and drops unusable questions', () => {
    const cleaned = cleanQuestions([
      { q: ' One? ', opts: ['', 'x', 'y', ''], a: 2, why: ' because ' },
      { q: 'Two?', opts: ['only'], a: 0, why: '' },
      { q: '', opts: ['a', 'b'], a: 0, why: '' },
      { q: 'Three?', opts: ['a', 'b'], a: 5, why: '' },
    ]);
    expect(cleaned).toEqual([{ q: 'One?', opts: ['x', 'y'], a: 1, why: 'because' }]);
  });
  it('scores the share of right answers', () => {
    const qs = [
      { q: '1', opts: ['a', 'b'], a: 0, why: '' },
      { q: '2', opts: ['a', 'b'], a: 1, why: 'w' },
      { q: '3', opts: ['a', 'b'], a: 1, why: '' },
    ];
    expect(gradeAnswers(qs, [0, 1, 0]).score).toBe(67);
    expect(gradeAnswers(qs, [0, 1, 1]).score).toBe(100);
    expect(gradeAnswers(qs, []).score).toBe(0);
    expect(gradeAnswers([], []).score).toBe(0);
  });
});
