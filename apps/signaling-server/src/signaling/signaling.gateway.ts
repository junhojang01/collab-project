/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import * as WebSocket from 'ws';

// 타입 안정성을 위한 WebSocket 타입 별칭
type WSClient = WebSocket.WebSocket;
type WSServer = WebSocket.Server;

// WebSocket 상태 상수
const WS_READY_STATE_OPEN = 1;

/**
 * y-webrtc JSON 메시지 타입 정의
 */
interface SignalingMessage {
  type: 'subscribe' | 'unsubscribe' | 'publish' | 'ping' | 'pong';
  topics?: string[]; // subscribe/unsubscribe용
  topic?: string; // publish용
  data?: unknown; // publish용 페이로드
}

/**
 * 방(room) 정보 관리를 위한 타입
 */
interface RoomInfo {
  roomName: string;
  clients: Set<WSClient>;
}

/**
 * y-webrtc 시그널링 서버
 * - 바이너리 프로토콜 지원
 * - 방(room) 기반 피어 그룹 관리
 * - subscribe/publish/ping/pong 처리
 */
@WebSocketGateway({
  transports: ['websocket'],
})
export class SignalingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('SignalingGateway');
  private readonly rooms = new Map<string, RoomInfo>(); // 방 이름 -> 방 정보
  private readonly clientRooms = new Map<WSClient, Set<string>>(); // 클라이언트 -> 참여 중인 방 목록

  /**
   * WebSocket 서버 초기화
   */
  afterInit(server: unknown): void {
    this.logger.log('✅ y-webrtc Signaling Server initialized');

    // WsAdapter를 통해 전달된 WebSocket Server 타입 단언
    const wsServer = server as WSServer;

    // 바이너리 메시지 핸들러 등록
    wsServer.on('connection', (client: unknown) => {
      const wsClient = client as WSClient;

      wsClient.on('message', (data: unknown) => {
        if (Buffer.isBuffer(data)) {
          this.handleBinaryMessage(wsClient, data);
        }
      });
    });
  }

  /**
   * 클라이언트 연결 시
   */
  handleConnection(client: WSClient): void {
    this.logger.log(`🔗 Client connected`);
    this.clientRooms.set(client, new Set<string>());
  }

  /**
   * 클라이언트 연결 해제 시
   */
  handleDisconnect(client: WSClient): void {
    this.logger.log(`🔌 Client disconnected`);

    // 클라이언트가 참여한 모든 방에서 제거
    const rooms = this.clientRooms.get(client);
    if (rooms) {
      rooms.forEach((roomName) => {
        this.removeClientFromRoom(client, roomName);
      });
      this.clientRooms.delete(client);
    }
  }

  /**
   * JSON 메시지 파싱 및 처리 (y-webrtc 프로토콜)
   */
  private handleBinaryMessage(client: WSClient, data: Buffer): void {
    try {
      if (data.length === 0) {
        this.logger.warn('⚠️ Received empty message');
        return;
      }

      // JSON 파싱
      const messageStr = data.toString('utf-8');
      const message = JSON.parse(messageStr) as SignalingMessage;

      this.logger.debug(`📨 Message: ${message.type}`);

      // 메시지 타입에 따라 처리
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribeJSON(client, message);
          break;

        case 'unsubscribe':
          this.handleUnsubscribeJSON(client, message);
          break;

        case 'publish':
          this.handlePublishJSON(client, message);
          break;

        case 'ping':
          this.handlePingJSON(client, message);
          break;

        default:
          this.logger.warn(`⚠️ Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Error handling message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Subscribe 처리 (JSON 메시지)
   */
  private handleSubscribeJSON(
    client: WSClient,
    message: SignalingMessage,
  ): void {
    const topics = message.topics || [];

    topics.forEach((roomName) => {
      this.logger.log(`📥 SUBSCRIBE: room="${roomName}"`);

      // 방이 없으면 생성
      if (!this.rooms.has(roomName)) {
        this.rooms.set(roomName, {
          roomName,
          clients: new Set<WSClient>(),
        });
      }

      // 방에 클라이언트 추가
      const room = this.rooms.get(roomName);
      if (room) {
        room.clients.add(client);
      }

      // 클라이언트가 참여한 방 목록에 추가
      const clientRoomsSet = this.clientRooms.get(client);
      if (clientRoomsSet) {
        clientRoomsSet.add(roomName);
      }

      this.logger.log(
        `✅ Client joined room "${roomName}" (total: ${room?.clients.size ?? 0})`,
      );
    });
  }

  /**
   * Unsubscribe 처리 (JSON 메시지)
   */
  private handleUnsubscribeJSON(
    client: WSClient,
    message: SignalingMessage,
  ): void {
    const topics = message.topics || [];

    topics.forEach((roomName) => {
      this.logger.log(`📤 UNSUBSCRIBE: room="${roomName}"`);
      this.removeClientFromRoom(client, roomName);
    });
  }

  /**
   * Publish 처리 (JSON 메시지 - 브로드캐스트)
   */
  private handlePublishJSON(client: WSClient, message: SignalingMessage): void {
    const roomName = message.topic;
    if (!roomName) {
      this.logger.warn('⚠️ Publish message without topic');
      return;
    }

    this.logger.debug(`📡 PUBLISH: room="${roomName}"`);

    const room = this.rooms.get(roomName);
    if (!room) {
      this.logger.warn(`⚠️ Room not found: "${roomName}"`);
      return;
    }

    // 같은 방의 다른 클라이언트들에게만 전송 (JSON 형식 유지)
    const forwardMessage = JSON.stringify({
      type: 'publish',
      topic: roomName,
      data: message.data,
    });

    room.clients.forEach((otherClient: WSClient) => {
      // 다른 클라이언트에게만 전송, 연결 상태 확인
      if (
        otherClient !== client &&
        otherClient.readyState === WS_READY_STATE_OPEN
      ) {
        otherClient.send(forwardMessage);
      }
    });
  }

  /**
   * Ping 처리 (JSON 메시지)
   */
  private handlePingJSON(client: WSClient, message: SignalingMessage): void {
    this.logger.debug(`🏓 PING`);

    // Pong 응답 전송 (JSON 형식)
    const pongMessage = JSON.stringify({
      type: 'pong',
      data: message.data,
    });

    if (client.readyState === WS_READY_STATE_OPEN) {
      client.send(pongMessage);
    }
  }

  /**
   * 방에서 클라이언트 제거
   */
  private removeClientFromRoom(client: WSClient, roomName: string): void {
    const room = this.rooms.get(roomName);
    if (room) {
      room.clients.delete(client);

      // 방이 비었으면 삭제
      if (room.clients.size === 0) {
        this.rooms.delete(roomName);
        this.logger.log(`🗑️ Room "${roomName}" deleted (empty)`);
      } else {
        this.logger.log(
          `👋 Client left room "${roomName}" (remaining: ${room.clients.size})`,
        );
      }
    }

    // 클라이언트의 방 목록에서도 제거
    const clientRoomsSet = this.clientRooms.get(client);
    if (clientRoomsSet) {
      clientRoomsSet.delete(roomName);
    }
  }
}
