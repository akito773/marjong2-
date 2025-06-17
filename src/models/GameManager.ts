import { GameState, GameAction, GameSettings } from '../../shared/types/Game';
import { Player as IPlayer, PlayerAction } from '../../shared/types/Player';
import { Tile } from '../../shared/types/Tile';
import { TileManager } from './TileManager';
import { Player } from './Player';
import { HandAnalyzer } from '../utils/HandAnalyzer';
import { MahjongAI } from '../ai/MahjongAI';
import { GameRecordManager } from './GameRecord';

export class GameManager {
  public readonly gameId: string;
  private gameState: GameState;
  private tileManager: TileManager;
  private players: Player[] = [];
  private actionQueue: PlayerAction[] = [];
  private debugMode: boolean = false;
  private recordManager: GameRecordManager;

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
    this.gameId = gameId;
    this.recordManager = GameRecordManager.getInstance();
    
    if (playerNames.length !== 4) {
      throw new Error('Game requires exactly 4 players');
    }

    // プレイヤー初期化
    this.initializePlayers(playerNames, settings);

    // 牌管理システム初期化
    this.tileManager = new TileManager(settings.redDora);

    // ゲーム状態初期化
    this.gameState = this.createInitialGameState(gameId, settings);

    // AI対戦の場合はデバッグモードを有効にして手動操作を許可
    if (playerNames.includes('CPU東') || playerNames.includes('CPU南') || playerNames.includes('CPU西')) {
      this.debugMode = true;
      console.log(`🔧 デバッグモード有効: 手動操作が可能です`);
    }

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

    // ゲーム記録開始
    this.recordManager.startGameRecord(
      this.gameId, 
      this.players.map(p => this.playerToInterface(p)), 
      'ai' // デフォルトはAI対戦
    );

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
        case 'draw':
          actions.push(...this.processDraw(player));
          break;
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

  // ツモ処理
  private processDraw(player: Player): GameAction[] {
    // ターンチェック
    if (!this.debugMode && this.gameState.currentPlayer !== player.position) {
      throw new Error(`Not ${player.name}'s turn`);
    }

    // 手牌枚数チェック（13枚の時のみツモ可能）
    if (player.hand.tiles.length !== 13) {
      throw new Error(`${player.name}の手牌は${player.hand.tiles.length}枚です。ツモは13枚の時のみ可能です`);
    }

    // 牌をツモ
    const drawnTile = this.tileManager.drawTile();
    if (!drawnTile) {
      throw new Error('ツモする牌がありません');
    }

    player.drawTile(drawnTile);

    // ゲームアクションを記録
    return [{
      id: `draw_${Date.now()}`,
      type: 'draw',
      playerId: player.id,
      data: { tile: drawnTile },
      description: `${player.name}がツモ: ${drawnTile.displayName}`,
      timestamp: Date.now(),
    }];
  }

