import { GameState, GameAction, GameSettings } from '../../shared/types/Game';
import { Player as IPlayer, PlayerAction } from '../../shared/types/Player';
import { Tile } from '../../shared/types/Tile';
import { TileManager } from './TileManager';
import { Player } from './Player';

export class GameManager {
  private gameState: GameState;
  private tileManager: TileManager;
  private players: Player[] = [];
  private actionQueue: PlayerAction[] = [];

  constructor(
    gameId: string,
    playerNames: string[],
    settings: GameSettings = {
      maxPlayers: 4,
      botCount: 0,
      initialScore: 25000,
      endScore: 30000,
      redDora: true,
      openTanyao: true,
      doubleRon: false,
      nagashiMangan: false,
    }
  ) {
    if (playerNames.length !== 4) {
      throw new Error('Game requires exactly 4 players');
    }

    // プレイヤー初期化
    this.initializePlayers(playerNames, settings);

    // 牌管理システム初期化
    this.tileManager = new TileManager(settings.redDora);

    // ゲーム状態初期化
    this.gameState = this.createInitialGameState(gameId, settings);

    console.log(`🎮 ゲーム開始: ${gameId}`);
    console.log(`👥 プレイヤー: ${playerNames.join(', ')}`);
  }

  // プレイヤー初期化
  private initializePlayers(playerNames: string[], settings: GameSettings): void {
    this.players = playerNames.map((name, index) => {
      const isBot = index < settings.botCount;
      return new Player(
        `player_${index}`,
        name,
        index,
        isBot,
        settings.initialScore
      );
    });

    // 親設定（最初は座席0）
    this.players[0].setDealer(true);
  }

