jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, string>) => (o ? `${k}:${JSON.stringify(o)}` : k),
  }),
}));
const iconCalls: string[] = [];
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: { name: string }) => {
    iconCalls.push(props.name);
    return null;
  },
}));

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { act, create } = require('react-test-renderer') as {
  act: (fn: () => void) => void;
  create: (el: JSX.Element) => { root: any };
};
import { AnswerReview } from './AnswerReview';

const colors = new Proxy({}, { get: () => '#123456' }) as never;

function texts(root: any): string[] {
  return root
    .findAll((n: any) => n.type === 'Text')
    .map((n: any) => [].concat(n.props.children).join(''));
}
function render(el: JSX.Element) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(el);
  });
  return tree;
}

describe('AnswerReview', () => {
  beforeEach(() => {
    iconCalls.length = 0;
  });

  it('shows a right answer with a green check and nothing else', () => {
    const { root } = render(
      <AnswerReview colors={colors} submitted="train" correct="train" isCorrect />,
    );
    expect(iconCalls).toEqual(['checkmark-circle']);
    expect(texts(root)).toContain('train');
    expect(texts(root)).not.toContain('answerReview.correctAnswer');
  });

  it('shows what was written with a red cross, then the actual answer', () => {
    const { root } = render(
      <AnswerReview colors={colors} submitted="tarin" correct="train" isCorrect={false} />,
    );
    expect(iconCalls).toEqual(['close-circle', 'arrow-forward-circle']);
    const t = texts(root);
    expect(t.indexOf('tarin')).toBeGreaterThan(-1);
    expect(t.indexOf('train')).toBeGreaterThan(t.indexOf('tarin'));
  });

  it('says so when nothing was written before the clock ran out', () => {
    const { root } = render(
      <AnswerReview colors={colors} submitted="" correct="train" isCorrect={false} timedOut />,
    );
    expect(texts(root)).toContain('answerReview.noAnswer');
    expect(texts(root)).toContain('answerReview.timeUpCorrect');
  });

  it('spells out the letters tried in Hangman', () => {
    const { root } = render(
      <AnswerReview colors={colors} letters submitted="cat" correct="cat" isCorrect />,
    );
    expect(texts(root)).toContain('C A T');
    expect(texts(root)).toContain('answerReview.yourLetters');
  });
});
