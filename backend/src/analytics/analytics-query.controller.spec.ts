import { AnalyticsQueryController } from './analytics-query.controller';

describe('AnalyticsQueryController', () => {
  let controller: AnalyticsQueryController;
  const analyticsQueryMock = {
    getOverview: jest.fn(),
    getWordDuelDashboard: jest.fn(),
    getArcadeDashboard: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AnalyticsQueryController(analyticsQueryMock as any);
  });

  it('overview delegates to getOverview', () => {
    controller.overview();
    expect(analyticsQueryMock.getOverview).toHaveBeenCalledWith();
  });

  it('wordDuel delegates to getWordDuelDashboard', () => {
    controller.wordDuel();
    expect(analyticsQueryMock.getWordDuelDashboard).toHaveBeenCalledWith();
  });

  it('arcade delegates to getArcadeDashboard', () => {
    controller.arcade();
    expect(analyticsQueryMock.getArcadeDashboard).toHaveBeenCalledWith();
  });
});
