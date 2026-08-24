import { AliController } from './ali.controller';

describe('AliController', () => {
  let controller: AliController;

  const aliMock = {
    getMyMessages: jest.fn(),
    explainMistake: jest.fn(),
    suggestVocabularyAlternatives: jest.fn(),
    reviewWriting: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Direct instantiation, not Test.createTestingModule — same reason
    // as SkillsController/PassportController's specs: @UseGuards(JwtAuthGuard)
    // would pull in JwtAuthGuard's own DI chain for no reason here.
    controller = new AliController(aliMock as any);
  });

  it('getMyMessages delegates to the service with the parsed limit', () => {
    controller.getMyMessages('u1', '5');
    expect(aliMock.getMyMessages).toHaveBeenCalledWith('u1', 5);
  });

  it('explainMistake delegates the DTO straight through', () => {
    const dto = {
      word: 'resilient',
      playerAnswer: 'resiliant',
      correctAnswer: 'resilient',
      stage: 'GUESS' as const,
    };
    controller.explainMistake('u1', dto);
    expect(aliMock.explainMistake).toHaveBeenCalledWith('u1', dto);
  });

  it('suggestVocabularyAlternatives delegates the DTO straight through', () => {
    const dto = { word: 'resilient' };
    controller.suggestVocabularyAlternatives('u1', dto);
    expect(aliMock.suggestVocabularyAlternatives).toHaveBeenCalledWith('u1', dto);
  });

  it('reviewWriting delegates the DTO straight through', () => {
    const dto = { text: 'The cat sit on the mat.' };
    controller.reviewWriting('u1', dto);
    expect(aliMock.reviewWriting).toHaveBeenCalledWith('u1', dto);
  });
});
