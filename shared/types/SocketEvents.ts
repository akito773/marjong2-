import { GameState, GameAction, GameSettings } from './Game';
import { PlayerAction } from './Player';

// クライアント → サーバー イベント
export interface ClientToServerEvents {
  // ルーム管理
  joinRoom: (data: { roomId: string; playerId: string; playerName: string }) => void;
  leaveRoom: (data: { roomId: string; playerId: string }) => void;
  createRoom: (data: { playerId: string; playerName: string; settings: GameSettings }) => void;
  
  // ゲームアクション
  playerAction: (action: PlayerAction) => void;
  
  // 状態取得
  requestGameState: () => void;
  
  // 接続テスト
  ping: () => void;
}

// サーバー → クライアント イベント
export interface ServerToClientEvents {
  // ゲーム状態更新
  gameUpdate: (gameState: GameState) => void;
  gameAction: (action: GameAction) => void;
  
  // プレイヤー管理
  playerJoined: (data: { playerId: string; playerName: string }) => void;
  playerLeft: (data: { playerId: string }) => void;
  
  // アクション結果
  actionResult: (result: { 
    success: boolean; 
    message?: string; 
    action?: PlayerAction;
  }) => void;
  
  // ルーム管理
  roomCreated: (data: { roomId: string; gameState: GameState }) => void;
  roomJoined: (data: { roomId: string; gameState: GameState }) => void;
  roomError: (error: { code: string; message: string }) => void;
  
  // エラー
  error: (error: { 
    code: string; 
    message: string; 
    details?: unknown;
  }) => void;
  
  // 接続テスト
  pong: (data: { timestamp: string }) => void;
}

// Socket.IOサーバー間通信用（将来の拡張用）
export interface InterServerEvents {
  ping: () => void;
}

// Socket.IOのデータ型
export interface SocketData {
  playerId?: string;
  playerName?: string;
  roomId?: string;
}

// イベントのペイロード型定義
export interface JoinRoomPayload {
  roomId: string;
  playerId: string;
  playerName: string;
}

export interface CreateRoomPayload {
  playerId: string;
  playerName: string;
  settings: GameSettings;
}

export interface ActionResultPayload {
  success: boolean;
  message?: string;
  action?: PlayerAction;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}