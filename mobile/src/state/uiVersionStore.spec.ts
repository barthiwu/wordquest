import { DEFAULT_UI_VERSION, parseUiVersion } from './uiVersionStore';

describe('uiVersionStore', () => {
  it('defaults to the standard UI', () => {
    expect(DEFAULT_UI_VERSION).toBe('standard');
  });
  it('parses only known values (old v1 values are ignored)', () => {
    expect(parseUiVersion('prototype')).toBe('prototype');
    expect(parseUiVersion('standard')).toBe('standard');
    expect(parseUiVersion('classic')).toBeNull();
    expect(parseUiVersion('new')).toBeNull();
    expect(parseUiVersion(null)).toBeNull();
  });
});
