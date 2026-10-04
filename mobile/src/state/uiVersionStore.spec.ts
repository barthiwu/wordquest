import { DEFAULT_UI_VERSION, parseUiVersion } from './uiVersionStore';

describe('uiVersionStore', () => {
  it('defaults to the classic UI so reverting is the safe baseline', () => {
    expect(DEFAULT_UI_VERSION).toBe('classic');
  });
  it('parses only known values', () => {
    expect(parseUiVersion('new')).toBe('new');
    expect(parseUiVersion('classic')).toBe('classic');
    expect(parseUiVersion('beta')).toBeNull();
    expect(parseUiVersion(null)).toBeNull();
  });
});
