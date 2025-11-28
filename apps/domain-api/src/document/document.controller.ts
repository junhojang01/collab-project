import { Controller, Post, Body } from '@nestjs/common';
import { RedisService } from '../redis.service';

// DTO 정의
class SaveSnapshotDto {
  docId: string;
  content: string; // Base64 Encoded Uint8Array
}

@Controller('document')
export class DocumentController {
  constructor(private readonly redisService: RedisService) {}

  @Post('save')
  async saveSnapshot(@Body() dto: SaveSnapshotDto) {
    console.log(`⚡ [API] Redis 버퍼 저장 요청: ${dto.docId}`);

    // DB 연결 없이 Redis에만 저장 (매우 빠름)
    await this.redisService.setSnapshot(dto.docId, dto.content);

    return { success: true, message: 'Buffered in Redis' };
  }
}
