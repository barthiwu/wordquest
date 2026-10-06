import {
  checkChatMessage,
  hasBlockedLanguage,
  hasContactInfo,
  normalizeChatBody,
} from './duel-chat-filter';

describe('duel chat filter', () => {
  describe('normalizeChatBody', () => {
    it('collapses whitespace and trims', () => {
      expect(normalizeChatBody('  good   luck \n there ')).toBe('good luck there');
    });
    it('strips control and zero-width characters', () => {
      expect(normalizeChatBody('he​llo\u0007')).toBe('hello');
    });
  });

  describe('hasContactInfo', () => {
    it.each([
      'check out www.example.com',
      'https://discord.gg/abc',
      'my site is cool.com',
      'mail me bob@example.com',
      'bob (at) example dot com',
      'add me @coolkid99',
      'call 0803 123 4567',
      '0 8 0 3 1 2 3 4 5 6 7',
    ])('flags %s', (text) => {
      expect(hasContactInfo(text)).toBe(true);
    });

    it.each([
      'good luck!',
      'that was close :)',
      'I got 3 of 5 right',
      'see you in 10 minutes',
      'nice one, e.g. that word',
    ])('allows %s', (text) => {
      expect(hasContactInfo(text)).toBe(false);
    });
  });

  describe('hasBlockedLanguage', () => {
    it.each([
      'you are a bitch',
      'what the fuck',
      'FUCKING hell',
      'sh1t move',
      'f u c k you',
      'f.u.c.k',
      'fuuuuck',
      'kill yourself',
      'go kill urself',
      'kys',
      'you retarded',
    ])('blocks %s', (text) => {
      expect(hasBlockedLanguage(text)).toBe(true);
    });

    it.each([
      'good game',
      'what a classic assist',
      'I am passing the class',
      'a Scunthorpe grape and a cockatoo',
      'nice shot, you tricky devil',
      'that was damn close',
      'such a hell of a duel',
      'my assistant helped',
      'bass guitar',
    ])('allows %s', (text) => {
      expect(hasBlockedLanguage(text)).toBe(false);
    });
  });

  describe('checkChatMessage', () => {
    it('returns the cleaned body for a fine message', () => {
      expect(checkChatMessage('  Good   luck!  ')).toEqual({ ok: true, body: 'Good luck!' });
    });
    it('rejects empty and whitespace-only', () => {
      expect(checkChatMessage('   ')).toEqual({ ok: false, reason: 'EMPTY' });
    });
    it('rejects over-long messages', () => {
      expect(checkChatMessage('a'.repeat(201))).toEqual({ ok: false, reason: 'TOO_LONG' });
      expect(checkChatMessage('a'.repeat(200)).ok).toBe(true);
    });
    it('rejects contact details before language', () => {
      expect(checkChatMessage('text me 08031234567')).toEqual({
        ok: false,
        reason: 'CONTACT_INFO',
      });
    });
    it('rejects bad language', () => {
      expect(checkChatMessage('you suck, bitch')).toEqual({ ok: false, reason: 'LANGUAGE' });
    });
  });
});
