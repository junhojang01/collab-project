
## 시스템 아키텍처
```
flowchart TD
    %% ------------------------------
    %% 1. 클라이언트 영역
    %% ------------------------------
    subgraph Client ["클라이언트 (브라우저)"]
        direction TB
        ClientA["사용자 (서비스 A 접속)"]
        ClientB["사용자 (서비스 B 접속)"]
        
        %% P2P는 자기들끼리 함
        ClientA <-->|WebRTC P2P| ClientA_Peer["서비스 A 동료들"]
        ClientB <-->|WebRTC P2P| ClientB_Peer["서비스 B 동료들"]
    end

    %% ------------------------------
    %% 2. 공통 인프라 (Signaling)
    %% ------------------------------
    subgraph CommonInfra ["공통 인프라"]
        SignalServer["📢 시그널링 서버 (NestJS)<br/>(단순 중계)"]
    end

    %% ------------------------------
    %% 3. 도메인 서비스 (각각 저장)
    %% ------------------------------
    subgraph DomainServices ["도메인 서비스 (저장 API)"]
        direction TB
        
        subgraph ServiceA ["서비스 A (노션)"]
            API_A["API 서버 A"]
            DB_A[("DB A")]
        end

        subgraph ServiceB ["서비스 B (엑셀)"]
            API_B["API 서버 B"]
            DB_B[("DB B")]
        end
    end

    %% ------------------------------
    %% 4. 공유 캐시 (옵션)
    %% ------------------------------
    Redis[("Redis Cluster<br/>(Write-Back 버퍼)")]

    %% ------------------------------
    %% 흐름 연결
    %% ------------------------------
    
    %% 시그널링 연결 (공통)
    ClientA -.-> SignalServer
    ClientB -.-> SignalServer

    %% 저장 연결 (각자도생)
    ClientA -- "POST /api/v1/doc/save" --> API_A
    ClientB -- "POST /api/v1/sheet/save" --> API_B

    %% Redis 버퍼링 및 DB 저장
    API_A -->|Key: service-a:doc:1| Redis
    API_B -->|Key: service-b:sheet:1| Redis
    
    Redis -.->|배치 저장| DB_A
    Redis -.->|배치 저장| DB_B

    %% 스타일링
    style SignalServer fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:black
    style API_A fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:black
    style API_B fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:black
```

## 시퀀스 다이어그램
```
sequenceDiagram
    autonumber
    participant Leader as 클라이언트 (반장)
    participant API as 도메인 API 서버
    participant Redis as Redis (임시 저장소)
    participant Worker as 배치 워커 (Cron)
    participant DB as 영구 DB

    Note over Leader, Leader: WebRTC로 동기화된<br/>최신 상태(Snapshot) 생성

    Leader->>API: POST /save (스냅샷 전송)
    
    rect rgb(255, 240, 240)
        Note right of API: DB로 바로 안 가고<br/>Redis에만 저장 (속도 ↑)
        API->>Redis: SET doc:100 <binary data>
        Redis-->>API: OK
    end
    
    API-->>Leader: 200 OK (저장 완료)

    Note over Worker, DB: 사용자와 상관없이<br/>백그라운드에서 주기적 실행

    loop 매 1분마다
        Worker->>Redis: KEYS doc:* (수정된 문서 찾기)
        Worker->>Redis: GET doc:100
        Worker->>DB: UPDATE documents SET content=...
        Worker->>Redis: DEL doc:100 (처리 완료 시 삭제)
    end
```