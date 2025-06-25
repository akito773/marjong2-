const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// オンライン麻雀用のデータ構造
const rooms = new Map(); // 部屋管理
const users = new Map(); // ユーザー管理
const roomIdCounter = { current: 1000 }; // 部屋ID管理

// CPU名前とキャラクター設定（高度AI 15キャラクター）
const CPU_CHARACTERS = [
    // 1. 守備型：安全第一
    { 
        name: '守備の武', 
        nickname: 'タケシ',
        personality: 'defensive', 
        description: '安全牌しか切らない超守備型。放銃を絶対に避ける慎重派',
        priority: { safety: 10, efficiency: 3, yaku: 2, speed: 1, aggression: 0 },
        behavior: { riichiThreshold: 0.9, meldFrequency: 0.15, dangerAvoidance: 0.95, foldThreshold: 0.3 },
        catchphrase: '安全第一だ！'
    },
    // 2. 攻撃型：役満狙い
    { 
        name: '攻撃の明', 
        nickname: 'アキラ',
        personality: 'aggressive', 
        description: '役満・跳満狙いの超攻撃型。危険を顧みず大きな役を狙う',
        priority: { safety: 1, efficiency: 5, yaku: 10, speed: 3, aggression: 10 },
        behavior: { riichiThreshold: 0.3, meldFrequency: 0.85, dangerAvoidance: 0.2, foldThreshold: 0.9 },
        catchphrase: '行くぞ、大きく行くぞ！'
    },
    // 3. バランス型：効率重視
    { 
        name: 'バランスの聡', 
        nickname: 'サトシ',
        personality: 'balanced', 
        description: '効率とリスクのバランスを重視する万能型',
        priority: { safety: 6, efficiency: 8, yaku: 5, speed: 6, aggression: 5 },
        behavior: { riichiThreshold: 0.6, meldFrequency: 0.5, dangerAvoidance: 0.6, foldThreshold: 0.5 },
        catchphrase: 'バランスが大事だ'
    },
    // 4. スピード型：速攻
    { 
        name: 'スピードの雪', 
        nickname: 'ユキ',
        personality: 'risky', 
        description: '一刻も早い和了を目指すスピード重視型',
        priority: { safety: 3, efficiency: 7, yaku: 2, speed: 10, aggression: 7 },
        behavior: { riichiThreshold: 0.4, meldFrequency: 0.7, dangerAvoidance: 0.3, foldThreshold: 0.7 },
        catchphrase: '早く、早く！'
    },
    // 5. 役師型：高得点役
    { 
        name: '役師の花', 
        nickname: 'ハナ',
        personality: 'balanced', 
        description: '美しい役作りを追求する完璧主義者',
        priority: { safety: 5, efficiency: 6, yaku: 9, speed: 2, aggression: 4 },
        behavior: { riichiThreshold: 0.7, meldFrequency: 0.3, dangerAvoidance: 0.7, foldThreshold: 0.4 },
        catchphrase: '美しい役を作ろう'
    },
    // 6. 強運型：運任せ
    { 
        name: '強運の太郎', 
        nickname: 'タロウ',
        personality: 'risky', 
        description: '運とツキを信じる楽天家',
        priority: { safety: 2, efficiency: 4, yaku: 6, speed: 5, aggression: 8 },
        behavior: { riichiThreshold: 0.5, meldFrequency: 0.6, dangerAvoidance: 0.1, foldThreshold: 0.8 },
        catchphrase: '運が味方してくれる！'
    },
    // 7. 忍耐型：待ちの美学
    { 
        name: '忍耐の次郎', 
        nickname: 'ジロウ',
        personality: 'defensive', 
        description: 'じっくりと好機を待つ我慢強い戦法',
        priority: { safety: 8, efficiency: 5, yaku: 7, speed: 1, aggression: 2 },
        behavior: { riichiThreshold: 0.8, meldFrequency: 0.25, dangerAvoidance: 0.8, foldThreshold: 0.3 },
        catchphrase: '待つのも戦略だ'
    },
    // 8. 柔軟型：適応力
    { 
        name: '柔軟の美来', 
        nickname: 'ミク',
        personality: 'balanced', 
        description: '状況に応じて戦術を変える適応型',
        priority: { safety: 5, efficiency: 7, yaku: 6, speed: 5, aggression: 6 },
        behavior: { riichiThreshold: 0.55, meldFrequency: 0.55, dangerAvoidance: 0.55, foldThreshold: 0.45 },
        catchphrase: '状況に合わせて行こう'
    },
    // 9. 門前型：職人気質
    { 
        name: '門前の弘治', 
        nickname: 'コウジ',
        personality: 'defensive', 
        description: '門前清自摸和を愛する職人',
        priority: { safety: 7, efficiency: 6, yaku: 8, speed: 2, aggression: 3 },
        behavior: { riichiThreshold: 0.6, meldFrequency: 0.1, dangerAvoidance: 0.75, foldThreshold: 0.4 },
        catchphrase: '門前の美しさを見せよう'
    },
    // 10. 初心者型：天然キャラ
    { 
        name: '初心者のナナ', 
        nickname: 'ナナ',
        personality: 'risky', 
        description: '不安定だが愛されキャラの初心者',
        priority: { safety: 3, efficiency: 2, yaku: 4, speed: 6, aggression: 5 },
        behavior: { riichiThreshold: 0.3, meldFrequency: 0.8, dangerAvoidance: 0.2, foldThreshold: 0.6 },
        catchphrase: 'えーっと、これで良いのかな？'
    },
    // 11. 研究型：理論派
    { 
        name: '研究者の賢治', 
        nickname: 'ケンジ',
        personality: 'balanced', 
        description: 'データと理論に基づく合理的判断',
        priority: { safety: 6, efficiency: 9, yaku: 5, speed: 4, aggression: 4 },
        behavior: { riichiThreshold: 0.65, meldFrequency: 0.4, dangerAvoidance: 0.7, foldThreshold: 0.5 },
        catchphrase: '理論的に考えよう'
    },
    // 12. 職人型：平和特化
    { 
        name: '職人のイチロー', 
        nickname: 'イチロー',
        personality: 'defensive', 
        description: '平和一筋の頑固職人',
        priority: { safety: 9, efficiency: 7, yaku: 6, speed: 2, aggression: 1 },
        behavior: { riichiThreshold: 0.8, meldFrequency: 0.05, dangerAvoidance: 0.9, foldThreshold: 0.2 },
        catchphrase: '平和こそ至高だ'
    },
    // 13. ギャンブラー型：一発逆転
    { 
        name: 'ギャンブラーの蘭', 
        nickname: 'ラン',
        personality: 'risky', 
        description: 'リスクを愛するギャンブラー',
        priority: { safety: 1, efficiency: 3, yaku: 8, speed: 7, aggression: 10 },
        behavior: { riichiThreshold: 0.2, meldFrequency: 0.9, dangerAvoidance: 0.1, foldThreshold: 0.95 },
        catchphrase: 'リスクこそチャンス！'
    },
    // 14. 老練型：経験重視
    { 
        name: '老練のゴロー', 
        nickname: 'ゴロー',
        personality: 'balanced', 
        description: '豊富な経験に基づく老練な判断',
        priority: { safety: 7, efficiency: 6, yaku: 7, speed: 3, aggression: 5 },
        behavior: { riichiThreshold: 0.7, meldFrequency: 0.45, dangerAvoidance: 0.75, foldThreshold: 0.4 },
        catchphrase: '経験がものを言う'
    },
    // 15. AI型：完璧計算
    { 
        name: 'AI-ZERO', 
        nickname: 'ゼロ',
        personality: 'balanced', 
        description: '完璧な計算に基づく人工知能',
        priority: { safety: 8, efficiency: 10, yaku: 6, speed: 5, aggression: 6 },
        behavior: { riichiThreshold: 0.75, meldFrequency: 0.6, dangerAvoidance: 0.8, foldThreshold: 0.35 },
        catchphrase: '最適解を算出しました'
    }
];

