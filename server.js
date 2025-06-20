const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// 静的ファイルの配信
app.use(express.static('public'));
app.use(express.json());

// ルートパス
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ヘルスチェック用API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: '麻雀ゲームサーバーが動作中です',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// CPU自動対戦API
app.post('/api/game/:gameId/cpu-auto', (req, res) => {
  const gameId = req.params.gameId;
  const { enabled, speed } = req.body;
  
  if (!games.has(gameId)) {
    return res.status(404).json({
      status: 'Error',
      message: 'ゲームが見つかりません'
    });
  }
  
  const gameState = games.get(gameId);
  gameState.cpuAutoMode = enabled;
  gameState.cpuAutoSpeed = speed || 1000;
  
  games.set(gameId, gameState);
  
  if (enabled) {
    startCpuAutoGame(gameId);
  }
  
  res.json({
    status: 'OK',
    message: enabled ? 'CPU自動対戦を開始しました' : 'CPU自動対戦を停止しました',
    gameId,
    enabled,
    speed
  });
});

// 404エラーハンドリング
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'Error',
    message: 'ページが見つかりません',
    path: req.originalUrl
  });
});

// ゲーム状態管理
const games = new Map();

// 麻雀牌データ
function createTiles() {
  const tiles = [];
  let id = 0;
  
  // 萬子・筒子・索子（各1-9を4枚ずつ）
  ['man', 'pin', 'sou'].forEach(suit => {
    for (let rank = 1; rank <= 9; rank++) {
      for (let i = 0; i < 4; i++) {
        tiles.push({
          id: id++,
          suit: suit,
          rank: rank,
          unicode: getSuitUnicode(suit, rank),
          displayName: `${suit}${rank}`,
          isRed: false
        });
      }
    }
  });
  
  // 字牌（各4枚ずつ）
  ['east', 'south', 'west', 'north', 'white', 'green', 'red'].forEach(honor => {
    for (let i = 0; i < 4; i++) {
      tiles.push({
        id: id++,
        honor: honor,
        unicode: getHonorUnicode(honor),
        displayName: getHonorName(honor),
        isRed: false
      });
    }
  });
  
  return tiles;
}

function getSuitUnicode(suit, rank) {
  const unicodes = {
    man: ['🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏'],
    pin: ['🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡'],
    sou: ['🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘']
  };
  return unicodes[suit][rank - 1];
}

function getHonorUnicode(honor) {
  const unicodes = {
    east: '🀀', south: '🀁', west: '🀂', north: '🀃',
    white: '🀆', green: '🀅', red: '🀄'
  };
  return unicodes[honor];
}

function getHonorName(honor) {
  const names = {
    east: '東', south: '南', west: '西', north: '北',
    white: '白', green: '發', red: '中'
  };
  return names[honor];
}

// 初期ゲーム状態作成
function createGameState(gameId) {
  const tiles = createTiles();
  
  // シャッフル
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  
  // プレイヤー作成
  const players = [];
  const playerNames = ['プレイヤー1', 'CPU南', 'CPU西', 'CPU北'];
  const playerTypes = ['human', 'cpu', 'cpu', 'cpu'];
  
  for (let i = 0; i < 4; i++) {
    // 親（プレイヤー0）は14枚、他は13枚で開始
    const tileCount = i === 0 ? 14 : 13;
    console.log(`🔍 [DEBUG] プレイヤー${i}に${tileCount}枚配牌 (${i === 0 ? '親' : '子'})`);
    
    players.push({
      id: i,
      name: playerNames[i],
      type: playerTypes[i],
      wind: ['east', 'south', 'west', 'north'][i],
      score: 25000,
      hand: {
        tiles: tiles.splice(0, tileCount),
        discards: [],
        melds: [],
        riichi: false
      }
    });
  }
  
  return {
    gameId: gameId,
    players: players,
    currentPlayer: 0,
    remainingTiles: tiles.length,
    wallTiles: tiles,
    round: 1,
    dealer: 0,
    dora: tiles[0] || null
  };
}

