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
  
  // 元の配列を直接ソートするが、null/undefinedを安全に処理
  return tiles.sort((a, b) => {
    // データ検証 - null/undefinedは最後に移動
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    
    // 1. 萬子・筒子・索子・字牌の順序
    const suitOrder = { 'man': 1, 'pin': 2, 'sou': 3, 'ji': 4 };
    
    // 字牌の場合
    if (a.honor && b.honor) {
      const honorOrder = { 'east': 1, 'south': 2, 'west': 3, 'north': 4, 'white': 5, 'green': 6, 'red': 7 };
      return (honorOrder[a.honor] || 0) - (honorOrder[b.honor] || 0);
    }
    
    // 一方が字牌、一方が数牌の場合
    if (a.honor && !b.honor) return 1;
    if (!a.honor && b.honor) return -1;
    
    // 両方数牌の場合
    const aSuit = a.suit || '';
    const bSuit = b.suit || '';
    if (aSuit !== bSuit) {
      return (suitOrder[aSuit] || 0) - (suitOrder[bSuit] || 0);
    }
    
    // 同じスートの場合は数字順
    return (a.rank || 0) - (b.rank || 0);
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
    phase: 'playing', // ゲーム状態
    // 局・半荘管理
    wind: 'east', // 場風（東場・南場）
    roundNumber: 1, // 局数（1-4局）
    honba: 0, // 本場数
    kyotaku: 0, // 供託（リーチ棒）
    gameType: 'hanchan', // 'tonpuu'（東風戦）または 'hanchan'（半荘戦）
    isLastRound: false, // 最終局フラグ
    roundResults: [] // 各局の結果履歴
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
        // ツモ牌は末尾に保持するため、ソートしない
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
      case 'riichi':
        logWithTime(`🔥 [PLAYER ACTION] リーチ宣言: ${data.playerId}`);
        handleRiichi(socket, gameState, data);
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
  try {
    logWithTime(`🔥 [DISCARD] handleDiscard関数が呼ばれました！`);
    console.log(`🔍 [DEBUG] handleDiscard called`);
    console.log(`🔍 [DEBUG] currentPlayer: ${gameState.currentPlayer}`);
    console.log(`🔍 [DEBUG] data:`, data);
    
    if (!gameState || !gameState.players || !gameState.players[gameState.currentPlayer]) {
      console.error(`❌ [DISCARD ERROR] Invalid game state or player`);
      return;
    }
    
    const player = gameState.players[gameState.currentPlayer];
    console.log(`🔍 [DEBUG] player tiles count: ${player.hand.tiles.length}`);
    
    if (!player.hand || !player.hand.tiles) {
      console.error(`❌ [DISCARD ERROR] Player hand or tiles is undefined`);
      return;
    }
    
    const tileIndex = player.hand.tiles.findIndex(t => t && t.id === data.tileId);
    console.log(`🔍 [DEBUG] tileIndex: ${tileIndex}`);
  
  if (tileIndex !== -1) {
    const discardedTile = player.hand.tiles.splice(tileIndex, 1)[0];
    
    // 捨て牌後に手牌をソート（整理）
    player.hand.tiles = sortHand(player.hand.tiles);
    
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
  } catch (error) {
    console.error(`❌ [DISCARD CRITICAL ERROR] handleDiscard例外:`, error);
    console.error(`❌ [DISCARD STACK] スタックトレース:`, error.stack);
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
  
  // 嶺上牌を引く（王牌から取得）
  if (gameState.rinshanTiles && gameState.rinshanTiles.length > 0) {
    const drawnTile = gameState.rinshanTiles.shift();
    player.hand.tiles.push(drawnTile);
    // 嶺上牌は末尾に保持するため、ソートしない
    
    // 新しいドラ表示牌を開く
    addNewDoraIndicator(gameState);
    
    logWithTime(`🎲 [KAN] 嶺上牌: ${drawnTile.displayName}、新ドラ表示牌: ${gameState.doraIndicators[gameState.doraIndicators.length - 1]?.displayName}`);
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
  
  // 嶺上牌を引く（王牌から取得）
  if (gameState.rinshanTiles && gameState.rinshanTiles.length > 0) {
    const drawnTile = gameState.rinshanTiles.shift();
    player.hand.tiles.push(drawnTile);
    // 嶺上牌は末尾に保持するため、ソートしない
    
    // 新しいドラ表示牌を開く
    addNewDoraIndicator(gameState);
    
    logWithTime(`🎲 [KAN] 嶺上牌: ${drawnTile.displayName}、新ドラ表示牌: ${gameState.doraIndicators[gameState.doraIndicators.length - 1]?.displayName}`);
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
  
  const sortedTiles = [...tiles].filter(tile => tile != null).sort((a, b) => {
    // データ検証
    if (!a || !b) {
      console.error('❌ [SORT ERROR] Null tile in sort:', { a, b });
      return 0;
    }
    
    const aSuit = a.suit || '';
    const bSuit = b.suit || '';
    const aHonor = a.honor || '';
    const bHonor = b.honor || '';
    
    if (aSuit !== bSuit) return aSuit.localeCompare(bSuit);
    if (a.rank !== b.rank) return (a.rank || 0) - (b.rank || 0);
    if (aHonor !== bHonor) return aHonor.localeCompare(bHonor);
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
  
  // 点数移動処理
  const scoreChanges = calculateScoreChanges(gameState, playerId, score, true);
  applyScoreChanges(gameState, scoreChanges);
  
  // 局結果を記録
  const roundResult = {
    roundNumber: gameState.roundNumber,
    wind: gameState.wind,
    honba: gameState.honba,
    winner: playerId,
    winType: 'tsumo',
    yaku: winResult.yaku,
    han: winResult.han,
    score: score,
    scoreChanges: scoreChanges,
    timestamp: new Date()
  };
  gameState.roundResults.push(roundResult);
  
  // 全プレイヤーに結果を通知
  const winData = {
    success: true,
    winner: playerId,
    winnerName: player.name,
    winType: 'tsumo',
    yaku: winResult.yaku,
    han: winResult.han,
    score: score,
    scoreChanges: scoreChanges,
    roundResult: roundResult,
    message: `${player.name}がツモ和了しました！`
  };
  
  games.set(socket.gameId, gameState);
  io.to(socket.gameId).emit('winResult', winData);
  
  // 局終了処理と次局準備
  setTimeout(() => {
    processRoundEnd(socket, gameState, roundResult);
  }, 5000); // 5秒後に次局開始
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
  
  // 点数移動処理
  const scoreChanges = calculateScoreChanges(gameState, playerId, score, false, lastDiscard.playerId);
  applyScoreChanges(gameState, scoreChanges);
  
  // 局結果を記録
  const roundResult = {
    roundNumber: gameState.roundNumber,
    wind: gameState.wind,
    honba: gameState.honba,
    winner: playerId,
    winType: 'ron',
    yaku: winResult.yaku,
    han: winResult.han,
    score: score,
    scoreChanges: scoreChanges,
    discardPlayer: lastDiscard.playerId,
    discardTile: lastDiscard.tile,
    timestamp: new Date()
  };
  gameState.roundResults.push(roundResult);
  
  // 全プレイヤーに結果を通知
  const winData = {
    success: true,
    winner: playerId,
    winnerName: player.name,
    winType: 'ron',
    yaku: winResult.yaku,
    han: winResult.han,
    score: score,
    scoreChanges: scoreChanges,
    roundResult: roundResult,
    discardPlayer: lastDiscard.playerId,
    discardTile: lastDiscard.tile,
    message: `${player.name}がロン和了しました！`
  };
  
  games.set(socket.gameId, gameState);
  io.to(socket.gameId).emit('winResult', winData);
  
  // 局終了処理と次局準備
  setTimeout(() => {
    processRoundEnd(socket, gameState, roundResult);
  }, 5000); // 5秒後に次局開始
}

// リーチハンドラー
function handleRiichi(socket, gameState, data) {
  logWithTime(`🔥 [RIICHI] リーチ処理開始`);
  const playerId = parseInt(data.playerId.replace('player_', ''));
  const player = gameState.players[playerId];
  
  if (!player) {
    logWithTime(`❌ [RIICHI ERROR] プレイヤーが見つかりません: ${playerId}`);
    socket.emit('actionResult', { success: false, error: 'プレイヤーが見つかりません' });
    return;
  }
  
  // リーチ条件チェック
  if (gameState.currentPlayer !== playerId) {
    logWithTime(`❌ [RIICHI ERROR] プレイヤー${playerId}のターンではありません`);
    socket.emit('actionResult', { success: false, error: 'あなたのターンではありません' });
    return;
  }
  
  if (player.hand.riichi) {
    logWithTime(`❌ [RIICHI ERROR] プレイヤー${playerId}は既にリーチしています`);
    socket.emit('actionResult', { success: false, error: '既にリーチしています' });
    return;
  }
  
  if (player.score < 1000) {
    logWithTime(`❌ [RIICHI ERROR] プレイヤー${playerId}の点数が不足: ${player.score}点`);
    socket.emit('actionResult', { success: false, error: '点数が不足しています（1000点必要）' });
    return;
  }
  
  if (player.hand.tiles.length !== 14) {
    logWithTime(`❌ [RIICHI ERROR] プレイヤー${playerId}の手牌数が不正: ${player.hand.tiles.length}枚`);
    socket.emit('actionResult', { success: false, error: '手牌数が不正です' });
    return;
  }
  
  // リーチ成立
  player.hand.riichi = true;
  player.score -= 1000; // リーチ棒支払い
  gameState.kyotaku++; // 供託に追加
  
  logWithTime(`✅ [RIICHI] プレイヤー${playerId}(${player.name})がリーチ宣言！ 供託: ${gameState.kyotaku}本`);
  
  // 全プレイヤーに通知
  const riichiData = {
    success: true,
    playerId: playerId,
    playerName: player.name,
    kyotaku: gameState.kyotaku,
    playerScore: player.score,
    message: `${player.name}がリーチ！`
  };
  
  games.set(socket.gameId, gameState);
  io.to(socket.gameId).emit('gameState', gameState);
  io.to(socket.gameId).emit('riichiDeclared', riichiData);
  socket.emit('actionResult', riichiData);
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
      const shouldPon = player.type === 'cpu' ? shouldCpuCallPon(player, discardedTile, gameState) : true;
      if (shouldPon) {
        opportunities.pon = true;
        logWithTime(`✅ [PON] プレイヤー${i}がポン可能: ${discardedTile.displayName}`);
      }
    }
    if (sameTypeCount >= 3) {
      const shouldKan = player.type === 'cpu' ? shouldCpuCallKan(player, discardedTile, gameState) : true;
      if (shouldKan) {
        opportunities.kan = true;
        logWithTime(`✅ [KAN] プレイヤー${i}がカン可能: ${discardedTile.displayName}`);
      }
    }
    
    // チーチェック（下家のみ：捨て牌プレイヤーの次のプレイヤー）
    const isNextPlayer = (discardPlayerId + 1) % 4 === i;
    if (isNextPlayer && !discardedTile.honor) {
      // 数牌の場合のみチー可能
      const chiPossible = checkChiPossibility(player.hand.tiles, discardedTile);
      if (chiPossible) {
        const shouldChi = player.type === 'cpu' ? shouldCpuCallChi(player, discardedTile, gameState) : true;
        if (shouldChi) {
          opportunities.chi = true;
          logWithTime(`✅ [CHI] プレイヤー${i}がチー可能: ${discardedTile.displayName}`);
        }
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
    // ツモ牌は末尾に保持するため、ソートしない
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
    
    // 14枚持っているCPUプレイヤーを検索（緊急時の補正）
    for (let i = 0; i < 4; i++) {
      const player = currentState.players[i];
      if (player.type === 'cpu' && player.hand.tiles.length === 14) {
        console.log(`🚨 [EMERGENCY] CPU${i}(${player.name})が14枚保持 - 強制実行`);
        currentState.currentPlayer = i;
        break;
      }
    }
    
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
        // ツモ牌は末尾に保持するため、ソートしない
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
        
        console.log(`🤖 [DEBUG] CPUが戦略的打牌を実行（現在${currentPlayer.hand.tiles.length}枚）`);
        const tileToDiscard = selectBestDiscardTile(currentPlayer, gameState);
        
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

// =====================================
// AI戦略的打牌システム
// =====================================

// CPUの最適な捨て牌を選択
function selectBestDiscardTile(player, gameState) {
  logWithTime(`🧠 [AI] ${player.name}の戦略的打牌分析開始`);
  
  const handTiles = player.hand.tiles;
  const candidates = [];
  
  // 各牌について捨て牌価値を評価
  for (let i = 0; i < handTiles.length; i++) {
    const tile = handTiles[i];
    const score = evaluateDiscardTile(tile, handTiles, player, gameState);
    candidates.push({
      tile: tile,
      index: i,
      score: score
    });
  }
  
  // スコアでソート（高いほど捨てやすい）
  candidates.sort((a, b) => b.score - a.score);
  
  const bestCandidate = candidates[0];
  logWithTime(`🧠 [AI] ${player.name}の選択: ${bestCandidate.tile.displayName} (スコア: ${bestCandidate.score})`);
  
  return bestCandidate.tile;
}

// 捨て牌の評価スコア計算
function evaluateDiscardTile(tile, handTiles, player, gameState) {
  let score = 0;
  
  // 1. 孤立牌の優先度を上げる（捨てやすい）
  score += evaluateIsolationValue(tile, handTiles) * 100;
  
  // 2. 危険牌の評価（他プレイヤーに当たりやすい牌は避ける）
  score += evaluateDangerLevel(tile, gameState) * 50;
  
  // 3. 手牌効率の評価（面子構成に不要な牌）
  score += evaluateHandEfficiency(tile, handTiles) * 80;
  
  // 4. 字牌の評価
  score += evaluateHonorTiles(tile, player, gameState) * 60;
  
  // 5. ドラの評価（ドラは基本的に残したい）
  score += evaluateDoraValue(tile, gameState) * -150;
  
  return score;
}

// 孤立牌の評価（周囲に関連牌がない牌は捨てやすい）
function evaluateIsolationValue(tile, handTiles) {
  if (tile.suit === 'honors') {
    // 字牌の場合、同種牌の数で判定
    const sameCount = handTiles.filter(t => isSameTileType(t, tile)).length;
    return sameCount === 1 ? 10 : -sameCount * 2; // 1枚なら孤立、複数あれば価値あり
  }
  
  // 数牌の場合、前後の牌があるかチェック
  let connectionCount = 0;
  const rank = tile.rank;
  const suit = tile.suit;
  
  // 前後2段階まで関連牌をチェック
  for (let offset = -2; offset <= 2; offset++) {
    if (offset === 0) continue;
    const targetRank = rank + offset;
    if (targetRank >= 1 && targetRank <= 9) {
      const hasRelated = handTiles.some(t => t.suit === suit && t.rank === targetRank);
      if (hasRelated) connectionCount++;
    }
  }
  
  // 関連牌が少ないほど孤立度が高い
  return Math.max(0, 5 - connectionCount);
}

// 危険牌レベルの評価
function evaluateDangerLevel(tile, gameState) {
  let dangerScore = 0;
  
  // 他プレイヤーの捨て牌を確認
  for (const player of gameState.players) {
    if (!player.discards) continue;
    
    // 同種牌が既に捨てられている場合は比較的安全
    const alreadyDiscarded = player.discards.some(d => isSameTileType(d, tile));
    if (alreadyDiscarded) {
      dangerScore += 2; // 安全度アップ
    }
    
    // リーチプレイヤーがいる場合の危険度評価
    if (player.hand.riichi) {
      // 中張牌（2-8）は危険度高め
      if (tile.suit !== 'honors' && tile.rank >= 2 && tile.rank <= 8) {
        dangerScore -= 3;
      }
      // 1,9牌と字牌は比較的安全
      if (tile.suit === 'honors' || tile.rank === 1 || tile.rank === 9) {
        dangerScore += 1;
      }
    }
  }
  
  return dangerScore;
}

// 手牌効率の評価
function evaluateHandEfficiency(tile, handTiles) {
  // この牌を除いた手牌で面子候補がいくつ作れるかを評価
  const remainingTiles = handTiles.filter(t => t.id !== tile.id);
  const mentsuCandidates = countMentsuCandidates(remainingTiles);
  
  // 面子候補が多いほど、この牌は不要（捨てやすい）
  return mentsuCandidates;
}

// 面子候補の数をカウント
function countMentsuCandidates(tiles) {
  let candidates = 0;
  
  // 対子・刻子候補
  const tileCounts = {};
  for (const tile of tiles) {
    const key = `${tile.suit}_${tile.rank}`;
    tileCounts[key] = (tileCounts[key] || 0) + 1;
  }
  
  for (const count of Object.values(tileCounts)) {
    if (count >= 2) candidates += Math.floor(count / 2);
  }
  
  // 順子候補（数牌のみ）
  for (const tile of tiles) {
    if (tile.suit === 'honors') continue;
    
    let sequenceLength = 1;
    let currentRank = tile.rank;
    
    // 連続する牌をカウント
    while (currentRank < 9) {
      const nextExists = tiles.some(t => t.suit === tile.suit && t.rank === currentRank + 1);
      if (!nextExists) break;
      sequenceLength++;
      currentRank++;
    }
    
    if (sequenceLength >= 3) {
      candidates += Math.floor(sequenceLength / 3);
    }
  }
  
  return candidates;
}

// 字牌の特別評価
function evaluateHonorTiles(tile, player, gameState) {
  if (tile.suit !== 'honors') return 0;
  
  let honorScore = 0;
  
  // 役牌（三元牌）は価値が高い
  if (tile.rank >= 5) { // 白=5, 發=6, 中=7
    honorScore -= 2; // 残したい
  }
  
  // 自風・場風は価値が高い
  const isPlayerWind = (tile.rank === 1 && player.wind === 'east') ||
                      (tile.rank === 2 && player.wind === 'south') ||
                      (tile.rank === 3 && player.wind === 'west') ||
                      (tile.rank === 4 && player.wind === 'north');
  
  if (isPlayerWind) {
    honorScore -= 1; // 残したい
  }
  
  return honorScore;
}

// ドラの評価
function evaluateDoraValue(tile, gameState) {
  if (!gameState.dora) return 0;
  
  // ドラ表示牌から実際のドラを判定
  const doraIndicator = gameState.dora;
  let actualDora;
  
  if (doraIndicator.suit === 'honors') {
    // 字牌の場合
    if (doraIndicator.rank <= 4) {
      // 風牌: 東→南→西→北→東...
      actualDora = { suit: 'honors', rank: (doraIndicator.rank % 4) + 1 };
    } else {
      // 三元牌: 白→發→中→白...
      actualDora = { suit: 'honors', rank: ((doraIndicator.rank - 5) % 3) + 5 };
    }
  } else {
    // 数牌の場合: 9→1, その他は+1
    actualDora = {
      suit: doraIndicator.suit,
      rank: doraIndicator.rank === 9 ? 1 : doraIndicator.rank + 1
    };
  }
  
  // このタイルがドラかチェック
  if (tile.suit === actualDora.suit && tile.rank === actualDora.rank) {
    return 1; // ドラなので残したい（負のスコア）
  }
  
  return 0;
}

// CPUメルド判定関数
function shouldCpuCallPon(player, discardedTile, gameState) {
  // 役牌の場合は積極的にポン
  if (discardedTile.suit === 'honors') {
    if (discardedTile.rank >= 5) return true; // 三元牌
    
    // 自風・場風の場合
    const isPlayerWind = (discardedTile.rank === 1 && player.wind === 'east') ||
                        (discardedTile.rank === 2 && player.wind === 'south') ||
                        (discardedTile.rank === 3 && player.wind === 'west') ||
                        (discardedTile.rank === 4 && player.wind === 'north');
    if (isPlayerWind) return true;
  }
  
  // テンパイに近い場合は慎重に
  const tenpaiResult = isNearTenpai(player.hand.tiles, player.hand.melds);
  if (tenpaiResult.isClose) {
    return Math.random() < 0.3; // 30%の確率でポン
  }
  
  // 通常は50%の確率でポン
  return Math.random() < 0.5;
}

function shouldCpuCallChi(player, discardedTile, gameState) {
  // チーは手牌効率を重視
  const efficiency = evaluateChiEfficiency(player.hand.tiles, discardedTile);
  
  // 効率が良い場合のみチー
  return efficiency > 0.6;
}

function shouldCpuCallKan(player, discardedTile, gameState) {
  // 役牌カンは積極的
  if (discardedTile.suit === 'honors' && discardedTile.rank >= 5) {
    return true;
  }
  
  // ドラの場合も積極的
  if (isDiscardedTileDora(discardedTile, gameState)) {
    return true;
  }
  
  // 通常は30%の確率
  return Math.random() < 0.3;
}

// テンパイに近いかチェック
function isNearTenpai(tiles, melds) {
  // 簡易的な判定
  const totalTiles = tiles.length + (melds.length * 3);
  if (totalTiles < 11) return { isClose: false };
  
  // 面子候補の数で判定
  const candidates = countMentsuCandidates(tiles);
  return { isClose: candidates >= 3 };
}

// チーの効率性評価
function evaluateChiEfficiency(tiles, discardedTile) {
  // この牌をチーした場合の手牌効率を計算
  // 簡易版：中張牌（4-6）は効率が良い
  if (discardedTile.suit !== 'honors' && 
      discardedTile.rank >= 4 && discardedTile.rank <= 6) {
    return 0.8;
  }
  
  return 0.4;
}

// ドラかどうかチェック
function isDiscardedTileDora(tile, gameState) {
  if (!gameState.dora) return false;
  
  const doraIndicator = gameState.dora;
  let actualDora;
  
  if (doraIndicator.suit === 'honors') {
    if (doraIndicator.rank <= 4) {
      actualDora = { suit: 'honors', rank: (doraIndicator.rank % 4) + 1 };
    } else {
      actualDora = { suit: 'honors', rank: ((doraIndicator.rank - 5) % 3) + 5 };
    }
  } else {
    actualDora = {
      suit: doraIndicator.suit,
      rank: doraIndicator.rank === 9 ? 1 : doraIndicator.rank + 1
    };
  }
  
  return tile.suit === actualDora.suit && tile.rank === actualDora.rank;
}

// =====================================
// 局・半荘管理システム
// =====================================

// 点数移動計算
function calculateScoreChanges(gameState, winnerId, score, isTsumo, discardPlayerId = null) {
  const changes = {};
  const isParent = gameState.players[winnerId].wind === 'east';
  
  // 全プレイヤーの変動を初期化
  for (let i = 0; i < 4; i++) {
    changes[i] = 0;
  }
  
  if (isTsumo) {
    // ツモの場合：全員から支払い
    const payments = score.payments;
    changes[winnerId] = payments.winner; // 和了者が受け取る
    
    for (let i = 0; i < 4; i++) {
      if (i !== winnerId) {
        changes[i] = -payments.others; // 他者が支払い
      }
    }
  } else {
    // ロンの場合：放銃者のみが支払い
    changes[winnerId] = score.total;
    changes[discardPlayerId] = -score.total;
  }
  
  // 本場代・供託を加算
  if (gameState.honba > 0) {
    const honbaBonus = gameState.honba * 300;
    changes[winnerId] += honbaBonus;
    
    if (isTsumo) {
      // ツモの場合：全員から100点ずつ
      for (let i = 0; i < 4; i++) {
        if (i !== winnerId) {
          changes[i] -= 100 * gameState.honba;
        }
      }
    } else {
      // ロンの場合：放銃者のみ
      changes[discardPlayerId] -= honbaBonus;
    }
  }
  
  // 供託（リーチ棒）を加算
  if (gameState.kyotaku > 0) {
    changes[winnerId] += gameState.kyotaku * 1000;
  }
  
  return changes;
}

// 点数変動を適用
function applyScoreChanges(gameState, scoreChanges) {
  for (let i = 0; i < 4; i++) {
    gameState.players[i].score += scoreChanges[i];
    logWithTime(`💰 [SCORE] ${gameState.players[i].name}: ${scoreChanges[i] >= 0 ? '+' : ''}${scoreChanges[i]}点 (合計: ${gameState.players[i].score}点)`);
  }
}

// 局終了処理
function processRoundEnd(socket, gameState, roundResult) {
  logWithTime(`🏁 [ROUND END] ${gameState.wind}${gameState.roundNumber}局 ${gameState.honba}本場終了`);
  
  // 連荘判定（親が和了した場合）
  const isRenchan = roundResult.winner === gameState.dealer;
  
  if (isRenchan) {
    logWithTime(`🔄 [RENCHAN] 親の和了により連荘`);
    gameState.honba++; // 本場数を増やす
  } else {
    // 親流れ
    logWithTime(`👑 [DEALER CHANGE] 親流れ`);
    gameState.dealer = (gameState.dealer + 1) % 4;
    gameState.roundNumber++;
    gameState.honba = 0;
    
    // 風牌の更新
    updatePlayerWinds(gameState);
  }
  
  // リーチ棒をクリア（和了者が獲得済み）
  gameState.kyotaku = 0;
  
  // ゲーム終了判定
  if (checkGameEnd(gameState)) {
    logWithTime(`🎊 [GAME END] ゲーム終了`);
    finishGame(socket, gameState);
  } else {
    // 次局開始
    logWithTime(`🆕 [NEW ROUND] 次局開始: ${gameState.wind}${gameState.roundNumber}局`);
    startNewRound(socket, gameState);
  }
}

// 風牌の更新
function updatePlayerWinds(gameState) {
  const winds = ['east', 'south', 'west', 'north'];
  for (let i = 0; i < 4; i++) {
    const windIndex = (i - gameState.dealer + 4) % 4;
    gameState.players[i].wind = winds[windIndex];
  }
}

// ゲーム終了判定
function checkGameEnd(gameState) {
  // 半荘の場合：南4局終了で終了
  if (gameState.gameType === 'hanchan') {
    if (gameState.wind === 'south' && gameState.roundNumber > 4) {
      return true;
    }
    // 東場の場合、南場に移行
    if (gameState.wind === 'east' && gameState.roundNumber > 4) {
      gameState.wind = 'south';
      gameState.roundNumber = 1;
      gameState.dealer = 0; // 起家に戻る
      updatePlayerWinds(gameState);
      return false;
    }
  }
  
  // 東風戦の場合：東4局終了で終了
  if (gameState.gameType === 'tonpuu' && gameState.roundNumber > 4) {
    return true;
  }
  
  // 誰かが0点以下になった場合
  const hasNegativeScore = gameState.players.some(player => player.score < 0);
  if (hasNegativeScore) {
    logWithTime(`⚠️ [GAME END] 誰かが0点以下になったため終了`);
    return true;
  }
  
  return false;
}

// 新しい局の開始
function startNewRound(socket, gameState) {
  // 牌山を再生成
  const tiles = createTiles();
  
  // シャッフル
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  
  // プレイヤーの手牌をリセット
  for (let i = 0; i < 4; i++) {
    const player = gameState.players[i];
    
    // 手牌をクリア
    player.hand.tiles = [];
    player.hand.discards = [];
    player.hand.melds = [];
    player.hand.riichi = false;
    
    // 配牌
    const tileCount = i === gameState.dealer ? 14 : 13;
    player.hand.tiles = sortHand(tiles.splice(0, tileCount));
    
    logWithTime(`🀄 [NEW ROUND] ${player.name}に${tileCount}枚配牌`);
  }
  
  // ゲーム状態更新
  gameState.wallTiles = tiles;
  gameState.remainingTiles = tiles.length;
  gameState.dora = tiles[0] || null;
  gameState.currentPlayer = gameState.dealer;
  gameState.phase = 'playing';
  gameState.lastDiscard = null;
  gameState.lastDiscardPlayer = null;
  
  logWithTime(`🎲 [NEW ROUND] 新ドラ表示牌: ${tiles[0]?.displayName || 'なし'}`);
  
  // 全プレイヤーに新局状態を送信
  games.set(socket.gameId, gameState);
  io.to(socket.gameId).emit('gameState', gameState);
  io.to(socket.gameId).emit('newRound', {
    wind: gameState.wind,
    roundNumber: gameState.roundNumber,
    dealer: gameState.dealer,
    honba: gameState.honba
  });
  
  // CPU自動モードを再開
  gameState.cpuAutoMode = true;
  startCpuAutoGame(gameState, socket.gameId);
}

// ゲーム終了処理
function finishGame(socket, gameState) {
  gameState.phase = 'finished';
  
  // 最終順位計算
  const finalRanking = [...gameState.players]
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      rank: index + 1,
      playerId: player.id,
      name: player.name,
      score: player.score
    }));
  
  logWithTime(`🏆 [FINAL RANKING] 最終結果:`);
  finalRanking.forEach(result => {
    logWithTime(`${result.rank}位: ${result.name} (${result.score}点)`);
  });
  
  const gameEndData = {
    finalRanking: finalRanking,
    roundResults: gameState.roundResults,
    gameType: gameState.gameType,
    totalRounds: gameState.roundResults.length
  };
  
  games.set(socket.gameId, gameState);
  io.to(socket.gameId).emit('gameState', gameState);
  io.to(socket.gameId).emit('gameEnd', gameEndData);
}

server.listen(PORT, () => {
  console.log(`🀄 麻雀ゲームサーバーがポート ${PORT} で起動しました`);
  console.log(`🌐 http://localhost:${PORT} でアクセスできます`);
  console.log(`📊 ヘルスチェック: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.IO接続待機中...`);
});