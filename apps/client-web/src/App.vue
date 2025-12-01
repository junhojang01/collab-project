<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

// --- 상수 및 상태 정의 ---
const API_URL = 'http://localhost:3001/document/save';
const DOC_ID = '550e8400-e29b-41d4-a716-446655440000'; // 테스트용 UUID

const status = ref('연결 중...');
const isLeader = ref(false); // 내가 반장인가?
const blocks = ref([]); // 화면 렌더링용 블록 리스트

// Yjs 객체는 Vue의 반응성 시스템(Proxy)에 넣지 않고 일반 변수로 관리하는 게 성능상 좋습니다.
let ydoc = null;
let provider = null;
let yBlocks = null;
let leaderInterval = null;

// --- 초기화 (Mounted) ---
onMounted(() => {
  // 1. Yjs 문서 및 배열 생성
  ydoc = new Y.Doc();
  yBlocks = ydoc.getArray('blocks');

  // 2. WebRTC 연결 (P2P)
  // signaling: ['ws://localhost:3001'] // 직접 만든 시그널링 서버 주소
  provider = new WebrtcProvider('my-vue-collab-room', ydoc, {
    signaling: ['ws://localhost:3000'], // 테스트용 공용 서버
  });

  // 3. 데이터 동기화 리스너: Yjs 데이터가 변하면 -> Vue 상태(blocks) 업데이트
  yBlocks.observeDeep(() => {
    // Yjs 데이터를 일반 JSON 배열로 변환해서 Vue에 할당
    blocks.value = yBlocks.toJSON();
  });

  // 4. 연결 상태 모니터링
  provider.on('status', ({ connected }) => {
    status.value = connected ? '🟢 P2P 연결됨' : '🔴 연결 끊김';
    console.log('🔌 [연결상태]', { connected });
  });

  // 4-1. 피어 연결 모니터링 (디버깅용)
  provider.on('peers', ({ added, removed, webrtcPeers }) => {
    console.log('👥 [피어변화]', {
      added,
      removed,
      totalPeers: webrtcPeers.length,
      awarenessStates: provider.awareness.getStates().size,
    });
  });

  // 5. ★ 리더 선출 및 주기적 저장 로직 (핵심)
  leaderInterval = setInterval(() => {
    const myID = ydoc.clientID;
    
    // awareness.getStates()에서 모든 클라이언트 ID 가져오기
    const allAwarenessClients = Array.from(provider.awareness.getStates().keys());
    
    // 본인 제외한 다른 클라이언트들
    const otherClients = allAwarenessClients.filter(id => id !== myID);
    
    // 전체 클라이언트 (본인 포함)
    const allClients = [myID, ...otherClients];
    
    // 디버깅 로그
    console.log('🔍 [리더선출]', {
      myID,
      allAwarenessClients,  // awareness에 있는 모든 ID (디버깅용)
      otherClients,         // 다른 사람들
      allClients,           // 본인 + 다른 사람들
      minID: allClients.length > 0 ? Math.min(...allClients) : null,
      peers: provider.peers?.size || 0,
    });
    
    // 가장 작은 ID가 반장
    const amILeader = allClients.length > 0 && myID === Math.min(...allClients);
    isLeader.value = amILeader;

    if (amILeader) {
      console.log('👑 [반장] 저장 실행');
      saveSnapshot();
    }
  }, 5000);
});

// --- 정리 (Unmounted) ---
onUnmounted(() => {
  if (leaderInterval) clearInterval(leaderInterval);
  if (provider) provider.destroy();
  if (ydoc) ydoc.destroy();
});

// --- 기능 함수들 ---

// API로 스냅샷 전송 (반장만 실행)
const saveSnapshot = async () => {
  try {
    const update = Y.encodeStateAsUpdate(ydoc);
    // Uint8Array -> Base64 변환
    const content = btoa(String.fromCharCode(...update));

    console.log(`👑 [반장] 변경사항 API 전송 (Size: ${content.length})`);
    
    await axios.post(API_URL, {
      docId: DOC_ID,
      content: content
    });
  } catch (e) {
    console.error('저장 실패:', e);
  }
};

// 블록 추가
const addBlock = () => {
  const newBlock = new Y.Map();
  newBlock.set('id', uuidv4());
  newBlock.set('content', '새로운 블록');
  yBlocks.push([newBlock]); // Y.Array에 추가
};

// 블록 수정
const updateBlock = (index, event) => {
  const newText = event.target.value;
  
  // Vue 상태만 바꾸는 게 아니라 Yjs 원본 데이터를 바꿔야 전파됨
  // 트랜잭션으로 묶으면 오버헤드가 줄어듦
  ydoc.transact(() => {
    const targetBlockMap = yBlocks.get(index);
    targetBlockMap.set('content', newText);
  });
};
</script>

<template>
  <div class="container">
    <h2>Vue 3 + WebRTC 동시 편집기</h2>

    <div class="status-bar" :class="{ leader: isLeader }">
      <span class="status-icon">{{ status }}</span>
      <span v-if="isLeader">👑 당신은 <strong>반장</strong>입니다 (자동 저장 중)</span>
      <span v-else>🐜 당신은 팔로워입니다 (저장 대기)</span>
    </div>

    <div class="editor-area">
      <div v-for="(block, index) in blocks" :key="block.id" class="block-row">
        <span class="block-id">#{{ index + 1 }}</span>
        <input 
          type="text" 
          :value="block.content" 
          @input="(e) => updateBlock(index, e)"
          class="block-input"
        />
      </div>
    </div>

    <button @click="addBlock" class="add-btn">+ 블록 추가</button>
  </div>
</template>

<style scoped>
.container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  font-family: sans-serif;
}

.status-bar {
  padding: 15px;
  margin-bottom: 20px;
  border-radius: 8px;
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  display: flex;
  gap: 10px;
  align-items: center;
}

.status-bar.leader {
  background-color: #e8f5e9; /* 연한 초록색 */
  border-color: #c3e6cb;
  color: #155724;
}

.editor-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.block-id {
  font-size: 0.8rem;
  color: #888;
  width: 30px;
}

.block-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.add-btn {
  margin-top: 20px;
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.add-btn:hover {
  background-color: #0056b3;
}
</style>