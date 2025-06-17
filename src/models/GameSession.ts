import { GameManager } from './GameManager';
import { PlayerAction } from '../../shared/types/Player';
import { GameAction } from '../../shared/types/Game';

// ゲームセッション管理クラス
export class GameSessionManager {
  private static instance: GameSessionManager;
  private activeSessions: Map<string, GameManager> = new Map();

  private constructor() {}

  static getInstance(): GameSessionManager {
    if (!GameSessionManager.instance) {
      GameSessionManager.instance = new GameSessionManager();
    }
    return GameSessionManager.instance;
  }

  // 新しいゲームセッション作成
  createGame(playerNames?: string[], gameId?: string): GameManager {
    const finalGameId = gameId || `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // デフォルトプレイヤー名（マルチプレイヤー用）
    const defaultPlayerNames = playerNames || [
      'プレイヤー1', 'CPU南', 'CPU西', 'CPU北'
    ];
    
    const gameManager = new GameManager(finalGameId, defaultPlayerNames);
    gameManager.startGame();
    
    this.activeSessions.set(finalGameId, gameManager);
    
    console.log(`🎮 新しいゲームセッション作成: ${finalGameId}`);
    return gameManager;
  }

  // ゲームセッション取得
  getGame(gameId: string): GameManager | null {
    return this.activeSessions.get(gameId) || null;
  }

  // プレイヤーアクション処理
  processPlayerAction(gameId: string, action: PlayerAction): {
    success: boolean;
    actions: GameAction[];
    message?: string;
    gameState?: any;
  } {
    const game = this.getGame(gameId);
    if (!game) {
      return {
        success: false,
        actions: [],
        message: `ゲームが見つかりません: ${gameId}`
      };
    }

    try {
      const actions = game.processAction(action);
      const gameState = game.getGameState();
      
      return {
        success: true,
        actions,
        gameState,
        message: `アクション処理成功: ${action.type}`
      };
    } catch (error) {
      return {
        success: false,
        actions: [],
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ゲーム状態取得
  getGameState(gameId: string) {
    const game = this.getGame(gameId);
    if (!game) {
      return null;
    }
    return game.getGameState();
  }

  // デバッグ情報取得
  getDebugInfo(gameId: string) {
    const game = this.getGame(gameId);
    if (!game) {
      return null;
    }
    return game.getDebugInfo();
  }

  // デバッグモード設定
  setDebugMode(gameId: string, enabled: boolean): boolean {
    const game = this.getGame(gameId);
    if (!game) {
      return false;
    }
    game.setDebugMode(enabled);
    return true;
  }

  // 手動ツモ処理
  processManualDraw(gameId: string, playerId: string): {
    success: boolean;
    tile?: any;
    message: string;
    gameState?: any;
  } {
    const game = this.getGame(gameId);
    if (!game) {
      return {
        success: false,
        message: `ゲームが見つかりません: ${gameId}`
      };
    }

    try {
      const result = game.manualDraw(playerId);
      const gameState = game.getGameState();
      
      return {
        ...result,
        gameState
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // 鳴き機会取得
  getMeldOpportunities(gameId: string): {
    success: boolean;
    opportunities?: any[];
    message?: string;
  } {
    const game = this.getGame(gameId);
    if (!game) {
      return {
        success: false,
        message: `ゲームが見つかりません: ${gameId}`
      };
    }

    try {
      const opportunities = game.getMeldOpportunities();
      return {
        success: true,
        opportunities
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // AI自動実行
  executeAI(gameId: string): {
    success: boolean;
    actions?: any[];
    gameState?: any;
    message?: string;
  } {
    const game = this.getGame(gameId);
    if (!game) {
      return {
        success: false,
        message: `ゲームが見つかりません: ${gameId}`
      };
    }

    try {
      const actions = game.executeAIAction();
      const gameState = game.getGameState();
      
      return {
        success: true,
        actions,
        gameState,
        message: actions.length > 0 ? 'AI行動実行' : 'AI行動なし'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // アクティブなゲーム一覧
  getActiveGames(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  // ゲームセッション削除
  removeGame(gameId: string): boolean {
    const removed = this.activeSessions.delete(gameId);
    if (removed) {
      console.log(`🗑️ ゲームセッション削除: ${gameId}`);
    }
    return removed;
  }

  // 全セッション情報
  getAllSessionsInfo() {
    const sessions = Array.from(this.activeSessions.entries()).map(([gameId, game]) => ({
      gameId,
      phase: game.getGameState().phase,
      playerCount: game.getGameState().players.length,
      currentPlayer: game.getDebugInfo().currentPlayer,
      createdAt: game.getGameState().createdAt,
    }));

    return {
      totalSessions: this.activeSessions.size,
      sessions
    };
  }
}