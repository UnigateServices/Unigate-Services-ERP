import { Body, Controller, INestApplication, Post, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import request from 'supertest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { validationExceptionFactory } from './validation';

class SampleDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

@Controller('sample')
class SampleController {
  @Post()
  create(@Body() body: SampleDto) {
    return body;
  }
}

describe('validation errors', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SampleController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns VALIDATION_ERROR without the submitted value or a stack', async () => {
    const response = await request(app.getHttpServer()).post('/api/sample').send({ name: 'a', password: 'secret-value' }).expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('secret-value');
    expect(serialized).not.toMatch(/stack|prisma/i);
    expect(serialized).toContain('name');
  });
});