// Socket.IO接続処理
io.on('connection', (socket) => {
  console.log('🔌 クライアントが接続しました:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('❌ クライアントが切断しました:', socket.id);
  });
  
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  // ゲーム作成
  socket.on('createRoom', (data) => {
    const gameId = 'game_' + Date.now();
    const gameState = createGameState(gameId);
    games.set(gameId, gameState);
    
    socket.join(gameId);
    socket.gameId = gameId;
    
    console.log(`🎮 新しいゲームを作成: ${gameId}`);
    socket.emit('gameCreated', { gameId: gameId });
    socket.emit('gameState', gameState);
  });
  
  // ゲーム状態要求
  socket.on('requestGameState', () => {
    if (socket.gameId && games.has(socket.gameId)) {
      const gameState = games.get(socket.gameId);
      socket.emit('gameState', gameState);
    }
  });
  
  // 牌を引く
  socket.on('drawTile', () => {
    if (socket.gameId && games.has(socket.gameId)) {
      const gameState = games.get(socket.gameId);
      if (gameState.wallTiles.length > 0) {
        const drawnTile = gameState.wallTiles.pop();
        gameState.players[gameState.currentPlayer].hand.tiles.push(drawnTile);
        gameState.remainingTiles = gameState.wallTiles.length;
        
        games.set(socket.gameId, gameState);
        io.to(socket.gameId).emit('gameState', gameState);
        
        console.log(`🎯 プレイヤー${gameState.currentPlayer}が牌を引きました: ${drawnTile.displayName || drawnTile.unicode}`);
      }
    }
  });
  
  // プレイヤーアクション（統一ハンドラー）
  socket.on('playerAction', (data) => {
    console.log(`🔍 [DEBUG] playerAction received:`, data);
    console.log(`🔍 [DEBUG] socket.gameId:`, socket.gameId);
    console.log(`🔍 [DEBUG] games.has(socket.gameId):`, games.has(socket.gameId));
    
    if (!socket.gameId || !games.has(socket.gameId)) {
      console.log(`❌ [ERROR] ゲームが見つかりません: gameId=${socket.gameId}`);
      socket.emit('error', { message: 'ゲームが見つかりません' });
      return;
    }
    
    const gameState = games.get(socket.gameId);
    console.log(`🔍 [DEBUG] gameState found, processing action: ${data.type}`);
    
    switch (data.type) {
      case 'discard':
        console.log(`🔍 [DEBUG] Handling discard action`);
        handleDiscard(socket, gameState, data);
        break;
      case 'draw':
        console.log(`🔍 [DEBUG] Handling draw action`);
        handleDraw(socket, gameState, data);
        break;
      default:
        console.log(`❌ [ERROR] 未知のアクション: ${data.type}`);
    }
  });
  
  // 牌を捨てる（従来の互換性のため）
  socket.on('discardTile', (data) => {
    handleDiscard(socket, games.get(socket.gameId), { tileId: data.tileId });
  });
});

// アクションハンドラー関数
function handleDiscard(socket, gameState, data) {
  console.log(`🔍 [DEBUG] handleDiscard called`);
  console.log(`🔍 [DEBUG] currentPlayer: ${gameState.currentPlayer}`);
  console.log(`🔍 [DEBUG] data:`, data);
  
  const player = gameState.players[gameState.currentPlayer];
  console.log(`🔍 [DEBUG] player tiles count: ${player.hand.tiles.length}`);
  
  const tileIndex = player.hand.tiles.findIndex(t => t.id === data.tileId);
  console.log(`🔍 [DEBUG] tileIndex: ${tileIndex}`);
  
  if (tileIndex !== -1) {
    const discardedTile = player.hand.tiles.splice(tileIndex, 1)[0];
    player.hand.discards.push(discardedTile);
    
    console.log(`🗑️ プレイヤー${gameState.currentPlayer}が牌を捨てました: ${discardedTile.displayName || discardedTile.unicode}`);
    console.log(`🔍 [DEBUG] 捨て牌後の手牌数: ${player.hand.tiles.length}`);
    
    // 次のプレイヤーへ
    const oldPlayer = gameState.currentPlayer;
    gameState.currentPlayer = (gameState.currentPlayer + 1) % 4;
    console.log(`🔄 [DEBUG] プレイヤー変更: ${oldPlayer} → ${gameState.currentPlayer}`);
    console.log(`🔍 [DEBUG] 次のプレイヤータイプ: ${gameState.players[gameState.currentPlayer].type}`);
    
    games.set(socket.gameId, gameState);
    io.to(socket.gameId).emit('gameState', gameState);
  } else {
    console.log(`❌ [ERROR] 指定された牌が見つかりません: ${data.tileId}`);
  }
}

