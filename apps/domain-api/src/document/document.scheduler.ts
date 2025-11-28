import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis.service';
import { Document } from './document.entity';

@Injectable()
export class DocumentScheduler {
  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
  ) {}

  // 10초마다 실행 (테스트용. 실제로는 EVERY_MINUTE 추천)
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    const keys = await this.redisService.getSnapshotKeys();
    if (keys.length === 0) return;

    console.log(
      `🚌 [Scheduler] ${keys.length}개의 변경사항을 DB로 이관 시작...`,
    );

    for (const key of keys) {
      // 1. Redis에서 데이터 꺼내기
      const content = await this.redisService.getSnapshot(key);
      if (!content) continue;

      // 키에서 ID 추출 (notion:doc:{id}:snapshot)
      const docId = key.split(':')[2];

      // 2. DB에 저장 (Upsert: 있으면 업데이트, 없으면 생성)
      // *주의: 실제로는 서비스 A와 B가 분리되어 있으므로 해당 로직에 맞게 구현
      const existingDoc = await this.docRepo.findOneBy({ id: docId });

      if (existingDoc) {
        existingDoc.content = content;
        await this.docRepo.save(existingDoc);
      } else {
        await this.docRepo.save({ id: docId, content });
      }

      // 3. Redis에서 삭제 (처리 완료)
      await this.redisService.delSnapshot(key);
    }

    console.log(`✅ [Scheduler] DB 저장 완료.`);
  }
}
