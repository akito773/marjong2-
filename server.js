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

// プレイヤーオートツモ切りAPI
app.post('/api/game/:gameId/player-auto', (req, res) => {
  const gameId = req.params.gameId;
  const { enabled } = req.body;
  
  if (!games.has(gameId)) {
    return res.status(404).json({
      status: 'Error',
      message: 'ゲームが見つかりません'
    });
  }
  
  const gameState = games.get(gameId);
  gameState.playerAutoTsumoKiri = enabled;
  
  games.set(gameId, gameState);
  
  res.json({
    status: 'OK',
    message: enabled ? 'プレイヤーオートツモ切りを有効にしました' : 'プレイヤーオートツモ切りを無効にしました',
    gameId,
    enabled
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

// 手牌ソート関数
function sortHand(tiles) {
  if (!tiles || tiles.length === 0) return tiles;
  
  return tiles.sort((a, b) => {
    // 1. 萬子・筒子・索子・字牌の順序
    const suitOrder = { 'man': 1, 'pin': 2, 'sou': 3, 'ji': 4 };
    
    // 字牌の場合
    if (a.honor && b.honor) {
      const honorOrder = { 'east': 1, 'south': 2, 'west': 3, 'north': 4, 'white': 5, 'green': 6, 'red': 7 };
      return honorOrder[a.honor] - honorOrder[b.honor];
    }
    
    // 一方が字牌、一方が数牌の場合
    if (a.honor && !b.honor) return 1;
    if (!a.honor && b.honor) return -1;
    
    // 両方数牌の場合
    if (a.suit !== b.suit) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    
    // 同じスートの場合は数字順
    return a.rank - b.rank;
  });
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
  const now = new Date();
  const timestamp = now.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  logWithTime(`🎮 [GAME START] 新しいゲーム開始: ${gameId}`);
  logWithTime(`📅 [GAME START] 開始日時: ${timestamp}`);
  
  const tiles = createTiles();
  
  // シャッフル
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  
  logWithTime(`🀄 [GAME START] 牌をシャッフルしました (${tiles.length}枚)`);
  
  // プレイヤー作成
  const players = [];
  const playerNames = ['プレイヤー1', 'CPU南', 'CPU西', 'CPU北'];
  const playerTypes = ['human', 'cpu', 'cpu', 'cpu'];
  
  for (let i = 0; i < 4; i++) {
    // 親（プレイヤー0）は14枚、他は13枚で開始
    const tileCount = i === 0 ? 14 : 13;
    logWithTime(`👤 [HAIPAI] プレイヤー${i}(${playerNames[i]})に${tileCount}枚配牌 (${i === 0 ? '親' : '子'})`);
    
    const handTiles = tiles.splice(0, tileCount);
    const sortedTiles = sortHand(handTiles);
    
    logWithTime(`🀄 [HAIPAI] プレイヤー${i}の配牌: ${sortedTiles.map(t => t.displayName || t.unicode).join(' ')}`);
    
    players.push({
      id: i,
      name: playerNames[i],
      type: playerTypes[i],
      wind: ['east', 'south', 'west', 'north'][i],
      score: 25000,
      hand: {
        tiles: sortedTiles,
        discards: [],
        melds: [],
        riichi: false
      }
    });
  }
  
  logWithTime(`🎯 [GAME START] 残り牌数: ${tiles.length}枚`);
  logWithTime(`🎲 [GAME START] ドラ表示牌: ${tiles[0]?.displayName || tiles[0]?.unicode || 'なし'}`);
  
  return {
    gameId: gameId,
    players: players,
    currentPlayer: 0,
    remainingTiles: tiles.length,
    wallTiles: tiles,
    round: 1,
    dealer: 0,
    dora: tiles[0] || null,
    playerAutoTsumoKiri: false, // プレイヤーのオートツモ切り設定
    lastDiscard: null, // 最後の捨て牌
    lastDiscardPlayer: null, // 最後に捨て牌したプレイヤー
    phase: 'playing' // ゲーム状態
  };
}

// タイムスタンプ付きログ関数
const fs = require('fs');

function logWithTime(message) {
  const now = new Date();
  const timestamp = now.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  // ファイルにも出力
  try {
    fs.appendFileSync('game.log', logMessage + '\n');
  } catch (err) {
    console.error('ログファイル書き込みエラー:', err);
  }
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
        // 手牌をソート
        gameState.players[gameState.currentPlayer].hand.tiles = sortHand(gameState.players[gameState.currentPlayer].hand.tiles);
        gameState.remainingTiles = gameState.wallTiles.length;
        
        games.set(socket.gameId, gameState);
        io.to(socket.gameId).emit('gameState', gameState);
        
        console.log(`🎯 プレイヤー${gameState.currentPlayer}が牌を引きました: ${drawnTile.displayName || drawnTile.unicode}`);
      }
    }
  });

  // メルド処理（チー・ポン・カン）
  socket.on('meld', (data) => {
    logWithTime('🀄 [MELD] メルド要求: ' + JSON.stringify(data));
    if (socket.gameId && games.has(socket.gameId)) {
      const gameState = games.get(socket.gameId);
      handleMeld(socket, gameState, data);
    }
  });
  
  // プレイヤーアクション（統一ハンドラー）
  socket.on('playerAction', (data) => {
    console.log(`🚨 PLAYERACTION RECEIVED!!! Type: ${data.type}`);
    fs.appendFileSync('debug.log', `🚨 PLAYERACTION RECEIVED!!! Type: ${data.type}\n`);
    logWithTime(`🎯 [PLAYER ACTION] 受信: ${data.type}`);
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
      case 'chi':
      case 'pon':
      case 'kan':
      case 'ankan':
        logWithTime(`🔍 [PLAYER ACTION] メルドアクション: ${data.type}`);
        handleMeld(socket, gameState, data);
        break;
      case 'tsumo':
        logWithTime(`🎯 [PLAYER ACTION] ツモ和了: ${data.playerId}`);
        handleTsumo(socket, gameState, data);
        break;
      case 'ron':
        logWithTime(`🎯 [PLAYER ACTION] ロン和了: ${data.playerId}`);
        handleRon(socket, gameState, data);
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
  logWithTime(`🔥 [DISCARD] handleDiscard関数が呼ばれました！`);
  console.log(`🔍 [DEBUG] handleDiscard called`);
  console.log(`🔍 [DEBUG] currentPlayer: ${gameState.currentPlayer}`);
  console.log(`🔍 [DEBUG] data:`, data);
  
  const player = gameState.players[gameState.currentPlayer];
  console.log(`🔍 [DEBUG] player tiles count: ${player.hand.tiles.length}`);
  
  const tileIndex = player.hand.tiles.findIndex(t => t.id === data.tileId);
  console.log(`🔍 [DEBUG] tileIndex: ${tileIndex}`);
  
  if (tileIndex !== -1) {
    const discardedTile = player.hand.tiles.splice(tileIndex, 1)[0];
    
    // タイムスタンプを追加
    discardedTile.timestamp = Date.now();
    player.hand.discards.push(discardedTile);
    
    // gameState.lastDiscardを設定
    gameState.lastDiscard = discardedTile;
    gameState.lastDiscardPlayer = gameState.currentPlayer;
    
    console.log(`🗑️ プレイヤー${gameState.currentPlayer}が牌を捨てました: ${discardedTile.displayName || discardedTile.unicode}`);
    console.log(`🔍 [DEBUG] 捨て牌後の手牌数: ${player.hand.tiles.length}`);
    console.log(`🔍 [DEBUG] lastDiscard設定: ${discardedTile.displayName}, lastDiscardPlayer: ${gameState.lastDiscardPlayer}`);
    
    // 他のプレイヤーのメルド可能性をチェック
    checkMeldOpportunities(socket, gameState, discardedTile, gameState.currentPlayer);
    
    // 次のプレイヤーへ
    const oldPlayer = gameState.currentPlayer;
    gameState.currentPlayer = (gameState.currentPlayer + 1) % 4;
    console.log(`🔄 [DEBUG] プレイヤー変更: ${oldPlayer} → ${gameState.currentPlayer}`);
    console.log(`🔍 [DEBUG] 次のプレイヤータイプ: ${gameState.players[gameState.currentPlayer].type}`);
    
    // メルド後の捨て牌の場合、CPU自動モードを再開
    if (gameState.phase === 'discard') {
      gameState.phase = 'playing';
      gameState.cpuAutoMode = true;
      logWithTime(`🔄 [TURN] メルド後の捨て牌完了 - CPU自動モード再開`);
      
      // CPU自動対戦を即座に再開
      setTimeout(() => {
        logWithTime(`🤖 [AUTO RESTART] CPU自動対戦を再開します`);
        startCpuAutoGame(socket.gameId);
      }, 1000);
    }
    
    games.set(socket.gameId, gameState);
    io.to(socket.gameId).emit('gameState', gameState);
  } else {
    console.log(`❌ [ERROR] 指定された牌が見つかりません: ${data.tileId}`);
  }
}

// メルド処理関数
function handleMeld(socket, gameState, data) {
  logWithTime(`🀄 [MELD] handleMeld開始 タイプ: ${data.type}`);
  logWithTime(`🀄 [MELD DEBUG] data: ${JSON.stringify(data, null, 2)}`);
  logWithTime(`🀄 [MELD DEBUG] currentPlayer: ${gameState.currentPlayer}`);
  const playerId = parseInt(data.playerId.replace('player_', ''));
  logWithTime(`🀄 [MELD DEBUG] playerId: ${playerId}`);
  const player = gameState.players[playerId];
  
  if (!player) {
    logWithTime(`❌ [MELD ERROR] プレイヤーが見つかりません: ${playerId}`);
    return;
  }

  switch (data.type) {
    case 'chi':
      handleChi(gameState, playerId, data);
      break;
    case 'pon':
      handlePon(gameState, playerId, data);
      break;
    case 'kan':
      handleKan(gameState, playerId, data);
      break;
    default:
      logWithTime(`❌ [MELD ERROR] 不明なメルドタイプ: ${data.type}`);
      return;
  }
  
  games.set(socket.gameId, gameState);
  io.to(socket.gameId).emit('gameState', gameState);
}

function handleChi(gameState, playerId, data) {
  logWithTime(`🀄 [CHI] チー処理開始: プレイヤー${playerId}`);
  const player = gameState.players[playerId];
  
  // 最後の捨て牌を取得
  const lastDiscard = getLastDiscardedTile(gameState);
  if (!lastDiscard) {
    logWithTime(`❌ [CHI ERROR] 捨て牌が見つかりません`);
    return;
  }
  
  // クライアントから送られたメルドデータを使用
  const meldData = data.meld;
  if (!meldData || !meldData.tiles) {
    logWithTime(`❌ [CHI ERROR] メルドデータが不正です`);
    return;
  }
  
  // メルドに含まれる手牌（捨て牌以外）を手牌から削除
  const usedTiles = [];
  for (const meldTile of meldData.tiles) {
    // 捨て牌は除外
    if (meldTile.id === lastDiscard.tile.id) continue;
    
    const tileIndex = player.hand.tiles.findIndex(t => t.id === meldTile.id);
    if (tileIndex !== -1) {
      usedTiles.push(player.hand.tiles.splice(tileIndex, 1)[0]);
      logWithTime(`🀄 [CHI] 手牌から削除: ${meldTile.displayName}`);
    }
  }
  
  // メルドを作成
  const meld = {
    type: 'chi',
    tiles: meldData.tiles,
    from: lastDiscard.playerId,
    open: true
  };
  
  player.hand.melds.push(meld);
  
  // 手牌をソート
  player.hand.tiles = sortHand(player.hand.tiles);
  
  // ターンをこのプレイヤーに移す（メルド後は捨て牌が必要）
  gameState.currentPlayer = playerId;
  gameState.phase = 'discard'; // 捨て牌フェーズに設定
  
  // メルド後は自動進行を一時停止（手動で捨て牌する必要があるため）
  gameState.cpuAutoMode = false;
  
  logWithTime(`✅ [CHI] チー完了: プレイヤー${playerId}が${meld.tiles.map(t => t.displayName || t.name).join('')}をチー - 捨て牌待ち`);
  logWithTime(`🔍 [CHI DEBUG] メルド後の手牌数: ${player.hand.tiles.length}, メルド数: ${player.hand.melds.length}`);
}

function handlePon(gameState, playerId, data) {
  logWithTime(`🀄 [PON] ポン処理開始: プレイヤー${playerId}`);
  const player = gameState.players[playerId];
  
  // 最後の捨て牌を取得
  const lastDiscard = getLastDiscardedTile(gameState);
  logWithTime(`🀄 [PON DEBUG] lastDiscard: ${JSON.stringify(lastDiscard)}`);
  if (!lastDiscard) {
    logWithTime(`❌ [PON ERROR] 捨て牌が見つかりません`);
    return;
  }
  
  // クライアントから送られたメルドデータを使用
  const meldData = data.meld;
  logWithTime(`🀄 [PON DEBUG] meldData: ${JSON.stringify(meldData)}`);
  if (!meldData || !meldData.tiles) {
    logWithTime(`❌ [PON ERROR] メルドデータが不正です`);
    return;
  }
  
  // メルドに含まれる手牌（捨て牌以外）を手牌から削除
  const usedTiles = [];
  for (const meldTile of meldData.tiles) {
    // 捨て牌は除外
    if (meldTile.id === lastDiscard.tile.id) continue;
    
    const tileIndex = player.hand.tiles.findIndex(t => t.id === meldTile.id);
    if (tileIndex !== -1) {
      usedTiles.push(player.hand.tiles.splice(tileIndex, 1)[0]);
      logWithTime(`🀄 [PON] 手牌から削除: ${meldTile.displayName}`);
    }
  }
  
  if (usedTiles.length < 2) {
    logWithTime(`❌ [PON ERROR] ポンに必要な牌が不足: ${usedTiles.length}枚`);
    return;
  }
  
  // メルドを作成
  const meld = {
    type: 'pon',
    tiles: meldData.tiles,
    from: lastDiscard.playerId,
    open: true
  };
  
  player.hand.melds.push(meld);
  
  // 手牌をソート
  player.hand.tiles = sortHand(player.hand.tiles);
  
  // ターンをこのプレイヤーに移す（メルド後は捨て牌が必要）
  gameState.currentPlayer = playerId;
  gameState.phase = 'discard'; // 捨て牌フェーズに設定
  
  // メルド後は自動進行を一時停止（手動で捨て牌する必要があるため）
  gameState.cpuAutoMode = false;
  
  logWithTime(`✅ [PON] ポン完了: プレイヤー${playerId}が${meld.tiles.map(t => t.displayName || t.name).join('')}をポン - 捨て牌待ち`);
}

function handleKan(gameState, playerId, data) {
  logWithTime(`🀄 [KAN] カン処理開始: プレイヤー${playerId}`);
  const player = gameState.players[playerId];
  
  if (data.kanType === 'ankan') {
    // 暗槓処理
    handleAnkan(gameState, playerId, data);
  } else {
    // 明槓処理
    handleMinkan(gameState, playerId, data);
  }
}

function handleAnkan(gameState, playerId, data) {
  logWithTime(`🀄 [ANKAN] 暗槓処理: プレイヤー${playerId}`);
  const player = gameState.players[playerId];
  const targetTileId = data.tileId;
  
  // 指定された牌と同じ牌を4枚削除
  const targetTile = player.hand.tiles.find(t => t.id === targetTileId);
  if (!targetTile) {
    console.log(`❌ [ERROR] 指定された牌が見つかりません`);
    return;
  }
  
  const removedTiles = [];
  for (let i = player.hand.tiles.length - 1; i >= 0; i--) {
    if (isSameTileType(player.hand.tiles[i], targetTile) && removedTiles.length < 4) {
      removedTiles.push(player.hand.tiles.splice(i, 1)[0]);
    }
  }
  
  if (removedTiles.length < 4) {
    console.log(`❌ [ERROR] 暗槓に必要な牌が不足: ${removedTiles.length}枚`);
    return;
  }
  
  // メルドを作成（暗槓）
  const meld = {
    type: 'ankan',
    tiles: removedTiles,
    from: playerId,
    open: false
  };
  
  player.hand.melds.push(meld);
  
  // 手牌をソート
  player.hand.tiles = sortHand(player.hand.tiles);
  
  // 嶺上牌を引く
  if (gameState.wallTiles.length > 0) {
    const drawnTile = gameState.wallTiles.pop();
    player.hand.tiles.push(drawnTile);
    player.hand.tiles = sortHand(player.hand.tiles);
    gameState.remainingTiles = gameState.wallTiles.length;
  }
  
  logWithTime(`✅ [ANKAN] 暗槓完了: プレイヤー${playerId}が${meld.tiles.map(t => t.displayName).join('')}を暗槓`);
}

function handleMinkan(gameState, playerId, data) {
  logWithTime(`🀄 [MINKAN] 明槓処理: プレイヤー${playerId}`);
  const player = gameState.players[playerId];
  
  // 最後の捨て牌を取得
  const lastDiscard = getLastDiscardedTile(gameState);
  if (!lastDiscard) {
    console.log(`❌ [ERROR] 捨て牌が見つかりません`);
    return;
  }
  
  // 手牌から同じ牌を3枚削除
  const discardedTile = lastDiscard.tile;
  const removedTiles = [];
  let removeCount = 3;
  
  for (let i = player.hand.tiles.length - 1; i >= 0 && removeCount > 0; i--) {
    if (isSameTileType(player.hand.tiles[i], discardedTile)) {
      removedTiles.push(player.hand.tiles.splice(i, 1)[0]);
      removeCount--;
    }
  }
  
  if (removedTiles.length < 3) {
    console.log(`❌ [ERROR] 明槓に必要な牌が不足: ${removedTiles.length}枚`);
    return;
  }
  
  // メルドを作成（明槓）
  const meld = {
    type: 'minkan',
    tiles: [...removedTiles, discardedTile],
    from: lastDiscard.playerId,
    open: true
  };
  
  player.hand.melds.push(meld);
  
  // 手牌をソート
  player.hand.tiles = sortHand(player.hand.tiles);
  
  // 嶺上牌を引く
  if (gameState.wallTiles.length > 0) {
    const drawnTile = gameState.wallTiles.pop();
    player.hand.tiles.push(drawnTile);
    player.hand.tiles = sortHand(player.hand.tiles);
    gameState.remainingTiles = gameState.wallTiles.length;
  }
  
  // ターンをこのプレイヤーに移す
  gameState.currentPlayer = playerId;
  
  logWithTime(`✅ [MINKAN] 明槓完了: プレイヤー${playerId}が${meld.tiles.map(t => t.displayName).join('')}を明槓`);
}

// ヘルパー関数
function getLastDiscardedTile(gameState) {
  // gameState.lastDiscardから直接取得
  if (gameState.lastDiscard && gameState.lastDiscardPlayer !== undefined) {
    return {
      tile: gameState.lastDiscard,
      playerId: gameState.lastDiscardPlayer
    };
  }
  
  // フォールバック：最も新しい捨て牌を取得
  let lastDiscard = null;
  let latestTime = 0;
  
  for (let i = 0; i < 4; i++) {
    const player = gameState.players[i];
    if (player.hand.discards.length > 0) {
      const lastTile = player.hand.discards[player.hand.discards.length - 1];
      // 時間情報があれば使用、なければプレイヤーインデックス順で判定
      const discardTime = lastTile.timestamp || i;
      if (discardTime > latestTime) {
        latestTime = discardTime;
        lastDiscard = {
          tile: lastTile,
          playerId: i
        };
      }
    }
  }
  
  return lastDiscard;
}

function isSameTileType(tile1, tile2) {
  if (tile1.honor && tile2.honor) {
    return tile1.honor === tile2.honor;
  }
  if (tile1.suit && tile2.suit) {
    return tile1.suit === tile2.suit && tile1.rank === tile2.rank;
  }
  return false;
}

// 和了判定システム（役も含めて判定）
function checkWin(tiles, melds = [], player = null, winTile = null, isTsumo = false) {
  logWithTime(`🎯 [WIN CHECK] 和了判定開始: 手牌${tiles.length}枚, メルド${melds.length}個`);
  
  // メルドを含めた全牌数が14枚になるかチェック
  const totalTiles = tiles.length + (melds.length * 3);
  if (totalTiles !== 14) {
    logWithTime(`❌ [WIN CHECK] 牌数が不正: ${totalTiles}枚`);
    return { canWin: false, error: '牌数が不正です' };
  }
  
  let winPattern = null;
  
  // 基本和了形（4面子1雀頭）をチェック
  if (checkBasicWinPattern(tiles, melds)) {
    winPattern = 'basic';
  }
  // 七対子をチェック（メルドがない場合のみ）
  else if (melds.length === 0 && checkChiitoi(tiles)) {
    winPattern = 'chiitoi';
  }
  // 国士無双をチェック（メルドがない場合のみ）
  else if (melds.length === 0 && checkKokushi(tiles)) {
    winPattern = 'kokushi';
  }
  
  if (!winPattern) {
    logWithTime(`❌ [WIN CHECK] 和了形ではありません`);
    return { canWin: false, error: '和了形ではありません' };
  }
  
  // 役をチェック
  const yaku = checkYaku(tiles, melds, player, winTile, isTsumo, winPattern);
  if (yaku.length === 0) {
    logWithTime(`❌ [WIN CHECK] 役がありません`);
    return { canWin: false, error: '役がありません（最低1役必要）' };
  }
  
  logWithTime(`✅ [WIN CHECK] ${winPattern}形で和了 - 役: ${yaku.map(y => y.name).join('・')}`);
  return { 
    canWin: true, 
    pattern: winPattern, 
    yaku: yaku,
    han: yaku.reduce((sum, y) => sum + y.han, 0)
  };
}

// 役判定システム
function checkYaku(tiles, melds, player, winTile, isTsumo, winPattern) {
  const yaku = [];
  
  // 役満系
  if (winPattern === 'kokushi') {
    yaku.push({ name: '国士無双', han: 13, isYakuman: true });
    return yaku;
  }
  
  // リーチ
  if (player && player.hand.riichi) {
    yaku.push({ name: 'リーチ', han: 1 });
  }
  
  // ツモ
  if (isTsumo) {
    yaku.push({ name: 'ツモ', han: 1 });
  }
  
  // 七対子
  if (winPattern === 'chiitoi') {
    yaku.push({ name: '七対子', han: 2 });
  }
  
  // タンヤオ（断么九）
  if (checkTanyao(tiles, melds)) {
    yaku.push({ name: 'タンヤオ', han: 1 });
  }
  
  // ピンフ（平和）
  if (checkPinfu(tiles, melds, winTile)) {
    yaku.push({ name: 'ピンフ', han: 1 });
  }
  
  // 一盃口
  if (checkIipeikou(tiles, melds)) {
    yaku.push({ name: '一盃口', han: 1 });
  }
  
  return yaku;
}

// タンヤオ判定（2-8の数牌のみ）
function checkTanyao(tiles, melds) {
  // 手牌チェック
  for (const tile of tiles) {
    if (tile.honor || tile.rank === 1 || tile.rank === 9) {
      return false;
    }
  }
  
  // メルドチェック
  for (const meld of melds) {
    for (const tile of meld.tiles) {
      if (tile.honor || tile.rank === 1 || tile.rank === 9) {
        return false;
      }
    }
  }
  
  return true;
}

// ピンフ判定（平和）
function checkPinfu(tiles, melds, winTile) {
  // メルドがあるとピンフにならない
  if (melds.length > 0) return false;
  
  // 基本的なピンフ判定（簡易版）
  // 実際はもっと複雑（両面待ち、役牌なし等）
  return false; // 簡易実装のため一旦false
}

// 一盃口判定
function checkIipeikou(tiles, melds) {
  // メルドがあると一盃口にならない
  if (melds.length > 0) return false;
  
  // 簡易実装のため一旦false
  return false;
}

// 基本和了形（4面子1雀頭）チェック
function checkBasicWinPattern(tiles, melds) {
  // 手牌のコピーを作成
  const handTiles = [...tiles];
  
  // 既存メルドの面子数
  const existingMentsu = melds.length;
  
  // 必要な面子数（4 - 既存メルド数）
  const neededMentsu = 4 - existingMentsu;
  
  // 雀頭（対子）を探す
  for (let i = 0; i < handTiles.length - 1; i++) {
    const tile1 = handTiles[i];
    for (let j = i + 1; j < handTiles.length; j++) {
      const tile2 = handTiles[j];
      
      if (isSameTileType(tile1, tile2)) {
        // 雀頭候補を除いた残りの牌
        const remainingTiles = [...handTiles];
        remainingTiles.splice(j, 1);
        remainingTiles.splice(i, 1);
        
        // 残りの牌で必要数の面子が作れるかチェック
        if (checkMentsuPattern(remainingTiles, neededMentsu)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// 面子パターンチェック
function checkMentsuPattern(tiles, neededCount) {
  if (neededCount === 0) {
    return tiles.length === 0;
  }
  
  if (tiles.length < 3) {
    return false;
  }
  
  const sortedTiles = [...tiles].sort((a, b) => {
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.honor !== b.honor) return (a.honor || '').localeCompare(b.honor || '');
    return 0;
  });
  
  // 刻子をチェック
  for (let i = 0; i <= sortedTiles.length - 3; i++) {
    if (isSameTileType(sortedTiles[i], sortedTiles[i + 1]) && 
        isSameTileType(sortedTiles[i + 1], sortedTiles[i + 2])) {
      const remaining = [...sortedTiles];
      remaining.splice(i, 3);
      if (checkMentsuPattern(remaining, neededCount - 1)) {
        return true;
      }
    }
  }
  
  // 順子をチェック（数牌のみ）
  for (let i = 0; i < sortedTiles.length; i++) {
    const tile = sortedTiles[i];
    if (tile.honor) continue; // 字牌は順子を作れない
    if (tile.rank > 7) continue; // 8,9は順子の最初になれない
    
    // n, n+1, n+2 を探す
    const nextTile = sortedTiles.find((t, idx) => 
      idx > i && t.suit === tile.suit && t.rank === tile.rank + 1);
    const nextNextTile = sortedTiles.find((t, idx) => 
      idx > i && t.suit === tile.suit && t.rank === tile.rank + 2);
    
    if (nextTile && nextNextTile) {
      const remaining = [...sortedTiles];
      // 後ろから削除（インデックスがずれないように）
      const indices = [
        sortedTiles.indexOf(nextNextTile),
        sortedTiles.indexOf(nextTile),
        i
      ].sort((a, b) => b - a);
      
      indices.forEach(idx => remaining.splice(idx, 1));
      
      if (checkMentsuPattern(remaining, neededCount - 1)) {
        return true;
      }
    }
  }
  
  return false;
}

// 七対子チェック
function checkChiitoi(tiles) {
  if (tiles.length !== 14) return false;
  
  const pairs = new Map();
  for (const tile of tiles) {
    const key = `${tile.suit}_${tile.rank}_${tile.honor}`;
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
  
  // 7種類の対子があるかチェック
  const pairCounts = Array.from(pairs.values());
  return pairCounts.length === 7 && pairCounts.every(count => count === 2);
}

// 国士無双チェック
function checkKokushi(tiles) {
  if (tiles.length !== 14) return false;
  
  const yaochu = [
    'man_1', 'man_9', 'pin_1', 'pin_9', 'sou_1', 'sou_9',
    'ji_東', 'ji_南', 'ji_西', 'ji_北', 'ji_白', 'ji_發', 'ji_中'
  ];
  
  const tileCounts = new Map();
  for (const tile of tiles) {
    const key = tile.honor ? `ji_${tile.honor}` : `${tile.suit}_${tile.rank}`;
    tileCounts.set(key, (tileCounts.get(key) || 0) + 1);
  }
  
  // 13種類のヤオ九牌がすべて含まれているかチェック
  let pairCount = 0;
  for (const yao of yaochu) {
    const count = tileCounts.get(yao) || 0;
    if (count === 0) return false;
    if (count === 2) pairCount++;
    if (count > 2) return false;
  }
  
  // 1つだけ対子があるかチェック
  return pairCount === 1;
}

// 点数計算システム
function calculateScore(tiles, melds, yaku, winTile, isTsumo, isParent, winPattern) {
  logWithTime(`💰 [SCORE] 点数計算開始: ${yaku.length}役, ${winPattern}形`);
  
  // 役満チェック
  const yakumanYaku = yaku.filter(y => y.isYakuman);
  if (yakumanYaku.length > 0) {
    return calculateYakumanScore(yakumanYaku, isParent, isTsumo);
  }
  
  // 通常役の計算
  const han = yaku.reduce((sum, y) => sum + y.han, 0);
  const fu = calculateFu(tiles, melds, winTile, isTsumo, winPattern, yaku);
  
  logWithTime(`💰 [SCORE] ${han}翻${fu}符`);
  
  return calculateNormalScore(han, fu, isParent, isTsumo);
}

// 符計算
function calculateFu(tiles, melds, winTile, isTsumo, winPattern, yaku) {
  let fu = 20; // 基本符
  
  // 七対子は特殊（25符固定）
  if (winPattern === 'chiitoi') {
    return 25;
  }
  
  // ツモ符
  if (isTsumo) {
    fu += 2;
  }
  
  // 門前ロン符
  if (!isTsumo && melds.every(m => m.isConcealed)) {
    fu += 10;
  }
  
  // 雀頭符（役牌の場合）
  // 簡易実装：後で詳細化
  
  // 面子符の計算
  for (const meld of melds) {
    if (meld.type === 'pon' || meld.type === 'kan') {
      // 刻子・槓子の符
      let meldFu = 2; // 明刻の基本符
      
      if (meld.isConcealed) {
        meldFu *= 2; // 暗刻は倍
      }
      
      // 槓子はさらに倍
      if (meld.type === 'kan') {
        meldFu *= 4;
      }
      
      // ヤオ九牌は倍
      const tile = meld.tiles[0];
      if (tile.honor || tile.rank === 1 || tile.rank === 9) {
        meldFu *= 2;
      }
      
      fu += meldFu;
    }
  }
  
  // 待ちの種類による符
  // 簡易実装：リャンメン待ち以外は+2符
  // 詳細な待ち判定は複雑なので後で実装
  
  // ピンフの場合は30符固定
  if (yaku.some(y => y.name === 'ピンフ')) {
    return 30;
  }
  
  // 最低30符
  fu = Math.max(fu, 30);
  
  // 10符単位で切り上げ
  fu = Math.ceil(fu / 10) * 10;
  
  logWithTime(`💰 [FU] 符計算結果: ${fu}符`);
  return fu;
}

// 通常役の点数計算
function calculateNormalScore(han, fu, isParent, isTsumo) {
  let baseScore;
  
  // 満貫以上の判定
  if (han >= 13) {
    baseScore = 8000; // 数え役満
  } else if (han >= 11) {
    baseScore = 6000; // 三倍満
  } else if (han >= 8) {
    baseScore = 4000; // 倍満
  } else if (han >= 6) {
    baseScore = 3000; // 跳満
  } else if (han >= 5 || (han >= 4 && fu >= 40) || (han >= 3 && fu >= 70)) {
    baseScore = 2000; // 満貫
  } else {
    // 通常計算: fu × 2^(han+2)
    baseScore = fu * Math.pow(2, han + 2);
  }
  
  // 親の場合は1.5倍
  if (isParent) {
    baseScore = Math.floor(baseScore * 1.5);
  }
  
  // 支払い方式による分配
  let payments = {};
  
  if (isTsumo) {
    // ツモの場合：全員から支払い
    if (isParent) {
      // 親ツモ：子が全額の1/3ずつ支払い
      const childPayment = Math.ceil(baseScore / 3 / 100) * 100;
      payments = {
        child1: childPayment,
        child2: childPayment,
        child3: childPayment,
        winner: childPayment * 3
      };
    } else {
      // 子ツモ：親が半額、他の子が1/4ずつ支払い
      const parentPayment = Math.ceil(baseScore / 2 / 100) * 100;
      const childPayment = Math.ceil(baseScore / 4 / 100) * 100;
      payments = {
        parent: parentPayment,
        child1: childPayment,
        child2: childPayment,
        winner: parentPayment + childPayment * 2
      };
    }
  } else {
    // ロンの場合：放銃者が全額支払い
    const totalPayment = Math.ceil(baseScore / 100) * 100;
    payments = {
      loser: totalPayment,
      winner: totalPayment
    };
  }
  
  logWithTime(`💰 [SCORE] 点数計算完了: ${payments.winner}点`);
  
  return {
    han: han,
    fu: fu,
    baseScore: baseScore,
    payments: payments,
    total: payments.winner,
    isParent: isParent,
    isTsumo: isTsumo
  };
}

// 役満の点数計算
function calculateYakumanScore(yakumanYaku, isParent, isTsumo) {
  const yakumanCount = yakumanYaku.reduce((sum, y) => sum + (y.han === 13 ? 1 : y.han / 13), 0);
  let baseScore = 8000 * yakumanCount;
  
  if (isParent) {
    baseScore = Math.floor(baseScore * 1.5);
  }
  
  let payments = {};
  
  if (isTsumo) {
    if (isParent) {
      const childPayment = Math.ceil(baseScore / 3 / 100) * 100;
      payments = {
        child1: childPayment,
        child2: childPayment,
        child3: childPayment,
        winner: childPayment * 3
      };
    } else {
      const parentPayment = Math.ceil(baseScore / 2 / 100) * 100;
      const childPayment = Math.ceil(baseScore / 4 / 100) * 100;
      payments = {
        parent: parentPayment,
        child1: childPayment,
        child2: childPayment,
        winner: parentPayment + childPayment * 2
      };
    }
  } else {
    const totalPayment = Math.ceil(baseScore / 100) * 100;
    payments = {
      loser: totalPayment,
      winner: totalPayment
    };
  }
  
  logWithTime(`💰 [YAKUMAN] 役満${yakumanCount}倍: ${payments.winner}点`);
  
  return {
    han: yakumanCount * 13,
    fu: 0,
    baseScore: baseScore,
    payments: payments,
    total: payments.winner,
    isParent: isParent,
    isTsumo: isTsumo,
    isYakuman: true,
    yakumanCount: yakumanCount
  };
}

// テンパイ（聴牌）チェック
function checkTenpai(tiles, melds, player) {
  const currentTileCount = tiles.length + (melds.length * 3);
  
  // 13枚の場合のみテンパイチェック（14枚は和了チェック）
  if (currentTileCount !== 13) {
    return { isTenpai: false, waitingTiles: [] };
  }
  
  const waitingTiles = [];
  
  // 全ての牌種を試して、和了できるかチェック
  const allTileTypes = [];
  
  // 数牌 1-9
  for (const suit of ['man', 'pin', 'sou']) {
    for (let rank = 1; rank <= 9; rank++) {
      allTileTypes.push({ suit, rank });
    }
  }
  
  // 字牌
  for (const honor of ['東', '南', '西', '北', '白', '發', '中']) {
    allTileTypes.push({ honor });
  }
  
  for (const tileType of allTileTypes) {
    const testTiles = [...tiles, tileType];
    const winResult = checkWin(testTiles, melds, player, tileType, true);
    
    if (winResult.canWin) {
      waitingTiles.push(tileType);
    }
  }
  
  return {
    isTenpai: waitingTiles.length > 0,
    waitingTiles: waitingTiles
  };
}

// ツモ和了ハンドラー
function handleTsumo(socket, gameState, data) {
  logWithTime(`🎯 [TSUMO] ツモ和了処理開始`);
  const playerId = parseInt(data.playerId.replace('player_', ''));
  const player = gameState.players[playerId];
  
  if (!player) {
    logWithTime(`❌ [TSUMO ERROR] プレイヤーが見つかりません: ${playerId}`);
    socket.emit('winResult', { success: false, error: 'プレイヤーが見つかりません' });
    return;
  }
  
  // 現在のプレイヤーのターンかチェック
  if (gameState.currentPlayer !== playerId) {
    logWithTime(`❌ [TSUMO ERROR] プレイヤー${playerId}のターンではありません`);
    socket.emit('winResult', { success: false, error: 'あなたのターンではありません' });
    return;
  }
  
  // 和了判定（役も含む）
  const winResult = checkWin(player.hand.tiles, player.hand.melds, player, null, true);
  if (!winResult.canWin) {
    logWithTime(`❌ [TSUMO ERROR] プレイヤー${playerId}: ${winResult.error}`);
    socket.emit('winResult', { success: false, error: winResult.error });
    return;
  }
  
  // 点数計算
  const isParent = player.wind === 'east';
  const score = calculateScore(
    player.hand.tiles, 
    player.hand.melds, 
    winResult.yaku, 
    null, 
    true, 
    isParent, 
    winResult.pattern
  );
  
  logWithTime(`✅ [TSUMO] プレイヤー${playerId}(${player.name})がツモ和了！ ${score.total}点`);
  
  // ゲーム終了処理
  gameState.phase = 'finished';
  gameState.winner = playerId;
  gameState.winType = 'tsumo';
  gameState.cpuAutoMode = false;
  
  // 全プレイヤーに結果を通知
  const winData = {
    success: true,
    winner: playerId,
    winnerName: player.name,
    winType: 'tsumo',
    yaku: winResult.yaku,
    han: winResult.han,
    score: score,
    message: `${player.name}がツモ和了しました！`
  };
  
  games.set(socket.gameId, gameState);
  io.to(socket.gameId).emit('gameState', gameState);
  io.to(socket.gameId).emit('winResult', winData);
}

// ロン和了ハンドラー
function handleRon(socket, gameState, data) {
  logWithTime(`🎯 [RON] ロン和了処理開始`);
  const playerId = parseInt(data.playerId.replace('player_', ''));
  const player = gameState.players[playerId];
  
  if (!player) {
    logWithTime(`❌ [RON ERROR] プレイヤーが見つかりません: ${playerId}`);
    socket.emit('winResult', { success: false, error: 'プレイヤーが見つかりません' });
    return;
  }
  
  // 自分のターンではないことを確認（ロンは他人の捨て牌で和了）
  if (gameState.currentPlayer === playerId) {
    logWithTime(`❌ [RON ERROR] プレイヤー${playerId}は自分のターンです（ロンは不可）`);
    socket.emit('winResult', { success: false, error: '自分のターンではロンできません' });
    return;
  }
  
  // 最後の捨て牌があるかチェック
  const lastDiscard = getLastDiscardedTile(gameState);
  if (!lastDiscard) {
    logWithTime(`❌ [RON ERROR] 捨て牌が見つかりません`);
    socket.emit('winResult', { success: false, error: '捨て牌が見つかりません' });
    return;
  }
  
  // 仮想的に捨て牌を手牌に加えて和了判定（役も含む）
  const testTiles = [...player.hand.tiles, lastDiscard.tile];
  const winResult = checkWin(testTiles, player.hand.melds, player, lastDiscard.tile, false);
  if (!winResult.canWin) {
    logWithTime(`❌ [RON ERROR] プレイヤー${playerId}: ${winResult.error}`);
    socket.emit('winResult', { success: false, error: winResult.error });
    return;
  }
  
  // 点数計算
  const isParent = player.wind === 'east';
  const score = calculateScore(
    testTiles, 
    player.hand.melds, 
    winResult.yaku, 
    lastDiscard.tile, 
    false, 
    isParent, 
    winResult.pattern
  );
  
  logWithTime(`✅ [RON] プレイヤー${playerId}(${player.name})がロン和了！ ${score.total}点`);
  
  // ゲーム終了処理
  gameState.phase = 'finished';
  gameState.winner = playerId;
  gameState.winType = 'ron';
  gameState.cpuAutoMode = false;
  
  // 全プレイヤーに結果を通知
  const winData = {
    success: true,
    winner: playerId,
    winnerName: player.name,
    winType: 'ron',
    yaku: winResult.yaku,
    han: winResult.han,
    score: score,
    discardPlayer: lastDiscard.playerId,
    discardTile: lastDiscard.tile,
    message: `${player.name}がロン和了しました！`
  };
  
  games.set(socket.gameId, gameState);
  io.to(socket.gameId).emit('gameState', gameState);
  io.to(socket.gameId).emit('winResult', winData);
}

// メルド可能性チェック関数
function checkMeldOpportunities(socket, gameState, discardedTile, discardPlayerId) {
  logWithTime(`🔍 [MELD CHECK] メルド可能性チェック開始: ${discardedTile.displayName || discardedTile.unicode}`);
  
  const meldOpportunities = [];
  
  // 各プレイヤー（捨て牌したプレイヤー以外）をチェック
  for (let i = 0; i < 4; i++) {
    if (i === discardPlayerId) continue; // 捨て牌したプレイヤーはスキップ
    
    const player = gameState.players[i];
    
    // まずロン可能性をチェック（CPUの場合は自動実行）
    const tilesWithRon = [...player.hand.tiles, discardedTile];
    const winResult = checkWin(tilesWithRon, player.hand.melds, player, discardedTile, false);
    if (winResult.canWin) {
      if (player.type === 'cpu') {
        logWithTime(`🤖 [RON] CPU${i}(${player.name})がロン和了判定！`);
        
        // CPUロン和了処理
        const cpuSocket = { gameId: socket.gameId, emit: () => {} }; // ダミーソケット
        handleRon(cpuSocket, gameState, {
          playerId: `player_${i}`,
          timestamp: Date.now()
        });
        return; // ロン和了したので処理終了
      } else {
        logWithTime(`👤 [RON] プレイヤー${i}にロン機会あり`);
        // 人間プレイヤーの場合はボタン表示制御のみ（既存のcanCallRon処理に委ねる）
      }
    }
    
    const opportunities = {
      playerId: i,
      playerType: player.type,
      chi: false,
      pon: false,
      kan: false
    };
    
    // ポン・カンチェック（全プレイヤー対象）
    const sameTypeCount = player.hand.tiles.filter(tile => isSameTileType(tile, discardedTile)).length;
    if (sameTypeCount >= 2) {
      opportunities.pon = true;
      logWithTime(`✅ [PON] プレイヤー${i}がポン可能: ${discardedTile.displayName}`);
    }
    if (sameTypeCount >= 3) {
      opportunities.kan = true;
      logWithTime(`✅ [KAN] プレイヤー${i}がカン可能: ${discardedTile.displayName}`);
    }
    
    // チーチェック（下家のみ：捨て牌プレイヤーの次のプレイヤー）
    const isNextPlayer = (discardPlayerId + 1) % 4 === i;
    if (isNextPlayer && !discardedTile.honor) {
      // 数牌の場合のみチー可能
      const chiPossible = checkChiPossibility(player.hand.tiles, discardedTile);
      if (chiPossible) {
        opportunities.chi = true;
        logWithTime(`✅ [CHI] プレイヤー${i}がチー可能: ${discardedTile.displayName}`);
      }
    }
    
    // 何らかのメルドが可能な場合
    if (opportunities.chi || opportunities.pon || opportunities.kan) {
      meldOpportunities.push(opportunities);
    }
  }
  
  // メルドの機会があれば通知
  if (meldOpportunities.length > 0) {
    logWithTime(`🀄 [MELD OPPORTUNITIES] ${meldOpportunities.length}人のプレイヤーにメルド機会あり`);
    
    // 人間プレイヤーにメルド機会がある場合、オート機能を一時停止
    const hasHumanOpportunity = meldOpportunities.some(opp => opp.playerType === 'human');
    if (hasHumanOpportunity) {
      logWithTime(`⏸️ [AUTO PAUSE] 人間プレイヤーのメルド機会により自動進行を一時停止`);
      gameState.cpuAutoMode = false; // CPU自動対戦を停止
      gameState.playerAutoTsumoKiri = false; // プレイヤーオートツモ切りを停止
    }
    
    const meldData = {
      discardedTile: discardedTile,
      discardPlayerId: discardPlayerId,
      opportunities: meldOpportunities,
      autoPaused: hasHumanOpportunity // オート停止したかどうかの情報
    };
    
    logWithTime(`📤 [EMIT] meldOpportunities送信: ${JSON.stringify(meldData)}`);
    io.to(socket.gameId).emit('meldOpportunities', meldData);
  } else {
    logWithTime(`❌ [MELD CHECK] メルド機会なし`);
  }
}

// チー可能性チェック
function checkChiPossibility(handTiles, discardedTile) {
  if (discardedTile.honor) return false; // 字牌はチー不可
  
  const suit = discardedTile.suit;
  const rank = discardedTile.rank;
  
  // 手牌から同じスートの牌を抽出
  const sameSuitTiles = handTiles.filter(tile => tile.suit === suit);
  const rankCounts = {};
  
  sameSuitTiles.forEach(tile => {
    rankCounts[tile.rank] = (rankCounts[tile.rank] || 0) + 1;
  });
  
  // チー可能パターンをチェック
  // パターン1: [n-2, n-1] + n (例: 1,2 + 3)
  if (rank >= 3 && rankCounts[rank - 2] >= 1 && rankCounts[rank - 1] >= 1) {
    return true;
  }
  
  // パターン2: [n-1, n+1] + n (例: 2,4 + 3)
  if (rank >= 2 && rank <= 8 && rankCounts[rank - 1] >= 1 && rankCounts[rank + 1] >= 1) {
    return true;
  }
  
  // パターン3: [n+1, n+2] + n (例: 4,5 + 3)
  if (rank <= 7 && rankCounts[rank + 1] >= 1 && rankCounts[rank + 2] >= 1) {
    return true;
  }
  
  return false;
}

function handleDraw(socket, gameState, data) {
  if (gameState.wallTiles.length > 0) {
    const drawnTile = gameState.wallTiles.pop();
    gameState.players[gameState.currentPlayer].hand.tiles.push(drawnTile);
    // 手牌をソート
    gameState.players[gameState.currentPlayer].hand.tiles = sortHand(gameState.players[gameState.currentPlayer].hand.tiles);
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
    
    // プレイヤータイプに関係なく、手牌が適切な枚数の場合は自動ツモ
    // 基本は13枚だが、メルドがある場合は減る（3枚メルド1個につき-3枚）
    const meldCount = currentPlayer.hand.melds ? currentPlayer.hand.melds.length : 0;
    const expectedTileCount = 13 - (meldCount * 3);
    
    console.log(`🔍 [MELD DEBUG] プレイヤー${currentState.currentPlayer}: メルド数=${meldCount}, 期待手牌数=${expectedTileCount}, 実際手牌数=${currentPlayer.hand.tiles.length}`);
    
    if (currentPlayer.hand.tiles.length === expectedTileCount) {
      console.log(`🎯 [DEBUG] プレイヤー${currentState.currentPlayer}(${currentPlayer.type})が自動ツモを実行（現在${currentPlayer.hand.tiles.length}枚）`);
      if (currentState.wallTiles.length > 0) {
        const drawnTile = currentState.wallTiles.pop();
        currentPlayer.hand.tiles.push(drawnTile);
        // 手牌をソート
        currentPlayer.hand.tiles = sortHand(currentPlayer.hand.tiles);
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
      
      // 手牌が適切な枚数+1の場合は捨て牌（ツモ後の状態）
      const expectedDiscardCount = expectedTileCount + 1;
      if (currentPlayer.hand.tiles.length === expectedDiscardCount) {
        // まず和了可能かチェック
        const winResult = checkWin(currentPlayer.hand.tiles, currentPlayer.hand.melds, currentPlayer, null, true);
        if (winResult.canWin) {
          console.log(`🤖 [TSUMO] CPU${currentPlayer.playerId}(${currentPlayer.name})がツモ和了判定！`);
          
          // CPUツモ和了処理
          const cpuSocket = { gameId, emit: () => {} }; // ダミーソケット
          handleTsumo(cpuSocket, currentState, {
            playerId: `player_${currentPlayer.playerId}`,
            timestamp: Date.now()
          });
          return; // 和了したので処理終了
        }
        
        console.log(`🤖 [DEBUG] CPUが捨て牌を実行（現在${currentPlayer.hand.tiles.length}枚）`);
        const randomIndex = Math.floor(Math.random() * currentPlayer.hand.tiles.length);
        const tileToDiscard = currentPlayer.hand.tiles[randomIndex];
        
        // 牌を捨てる
        handleDiscard({ gameId }, currentState, { tileId: tileToDiscard.id });
      } else if (currentPlayer.hand.tiles.length < 13) {
        console.log(`🤖 [ERROR] CPUの手牌数が異常: ${currentPlayer.hand.tiles.length}枚`);
      }
    } else {
      // 人間プレイヤーの場合
      if (currentState.playerAutoTsumoKiri && currentPlayer.hand.tiles.length === expectedTileCount + 1) {
        console.log(`👤 [DEBUG] プレイヤーオートツモ切り実行（手牌${currentPlayer.hand.tiles.length}枚）`);
        // 最後にツモした牌（最後の牌）を自動で捨てる
        const lastTileIndex = currentPlayer.hand.tiles.length - 1;
        const tileToDiscard = currentPlayer.hand.tiles[lastTileIndex];
        
        // 少し遅延を入れて自然に見せる
        setTimeout(() => {
          handleDiscard({ gameId }, currentState, { tileId: tileToDiscard.id });
        }, 800);
      } else {
        console.log(`👤 [DEBUG] 人間プレイヤーのターン（手牌${currentPlayer.hand.tiles.length}枚）- 捨て牌待ち`);
      }
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