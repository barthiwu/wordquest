jest.mock('@/state/themeStore', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#123456' }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// react-test-renderer ships no types in this project; the spec only needs a
// tiny slice of its API.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { act, create } = require('react-test-renderer') as {
  act: (fn: () => void) => void;
  create: (el: JSX.Element) => { root: any; toJSON: () => unknown };
};
type ReactTestInstance = any;
import { ArcadeModeSheet } from './ArcadeModeSheet';

function render(el: JSX.Element) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(el);
  });
  return tree;
}
function press(root: ReactTestInstance, label: string) {
  const node = root.findAll(
    (n: ReactTestInstance) =>
      n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  )[0];
  act(() => node.props.onPress());
}
function has(root: ReactTestInstance, label: string) {
  return root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === label).length > 0;
}

describe('ArcadeModeSheet', () => {
  const handlers = () => ({
    onClose: jest.fn(),
    onSingle: jest.fn(),
    onRandom: jest.fn(),
    onFriend: jest.fn(),
    onGroup: jest.fn(),
  });

  it('renders nothing until a game is chosen', () => {
    const tree = render(<ArcadeModeSheet game={null} {...handlers()} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('offers single player, multiplayer or group play first', () => {
    const h = handlers();
    const tree = render(<ArcadeModeSheet game="HANGMAN" {...h} />);
    expect(has(tree.root, 'arcade:versus.single')).toBe(true);
    expect(has(tree.root, 'arcade:versus.multi')).toBe(true);
    expect(has(tree.root, 'arcade:versus.group')).toBe(true);
    expect(has(tree.root, 'arcade:versus.random')).toBe(false);

    press(tree.root, 'arcade:versus.single');
    expect(h.onSingle).toHaveBeenCalledWith('HANGMAN');
  });

  it('group play goes straight to the group hub for that game', () => {
    const h = handlers();
    const tree = render(<ArcadeModeSheet game="SCRAMBLE_QUEST" {...h} />);
    press(tree.root, 'arcade:versus.group');
    expect(h.onGroup).toHaveBeenCalledWith('SCRAMBLE_QUEST');
  });

  it('multiplayer opens the random / friend choice', () => {
    const h = handlers();
    const tree = render(<ArcadeModeSheet game="COMPLETE_IT" {...h} />);
    press(tree.root, 'arcade:versus.multi');
    expect(has(tree.root, 'arcade:versus.random')).toBe(true);
    expect(has(tree.root, 'arcade:versus.friend')).toBe(true);

    press(tree.root, 'arcade:versus.random');
    expect(h.onRandom).toHaveBeenCalledWith('COMPLETE_IT');
    press(tree.root, 'arcade:versus.friend');
    expect(h.onFriend).toHaveBeenCalledWith('COMPLETE_IT');
  });

  it('back returns to the first choice', () => {
    const tree = render(<ArcadeModeSheet game="SCRAMBLE_QUEST" {...handlers()} />);
    press(tree.root, 'arcade:versus.multi');
    press(tree.root, 'arcade:versus.back');
    expect(has(tree.root, 'arcade:versus.single')).toBe(true);
  });
});