// 部屋状態の定義
const ROOM_STATUS = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
};

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

// 部屋一覧取得API
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    status: room.status,
    playerCount: room.players.filter(p => p.type === 'human').length,
    maxPlayers: 4,
    created: room.created,
    owner: room.owner
  }));
  
  res.json({
    status: 'OK',
    rooms: roomList
  });
});

// 部屋作成API
app.post('/api/rooms', (req, res) => {
  const { roomName, playerName } = req.body;
  
  if (!roomName || !playerName) {
    return res.status(400).json({
      status: 'Error',
      message: '部屋名とプレイヤー名が必要です'
    });
  }

  const roomId = (roomIdCounter.current++).toString();
  const room = createRoom(roomId, roomName, playerName);
  
  res.json({
    status: 'OK',
    room: {
      id: room.id,
      name: room.name,
      status: room.status,
      playerCount: room.players.filter(p => p.type === 'human').length
    }
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

function logWithTime(message, roomId = null) {
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
  const roomPrefix = roomId ? `[ROOM ${roomId}] ` : '';
  const logMessage = `[${timestamp}] ${roomPrefix}${message}`;
  console.log(logMessage);
  
  // ファイルにも出力
  try {
    fs.appendFileSync('game.log', logMessage + '\n');
  } catch (err) {
    console.error('ログファイル書き込みエラー:', err);
  }
}

// 古いSocket.IOハンドラーは削除済み - 統合版ハンドラーを下部で実装

// アクションハンドラー関数
function handleDiscard(socket, gameState, data) {
  try {
    const roomId = gameState.gameId || socket.gameId;
    logWithTime(`🔥 [DISCARD] handleDiscard関数が呼ばれました！`, roomId);
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
    
    // 捨て牌後、CPU自動モードを再開（メルド機会がない場合）
    if (gameState.phase === 'discard') {
      gameState.phase = 'playing';
      gameState.cpuAutoMode = true;
      logWithTime(`🔄 [TURN] メルド後の捨て牌完了 - CPU自動モード再開`);
      
      // CPU自動対戦を即座に再開
      setTimeout(() => {
        logWithTime(`🤖 [AUTO RESTART] CPU自動対戦を再開します`);
        startCpuAutoGame(socket.gameId);
      }, 1000);
    } else {
      // 通常の捨て牌後もCPU自動モードを再開（ただし、メルド機会チェック後に判断）
      logWithTime(`🔄 [TURN] 通常捨て牌完了 - メルド機会チェック後にCPU自動再開予定`);
      
      // メルド機会がなければCPU自動を再開
      setTimeout(() => {
        if (gameState.cpuAutoMode === false) {
          // メルド機会で停止していた場合のみ条件確認
          const hasActiveMeldOpportunity = checkIfMeldOpportunityActive(gameState);
          if (!hasActiveMeldOpportunity) {
            gameState.cpuAutoMode = true;
            logWithTime(`🤖 [AUTO RESTART] メルド機会終了 - CPU自動対戦を再開します`);
            startCpuAutoGame(socket.gameId);
          }
        } else {
          // 既にCPU自動が有効な場合は継続
          logWithTime(`🤖 [AUTO CONTINUE] CPU自動対戦を継続します`);
          if (!isCpuAutoRunning(socket.gameId)) {
            startCpuAutoGame(socket.gameId);
          }
        }
      }, 500);
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
  const roomId = gameState.gameId || socket.gameId;
  logWithTime(`🔍 [MELD CHECK] メルド可能性チェック開始: ${discardedTile.displayName || discardedTile.unicode}`, roomId);
  
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
      const shouldPon = player.type === 'cpu' ? shouldCpuCallMeld(player, 'pon', discardedTile, gameState) : true;
      if (shouldPon) {
        opportunities.pon = true;
        logWithTime(`✅ [PON] プレイヤー${i}がポン可能: ${discardedTile.displayName}`);
      }
    }
    if (sameTypeCount >= 3) {
      const shouldKan = player.type === 'cpu' ? shouldCpuCallMeld(player, 'kan', discardedTile, gameState) : true;
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
        const shouldChi = player.type === 'cpu' ? shouldCpuCallMeld(player, 'chi', discardedTile, gameState) : true;
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

// メルド機会が現在アクティブかチェック
function checkIfMeldOpportunityActive(gameState) {
  // 簡単な判定：最後の捨て牌から一定時間経過したか、メルド待ちフラグがあるか
  return false; // 実装簡素化：常にfalse（メルド機会は短時間で終了と仮定）
}

// CPU自動が現在実行中かチェック
function isCpuAutoRunning(gameId) {
  // 実装簡素化：startCpuAutoGameで管理されるため、常にfalse
  return false;
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
  } else {
    // 牌が尽きた場合は流局処理
    logWithTime(`🌊 [RYUKYOKU] 牌が尽きたため流局`);
    handleRyukyoku(socket, gameState);
  }
}

// 流局処理
function handleRyukyoku(socket, gameState) {
  logWithTime(`🌊 [RYUKYOKU] 流局処理開始`);
  
  // テンパイ判定
  const tempaiiPlayers = [];
  const notenPlayers = [];
  
  for (let i = 0; i < 4; i++) {
    const player = gameState.players[i];
    const isTemplaii = checkTempai(player.hand.tiles, player.hand.melds);
    
    if (isTemplaii) {
      tempaiiPlayers.push(i);
      logWithTime(`✅ [TEMPAI] プレイヤー${i}(${player.name}): テンパイ`);
    } else {
      notenPlayers.push(i);
      logWithTime(`❌ [NOTEN] プレイヤー${i}(${player.name}): ノーテン`);
    }
  }
  
  // ノーテン罰符の計算と支払い
  if (tempaiiPlayers.length > 0 && notenPlayers.length > 0) {
    const totalPenalty = 3000;
    const penaltyPerNoten = Math.floor(totalPenalty / notenPlayers.length);
    const bonusPerTempai = Math.floor(totalPenalty / tempaiiPlayers.length);
    
    // ノーテン者から徴収
    notenPlayers.forEach(playerId => {
      gameState.players[playerId].score -= penaltyPerNoten;
      logWithTime(`💰 [NOTEN PENALTY] プレイヤー${playerId}: -${penaltyPerNoten}点`);
    });
    
    // テンパイ者に支払い
    tempaiiPlayers.forEach(playerId => {
      gameState.players[playerId].score += bonusPerTempai;
      logWithTime(`💰 [TEMPAI BONUS] プレイヤー${playerId}: +${bonusPerTempai}点`);
    });
  }
  
  // 親の連荘・流れ判定
  const dealerIsTempai = tempaiiPlayers.includes(gameState.dealer);
  const isRenchan = dealerIsTempai;
  
  if (isRenchan) {
    // 親がテンパイの場合は連荘
    logWithTime(`🔄 [RENCHAN] 親がテンパイのため連荘`);
    gameState.honba++; // 本場数を増やす
  } else {
    // 親がノーテンの場合は親流れ
    logWithTime(`👑 [DEALER CHANGE] 親がノーテンのため親流れ`);
    gameState.dealer = (gameState.dealer + 1) % 4;
    gameState.roundNumber++;
    gameState.honba++; // 流局でも本場は増える（流れ本場）
    
    // 風牌の更新
    updatePlayerWinds(gameState);
  }
  
  // リーチ棒は次局に持ち越し（クリアしない）
  logWithTime(`🎯 [KYOTAKU] リーチ棒${gameState.kyotaku}本は次局に持ち越し`);
  
  // 流局結果をクライアントに送信
  const ryukyokuResult = {
    type: 'ryukyoku',
    tempaiiPlayers: tempaiiPlayers,
    notenPlayers: notenPlayers,
    isRenchan: isRenchan,
    newDealer: gameState.dealer,
    honba: gameState.honba,
    scores: gameState.players.map(p => p.score)
  };
  
  io.to(socket.gameId).emit('roundResult', ryukyokuResult);
  
  // ゲーム終了判定
  if (checkGameEnd(gameState)) {
    logWithTime(`🎊 [GAME END] ゲーム終了`);
    finishGame(socket, gameState);
  } else {
    // 次局開始（少し遅延を入れる）
    setTimeout(() => {
      logWithTime(`🆕 [NEW ROUND] 次局開始: ${gameState.wind}${gameState.roundNumber}局${gameState.honba}本場`);
      startNewRound(socket, gameState);
    }, 3000);
  }
}

// テンパイ判定（簡易版）
function checkTempai(handTiles, melds = []) {
  // 13枚でない場合はテンパイではない（通常は14枚だが、捨て牌前の状態）
  if (handTiles.length !== 13) {
    return false;
  }
  
  // 簡易的な判定：1シャンテンかどうかをチェック
  // 実際の実装では、各牌を仮想的に加えて和了形になるかチェック
  
  // 牌の種類ごとに分類
  const tileCounts = {};
  handTiles.forEach(tile => {
    const key = `${tile.suit}_${tile.rank}_${tile.honor}`;
    tileCounts[key] = (tileCounts[key] || 0) + 1;
  });
  
  // 対子（雀頭）候補の数をチェック
  const pairs = Object.values(tileCounts).filter(count => count >= 2).length;
  
  // 簡易判定：対子があれば一応テンパイの可能性ありとする
  return pairs > 0;
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
    logWithTime(`🤖 [DEBUG] cpuTurn called`, gameId);
    
    if (!games.has(gameId)) {
      logWithTime(`🤖 [DEBUG] ゲームが存在しません: ${gameId}`, gameId);
      return;
    }
    
    const currentState = games.get(gameId);
    if (!currentState.cpuAutoMode) {
      logWithTime(`🤖 [DEBUG] CPU自動モードが停止されました`, gameId);
      return;
    }
    
    logWithTime(`🤖 [DEBUG] currentPlayer: ${currentState.currentPlayer}`, gameId);
    
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
    logWithTime(`🤖 [DEBUG] currentPlayer type: ${currentPlayer.type}`, gameId);
    logWithTime(`🤖 [DEBUG] currentPlayer name: ${currentPlayer.name}`, gameId);
    logWithTime(`🤖 [DEBUG] currentPlayer tiles count: ${currentPlayer.hand.tiles.length}`, gameId);
    
    // プレイヤータイプに関係なく、手牌が適切な枚数の場合は自動ツモ
    // 基本は13枚だが、メルドがある場合は減る（3枚メルド1個につき-3枚）
    const meldCount = currentPlayer.hand.melds ? currentPlayer.hand.melds.length : 0;
    const expectedTileCount = 13 - (meldCount * 3);
    
    logWithTime(`🔍 [MELD DEBUG] プレイヤー${currentState.currentPlayer}: メルド数=${meldCount}, 期待手牌数=${expectedTileCount}, 実際手牌数=${currentPlayer.hand.tiles.length}`, gameId);
    
    if (currentPlayer.hand.tiles.length === expectedTileCount) {
      logWithTime(`🎯 [DEBUG] プレイヤー${currentState.currentPlayer}(${currentPlayer.type})が自動ツモを実行（現在${currentPlayer.hand.tiles.length}枚）`, gameId);
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
        logWithTime(`👤 [DEBUG] 人間プレイヤーのターン（手牌${currentPlayer.hand.tiles.length}枚）- 捨て牌待ち`, gameId);
        // 人間プレイヤーの場合は次のターンをスケジュールしない（手動で捨て牌するまで待機）
        // ただし、人間プレイヤーのターンでもCPU自動は停止させない（メルド機会がある時のみ停止）
        logWithTime(`👤 [DEBUG] 人間プレイヤーのターン - CPU自動は継続待機中`, gameId);
        
        // 人間プレイヤーが捨て牌するまで一定間隔で状態をチェック
        setTimeout(() => {
          // ゲーム状態を再確認して、まだ同じプレイヤーのターンなら継続待機
          const currentState = games.get(gameId);
          if (currentState && currentState.cpuAutoMode && currentState.currentPlayer === currentPlayer.playerId) {
            // まだ同じ人間プレイヤーのターンなら再度チェック
            cpuTurn();
          }
        }, 2000); // 2秒後に再チェック
        return;
      }
    }
    
    // CPUプレイヤーの場合のみ次のターンをスケジュール
    setTimeout(cpuTurn, currentState.cpuAutoSpeed || 1000);
  };
  
  logWithTime(`🤖 [DEBUG] 最初のCPUターンをスケジュール（${gameState.cpuAutoSpeed || 1000}ms後）`, gameId);
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
  
  // キャラクター特性を取得
  const character = CPU_CHARACTERS.find(c => c.name === player.name) || CPU_CHARACTERS[0];
  const priority = character.priority;
  const behavior = character.behavior;
  
  // 1. 孤立牌の優先度を上げる（捨てやすい）
  score += evaluateIsolationValue(tile, handTiles) * (100 * priority.efficiency / 10);
  
  // 2. 危険牌の評価（他プレイヤーに当たりやすい牌は避ける）
  const dangerWeight = behavior.dangerAvoidance * priority.safety * 50;
  score += evaluateDangerLevel(tile, gameState) * dangerWeight;
  
  // 3. 手牌効率の評価（面子構成に不要な牌）
  score += evaluateHandEfficiency(tile, handTiles) * (80 * priority.efficiency / 10);
  
  // 4. 字牌の評価
  score += evaluateHonorTiles(tile, player, gameState) * (60 * priority.yaku / 10);
  
  // 5. ドラの評価（ドラは基本的に残したい）
  const doraWeight = -150 * (priority.yaku + priority.efficiency) / 20;
  score += evaluateDoraValue(tile, gameState) * doraWeight;
  
  // 6. キャラクター特性による調整
  score = applyCharacterPersonality(score, tile, handTiles, player, gameState, character);
  
  return score;
}

// キャラクター特性による戦略調整
function applyCharacterPersonality(score, tile, handTiles, player, gameState, character) {
  const priority = character.priority;
  const behavior = character.behavior;
  
  // 安全性重視キャラクター（守備の武、職人のイチローなど）
  if (priority.safety >= 8) {
    // 現物牌を最優先
    if (isGenbutsuTile(tile, gameState)) {
      score += 500; // 大幅に優先度アップ
    }
    // リーチ者がいる場合、危険牌は絶対避ける
    if (hasRiichiPlayer(gameState) && isDangerousTile(tile, gameState)) {
      score -= 1000; // 大幅に優先度ダウン
    }
  }
  
  // 攻撃性重視キャラクター（攻撃の明、ギャンブラーの蘭など）
  if (priority.aggression >= 8) {
    // 危険牌でも役作りのためなら切る
    if (isYakuRelatedTile(tile, handTiles)) {
      score -= 200; // 役に関連する牌は残したい
    }
    // ドラ単騎待ちなどを狙う
    if (isDoraRelated(tile, gameState)) {
      score -= 300;
    }
  }
  
  // 効率重視キャラクター（研究者の賢治、AI-ZEROなど）
  if (priority.efficiency >= 9) {
    // 牌効率を最優先（シャンテン数を考慮）
    const efficiencyBonus = calculateTileEfficiency(tile, handTiles);
    score += efficiencyBonus * 100;
  }
  
  // 役重視キャラクター（役師の花、門前の弘治など）
  if (priority.yaku >= 8) {
    // 特定の役を狙いやすくする
    if (character.name === '門前の弘治' && hasMeldedTiles(player)) {
      // 門前役を狙うキャラは鳴きを嫌う
      score -= 200;
    }
    if (character.name === '役師の花' && isHighScoringYakuPossible(handTiles)) {
      // 高得点役の可能性がある牌は残す
      score -= 300;
    }
  }
  
  // スピード重視キャラクター（スピードの雪など）
  if (priority.speed >= 8) {
    // テンパイに近づく牌を優先
    if (isTempaiBuildingTile(tile, handTiles)) {
      score -= 150;
    }
  }
  
  return score;
}

// ヘルパー関数群
function isGenbutsuTile(tile, gameState) {
  // 現物判定の簡易実装
  return gameState.players.some(p => 
    p.hand.discards.some(d => isSameTileType(d, tile))
  );
}

function hasRiichiPlayer(gameState) {
  return gameState.players.some(p => p.hand.riichi);
}

function isDangerousTile(tile, gameState) {
  // 危険牌判定の簡易実装
  return false; // 実装簡素化
}

function isYakuRelatedTile(tile, handTiles) {
  // 役に関連する牌の判定
  return false; // 実装簡素化
}

function isDoraRelated(tile, gameState) {
  // ドラ関連の判定
  return gameState.dora && isSameTileType(tile, gameState.dora);
}

function calculateTileEfficiency(tile, handTiles) {
  // 牌効率計算の簡易実装
  return Math.random() * 10; // 実装簡素化
}

function hasMeldedTiles(player) {
  return player.hand.melds && player.hand.melds.length > 0;
}

function isHighScoringYakuPossible(handTiles) {
  // 高得点役の可能性判定
  return false; // 実装簡素化
}

function isTempaiBuildingTile(tile, handTiles) {
  // テンパイ構築に有効な牌の判定
  return false; // 実装簡素化
}

// CPU鳴き判定（キャラクター特性考慮）
function shouldCpuCallMeld(player, meldType, discardedTile, gameState) {
  const character = CPU_CHARACTERS.find(c => c.name === player.name) || CPU_CHARACTERS[0];
  const behavior = character.behavior;
  const priority = character.priority;
  
  // 基本鳴き頻度をベースに判定
  const baseProbability = behavior.meldFrequency;
  let adjustedProbability = baseProbability;
  
  // キャラクター特性による調整
  switch (meldType) {
    case 'chi':
      // チーは効率重視なら積極的
      if (priority.efficiency >= 8) adjustedProbability += 0.2;
      // 門前重視なら消極的
      if (character.name === '門前の弘治') adjustedProbability -= 0.8;
      // スピード重視なら積極的
      if (priority.speed >= 8) adjustedProbability += 0.3;
      break;
      
    case 'pon':
      // 役重視なら状況次第で積極的
      if (priority.yaku >= 8) adjustedProbability += 0.1;
      // 安全重視なら消極的（手牌が見える）
      if (priority.safety >= 8) adjustedProbability -= 0.2;
      break;
      
    case 'kan':
      // 攻撃的なキャラは積極的
      if (priority.aggression >= 8) adjustedProbability += 0.2;
      // 安全重視は消極的
      if (priority.safety >= 8) adjustedProbability -= 0.3;
      break;
  }
  
  // ゲーム状況による調整
  if (hasRiichiPlayer(gameState)) {
    // リーチ者がいる場合
    if (priority.safety >= 7) {
      adjustedProbability -= 0.4; // 安全重視は鳴きを控える
    } else if (priority.aggression >= 8) {
      adjustedProbability += 0.1; // 攻撃的は構わず鳴く
    }
  }
  
  // 確率で判定
  const shouldMeld = Math.random() < Math.max(0, Math.min(1, adjustedProbability));
  
  logWithTime(`🧠 [CPU MELD] ${player.name}: ${meldType} 判定=${shouldMeld} (確率:${adjustedProbability.toFixed(2)})`);
  
  return shouldMeld;
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
  startCpuAutoGame(socket.gameId);
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

// =====================
// オンライン麻雀関数群
// =====================

// 部屋作成
function createRoom(roomId, roomName, ownerName) {
  const room = {
    id: roomId,
    name: roomName,
    status: ROOM_STATUS.WAITING,
    owner: ownerName,
    created: new Date().toISOString(),
    players: [
      {
        id: generateUserId(),
        name: ownerName,
        type: 'human',
        socketId: null,
        ready: false,
        position: 0
      }
    ],
    gameState: null
  };
  
  // 人間プレイヤーが2人未満の場合、CPUを自動追加
  fillRoomWithCPU(room);
  
  rooms.set(roomId, room);
  console.log(`🏠 [ROOM CREATED] 部屋 "${roomName}" (ID: ${roomId}) が作成されました`);
  
  return room;
}

// CPUで部屋を埋める
function fillRoomWithCPU(room) {
  const humanCount = room.players.filter(p => p.type === 'human').length;
  const cpuNeeded = 4 - room.players.length;
  
  for (let i = 0; i < cpuNeeded; i++) {
    const cpuChar = CPU_CHARACTERS[i % CPU_CHARACTERS.length];
    const cpuPlayer = {
      id: `cpu_${Date.now()}_${i}`,
      name: cpuChar.name,
      type: 'cpu',
      personality: cpuChar.personality,
      description: cpuChar.description,
      socketId: null,
      ready: true,
      position: room.players.length
    };
    
    room.players.push(cpuPlayer);
    console.log(`🤖 [CPU ADDED] ${cpuChar.name} (${cpuChar.personality}) が部屋に参加`);
  }
}

// ユーザーID生成
function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 部屋参加
function joinRoom(roomId, playerName, socketId) {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, message: '部屋が見つかりません' };
  }
  
  if (room.status !== ROOM_STATUS.WAITING) {
    return { success: false, message: '部屋がゲーム中または終了しています' };
  }
  
  const humanPlayers = room.players.filter(p => p.type === 'human');
  if (humanPlayers.length >= 4) {
    return { success: false, message: '部屋が満室です' };
  }
  
  // 既存の人間プレイヤーを確認
  const existingPlayer = room.players.find(p => p.name === playerName && p.type === 'human');
  if (existingPlayer) {
    // 再接続の場合
    existingPlayer.socketId = socketId;
    console.log(`🔄 [RECONNECT] ${playerName} が部屋 ${roomId} に再接続`);
  } else {
    // 新規参加の場合、CPUを1人削除して人間プレイヤーを追加
    const cpuIndex = room.players.findIndex(p => p.type === 'cpu');
    if (cpuIndex !== -1) {
      const removedCpu = room.players.splice(cpuIndex, 1)[0];
      console.log(`🤖 [CPU REMOVED] ${removedCpu.name} が部屋から退出`);
    }
    
    const newPlayer = {
      id: generateUserId(),
      name: playerName,
      type: 'human',
      socketId: socketId,
      ready: false,
      position: room.players.length
    };
    
    room.players.push(newPlayer);
    console.log(`👤 [PLAYER JOINED] ${playerName} が部屋 ${roomId} に参加`);
  }
  
  return { success: true, room: room };
}

// プレイヤー準備完了
function setPlayerReady(roomId, socketId, ready) {
  const room = rooms.get(roomId);
  if (!room) return false;
  
  const player = room.players.find(p => p.socketId === socketId);
  if (!player) return false;
  
  player.ready = ready;
  console.log(`✅ [READY] ${player.name} の準備状態: ${ready ? '完了' : '未完了'}`);
  
  // 全人間プレイヤーが準備完了かチェック
  const humanPlayers = room.players.filter(p => p.type === 'human');
  const allReady = humanPlayers.every(p => p.ready);
  
  if (allReady && humanPlayers.length >= 1) {
    startRoomGame(room);
  }
  
  return true;
}

// 親決め（起家決め）- 2回のサイコロで決定
function determineInitialDealer(players) {
  logWithTime(`🎲 [DEALER SELECTION] 親決めを開始`);
  
  // 第1回目のサイコロ（仮東の人が振る）
  const firstRoll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
  const secondRoller = (firstRoll - 1) % 4;
  logWithTime(`🎲 [DICE 1] 第1回サイコロ: ${firstRoll} → プレイヤー${secondRoller}が第2回を振る`);
  
  // 第2回目のサイコロ（決まったプレイヤーが振る）
  const secondRoll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
  const dealer = (secondRoller + secondRoll - 1) % 4;
  logWithTime(`🎲 [DICE 2] 第2回サイコロ: ${secondRoll} → プレイヤー${dealer}が起家に決定`);
  
  return dealer;
}

// 起家基準で風牌を設定
function updatePlayerWindsForDealer(players, dealer) {
  const winds = ['east', 'south', 'west', 'north'];
  const windNames = ['東', '南', '西', '北'];
  for (let i = 0; i < 4; i++) {
    const windIndex = (i - dealer + 4) % 4;
    players[i].wind = winds[windIndex];
    logWithTime(`🀄 [WIND] プレイヤー${i}: ${windNames[windIndex]}家`);
  }
}

// オンライン麻雀用のゲーム状態初期化
function initializeGameState(players) {
  const tiles = createTiles();
  
  // シャッフル
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  
  // 親決め（起家決め）
  const dealer = determineInitialDealer(players);
  logWithTime(`🎲 [DEALER SELECTION] 親決め結果: プレイヤー${dealer}(${players[dealer].name})が起家`);
  
  // プレイヤー情報を変換
  const gamePlayers = players.map((player, index) => ({
    id: index,
    name: player.name,
    type: player.type, // プレイヤータイプを追加
    isCPU: player.type === 'cpu',
    cpuPersonality: player.personality || null,
    score: 25000,
    wind: 'east', // 後でupdatePlayerWindsForDealerで正しく設定
    hand: {
      tiles: [],
      discards: [],
      melds: [],
      riichi: false
    }
  }));
  
  // 配牌（親から順番に）
  for (let i = 0; i < 4; i++) {
    const playerIndex = (dealer + i) % 4;
    const tileCount = i === 0 ? 14 : 13; // 親は14枚
    gamePlayers[playerIndex].hand.tiles = sortHand(tiles.splice(0, tileCount));
  }
  
  // 風牌を正しく設定
  updatePlayerWindsForDealer(gamePlayers, dealer);
  
  return {
    gameId: null, // 後で設定
    phase: 'playing',
    currentPlayer: dealer,
    dealer: dealer,
    wind: '東',
    roundNumber: 1,
    honba: 0,
    riichi: 0,
    players: gamePlayers,
    wallTiles: tiles,
    remainingTiles: tiles.length,
    dora: tiles[0] || null,
    lastDiscard: null,
    lastDiscardPlayer: null,
    roundResults: [],
    gameType: 'online'
  };
}

// 部屋でゲーム開始
function startRoomGame(room) {
  room.status = ROOM_STATUS.PLAYING;
  
  // ゲーム状態を初期化
  const gameState = initializeGameState(room.players);
  gameState.gameId = room.id;
  gameState.cpuAutoMode = true; // CPU自動モードを有効にする
  gameState.cpuAutoSpeed = 1000; // 1秒間隔で自動実行
  room.gameState = gameState;
  
  // gamesマップにも追加（既存システムとの互換性のため）
  games.set(room.id, gameState);
  
  logWithTime(`🎮 [GAME START] ゲーム開始`, room.id);
  
  // 全プレイヤーにゲーム開始を通知
  room.players.forEach(player => {
    if (player.socketId) {
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.gameId = room.id;
        socket.emit('gameState', gameState);
      }
    }
  });
  
  // CPU自動実行開始
  console.log(`🔍 [DEBUG] room.id type: ${typeof room.id}, value: ${room.id}`);
  startCpuAutoGame(room.id);
}

// Socket.IO統合イベントハンドラー
io.on('connection', (socket) => {
  console.log(`🔌 [CONNECT] ユーザー接続: ${socket.id}`);
  
  // 基本的な接続イベント
  socket.on('disconnect', () => {
    console.log(`🔌 [DISCONNECT] ユーザー切断: ${socket.id}`);
    
    // 部屋からプレイヤーを削除（またはオフライン状態に）
    for (const [roomId, room] of rooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.socketId = null;
        console.log(`👤 [OFFLINE] ${player.name} がオフラインになりました`);
        
        // 必要に応じて部屋の状態を更新
        if (room.status === ROOM_STATUS.WAITING) {
          io.to(roomId).emit('roomUpdate', { room: room });
        }
      }
    }
  });
  
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // オンライン麻雀 - 部屋作成
  socket.on('createRoom', (data) => {
    console.log(`🏠 [CREATE ROOM] 部屋作成要求:`, data);
    const { roomName, playerName } = data;
    
    if (!roomName || !playerName) {
      console.log(`❌ [ERROR] 部屋作成失敗: 必要なデータが不足`);
      socket.emit('joinError', { message: '部屋名とプレイヤー名が必要です' });
      return;
    }
    
    const roomId = (roomIdCounter.current++).toString();
    const room = createRoom(roomId, roomName, playerName);
    
    // 作成者を部屋に参加させる
    const joinResult = joinRoom(roomId, playerName, socket.id);
    if (joinResult.success) {
      socket.join(roomId);
      console.log(`✅ [SUCCESS] 部屋作成成功: ${roomId}`);
      socket.emit('roomCreated', { room: joinResult.room });
      socket.to(roomId).emit('roomUpdate', { room: joinResult.room });
    } else {
      console.log(`❌ [ERROR] 部屋参加失敗:`, joinResult.message);
      socket.emit('joinError', { message: joinResult.message });
    }
  });
  
  // オンライン麻雀 - 部屋参加
  socket.on('joinRoom', (data) => {
    console.log(`🚪 [JOIN ROOM] 部屋参加要求:`, data);
    const { roomId, playerName } = data;
    const result = joinRoom(roomId, playerName, socket.id);
    
    if (result.success) {
      socket.join(roomId);
      console.log(`✅ [SUCCESS] 部屋参加成功: ${playerName} → ${roomId}`);
      socket.emit('roomJoined', { room: result.room });
      socket.to(roomId).emit('roomUpdate', { room: result.room });
    } else {
      console.log(`❌ [ERROR] 部屋参加失敗:`, result.message);
      socket.emit('joinError', { message: result.message });
    }
  });
  
  // オンライン麻雀 - 準備完了
  socket.on('playerReady', (data) => {
    console.log(`✅ [READY] 準備状態変更:`, data);
    console.log(`🔍 [DEBUG] socket.id: ${socket.id}, rooms count: ${rooms.size}`);
    const { roomId, ready } = data;
    const result = setPlayerReady(roomId, socket.id, ready);
    console.log(`🔍 [DEBUG] setPlayerReady result: ${result}`);
    if (result) {
      const room = rooms.get(roomId);
      console.log(`🔍 [DEBUG] Emitting roomUpdate for room ${roomId}`);
      io.to(roomId).emit('roomUpdate', { room: room });
    }
  });
  
  // オンライン麻雀 - 部屋一覧要求
  socket.on('getRooms', () => {
    console.log(`📋 [GET ROOMS] 部屋一覧要求`);
    const roomList = Array.from(rooms.values())
      .filter(room => room.status === ROOM_STATUS.WAITING)
      .map(room => ({
        id: room.id,
        name: room.name,
        playerCount: room.players.filter(p => p.type === 'human').length,
        maxPlayers: 4,
        created: room.created
      }));
    
    console.log(`📋 [ROOM LIST] 送信する部屋数: ${roomList.length}`);
    socket.emit('roomList', { rooms: roomList });
  });

  // =====================================
  // 既存ゲームロジックのイベントハンドラー
  // =====================================
  
  // ゲーム作成（既存システム用）
  socket.on('createGame', (data) => {
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
    logWithTime(`🎯 [PLAYER ACTION] 受信: ${data.type}`);
    
    if (!socket.gameId || !games.has(socket.gameId)) {
      console.log(`❌ [ERROR] ゲームが見つかりません: gameId=${socket.gameId}`);
      socket.emit('error', { message: 'ゲームが見つかりません' });
      return;
    }
    
    const gameState = games.get(socket.gameId);
    
    switch (data.type) {
      case 'discard':
        handleDiscard(socket, gameState, data);
        break;
      case 'draw':
        handleDraw(socket, gameState, data);
        break;
      case 'chi':
      case 'pon':
      case 'kan':
      case 'ankan':
        logWithTime(`🔍 [PLAYER ACTION] メルドアクション: ${data.type}`);
        handleMeld(socket, gameState, data);
        break;
      case 'riichi':
        handleRiichi(socket, gameState, data);
        break;
      case 'win':
        handleWin(socket, gameState, data);
        break;
      case 'pass':
        handlePass(socket, gameState, data);
        break;
      default:
        console.log(`❓ [UNKNOWN ACTION] 不明なアクション: ${data.type}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🀄 麻雀ゲームサーバーがポート ${PORT} で起動しました`);
  console.log(`🌐 http://localhost:${PORT} でアクセスできます`);
  console.log(`📊 ヘルスチェック: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.IO接続待機中...`);
});