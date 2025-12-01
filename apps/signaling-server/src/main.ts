// apps/signaling-server/src/main.ts
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✨ 표준 WebSocket 어댑터 장착
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
  app.useWebSocketAdapter(new WsAdapter(app));

  // CORS 허용
  app.enableCors();

  await app.listen(3000); // HTTP 포트
  console.log(`🚀 Signaling Server is running`);
}
bootstrap();
