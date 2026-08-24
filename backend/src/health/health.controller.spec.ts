import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;

  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('reports ok when the database is reachable', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(result.service).toBe('wordquest-backend');
  });

  it('reports degraded when the database check fails', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const result = await controller.check();
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('down');
  });
});