function handleDraw(socket, gameState, data) {
  if (gameState.wallTiles.length > 0) {
    const drawnTile = gameState.wallTiles.pop();
    gameState.players[gameState.currentPlayer].hand.tiles.push(drawnTile);
    gameState.remainingTiles = gameState.wallTiles.length;
    
    games.set(socket.gameId, gameState);
    io.to(socket.gameId).emit('gameState', gameState);
    
    console.log(`🎯 プレイヤー${gameState.currentPlayer}が牌を引きました: ${drawnTile.displayName || drawnTile.unicode}`);
  }
}

// CPU自動対戦実行
function startCpuAutoGame(gameId) {
  console.log(`🤖 [DEBUG] startCpuAutoGame called for gameId: ${gameId}`);
  const gameState = games.get(gameId);
  if (!gameState || !gameState.cpuAutoMode) {
    console.log(`🤖 [DEBUG] ゲーム状態またはCPU自動モードが無効: gameState=${!!gameState}, cpuAutoMode=${gameState?.cpuAutoMode}`);
    return;
  }
  
  const cpuTurn = () => {
    console.log(`🤖 [DEBUG] cpuTurn called`);
    
    if (!games.has(gameId)) {
      console.log(`🤖 [DEBUG] ゲームが存在しません: ${gameId}`);
      return;
    }
    
    const currentState = games.get(gameId);
    if (!currentState.cpuAutoMode) {
      console.log(`🤖 [DEBUG] CPU自動モードが停止されました`);
      return;
    }
    
    console.log(`🤖 [DEBUG] currentPlayer: ${currentState.currentPlayer}`);
    const currentPlayer = currentState.players[currentState.currentPlayer];
    console.log(`🤖 [DEBUG] currentPlayer type: ${currentPlayer.type}`);
    console.log(`🤖 [DEBUG] currentPlayer name: ${currentPlayer.name}`);
    console.log(`🤖 [DEBUG] currentPlayer tiles count: ${currentPlayer.hand.tiles.length}`);
    
    // プレイヤータイプに関係なく、手牌が13枚の場合は自動ツモ
    if (currentPlayer.hand.tiles.length === 13) {
      console.log(`🎯 [DEBUG] プレイヤー${currentState.currentPlayer}(${currentPlayer.type})が自動ツモを実行（現在${currentPlayer.hand.tiles.length}枚）`);
      if (currentState.wallTiles.length > 0) {
        const drawnTile = currentState.wallTiles.pop();
        currentPlayer.hand.tiles.push(drawnTile);
        currentState.remainingTiles = currentState.wallTiles.length;
        console.log(`🎯 プレイヤー${currentState.currentPlayer}がツモ: ${drawnTile.displayName || drawnTile.unicode} (手牌${currentPlayer.hand.tiles.length}枚)`);
        
        games.set(gameId, currentState);
        io.to(gameId).emit('gameState', currentState);
      } else {
        console.log(`🤖 [WARNING] 山牌が空です`);
      }
    }
    
    // CPUプレイヤーの場合のみ自動捨て牌
    if (currentPlayer.type === 'cpu') {
      console.log(`🤖 [DEBUG] CPUプレイヤーのターンを実行`);
      
      // 手牌が14枚の場合は捨て牌
      if (currentPlayer.hand.tiles.length === 14) {
        console.log(`🤖 [DEBUG] CPUが捨て牌を実行（現在${currentPlayer.hand.tiles.length}枚）`);
        const randomIndex = Math.floor(Math.random() * currentPlayer.hand.tiles.length);
        const tileToDiscard = currentPlayer.hand.tiles[randomIndex];
        
        // 牌を捨てる
        handleDiscard({ gameId }, currentState, { tileId: tileToDiscard.id });
      } else if (currentPlayer.hand.tiles.length < 13) {
        console.log(`🤖 [ERROR] CPUの手牌数が異常: ${currentPlayer.hand.tiles.length}枚`);
      }
    } else {
      console.log(`👤 [DEBUG] 人間プレイヤーのターン（手牌${currentPlayer.hand.tiles.length}枚）- 捨て牌待ち`);
    }
    
    // 次のターンをスケジュール
    setTimeout(cpuTurn, currentState.cpuAutoSpeed || 1000);
  };
  
  console.log(`🤖 [DEBUG] 最初のCPUターンをスケジュール（${gameState.cpuAutoSpeed || 1000}ms後）`);
  setTimeout(cpuTurn, gameState.cpuAutoSpeed || 1000);
}

server.listen(PORT, () => {
  console.log(`🀄 麻雀ゲームサーバーがポート ${PORT} で起動しました`);
  console.log(`🌐 http://localhost:${PORT} でアクセスできます`);
  console.log(`📊 ヘルスチェック: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.IO接続待機中...`);
});