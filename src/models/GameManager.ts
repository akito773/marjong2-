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
  private cpuAutoMode: boolean = false; // CPU自動対戦モード
  private gameSpeed: number = 1000; // ゲーム速度（ミリ秒）
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

    // デバッグモードはデフォルトで無効（CPUが自動動作する）
    this.debugMode = false;
    console.log(`🤖 CPU自動動作モード: CPUプレイヤーが自動的にプレイします`);
    
    if (playerNames.includes('CPU南') || playerNames.includes('CPU西') || playerNames.includes('CPU北')) {
      console.log(`🔧 CPU名検出更新: [${playerNames.join(', ')}]`);
    }

    console.log(`🎮 ゲーム開始: ${gameId}`);
    console.log(`👥 プレイヤー: ${playerNames.join(', ')}`);
  }

  // プレイヤー初期化
  private initializePlayers(playerNames: string[], settings: GameSettings): void {
    this.players = playerNames.map((name, index) => {
      // CPUプレイヤーはname.includes('CPU')で判定
      const isBot = name.includes('CPU');
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
    
    // CPUプレイヤーの確認ログ
    this.players.forEach((player, index) => {
      console.log(`👤 プレイヤー${index}: ${player.name} (${player.isBot ? 'CPU' : '人間'})`);
    });
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

      // アクションをゲームログに追加
      actions.forEach(action => {
        this.gameState = {
          ...this.gameState,
          gameLog: [...this.gameState.gameLog, action]
        };
      });
      
      // ゲーム状態更新
      this.updateGameState();
      
      // CPUターンの自動実行をスケジュール（フロントエンド同期のため少し遅延）
      setTimeout(() => {
        this.scheduleNextCPUAction();
      }, 500); // 500ms後にスケジュール

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
      this.nextTurn(); // デバッグモードでも自動でターンを進める
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

    // ダブルリーチ判定（配牌から1巡目）
    const isDoubleRiichi = this.isFirstTurn(player);
    
    player.declareRiichi(action.tile, isDoubleRiichi);
    (this.gameState.round as any).riichiSticks++;

    // 一発フラグ設定
    this.setIppatsuFlag(player, true);

    return [{
      id: `riichi_${Date.now()}`,
      type: 'riichi',
      playerId: player.id,
      data: { 
        tile: action.tile,
        isDoubleRiichi: isDoubleRiichi
      },
      description: `${player.name}が${isDoubleRiichi ? 'ダブル' : ''}リーチ宣言`,
      timestamp: Date.now(),
    }];
  }

  // 1巡目判定
  private isFirstTurn(player: Player): boolean {
    // 配牌後、誰も鳴いておらず、各プレイヤーの捨牌が1枚以下の場合
    const allPlayersFirstTurn = this.players.every(p => p.hand.discards.length <= 1);
    const noMelds = this.players.every(p => p.hand.melds.length === 0);
    return allPlayersFirstTurn && noMelds;
  }

  // 一発フラグ設定
  private setIppatsuFlag(player: Player, value: boolean): void {
    (player as any).ippatsuFlag = value;
  }

  // 一発フラグクリア（他プレイヤーの鳴きで）
  private clearIppatsuFlags(): void {
    this.players.forEach(player => {
      (player as any).ippatsuFlag = false;
    });
  }

  // 一発フラグリセット（和了時）
  private resetIppatsuFlags(): void {
    this.players.forEach(player => {
      (player as any).ippatsuFlag = false;
    });
  }

  // リーチ棒リセット（和了時）
  private resetRiichiSticks(): void {
    (this.gameState.round as any).riichiSticks = 0;
  }

  // プレイヤー牌数検証
  private validatePlayerTileCount(player: Player, context: string): void {
    const handTiles = player.hand.tiles.length;
    const meldCount = player.hand.melds.length;
    const activeTiles = player.getActiveTileCount();
    const meldTiles = player.hand.melds.reduce((sum, m) => sum + m.tiles.length, 0);
    
    console.log(`🔍 [Validation] ${player.name} ${context}:`);
    console.log(`🔍   Hand tiles: ${handTiles}`);
    console.log(`🔍   Melds: ${meldCount} (${meldTiles} tiles)`);
    console.log(`🔍   Active total: ${activeTiles}`);
    
    // メルド後の期待枚数: 手牌 + メルド = 14枚（鳴き直後、打牌前）
    // 通常時は13枚だが、鳴き直後は14枚、ツモ直後は14枚（鳴きなし）または15枚（鳴きあり+ツモ）
    let expectedActive;
    if (context.includes('after') && (context.includes('chi') || context.includes('pon') || context.includes('kan'))) {
      expectedActive = 14; // 鳴き直後は14枚
    } else if (context.includes('after draw')) {
      expectedActive = 14 + meldCount; // ツモ直後は13+鳴き枚数+ツモ1枚
    } else {
      expectedActive = 13 + meldCount; // 通常時は13+鳴き枚数
    }
    
    if (activeTiles !== expectedActive) {
      console.warn(`⚠️ [${player.name}] Tile count mismatch ${context}: expected ${expectedActive}, got ${activeTiles}`);
      // 一時的にエラーを警告に変更してデバッグ
      // throw new Error(`Tile count validation failed for ${player.name} ${context}: expected ${expectedActive}, got ${activeTiles}`);
    } else {
      console.log(`✅ [Validation] ${player.name} tile count correct: ${activeTiles} tiles`);
    }
  }

  // 全プレイヤー牌数検証
  private validateAllPlayerTileCounts(context: string): void {
    console.log(`🔍 [Global Validation] ${context}`);
    
    let totalTiles = 0;
    this.players.forEach((player, index) => {
      const playerTotal = player.getTotalTileCount();
      totalTiles += playerTotal;
      console.log(`🔍 P${index} ${player.name}: ${playerTotal} tiles total`);
    });
    
    const wallTiles = this.gameState.remainingTiles;
    const deadWallTiles = 14; // 王牌
    const grandTotal = totalTiles + wallTiles + deadWallTiles;
    
    console.log(`🔍 Total distribution: ${totalTiles} (players) + ${wallTiles} (wall) + ${deadWallTiles} (dead) = ${grandTotal}`);
    
    if (grandTotal !== 136) {
      console.error(`❌ [Global] Tile count error ${context}: total ${grandTotal}, expected 136`);
      throw new Error(`Global tile validation failed ${context}: total ${grandTotal}, expected 136`);
    }
    
    console.log(`✅ [Global Validation] Total tile count correct: 136 tiles`);
  }

  // 和了時の支払い処理
  private processWinPayment(
    winnerIndex: number,
    scoreResult: any,
    isTsumo: boolean,
    honbaBonus: number,
    riichiStickBonus: number
  ): any {
    const winner = this.players[winnerIndex];
    const isDealer = winnerIndex === this.gameState.round.dealerPosition;
    
    if (isTsumo) {
      // ツモ和了の支払い
      const baseScore = scoreResult.baseScore;
      let dealerPay: number, childPay: number;
      
      if (isDealer) {
        // 親ツモ：子は全員同額
        dealerPay = 0;
        childPay = Math.ceil((baseScore * 2) / 100) * 100; // 100点単位切り上げ
      } else {
        // 子ツモ：親は2倍、子は等分
        dealerPay = Math.ceil((baseScore * 2) / 100) * 100;
        childPay = Math.ceil(baseScore / 100) * 100;
      }
      
      // 本場加算
      const honbaPerPlayer = isDealer ? honbaBonus / 3 : (winnerIndex === this.gameState.round.dealerPosition ? honbaBonus * 2 / 3 : honbaBonus / 3);
      
      // 支払い実行
      let totalWinnings = 0;
      this.players.forEach((player, index) => {
        if (index !== winnerIndex) {
          let payment = 0;
          if (index === this.gameState.round.dealerPosition && !isDealer) {
            payment = dealerPay + honbaPerPlayer;
          } else if (index !== this.gameState.round.dealerPosition) {
            payment = childPay + honbaPerPlayer;
          }
          
          player.changeScore(-payment);
          totalWinnings += payment;
        }
      });
      
      // 和了者に支払い分と供託を追加
      winner.changeScore(totalWinnings + riichiStickBonus);
      
      return {
        type: 'tsumo',
        dealerPay,
        childPay,
        honbaBonus,
        riichiStickBonus,
        totalWinnings: totalWinnings + riichiStickBonus
      };
    } else {
      // ロン和了の支払い（実装予定）
      return { type: 'ron' };
    }
  }

  // 鳴き処理
  private processMeld(player: Player, action: PlayerAction): GameAction[] {
    if (!action.meld || !action.tile) {
      throw new Error('Meld action requires meld and tile');
    }

    console.log(`🔧 [GameManager] Processing ${action.meld.type} for ${player.name}`);
    console.log(`🔧 [GameManager] Before meld: ${player.hand.tiles.length} hand tiles, ${player.hand.melds.length} melds`);

    player.addMeld(action.meld, action.tile);
    
    // 鳴き後の牌数検証
    this.validatePlayerTileCount(player, `after ${action.meld.type}`);
    
    // 鳴きが発生したら一発フラグをクリア
    this.clearIppatsuFlags();
    
    // カンの場合はドラ追加とツモ
    if (action.meld.type === 'kan') {
      this.tileManager.addDoraIndicator();
      // カン後はツモが必要
      this.drawTileForPlayer(player);
    }

    // メルド後はそのプレイヤーのターンになる
    this.gameState = {
      ...this.gameState,
      currentPlayer: player.position,
      availableActions: [] // 鳴きアクションをクリア
    };

    console.log(`🔄 メルド後ターン設定: ${player.name} (Position ${player.position})`);

    // CPUの場合は自動ターンをスケジュール（フロントエンド同期のため少し遅延）
    if (player.isBot && action.meld.type !== 'kan') {
      setTimeout(() => {
        this.scheduleNextCPUAction();
      }, 500); // 500ms後にスケジュール
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

    // 一発判定
    const hasIppatsu = (player as any).ippatsuFlag && player.hand.riichi;
    if (hasIppatsu) {
      yaku.push({ name: '一発', han: 1, description: 'リーチ後1巡以内の和了' });
    }

    // ダブルリーチ判定
    const hasDoubleRiichi = player.hand.doubleRiichi;
    if (hasDoubleRiichi) {
      // リーチを削除してダブルリーチに置き換え
      const riichiIndex = yaku.findIndex(y => y.name === 'リーチ');
      if (riichiIndex !== -1) {
        yaku[riichiIndex] = { name: 'ダブルリーチ', han: 2, description: '配牌後第1ツモでリーチ' };
      }
    }

    // 点数計算（本場加算含む）
    const scoreResult = HandAnalyzer.calculateScore(yaku, 30, this.gameState.currentPlayer === 0);
    const honbaBonus = this.gameState.round.honbaCount * 300;
    const riichiStickBonus = this.gameState.round.riichiSticks * 1000;
    
    // 支払い処理
    const paymentResult = this.processWinPayment(
      this.gameState.currentPlayer,
      scoreResult,
      true, // isTsumo
      honbaBonus,
      riichiStickBonus
    );

    // ゲーム状態更新
    this.resetIppatsuFlags();
    this.resetRiichiSticks();
    
    player.setStatus('finished');
    (this.gameState as any).phase = 'finished';

    return [{
      id: `tsumo_${Date.now()}`,
      type: 'win',
      playerId: player.id,
      data: { 
        yaku: yaku, 
        score: scoreResult, 
        payment: paymentResult,
        honbaBonus,
        riichiStickBonus
      },
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
    // デバッグモードでもCPU自動化は動作させる
    // if (this.debugMode) {
    //   return []; // デバッグモード時はAI自動実行しない
    // }

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

    console.log(`🔍 AI判断開始: ${currentPlayer.name}, 手牌数: ${currentPlayer.hand.tiles.length}, hasDrawn: ${context.hasDrawn}`);
    
    const aiDecision = MahjongAI.decideAction(currentPlayer, this.gameState, context);
    
    console.log(`🔍 AI判断結果: ${currentPlayer.name}`, aiDecision);
    
    if (!aiDecision) {
      console.log(`⚠️ AI判断失敗: ${currentPlayer.name} - AI決定がnull`);
      return []; // 何もしない
    }
    
    // tsumo判定が間違っている場合は強制的に捨牌に変更
    if (aiDecision.type === 'tsumo' && currentPlayer.hand.tiles.length === 14) {
      console.log(`🚫 ${currentPlayer.name} tsumo判定エラー回避 - 強制捨牌に変更`);
      const randomTile = currentPlayer.hand.tiles[Math.floor(Math.random() * currentPlayer.hand.tiles.length)];
      aiDecision.type = 'discard';
      aiDecision.tile = randomTile;
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
      
      // エラーが発生した場合、14枚なら強制的にランダム捨牌
      if (currentPlayer.hand.tiles.length === 14) {
        console.log(`🎲 ${currentPlayer.name} 強制ランダム捨牌実行`);
        const randomTile = currentPlayer.hand.tiles[Math.floor(Math.random() * currentPlayer.hand.tiles.length)];
        const discardAction: PlayerAction = {
          type: 'discard',
          playerId: currentPlayer.id,
          tile: randomTile,
          priority: 1,
          timestamp: Date.now()
        };
        return this.processAction(discardAction);
      }
      
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
    const nextPlayer = this.players[nextPlayerIndex];
    
    this.gameState = {
      ...this.gameState,
      currentPlayer: nextPlayerIndex
    };
    
    console.log(`🔄 ターン進行: Player ${nextPlayerIndex} (${nextPlayer?.name})`);
    
    // 新しいプレイヤーが13枚の場合、自動的にツモを実行
    if (nextPlayer && nextPlayer.hand.tiles.length === 13) {
      console.log(`🎯 ${nextPlayer.name} にツモが必要 (現在${nextPlayer.hand.tiles.length}枚)`);
      this.drawTileForPlayer(nextPlayer);
    }
    
    // CPUプレイヤーの場合、自動ターンをスケジュール（フロントエンド同期のため少し遅延）
    if (nextPlayer && nextPlayer.isBot) {
      setTimeout(() => {
        this.scheduleNextCPUAction();
      }, 500); // 500ms後にスケジュール
    }
  }

  private setNextPlayerTurn(): void {
    const nextPlayerIndex = (this.gameState.currentPlayer + 1) % 4;
    this.gameState = {
      ...this.gameState,
      currentPlayer: nextPlayerIndex
    };
  }

  // プレイヤーにツモを実行
  private drawTileForPlayer(player: Player): void {
    try {
      if (player.hand.tiles.length !== 13) {
        console.log(`⚠️ ${player.name}: 手牌${player.hand.tiles.length}枚のためツモスキップ`);
        return;
      }

      const drawnTile = this.tileManager.drawTile();
      if (!drawnTile) {
        console.log(`💨 山牌がなくなりました - 流局`);
        this.processDrawGame();
        return;
      }

      player.drawTile(drawnTile);
      console.log(`🎯 ${player.name} ツモ: ${drawnTile.displayName} (手牌${player.hand.tiles.length}枚)`);

      // ツモアクションを記録
      const drawAction: GameAction = {
        id: `draw_${Date.now()}`,
        type: 'draw',
        playerId: player.id,
        data: { tile: drawnTile },
        description: `${player.name}がツモ: ${drawnTile.displayName}`,
        timestamp: Date.now(),
      };

      this.gameState = {
        ...this.gameState,
        gameLog: [...this.gameState.gameLog, drawAction]
      };
      this.updateGameState();

    } catch (error) {
      console.error(`❌ ${player.name} ツモエラー:`, error);
    }
  }

  // デバッグモード用：手動ツモ
  allowManualDraw(): boolean {
    return this.debugMode || this.gameState.phase === 'waiting';
  }

  // CPUターンの自動実行をスケジュール
  private scheduleNextCPUAction(): void {
    if (this.debugMode) {
      return; // デバッグモード時は自動実行しない
    }

    const currentPlayerIndex = this.gameState.currentPlayer;
    const currentPlayer = this.players[currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isBot) {
      return; // 人間プレイヤーの場合は何もしない
    }

    // 2-5秒後にCPUアクションを実行（フロントエンド同期とリアルな思考時間をシミュレート）
    const delay = Math.random() * 3000 + 2000; // 2000-5000ms
    
    setTimeout(() => {
      // 実行時点での現在プレイヤーを再取得（ターンが変わっている可能性があるため）
      const actualCurrentPlayer = this.players[this.gameState.currentPlayer];
      
      try {
        if (!actualCurrentPlayer || !actualCurrentPlayer.isBot || actualCurrentPlayer.id !== currentPlayer.id) {
          console.log(`🚫 ${currentPlayer.name}: ターンが変わったためスキップ`);
          return;
        }
        
        console.log(`🤖 ${actualCurrentPlayer.name} 自動ターン開始`);
        
        // CPUの必要なアクションを判定して実行
        if (actualCurrentPlayer.hand.tiles.length === 13) {
          // ツモが必要
          const drawAction: PlayerAction = {
            type: 'draw',
            playerId: actualCurrentPlayer.id,
            priority: 1,
            timestamp: Date.now()
          };
          this.processAction(drawAction);
        } else if (actualCurrentPlayer.hand.tiles.length === 14) {
          // 捨て牌が必要
          const aiActions = this.executeAIAction();
          if (aiActions.length === 0) {
            // AIが判断できない場合はランダムに捨て牌
            const randomTile = actualCurrentPlayer.hand.tiles[Math.floor(Math.random() * actualCurrentPlayer.hand.tiles.length)];
            const discardAction: PlayerAction = {
              type: 'discard',
              playerId: actualCurrentPlayer.id,
              tile: randomTile,
              priority: 1,
              timestamp: Date.now()
            };
            this.processAction(discardAction);
          }
        }
      } catch (error) {
        console.error(`❌ CPU自動ターンエラー (${actualCurrentPlayer?.name || currentPlayer.name}):`, error);
      }
    }, delay);
  }

  // CPU自動対戦モード設定
  setCpuAutoMode(enabled: boolean, speed: number = 300): void {
    this.cpuAutoMode = enabled;
    this.gameSpeed = speed;
    console.log(`🤖 CPU自動対戦モード: ${enabled ? 'ON' : 'OFF'} (速度: ${speed}ms)`);
    
    if (enabled) {
      // 全プレイヤーをCPUにする
      this.players.forEach((player, index) => {
        (player as any)._isBot = true;
        console.log(`🤖 プレイヤー${index} (${player.name}) をCPUに変更`);
      });
      
      // 自動進行開始
      this.startAutoGame();
    }
  }

  // 自動ゲーム進行
  private async startAutoGame(): Promise<void> {
    console.log(`🚀 CPU自動対戦開始: ${this.gameSpeed}ms間隔`);
    
    let turnCount = 0;
    const maxTurns = 300; // 無限ループ防止
    
    while (this.cpuAutoMode && this.gameState.phase !== 'finished' && turnCount < maxTurns) {
      await this.sleep(this.gameSpeed);
      
      try {
        const executed = await this.executeNextCpuTurn();
        if (executed) {
          turnCount++;
          
          // 定期的にゲーム状況をログ出力
          if (turnCount % 20 === 0) {
            this.logGameProgress();
          }
        } else {
          // アクションが実行されなかった場合は次のプレイヤーに
          this.gameState = {
            ...this.gameState,
            currentPlayer: (this.gameState.currentPlayer + 1) % 4,
            updatedAt: Date.now()
          };
        }
      } catch (error) {
        console.error(`❌ CPU自動実行エラー (ターン${turnCount}):`, error);
        this.gameState = {
          ...this.gameState,
          currentPlayer: (this.gameState.currentPlayer + 1) % 4,
          updatedAt: Date.now()
        }; // エラー時も進行
      }
    }
    
    console.log(`🏁 CPU自動対戦終了 (${turnCount}ターン実行)`);
    this.logFinalResults();
  }

  // CPUターン実行
  private async executeNextCpuTurn(): Promise<boolean> {
    // 流局チェック
    if (this.gameState.remainingTiles <= 0) {
      console.log(`💨 流局発生: 残り牌${this.gameState.remainingTiles}枚`);
      this.processDrawGame();
      return true;
    }

    // 鳴き機会チェック（最優先）
    if (this.gameState.availableActions.length > 0) {
      console.log(`🎴 鳴き機会検出: ${this.gameState.availableActions.length}件`);
      
      // 鳴き機会があるプレイヤーを確認
      for (const action of this.gameState.availableActions) {
        const player = this.players[parseInt(action.playerId.replace('player_', ''))];
        if (player.isBot) {
          // CPUが鳴きを判断（簡易版：30%の確率で鳴く）
          const shouldMeld = Math.random() < 0.3;
          
          if (shouldMeld) {
            console.log(`🎴 ${player.name}: ${action.type}実行決定`);
            this.processAction(action);
            return true;
          } else {
            console.log(`🎲 ${player.name}: ${action.type}見送り`);
          }
        }
      }
      
      // 全プレイヤーが見送った場合、鳴き機会をクリア
      this.gameState = {
        ...this.gameState,
        availableActions: []
      };
    }

    const currentPlayer = this.players[this.gameState.currentPlayer];
    
    console.log(`🎮 ${currentPlayer.name} (P${this.gameState.currentPlayer}) ターン: 手牌${currentPlayer.hand.tiles.length}枚`);
    
    try {
      if (currentPlayer.hand.tiles.length === 13) {
        // ツモ処理
        console.log(`🎯 ${currentPlayer.name}: ツモ実行`);
        this.processDraw(currentPlayer);
        return true;
        
      } else if (currentPlayer.hand.tiles.length === 14) {
        // AI判断実行
        const aiActions = this.executeAIAction();
        
        if (aiActions.length > 0) {
          console.log(`✅ ${currentPlayer.name}: ${aiActions[0].type} 実行`);
          return true;
        } else {
          // ランダム捨牌
          console.log(`🎲 ${currentPlayer.name}: ランダム捨牌`);
          const randomTile = currentPlayer.hand.tiles[Math.floor(Math.random() * currentPlayer.hand.tiles.length)];
          const discardAction: PlayerAction = {
            type: 'discard',
            playerId: currentPlayer.position.toString(),
            priority: 1,
            timestamp: Date.now(),
            tile: randomTile
          };
          this.processAction(discardAction);
          return true;
        }
      }
    } catch (error) {
      console.error(`❌ ${currentPlayer.name} アクション失敗:`, error);
    }
    
    return false;
  }

  // 流局処理
  private processDrawGame(): void {
    console.log(`💨 === 流局処理開始 ===`);
    
    // テンパイ確認
    const tenpaiPlayers: number[] = [];
    this.players.forEach((player, index) => {
      if (this.isTenpai(player)) {
        tenpaiPlayers.push(index);
        console.log(`✅ ${player.name}: テンパイ`);
      } else {
        console.log(`❌ ${player.name}: ノーテン`);
      }
    });

    // 点数移動（ノーテン罰符）
    if (tenpaiPlayers.length > 0 && tenpaiPlayers.length < 4) {
      const tenpaiBonus = Math.floor(3000 / tenpaiPlayers.length);
      const notenPenalty = Math.floor(3000 / (4 - tenpaiPlayers.length));

      this.players.forEach((player, index) => {
        if (tenpaiPlayers.includes(index)) {
          player.addScore(tenpaiBonus);
          console.log(`💰 ${player.name}: +${tenpaiBonus}点 (テンパイ料)`);
        } else {
          player.addScore(-notenPenalty);
          console.log(`💸 ${player.name}: -${notenPenalty}点 (ノーテン罰符)`);
        }
      });
    }

    // 親番・局数の処理
    const dealerTenpai = tenpaiPlayers.includes(this.gameState.round.dealerPosition);
    let newRound = { ...this.gameState.round };
    
    if (dealerTenpai) {
      // 親テンパイ → 連荘（本場数増加）
      newRound.honbaCount = this.gameState.round.honbaCount + 1;
      console.log(`🔄 親テンパイのため連荘: ${newRound.roundNumber}局${newRound.honbaCount}本場`);
    } else {
      // 親ノーテン → 親流し（親番移動）
      const newDealerPosition = (this.gameState.round.dealerPosition + 1) % 4;
      
      if (newDealerPosition === 0) {
        // 一周して東に戻る → 南場へ or 終了
        if (this.gameState.round.prevailingWind === 'east') {
          newRound = {
            roundNumber: 1,
            dealerPosition: 0,
            prevailingWind: 'south',
            honbaCount: 0,
            riichiSticks: this.gameState.round.riichiSticks
          };
          console.log(`🌅 東場終了 → 南1局開始`);
        } else {
          // 南場終了 → ゲーム終了
          newRound = {
            roundNumber: 5, // 終了フラグ
            dealerPosition: 0,
            prevailingWind: 'south', // 型エラー回避
            honbaCount: 0,
            riichiSticks: this.gameState.round.riichiSticks
          };
          console.log(`🏁 半荘終了`);
          
          // ゲーム終了処理
          this.gameState = {
            ...this.gameState,
            phase: 'finished' as any
          };
        }
      } else {
        // 同場内での親番移動
        newRound.roundNumber = this.gameState.round.roundNumber + 1;
        newRound.dealerPosition = newDealerPosition;
        newRound.honbaCount = 0; // 本場リセット
        
        const windNames = ['東', '南', '西', '北'];
        console.log(`🔄 親流し: ${this.gameState.round.prevailingWind}${newRound.roundNumber}局 (${windNames[newDealerPosition]}家が親)`);
      }
    }
    
    this.gameState = {
      ...this.gameState,
      round: newRound
    };

    // ログ追加
    const dealerAction = dealerTenpai ? '連荘' : '親流し';
    const newLog: GameAction = {
      id: `draw_${Date.now()}`,
      type: 'draw_game' as const,
      description: `流局 - テンパイ${tenpaiPlayers.length}人、${dealerAction} → ${this.gameState.round.prevailingWind}${this.gameState.round.roundNumber}局${this.gameState.round.honbaCount}本場`,
      timestamp: Date.now()
    };
    this.gameState = {
      ...this.gameState,
      gameLog: [...this.gameState.gameLog, newLog]
    };

    console.log(`🏁 流局完了 - 次は${this.gameState.round.honbaCount}本場`);
    
    // 次局準備
    this.startNewRound();
  }

  // テンパイ判定（簡易版）
  private isTenpai(player: Player): boolean {
    const tiles = [...player.hand.tiles];
    const melds = player.hand.melds;
    
    // 14枚の場合は1枚捨てて13枚で判定
    if (tiles.length === 14) {
      tiles.pop();
    }
    
    // 簡易的なテンパイ判定：13枚で任意の1枚でアガリ形になるかチェック
    const allTiles = this.getAllUniqueTiles();
    
    for (const testTile of allTiles) {
      const testHand = [...tiles, testTile];
      if (HandAnalyzer.isWinningHand(testHand, [...melds])) {
        return true;
      }
    }
    
    return false;
  }

  // 全牌種取得
  private getAllUniqueTiles(): Tile[] {
    const uniqueTiles: Tile[] = [];
    
    // 数牌 1-9
    for (let suit of ['man', 'pin', 'sou'] as const) {
      for (let rank = 1; rank <= 9; rank++) {
        uniqueTiles.push({
          id: 0,
          suit,
          rank: rank as any,
          isRed: false,
          displayName: `${rank}${suit.charAt(0)}`,
          unicode: '🀀'
        });
      }
    }
    
    // 字牌
    for (let honor of ['east', 'south', 'west', 'north', 'white', 'green', 'red'] as const) {
      uniqueTiles.push({
        id: 0,
        suit: 'ji',
        honor,
        isRed: false,
        displayName: honor,
        unicode: '🀀'
      });
    }
    
    return uniqueTiles;
  }

  // 新局開始
  private startNewRound(): void {
    console.log(`🎊 新局準備開始`);
    
    // 牌山リセット
    this.tileManager = new TileManager(this.debugMode);
    
    // プレイヤー手牌リセット & 風更新
    this.players.forEach((player, index) => {
      player.clearHand();
      // 風の更新（親を基準に相対的に決定）
      const relativePosition = (index - this.gameState.round.dealerPosition + 4) % 4;
      const winds = ['east', 'south', 'west', 'north'] as const;
      const newWind = winds[relativePosition];
      
      // プレイヤーの風とディーラーフラグ更新
      player.updatePosition(index, newWind, index === this.gameState.round.dealerPosition);
    });
    
    // 配牌
    const hands = this.tileManager.dealInitialHands();
    hands.forEach((hand, index) => {
      this.players[index].setHand(hand);
    });
    
    // ゲーム状態更新
    this.gameState = {
      ...this.gameState,
      currentPlayer: this.gameState.round.dealerPosition,
      remainingTiles: this.tileManager.getRemainingTileCount(),
      doraIndicators: this.tileManager.getDebugInfo().doraIndicators,
      phase: 'playing',
      updatedAt: Date.now()
    };
    
    console.log(`✅ ${this.gameState.round.roundNumber}局${this.gameState.round.honbaCount}本場 開始`);
  }

  // ゲーム進行状況ログ
  private logGameProgress(): void {
    console.log(`\n📊 === ゲーム進行状況 ===`);
    console.log(`🏁 ${this.gameState.round.roundNumber}局${this.gameState.round.honbaCount}本場 (${this.gameState.round.prevailingWind}場)`);
    console.log(`👑 親: ${this.players[this.gameState.round.dealerPosition].name}`);
    console.log(`🎯 現在: ${this.players[this.gameState.currentPlayer].name}`);
    console.log(`🃏 残り牌: ${this.gameState.remainingTiles}枚`);
    console.log(`💰 供託: ${this.gameState.round.riichiSticks}本`);
    
    // プレイヤー状況
    this.players.forEach((player, index) => {
      const status = [];
      if (player.hand.riichi) status.push('🔴リーチ');
      if (player.hand.melds.length > 0) status.push(`🎴鳴き${player.hand.melds.length}`);
      if (player.isDealer) status.push('👑親');
      
      const statusText = status.length > 0 ? ` [${status.join(', ')}]` : '';
      console.log(`  P${index} ${player.name}: ${player.score}点, 手牌${player.hand.tiles.length}枚, 捨牌${player.hand.discards.length}枚${statusText}`);
    });
    
    // 最近のアクション
    const recentActions = this.gameState.gameLog.slice(-5);
    console.log(`📋 最近のアクション:`);
    recentActions.forEach(action => {
      console.log(`  ${action.description}`);
    });
    console.log(`========================\n`);
  }

  // 最終結果ログ
  private logFinalResults(): void {
    console.log(`\n🏆 === ゲーム最終結果 ===`);
    
    // 点数順にソート
    const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score);
    
    sortedPlayers.forEach((player, rank) => {
      const icons = ['🥇', '🥈', '🥉', '4️⃣'];
      const positions = ['1位', '2位', '3位', '4位'];
      console.log(`  ${icons[rank]} ${positions[rank]}: ${player.name} - ${player.score}点`);
    });
    
    // ゲーム統計
    const totalDiscards = this.players.reduce((sum, p) => sum + p.hand.discards.length, 0);
    const totalMelds = this.players.reduce((sum, p) => sum + p.hand.melds.length, 0);
    const riichiCount = this.players.filter(p => p.hand.riichi).length;
    
    console.log(`\n📊 ゲーム統計:`);
    console.log(`  総捨牌数: ${totalDiscards}枚`);
    console.log(`  総鳴き数: ${totalMelds}回`);
    console.log(`  リーチ者数: ${riichiCount}人`);
    console.log(`  総アクション: ${this.gameState.gameLog.length}回`);
    console.log(`========================\n`);
  }

  // 待機用ヘルパー
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // CPU自動対戦モード取得
  get isCpuAutoMode(): boolean {
    return this.cpuAutoMode;
  }
}