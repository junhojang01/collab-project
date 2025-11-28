import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private client: Redis;

  constructor() {
    // docker-compose의 redis 서비스와 연결
    this.client = new Redis({
      host: 'localhost', // Docker 내부망이면 'redis', 로컬 실행이면 'localhost'
      port: 6379,
    });
  }

  // 데이터 저장 (덮어쓰기)
  async setSnapshot(docId: string, content: string): Promise<void> {
    // 키 형식: service-a:doc:{id}:snapshot
    await this.client.set(`notion:doc:${docId}:snapshot`, content);
  }

  // 저장된 모든 스냅샷 키 조회
  async getSnapshotKeys(): Promise<string[]> {
    return this.client.keys('notion:doc:*:snapshot');
  }

  // 특정 스냅샷 가져오기
  async getSnapshot(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  // 스냅샷 삭제 (DB 저장 후 처리)
  async delSnapshot(key: string): Promise<void> {
    await this.client.del(key);
  }
}
