import express from 'express';
import path from 'path';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { TileManager } from './models/TileManager';
import { GameManager } from './models/GameManager';
import { GameSessionManager } from './models/GameSession';
import { GameRecordManager } from './models/GameRecord';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// ゲームセッションマネージャー初期化
const gameSessionManager = GameSessionManager.getInstance();
const gameRecordManager = GameRecordManager.getInstance();

// 静的ファイルの配信
app.use(express.static('public'));
app.use(express.json());

// ルートパス
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// ヘルスチェック用API
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    message: '麻雀ゲームサーバーが動作中です',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    environment: process.env.NODE_ENV || 'development',
    socketConnections: io.engine.clientsCount,
  });
});

// 牌管理システムテスト用API
app.get('/api/tiles/test', (_req, res) => {
  try {
    const tileManager = new TileManager(true);
    const hands = tileManager.dealInitialHands();
    const debugInfo = tileManager.getDebugInfo();

    res.json({
      status: 'OK',
      message: '牌管理システムテスト',
      data: {
        debugInfo,
        sampleHands: hands.map((hand, index) => ({
          playerId: index,
          tileCount: hand.tiles.length,
          tiles: hand.tiles.map(tile => ({
            displayName: tile.displayName,
            unicode: tile.unicode,
            isRed: tile.isRed,
            suit: tile.suit,
            rank: tile.rank,
            honor: tile.honor,
          })),
        })),
        doraInfo: {
          indicators: debugInfo.doraIndicators.map(tile => tile.unicode),
          actualDora: debugInfo.doraTiles.map(tile => tile.unicode),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      message: '牌管理システムエラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 牌の一覧取得API
app.get('/api/tiles/all', (_req, res) => {
  try {
    const tileManager = new TileManager(true);
    const debugInfo = tileManager.getDebugInfo();

    res.json({
      status: 'OK',
      message: '全牌一覧',
      data: {
        totalTiles: debugInfo.totalTiles,
        tilesByType: {
          man: Array.from({ length: 9 }, (_, i) => `${i + 1}m`),
          pin: Array.from({ length: 9 }, (_, i) => `${i + 1}p`),
          sou: Array.from({ length: 9 }, (_, i) => `${i + 1}s`),
          honors: ['東', '南', '西', '北', '白', '發', '中'],
          redDora: ['赤5m', '赤5p', '赤5s'],
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      message: '牌一覧取得エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ゲーム管理システムテスト用API
app.get('/api/game/test', (_req, res) => {
  try {
    const gameManager = new GameManager(
      'test_game_' + Date.now(),
      ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4']
    );

    gameManager.startGame();
    const gameState = gameManager.getGameState();
    const debugInfo = gameManager.getDebugInfo();

    res.json({
      status: 'OK',
      message: 'ゲーム管理システムテスト',
      data: {
        gameId: gameState.id,
        phase: gameState.phase,
        currentPlayer: debugInfo.currentPlayer,
        round: gameState.round,
        debugInfo,
        samplePlayers: gameState.players.map(player => ({
          name: player.name,
          position: player.position,
          handSize: player.hand.tiles.length,
          score: player.score,
          isDealer: player.isDealer,
          status: player.status,
          wind: player.wind,
          sampleTiles: player.hand.tiles.slice(0, 5).map(tile => ({
            displayName: tile.displayName,
            unicode: tile.unicode,
            isRed: tile.isRed,
          })),
        })),
        doraInfo: {
          indicators: gameState.doraIndicators.map(tile => tile.unicode),
          remaining: gameState.remainingTiles,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      message: 'ゲーム管理システムエラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 新しいゲーム作成API
app.post('/api/game/create', (req, res) => {
  try {
    const { playerNames } = req.body;
    const names = playerNames || ['プレイヤー1', 'CPU東', 'CPU南', 'CPU西'];
    
    const game = gameSessionManager.createGame(names);

    return res.json({
      status: 'OK',
      message: '新しいゲームを作成しました',
      data: {
        gameId: game.gameId,
        gameState: game.getGameState(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'ゲーム作成エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ゲーム状態取得API
app.get('/api/game/:gameId', (req, res) => {
  try {
    const { gameId } = req.params;
    const gameState = gameSessionManager.getGameState(gameId);
    
    if (!gameState) {
      return res.status(404).json({
        status: 'Error',
        message: 'ゲームが見つかりません',
      });
    }

    const debugInfo = gameSessionManager.getDebugInfo(gameId);

    return res.json({
      status: 'OK',
      message: 'ゲーム状態取得成功',
      data: {
        gameState,
        debugInfo,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'ゲーム状態取得エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// デバッグモード設定API
app.post('/api/game/:gameId/debug', (req, res) => {
  try {
    const { gameId } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        status: 'Error',
        message: 'enabled フィールドは boolean である必要があります',
      });
    }

    const success = gameSessionManager.setDebugMode(gameId, enabled);
    
    if (!success) {
      return res.status(404).json({
        status: 'Error',
        message: 'ゲームが見つかりません',
      });
    }

    return res.json({
      status: 'OK',
      message: `デバッグモード${enabled ? '有効' : '無効'}にしました`,
      data: { debugMode: enabled },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'デバッグモード設定エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// デバッグ情報専用API
app.get('/api/game/:gameId/debug', (req, res) => {
  try {
    const { gameId } = req.params;
    const game = gameSessionManager.getGame(gameId);
    
    if (!game) {
      return res.status(404).json({
        status: 'Error',
        message: 'ゲームが見つかりません',
      });
    }

    const gameState = game.getGameState();
    const debugInfo = game.getDebugInfo();

    // より詳細なデバッグ情報を追加
    const detailedDebug = {
      gameState,
      debugInfo,
      playerDetails: gameState.players.map((player, index) => ({
        ...player,
        handAnalysis: {
          tileCount: player.hand.tiles.length,
          uniqueTiles: [...new Set(player.hand.tiles.map(t => t.displayName))].length,
          suitDistribution: {
            man: player.hand.tiles.filter(t => t.suit === 'man').length,
            pin: player.hand.tiles.filter(t => t.suit === 'pin').length,
            sou: player.hand.tiles.filter(t => t.suit === 'sou').length,
            honor: player.hand.tiles.filter(t => t.honor).length,
          },
          // 简易的な待ち牌情報（実装予定）
          isReadyHand: player.hand.tiles.length % 3 === 1,
          discardCount: player.hand.discards.length,
        }
      })),
      wallInfo: {
        remainingTiles: gameState.remainingTiles,
        doraCount: gameState.doraIndicators.length,
        totalDrawn: 136 - gameState.remainingTiles - 14, // 王牌14枚
      }
    };

    return res.json({
      status: 'OK',
      message: 'デバッグ情報取得成功',
      data: detailedDebug,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'デバッグ情報取得エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 鳴き機会取得API
app.get('/api/game/:gameId/melds', (req, res) => {
  try {
    const { gameId } = req.params;
    const result = gameSessionManager.getMeldOpportunities(gameId);

    if (!result.success) {
      return res.status(404).json({
        status: 'Error',
        message: result.message,
      });
    }

    return res.json({
      status: 'OK',
      message: '鳴き機会取得成功',
      data: {
        opportunities: result.opportunities,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: '鳴き機会取得エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// AI自動実行API
app.post('/api/game/:gameId/ai', (req, res) => {
  try {
    const { gameId } = req.params;
    const result = gameSessionManager.executeAI(gameId);

    if (!result.success) {
      return res.status(400).json({
        status: 'Error',
        message: result.message,
      });
    }

    return res.json({
      status: 'OK',
      message: result.message,
      data: {
        actions: result.actions,
        gameState: result.gameState,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'AI実行エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 手動ツモAPI
app.post('/api/game/:gameId/draw', (req, res) => {
  try {
    const { gameId } = req.params;
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({
        status: 'Error',
        message: 'プレイヤーIDが必要です',
      });
    }

    const result = gameSessionManager.processManualDraw(gameId, playerId);

    if (!result.success) {
      return res.status(400).json({
        status: 'Error',
        message: result.message,
      });
    }

    return res.json({
      status: 'OK',
      message: result.message,
      data: {
        tile: result.tile,
        gameState: result.gameState,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: '手動ツモエラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// プレイヤーアクション実行API
app.post('/api/game/:gameId/action', (req, res) => {
  try {
    const { gameId } = req.params;
    const action = req.body;

    if (!action.type || !action.playerId) {
      return res.status(400).json({
        status: 'Error',
        message: 'アクションタイプとプレイヤーIDが必要です',
      });
    }

    const result = gameSessionManager.processPlayerAction(gameId, {
      ...action,
      timestamp: Date.now(),
    });

    if (!result.success) {
      return res.status(400).json({
        status: 'Error',
        message: result.message,
      });
    }

    return res.json({
      status: 'OK',
      message: result.message,
      data: {
        actions: result.actions,
        gameState: result.gameState,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'アクション処理エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// アクティブゲーム一覧API
app.get('/api/games', (req, res) => {
  try {
    const sessionsInfo = gameSessionManager.getAllSessionsInfo();

    return res.json({
      status: 'OK',
      message: 'アクティブゲーム一覧',
      data: sessionsInfo,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'ゲーム一覧取得エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Socket.IO接続処理
io.on('connection', socket => {
  console.log(`🔌 クライアント接続: ${socket.id}`);

  // ルーム作成
  socket.on('createRoom', (data) => {
    try {
      const { playerId, playerName, settings } = data;
      
      // 新しいゲームを作成
      const game = gameSessionManager.createGame();
      const gameId = game.gameId;
      
      // ソケットをルームに参加させる
      socket.join(gameId);
      socket.data.playerId = playerId;
      socket.data.playerName = playerName;
      socket.data.roomId = gameId;
      
      // ゲーム状態を送信
      socket.emit('roomCreated', {
        roomId: gameId,
        gameState: game.getGameState()
      });
      
      console.log(`🎮 ルーム作成: ${gameId}, プレイヤー: ${playerName}`);
    } catch (error) {
      socket.emit('roomError', {
        code: 'CREATE_ROOM_ERROR',
        message: 'ルーム作成に失敗しました'
      });
    }
  });

  // ルーム参加
  socket.on('joinRoom', (data) => {
    try {
      const { roomId, playerId, playerName } = data;
      
      // ゲームセッションを取得
      const game = gameSessionManager.getGame(roomId);
      if (!game) {
        socket.emit('roomError', {
          code: 'ROOM_NOT_FOUND',
          message: 'ゲームルームが見つかりません'
        });
        return;
      }
      
      // ソケットをルームに参加させる
      socket.join(roomId);
      socket.data.playerId = playerId;
      socket.data.playerName = playerName;
      socket.data.roomId = roomId;
      
      // 他のプレイヤーに通知
      socket.to(roomId).emit('playerJoined', {
        playerId,
        playerName
      });
      
      // ゲーム状態を送信
      socket.emit('roomJoined', {
        roomId,
        gameState: game.getGameState()
      });
      
      console.log(`🎮 ルーム参加: ${roomId}, プレイヤー: ${playerName}`);
    } catch (error) {
      socket.emit('roomError', {
        code: 'JOIN_ROOM_ERROR',
        message: 'ルーム参加に失敗しました'
      });
    }
  });

  // ルーム離脱
  socket.on('leaveRoom', (data) => {
    try {
      const { roomId, playerId } = data;
      
      socket.leave(roomId);
      
      // 他のプレイヤーに通知
      socket.to(roomId).emit('playerLeft', { playerId });
      
      // ソケットデータをクリア
      socket.data.playerId = undefined;
      socket.data.playerName = undefined;
      socket.data.roomId = undefined;
      
      console.log(`🎮 ルーム離脱: ${roomId}, プレイヤー: ${playerId}`);
    } catch (error) {
      socket.emit('error', {
        code: 'LEAVE_ROOM_ERROR',
        message: 'ルーム離脱に失敗しました'
      });
    }
  });

  // プレイヤーアクション
  socket.on('playerAction', (action) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) {
        socket.emit('error', {
          code: 'NO_ROOM',
          message: 'ルームに参加していません'
        });
        return;
      }

      const game = gameSessionManager.getGame(roomId);
      if (!game) {
        socket.emit('error', {
          code: 'GAME_NOT_FOUND',
          message: 'ゲームが見つかりません'
        });
        return;
      }

      // アクションを実行
      const actions = game.processAction(action);
      
      // ルーム全体にゲーム状態を送信
      io.to(roomId).emit('gameUpdate', game.getGameState());
      
      // アクション結果を送信
      socket.emit('actionResult', {
        success: true,
        message: `${action.type}を実行しました`,
        action: action
      });
      
      // 他のプレイヤーにアクションを通知
      socket.to(roomId).emit('gameAction', {
        type: action.type,
        playerId: action.playerId,
        data: action.data
      });
    } catch (error) {
      socket.emit('error', {
        code: 'ACTION_ERROR',
        message: 'アクション処理に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ゲーム状態要求
  socket.on('requestGameState', () => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) {
        socket.emit('error', {
          code: 'NO_ROOM',
          message: 'ルームに参加していません'
        });
        return;
      }

      const game = gameSessionManager.getGame(roomId);
      if (!game) {
        socket.emit('error', {
          code: 'GAME_NOT_FOUND',
          message: 'ゲームが見つかりません'
        });
        return;
      }

      socket.emit('gameUpdate', game.getGameState());
    } catch (error) {
      socket.emit('error', {
        code: 'STATE_REQUEST_ERROR',
        message: 'ゲーム状態取得に失敗しました'
      });
    }
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log(`🔌 クライアント切断: ${socket.id}`);
    
    // ルームから離脱処理
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    
    if (roomId && playerId) {
      socket.to(roomId).emit('playerLeft', { playerId });
    }
  });

  // テスト用イベント
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });
});

// 統計API
app.get('/api/stats', (req, res) => {
  try {
    const summary = gameRecordManager.getStatsSummary();
    const playerStats = gameRecordManager.getAllPlayerStats();
    const gameRecords = gameRecordManager.getAllGameRecords();

    return res.json({
      status: 'OK',
      message: '統計データ取得成功',
      data: {
        summary,
        playerStats,
        gameRecords: gameRecords.slice(0, 50), // 最新50件
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: '統計データ取得エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// プレイヤー統計API
app.get('/api/stats/player/:playerId', (req, res) => {
  try {
    const { playerId } = req.params;
    const stats = gameRecordManager.getPlayerStats(playerId);

    if (!stats) {
      return res.status(404).json({
        status: 'Error',
        message: 'プレイヤーが見つかりません',
      });
    }

    return res.json({
      status: 'OK',
      message: 'プレイヤー統計取得成功',
      data: stats,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'プレイヤー統計取得エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ゲーム記録API
app.get('/api/stats/game/:gameId', (req, res) => {
  try {
    const { gameId } = req.params;
    const record = gameRecordManager.getGameRecord(gameId);

    if (!record) {
      return res.status(404).json({
        status: 'Error',
        message: 'ゲーム記録が見つかりません',
      });
    }

    return res.json({
      status: 'OK',
      message: 'ゲーム記録取得成功',
      data: record,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: 'ゲーム記録取得エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 統計データクリアAPI（デバッグ用）
app.delete('/api/stats/clear', (req, res) => {
  try {
    gameRecordManager.clearAllData();
    
    return res.json({
      status: 'OK',
      message: '統計データをクリアしました',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'Error',
      message: '統計データクリアエラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ルートパスのリダイレクト
app.get('/', (req, res) => {
  res.redirect('/title.html');
});

// ホームページのリダイレクト（後方互換性）
app.get('/home', (req, res) => {
  res.redirect('/home.html');
});

// 404エラーハンドリング
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'Error',
    message: 'ページが見つかりません',
    path: req.originalUrl,
  });
});

server.listen(PORT, () => {
  console.log(`🀄 麻雀ゲームサーバーがポート ${PORT} で起動しました`);
  console.log(`🌐 http://localhost:${PORT} でアクセスできます`);
  console.log(`📊 ヘルスチェック: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.IO準備完了`);
});