  // 捨牌処理
  private processDiscard(player: Player, action: PlayerAction & { tileId?: number }): GameAction[] {
    let tileToDiscard: Tile;
    
    // タイルの取得（tileIdまたはtileプロパティから）
    if ((action as any).tileId !== undefined) {
      const tileId = (action as any).tileId;
      const foundTile = player.hand.tiles.find(t => t.id === tileId);
      if (!foundTile) {
        throw new Error(`指定されたタイル (ID: ${tileId}) が手牌にありません`);
      }
      tileToDiscard = foundTile;
    } else if (action.tile) {
      tileToDiscard = action.tile;
    } else {
      throw new Error('Discard action requires a tile or tileId');
    }

    // デバッグモード時はターンチェックをスキップ
    if (!this.debugMode && this.gameState.currentPlayer !== player.position) {
      throw new Error(`Not ${player.name}'s turn`);
    }

    // 手牌枚数チェック（14枚の時のみ捨牌可能）
    if (player.hand.tiles.length !== 14) {
      throw new Error(`${player.name}の手牌は${player.hand.tiles.length}枚です。捨牌は14枚の時のみ可能です`);
    }

    player.discardTile(tileToDiscard);

    // 他のプレイヤーの鳴き判定
    this.checkMeldOpportunities(tileToDiscard, player.position);

    // 最後の捨牌情報を更新
    this.gameState = {
      ...this.gameState,
      lastDiscard: tileToDiscard,
      lastDiscardPlayer: player.position,
    };

    // 次のプレイヤーにツモ（鳴きがない場合）
    if (this.actionQueue.length === 0) {
      if (!this.debugMode) {
        this.nextTurn();
      } else {
        // デバッグモード時は手動でターン管理
        this.setNextPlayerTurn();
      }
    }

    // ゲーム状態を更新
    this.updateGameState();

    const discardAction: GameAction = {
      id: `discard_${Date.now()}`,
      type: 'discard',
      playerId: player.id,
      data: { 
        tile: tileToDiscard,
        meldOpportunities: this.actionQueue.length > 0 ? this.actionQueue : undefined
      },
      description: `${player.name}が${tileToDiscard.displayName}を捨牌`,
      timestamp: Date.now(),
    };

    return [discardAction];
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
    // 和了判定
    const isWin = HandAnalyzer.isWinningHand([...player.hand.tiles], [...player.hand.melds]);
    
    if (!isWin) {
      throw new Error(`${player.name}の手牌は和了形ではありません`);
    }

    // 役判定
    const yaku = HandAnalyzer.analyzeYaku(
      [...player.hand.tiles], 
      [...player.hand.melds],
      {
        isRiichi: player.status === 'riichi',
        isTsumo: true,
        isDealer: this.gameState.currentPlayer === 0,
        seatWind: this.getSeatWind(this.gameState.currentPlayer),
        roundWind: this.getRoundWind(),
        doraCount: this.countDora([...player.hand.tiles, ...player.hand.melds.flatMap(m => m.tiles)])
      }
    );

    if (yaku.length === 0) {
      throw new Error(`${player.name}の手牌に役がありません`);
    }

    // 点数計算
    const scoreResult = HandAnalyzer.calculateScore(yaku, 30, this.gameState.currentPlayer === 0);

    player.setStatus('finished');
    (this.gameState as any).phase = 'finished';

    return [{
      id: `tsumo_${Date.now()}`,
      type: 'win',
      playerId: player.id,
      data: { yaku: yaku, score: scoreResult },
      description: `${player.name}がツモ和了: ${yaku.map(y => y.name).join('・')} (${scoreResult.scoreName})`,
      timestamp: Date.now(),
    }];
  }

