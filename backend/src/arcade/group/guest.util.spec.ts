import { guestHandleBase, guestHandleCandidate } from './guest.util';
import { USERNAME_REGEX } from '../../users/users.service';

describe('guest handles', () => {
  it('turns a typed name into a valid username base', () => {
    expect(guestHandleBase('Chioma')).toBe('chioma');
    expect(guestHandleBase('  Zoë Ade  ')).toBe('zoe_ade');
    expect(guestHandleBase('Mr. O\'Neil!!')).toBe('mr_oneil');
    expect(guestHandleBase('A very long nickname indeed')).toHaveLength(14);
  });

  it('falls back to "guest" when nothing usable is left', () => {
    expect(guestHandleBase('小明')).toBe('guest');
    expect(guestHandleBase('!!')).toBe('guest');
    expect(guestHandleBase('al')).toBe('guest');
  });

  it('tries the plain name first, then numbered ones, always a valid username', () => {
    const rnd = () => 0.5;
    expect(guestHandleCandidate('chioma', 0, rnd)).toBe('chioma');
    expect(guestHandleCandidate('chioma', 1, rnd)).toBe('chioma_50');
    expect(guestHandleCandidate('chioma', 5, rnd)).toBe('chioma_500');
    expect(guestHandleCandidate('guest', 0, rnd)).toBe('guest_50');
    for (let a = 0; a < 12; a++) {
      expect(USERNAME_REGEX.test(guestHandleCandidate('abcdefghijklmn', a, Math.random))).toBe(true);
    }
  });
});
