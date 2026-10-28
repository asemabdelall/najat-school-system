import { describe, expect, it } from 'vitest';
import { allowedTransitions, canReviewIncident, canTransition, INCIDENT_STATUSES, isOpenIncident, transitionRequiresNote } from './behavior';

describe('incident lifecycle', () => {
  it('allows only the documented transitions', () => {
    const allowed = new Set(['submitted>under_review', 'submitted>approved', 'submitted>rejected', 'under_review>approved', 'under_review>rejected', 'approved>resolved']);
    for (const from of INCIDENT_STATUSES) for (const to of INCIDENT_STATUSES) {
      expect(canTransition(from, to), `${from}>${to}`).toBe(allowed.has(`${from}>${to}`));
    }
  });
  it('treats rejected and resolved as terminal', () => {
    expect(allowedTransitions('rejected')).toEqual([]);
    expect(allowedTransitions('resolved')).toEqual([]);
  });
  it('cannot skip review straight to resolved', () => {
    expect(canTransition('submitted', 'resolved')).toBe(false);
  });
  it('requires a documented note for decisions', () => {
    expect(transitionRequiresNote('approved')).toBe(true);
    expect(transitionRequiresNote('rejected')).toBe(true);
    expect(transitionRequiresNote('resolved')).toBe(true);
    expect(transitionRequiresNote('under_review')).toBe(false);
  });
  it('identifies open incidents', () => {
    expect(isOpenIncident('submitted')).toBe(true);
    expect(isOpenIncident('under_review')).toBe(true);
    expect(isOpenIncident('approved')).toBe(false);
  });
});

describe('who may review', () => {
  it('blocks self-review and non-managers', () => {
    expect(canReviewIncident({ isManager: true, userId: 'u1', reportedBy: 'u1', status: 'submitted' })).toBe(false);
    expect(canReviewIncident({ isManager: false, userId: 'u1', reportedBy: 'u2', status: 'submitted' })).toBe(false);
    expect(canReviewIncident({ isManager: true, userId: 'u1', reportedBy: 'u2', status: 'submitted' })).toBe(true);
    expect(canReviewIncident({ isManager: true, userId: 'u1', reportedBy: 'u2', status: 'resolved' })).toBe(false);
  });
});