  // ロン処理
  private processRon(player: Player, action: PlayerAction): GameAction[] {
    if (!action.tile || !this.gameState.lastDiscard) {
      throw new Error('ロンには捨牌が必要です');
    }

    // ロン牌を手牌に加えて和了判定
    const tempTiles = [...player.hand.tiles, action.tile];
    const isWin = HandAnalyzer.isWinningHand(tempTiles, [...player.hand.melds]);
    
    if (!isWin) {
      throw new Error(`${player.name}の手牌は和了形ではありません`);
    }

    // 役判定
    const yaku = HandAnalyzer.analyzeYaku(
      tempTiles, 
      [...player.hand.melds],
      {
        isRiichi: player.status === 'riichi',
        isTsumo: false,
        isDealer: this.gameState.currentPlayer === 0,
        seatWind: this.getSeatWind(this.getPlayerIndex(action.playerId)),
        roundWind: this.getRoundWind(),
        doraCount: this.countDora([...tempTiles, ...player.hand.melds.flatMap(m => m.tiles)])
      }
    );

    if (yaku.length === 0) {
      throw new Error(`${player.name}の手牌に役がありません`);
    }

    // 点数計算
    const scoreResult = HandAnalyzer.calculateScore(yaku, 30, this.gameState.currentPlayer === 0);

    if (yaku.length === 0) {
      throw new Error(`${player.name}の手牌に役がありません`);
    }

    player.setStatus('finished');
    (this.gameState as any).phase = 'finished';

    return [{
      id: `ron_${Date.now()}`,
      type: 'win',
      playerId: player.id,
      data: { yaku: yaku, score: scoreResult, ronTile: action.tile },
      description: `${player.name}がロン和了: ${yaku.map(y => y.name).join('・')} (${scoreResult.scoreName})`,
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


  // 手動ツモ処理
  manualDraw(playerId: string): { success: boolean; tile?: any; message: string } {
    const playerIndex = parseInt(playerId.split('_')[1]);
    const player = this.players[playerIndex];

    if (!player) {
      return { success: false, message: 'プレイヤーが見つかりません' };
    }

    // デバッグモード以外では現在のプレイヤーのみツモ可能
    if (!this.debugMode && playerIndex !== this.gameState.currentPlayer) {
      return { success: false, message: `${player.name}のターンではありません` };
    }

    // 手牌枚数チェック（13枚の時のみツモ可能）
    if (player.hand.tiles.length !== 13) {
      return { 
        success: false, 
        message: `${player.name}の手牌は${player.hand.tiles.length}枚です。ツモは13枚の時のみ可能です` 
      };
    }

    const tile = this.tileManager.drawTile();
    if (!tile) {
      return { success: false, message: '牌山に牌がありません' };
    }

    player.drawTile(tile);
    
    // ゲーム状態を更新
    this.updateGameState();
    
    return { 
      success: true, 
      tile: tile,
      message: `${player.name}が${tile.displayName}をツモ` 
    };
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

  // デバッグモード設定
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    console.log(`🔧 デバッグモード: ${enabled ? 'ON' : 'OFF'}`);
  }

  // AI自動実行
  executeAIAction(): GameAction[] {
    if (this.debugMode) {
      return []; // デバッグモード時はAI自動実行しない
    }

    const currentPlayerIndex = this.gameState.currentPlayer;
    const currentPlayer = this.players[currentPlayerIndex];
    
    if (!currentPlayer.isBot) {
      return []; // 人間プレイヤーの場合は何もしない
    }

    // AI行動決定
    const context = {
      hasDrawn: currentPlayer.hand.tiles.length === 14,
      lastDiscard: this.gameState.lastDiscard,
      lastDiscardPlayer: this.gameState.lastDiscardPlayer
    };

    const aiDecision = MahjongAI.decideAction(currentPlayer, this.gameState, context);
    
    if (!aiDecision) {
      return []; // 何もしない
    }

    // AI決定を実行
    try {
      const action: PlayerAction = {
        type: aiDecision.type as any,
        playerId: currentPlayer.id,
        tile: aiDecision.tile,
        meld: aiDecision.meldType ? this.findMeldForType(currentPlayer, aiDecision.tile!, aiDecision.meldType) : undefined,
        priority: 1,
        timestamp: Date.now()
      };

      console.log(`🤖 ${currentPlayer.name} AI行動: ${aiDecision.type}`);
      return this.processAction(action);
    } catch (error) {
      console.error(`❌ AI行動エラー (${currentPlayer.name}):`, error);
      return [];
    }
  }

  // 指定されたタイプの鳴きメルドを探す
  private findMeldForType(player: Player, tile: Tile, meldType: string): any {
    if (!this.gameState.lastDiscardPlayer) return null;
    
    const possibleMelds = player.canMeld(tile, this.gameState.lastDiscardPlayer);
    return possibleMelds.find(m => m.type === meldType) || null;
  }

  // 鳴き機会の取得
  getMeldOpportunities(): { playerId: string; playerName: string; possibleMelds: any[] }[] {
    if (!this.gameState.lastDiscard || !this.gameState.lastDiscardPlayer) {
      return [];
    }

    const opportunities = [];
    const lastDiscard = this.gameState.lastDiscard;
    const fromPlayer = this.gameState.lastDiscardPlayer;

    for (let i = 0; i < 4; i++) {
      if (i === fromPlayer) continue;

      const player = this.players[i];
      const possibleMelds = player.canMeld(lastDiscard, fromPlayer);

      if (possibleMelds.length > 0) {
        opportunities.push({
          playerId: player.id,
          playerName: player.name,
          possibleMelds: possibleMelds
        });
      }
    }

    return opportunities;
  }

  // デバッグ情報
  getDebugInfo(): {
    gameId: string;
    phase: string;
    currentPlayer: string;
    remainingTiles: number;
    actionQueueLength: number;
    debugMode: boolean;
    players: ReturnType<Player['getDebugInfo']>[];
  } {
    return {
      gameId: this.gameState.id,
      phase: this.gameState.phase,
      currentPlayer: this.players[this.gameState.currentPlayer]?.name || 'Unknown',
      remainingTiles: this.gameState.remainingTiles,
      actionQueueLength: this.actionQueue.length,
      debugMode: this.debugMode,
      players: this.players.map(p => p.getDebugInfo()),
    };
  }

  // ゲーム終了処理
  finishGame(winner?: number): void {
    this.gameState = {
      ...this.gameState,
      phase: 'finished',
      updatedAt: Date.now(),
    };

    // 最終得点を取得
    const finalScores = this.players.map(p => p.score);
    
    // 勝者を決定（得点が最も高いプレイヤー）
    if (winner === undefined) {
      const maxScore = Math.max(...finalScores);
      winner = finalScores.indexOf(maxScore);
    }

    // ゲーム記録を完了
    this.recordManager.finishGameRecord(this.gameId, finalScores, winner);

    console.log(`🏆 ゲーム終了: 勝者は${this.players[winner].name} (${finalScores[winner]}点)`);
  }

  // 局終了処理
  finishRound(winner?: number, winType?: 'tsumo' | 'ron'): void {
    const roundData = {
      roundNumber: this.gameState.round.roundNumber,
      honba: this.gameState.round.honbaCount,
      dealer: this.gameState.round.dealerPosition,
      winner,
      winType,
      scoreChanges: this.players.map(p => p.score),
      duration: Math.floor((Date.now() - this.gameState.createdAt) / 1000),
      totalTurns: this.gameState.gameLog.length,
    };

    // 局記録を保存
    this.recordManager.recordRound(this.gameId, roundData);

    // 東4局終了でゲーム終了
    if (this.gameState.round.roundNumber >= 4) {
      this.finishGame();
    } else {
      // 次の局へ
      this.nextRound();
    }
  }

  // 次の局へ
  private nextRound(): void {
    this.gameState = {
      ...this.gameState,
      round: {
        roundNumber: this.gameState.round.roundNumber + 1,
        honbaCount: 0,
        riichiSticks: 0,
        dealerPosition: (this.gameState.round.dealerPosition + 1) % 4,
        prevailingWind: 'east',
      },
      currentPlayer: (this.gameState.round.dealerPosition + 1) % 4,
      updatedAt: Date.now(),
    };

    // 新しい局を開始
    this.startNewRound();
  }

  // 新しい局の開始
  private startNewRound(): void {
    // 牌を初期化
    this.tileManager = new TileManager(true);
    
    // プレイヤーをリセット
    this.players.forEach(player => {
      // 手牌のクリアなど（実装は省略）
    });

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

    console.log(`🀄 東${this.gameState.round.roundNumber}局開始`);
  }

  // プレイヤーIDからインデックスを取得
  private getPlayerIndex(playerId: string): number {
    return this.players.findIndex(p => p.id === playerId);
  }

  // 自風を取得
  private getSeatWind(playerIndex: number): string {
    const windOrder = ['east', 'south', 'west', 'north'];
    const relativePosition = (playerIndex - this.gameState.round.dealerPosition + 4) % 4;
    return windOrder[relativePosition];
  }

  // 場風を取得
  private getRoundWind(): string {
    // 簡易版：東風戦として東のみ
    return 'east';
  }

  // ドラ数をカウント
  private countDora(tiles: Tile[]): number {
    // ドラ表示牌を取得
    const doraIndicators = this.tileManager.getDoraIndicators();
    let doraCount = 0;
    
    for (const tile of tiles) {
      for (const indicator of doraIndicators) {
        if (this.isDoraMatch(tile, indicator)) {
          doraCount++;
        }
      }
      
      // 赤ドラ
      if (tile.isRed) {
        doraCount++;
      }
    }
    
    return doraCount;
  }

  // ドラ判定
  private isDoraMatch(tile: Tile, indicator: Tile): boolean {
    if (tile.honor && indicator.honor) {
      // 字牌のドラ順序
      const honorOrder = ['east', 'south', 'west', 'north', 'white', 'green', 'red'];
      const indicatorIndex = honorOrder.indexOf(indicator.honor);
      const nextIndex = (indicatorIndex + 1) % honorOrder.length;
      return tile.honor === honorOrder[nextIndex];
    } else if (!tile.honor && !indicator.honor && tile.suit === indicator.suit) {
      // 数牌のドラ順序
      const nextRank = indicator.rank === 9 ? 1 : indicator.rank! + 1;
      return tile.rank === nextRank;
    }
    
    return false;
  }

  // ターン管理
  private nextTurn(): void {
    const nextPlayerIndex = (this.gameState.currentPlayer + 1) % 4;
    
    this.gameState = {
      ...this.gameState,
      currentPlayer: nextPlayerIndex
    };
    
    // 次のプレイヤーに自動的にツモさせる
    const nextPlayer = this.players[nextPlayerIndex];
    if (nextPlayer) {
      const drawnTile = this.tileManager.drawTile();
      if (drawnTile) {
        nextPlayer.drawTile(drawnTile);
        
        // ゲームログに記録
        this.addGameAction({
          type: 'draw',
          description: `${nextPlayer.name}がツモ`,
          timestamp: Date.now(),
        });
      }
    }
  }

  private setNextPlayerTurn(): void {
    const nextPlayerIndex = (this.gameState.currentPlayer + 1) % 4;
    this.gameState = {
      ...this.gameState,
      currentPlayer: nextPlayerIndex
    };
  }

  // デバッグモード用：手動ツモ
  allowManualDraw(): boolean {
    return this.debugMode || this.gameState.phase === 'waiting';
  }
}