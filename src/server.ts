import express from 'express';
import path from 'path';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { TileManager } from './models/TileManager';
import { GameManager } from './models/GameManager';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

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

// プレイヤーアクションテスト用API
app.post('/api/game/:gameId/action', (req, res) => {
  try {
    // TODO: 実際のゲーム管理実装
    res.json({
      status: 'OK',
      message: 'プレイヤーアクション処理（未実装）',
      data: {
        action: req.body,
        gameId: req.params.gameId,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      message: 'アクション処理エラー',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Socket.IO接続処理
io.on('connection', socket => {
  console.log(`🔌 クライアント接続: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔌 クライアント切断: ${socket.id}`);
  });

  // テスト用イベント
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });
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