  // 初期ゲーム状態作成
  private createInitialGameState(gameId: string, settings: GameSettings): GameState {
    const now = Date.now();
    const debugInfo = this.tileManager.getDebugInfo();

    return {
      id: gameId,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        hand: p.hand,
        score: p.score,
        position: p.position,
        isDealer: p.isDealer,
        isBot: p.isBot,
        status: p.status,
        wind: p.wind,
      })),
      currentPlayer: 0,
      phase: 'waiting',
      round: {
        roundNumber: 1,
        dealerPosition: 0,
        prevailingWind: 'east',
        honbaCount: 0,
        riichiSticks: 0,
      },
      wall: [],
      deadWall: [],
      doraIndicators: debugInfo.doraIndicators,
      uraDoraIndicators: [],
      remainingTiles: debugInfo.wallRemaining,
      availableActions: [],
      gameLog: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  // ゲーム開始
  startGame(): void {
    if (this.gameState.phase !== 'waiting') {
      throw new Error('Game is already started');
    }

    this.startRound();
  }

  // 局開始
  private startRound(): void {
    console.log(`🀄 東${this.gameState.round.roundNumber}局開始`);
    
    // 配牌
    const hands = this.tileManager.dealInitialHands();
    hands.forEach((hand, index) => {
      this.players[index].setInitialHand([...hand.tiles]);
    });

    // 親にツモ牌
    const dealerTile = this.tileManager.drawTile();
    if (dealerTile) {
      this.players[this.gameState.round.dealerPosition].drawTile(dealerTile);
    }

    // ゲーム状態更新
    this.gameState = {
      ...this.gameState,
      phase: 'playing',
      currentPlayer: this.gameState.round.dealerPosition,
      players: this.players.map(p => this.playerToInterface(p)),
      remainingTiles: this.tileManager.getRemainingTileCount(),
      updatedAt: Date.now(),
    };

    // ログ追加
    this.addGameAction({
      type: 'deal',
      description: `配牌完了。東${this.gameState.round.roundNumber}局開始`,
      timestamp: Date.now(),
    });

    console.log(`🎯 ${this.players[this.gameState.currentPlayer].name}のターン`);
  }

  // プレイヤーアクション処理
  processAction(action: PlayerAction): GameAction[] {
    console.log(`🎲 アクション: ${action.type} by ${this.players[parseInt(action.playerId.split('_')[1])].name}`);

    const actions: GameAction[] = [];
    const playerIndex = parseInt(action.playerId.split('_')[1]);
    const player = this.players[playerIndex];

    if (!player) {
      throw new Error(`Player not found: ${action.playerId}`);
    }

    try {
      switch (action.type) {
        case 'discard':
          actions.push(...this.processDiscard(player, action));
          break;
        case 'riichi':
          actions.push(...this.processRiichi(player, action));
          break;
        case 'chi':
        case 'pon':
        case 'kan':
          actions.push(...this.processMeld(player, action));
          break;
        case 'tsumo':
          actions.push(...this.processTsumo(player));
          break;
        case 'ron':
          actions.push(...this.processRon(player, action));
          break;
        case 'pass':
          actions.push(...this.processPass(player));
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      // ゲーム状態更新
      this.updateGameState();

    } catch (error) {
      console.error(`❌ アクション処理エラー:`, error);
      actions.push({
        id: `error_${Date.now()}`,
        type: 'deal',
        playerId: action.playerId,
        description: `エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }

    return actions;
  }

  // 捨牌処理
  private processDiscard(player: Player, action: PlayerAction): GameAction[] {
    if (!action.tile) {
      throw new Error('Discard action requires a tile');
    }

    if (this.gameState.currentPlayer !== player.position) {
      throw new Error(`Not ${player.name}'s turn`);
    }

    player.discardTile(action.tile);

    // 他のプレイヤーの鳴き判定
    this.checkMeldOpportunities(action.tile, player.position);

    // 最後の捨牌情報を更新
    this.gameState = {
      ...this.gameState,
      lastDiscard: action.tile,
      lastDiscardPlayer: player.position,
    };

    // 次のプレイヤーにツモ（鳴きがない場合）
    if (this.actionQueue.length === 0) {
      this.nextTurn();
    }

    return [{
      id: `discard_${Date.now()}`,
      type: 'discard',
      playerId: player.id,
      data: { tile: action.tile },
      description: `${player.name}が${action.tile.displayName}を捨牌`,
      timestamp: Date.now(),
    }];
  }

  // リーチ処理
  private processRiichi(player: Player, action: PlayerAction): GameAction[] {
    if (!action.tile) {
      throw new Error('Riichi action requires a tile');
    }

    if (!player.canDeclareRiichi()) {
      throw new Error(`${player.name} cannot declare riichi`);
    }

    player.declareRiichi(action.tile);
    (this.gameState.round as any).riichiSticks++;

    return [{
      id: `riichi_${Date.now()}`,
      type: 'riichi',
      playerId: player.id,
      data: { tile: action.tile },
      description: `${player.name}がリーチ宣言`,
      timestamp: Date.now(),
    }];
  }

  // 鳴き処理
  private processMeld(player: Player, action: PlayerAction): GameAction[] {
    if (!action.meld || !action.tile) {
      throw new Error('Meld action requires meld and tile');
    }

    player.addMeld(action.meld, action.tile);
    
    // カンの場合はドラ追加
    if (action.meld.type === 'kan') {
      this.tileManager.addDoraIndicator();
    }

    return [{
      id: `meld_${Date.now()}`,
      type: 'meld',
      playerId: player.id,
      data: { meld: action.meld },
      description: `${player.name}が${action.meld.type}`,
      timestamp: Date.now(),
    }];
  }

  // ツモ処理
  private processTsumo(player: Player): GameAction[] {
    // TODO: 和了判定と点数計算
    player.setStatus('finished');
    (this.gameState as any).phase = 'finished';

    return [{
      id: `tsumo_${Date.now()}`,
      type: 'win',
      playerId: player.id,
      description: `${player.name}がツモ和了`,
      timestamp: Date.now(),
    }];
  }

  // ロン処理
  private processRon(player: Player, action: PlayerAction): GameAction[] {
    // TODO: 和了判定と点数計算
    player.setStatus('finished');
    (this.gameState as any).phase = 'finished';

    return [{
      id: `ron_${Date.now()}`,
      type: 'win',
      playerId: player.id,
      description: `${player.name}がロン和了`,
      timestamp: Date.now(),
    }];
  }

  // パス処理
  private processPass(player: Player): GameAction[] {
    // アクションキューから削除
    this.actionQueue = this.actionQueue.filter(a => a.playerId !== player.id);

    return [{
      id: `pass_${Date.now()}`,
      type: 'deal',
      playerId: player.id,
      description: `${player.name}がパス`,
      timestamp: Date.now(),
    }];
  }

  // 次のターン
  private nextTurn(): void {
    const nextPlayer = (this.gameState.currentPlayer + 1) % 4;
    const tile = this.tileManager.drawTile();

    if (!tile) {
      // 流局
      (this.gameState as any).phase = 'finished';
      this.addGameAction({
        type: 'draw_game',
        description: '流局',
        timestamp: Date.now(),
      });
      return;
    }

    this.players[nextPlayer].drawTile(tile);
    (this.gameState as any).currentPlayer = nextPlayer;

    console.log(`🎯 ${this.players[nextPlayer].name}のターン`);
  }

  // 鳴き機会チェック
  private checkMeldOpportunities(discardedTile: Tile, fromPlayer: number): void {
    this.actionQueue = [];

    for (let i = 0; i < 4; i++) {
      if (i === fromPlayer) continue;

      const player = this.players[i];
      const possibleMelds = player.canMeld(discardedTile, fromPlayer);

      if (possibleMelds.length > 0) {
        // 鳴き可能なアクションをキューに追加
        possibleMelds.forEach(meld => {
          this.actionQueue.push({
            type: meld.type as PlayerAction['type'],
            playerId: player.id,
            tile: discardedTile,
            meld,
            priority: this.getMeldPriority(meld.type),
            timestamp: Date.now(),
          });
        });
      }
    }

    // 優先順位でソート（ロン > カン > ポン > チー）
    this.actionQueue.sort((a, b) => b.priority - a.priority);
  }

  // 鳴きの優先順位
  private getMeldPriority(meldType: string): number {
    switch (meldType) {
      case 'ron': return 4;
      case 'kan': return 3;
      case 'pon': return 2;
      case 'chi': return 1;
      default: return 0;
    }
  }

  // ゲーム状態更新
  private updateGameState(): void {
    this.gameState = {
      ...this.gameState,
      players: this.players.map(p => this.playerToInterface(p)),
      remainingTiles: this.tileManager.getRemainingTileCount(),
      doraIndicators: this.tileManager.getDebugInfo().doraIndicators,
      availableActions: this.actionQueue,
      updatedAt: Date.now(),
    };
  }

  // Player クラスを IPlayer インターフェースに変換
  private playerToInterface(player: Player): IPlayer {
    return {
      id: player.id,
      name: player.name,
      hand: player.hand,
      score: player.score,
      position: player.position,
      isDealer: player.isDealer,
      isBot: player.isBot,
      status: player.status,
      wind: player.wind,
    };
  }

  // ゲームアクション追加
  private addGameAction(action: Omit<GameAction, 'id'>): void {
    const gameAction: GameAction = {
      ...action,
      id: `action_${Date.now()}`,
    };
    
    (this.gameState.gameLog as any).push(gameAction);
    console.log(`📝 ${gameAction.description}`);
  }

  // 現在のゲーム状態取得
  getGameState(): GameState {
    return { ...this.gameState };
  }

  // デバッグ情報
  getDebugInfo(): {
    gameId: string;
    phase: string;
    currentPlayer: string;
    remainingTiles: number;
    actionQueueLength: number;
    players: ReturnType<Player['getDebugInfo']>[];
  } {
    return {
      gameId: this.gameState.id,
      phase: this.gameState.phase,
      currentPlayer: this.players[this.gameState.currentPlayer]?.name || 'Unknown',
      remainingTiles: this.gameState.remainingTiles,
      actionQueueLength: this.actionQueue.length,
      players: this.players.map(p => p.getDebugInfo()),
    };
  }
}