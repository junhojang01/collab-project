import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentController } from './document/document.controller';
import { DocumentScheduler } from './document/document.scheduler';
import { Document } from './document/document.entity';
import { RedisService } from './redis.service';

@Module({
  imports: [
    // 스케줄러 활성화
    ScheduleModule.forRoot(),
    // DB 연결 설정 (Docker 정보)
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'admin',
      password: 'root!',
      database: 'collab_db',
      entities: [Document],
      synchronize: true, // 개발용: 테이블 자동 생성
    }),
    TypeOrmModule.forFeature([Document]),
  ],
  controllers: [DocumentController],
  providers: [RedisService, DocumentScheduler],
})
export class AppModule {}
