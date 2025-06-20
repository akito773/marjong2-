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
  
  // ターンをこのプレイヤーに移す
  gameState.currentPlayer = playerId;
  
  logWithTime(`✅ [CHI] チー完了: プレイヤー${playerId}が${meld.tiles.map(t => t.displayName || t.name).join('')}をチー`);
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
  
  // ターンをこのプレイヤーに移す
  gameState.currentPlayer = playerId;
  
  logWithTime(`✅ [PON] ポン完了: プレイヤー${playerId}が${meld.tiles.map(t => t.displayName || t.name).join('')}をポン`);
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

// メルド可能性チェック関数
function checkMeldOpportunities(socket, gameState, discardedTile, discardPlayerId) {
  logWithTime(`🔍 [MELD CHECK] メルド可能性チェック開始: ${discardedTile.displayName || discardedTile.unicode}`);
  
  const meldOpportunities = [];
  
  // 各プレイヤー（捨て牌したプレイヤー以外）をチェック
  for (let i = 0; i < 4; i++) {
    if (i === discardPlayerId) continue; // 捨て牌したプレイヤーはスキップ
    
    const player = gameState.players[i];
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
    
    // プレイヤータイプに関係なく、手牌が13枚の場合は自動ツモ
    if (currentPlayer.hand.tiles.length === 13) {
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
      // 人間プレイヤーの場合
      if (currentState.playerAutoTsumoKiri && currentPlayer.hand.tiles.length === 14) {
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