import { Tile } from '../../shared/types/Tile';
import { Hand, Meld } from '../../shared/types/Hand';
import { Player } from '../models/Player';
import { GameState } from '../../shared/types/Game';
import { WaitAnalyzer } from '../utils/WaitAnalyzer';
import { ScoreCalculator } from '../utils/ScoreCalculator';
import { HandAnalyzer } from '../utils/HandAnalyzer';

// AI難易度設定
enum AILevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate', 
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

// AI戦略タイプ
enum AIStrategy {
  DEFENSIVE = 'defensive',   // 守備重視
  AGGRESSIVE = 'aggressive', // 攻撃重視
  BALANCED = 'balanced',     // バランス型
  YAKU_HUNTER = 'yaku_hunter' // 高得点狙い
}

// 麻雀AI思考エンジン
export class MahjongAI {
  private static aiLevel: AILevel = AILevel.ADVANCED;
  private static strategy: AIStrategy = AIStrategy.BALANCED;
  
  // AI設定
  static setAILevel(level: AILevel): void {
    this.aiLevel = level;
  }
  
  static setStrategy(strategy: AIStrategy): void {
    this.strategy = strategy;
  }
  
  // メイン思考エンジン: 捨牌を決定
  static selectDiscardTile(player: Player, gameState: GameState): Tile | null {
    const tiles = [...player.hand.tiles];
    
    if (tiles.length !== 14) {
      return null;
    }

    // 包括的な手牌分析
    const handAnalysis = this.analyzeHand(tiles, [...player.hand.melds], gameState, player);
    
    // 戦略に基づく捨て牌選択
    return this.selectOptimalDiscard(handAnalysis, gameState, player);
  }

  // 包括的手牌分析
  private static analyzeHand(tiles: Tile[], melds: Meld[], gameState: GameState, player: Player) {
    const waitAnalysis = WaitAnalyzer.analyzeWaits(tiles, melds);
    
    // 各牌を捨てた場合のシャンテン数変化を計算
    const discardOptions = tiles.map(tile => {
      const remainingTiles = tiles.filter(t => t.id !== tile.id);
      const newShanten = WaitAnalyzer.calculateShanten(remainingTiles, melds);
      
      return {
        tile,
        newShanten,
        shantenChange: newShanten - waitAnalysis.shanten,
        safety: this.evaluateSafety(tile, gameState),
        yakuPotential: this.evaluateYakuPotential(remainingTiles, melds, gameState, player),
        efficiency: this.evaluateEfficiency(tile, remainingTiles, gameState)
      };
    });

    return {
      currentShanten: waitAnalysis.shanten,
      isTempai: waitAnalysis.tempai,
      waitTiles: waitAnalysis.waitTiles,
      discardOptions,
      handType: this.classifyHandType(tiles, melds),
      gamePhase: this.determineGamePhase(gameState)
    };
  }

  // 最適な捨て牌選択
  private static selectOptimalDiscard(handAnalysis: any, gameState: GameState, player: Player): Tile {
    const { discardOptions, isTempai, gamePhase } = handAnalysis;
    
    // テンパイ時は安全性優先
    if (isTempai) {
      return this.selectSafestTempaiDiscard(discardOptions, gameState);
    }
    
    // ゲーム終盤では安全性を重視
    if (gamePhase === 'late' && gameState.remainingTiles < 30) {
      return this.selectDefensiveDiscard(discardOptions);
    }
    
    // 戦略に基づく選択
    switch (this.strategy) {
      case AIStrategy.AGGRESSIVE:
        return this.selectAggressiveDiscard(discardOptions);
      case AIStrategy.DEFENSIVE:
        return this.selectDefensiveDiscard(discardOptions);
      case AIStrategy.YAKU_HUNTER:
        return this.selectYakuFocusedDiscard(discardOptions);
      default:
        return this.selectBalancedDiscard(discardOptions);
    }
  }

  // 安全性評価 (0-100: 高いほど安全)
  private static evaluateSafety(tile: Tile, gameState: GameState): number {
    let safety = 50; // 基準値

    // 字牌は比較的安全
    if (tile.honor) {
      safety += 20;
      
      // 役牌は危険
      if (['white', 'green', 'red'].includes(tile.honor)) {
        safety -= 15;
      }
    } else {
      // 端牌は安全
      if (tile.rank === 1 || tile.rank === 9) {
        safety += 15;
      } else if (tile.rank === 2 || tile.rank === 8) {
        safety += 5;
      } else {
        // 中張牌は危険
        safety -= 10;
      }
    }

    // リーチプレイヤーがいる場合の安全性評価
    const riichiPlayers = gameState.players.filter(p => p.status === 'riichi');
    if (riichiPlayers.length > 0) {
      // すでに捨てられた牌は安全
      const allDiscards = gameState.players.flatMap(p => p.hand.discards);
      const isSafeCard = allDiscards.some(d => 
        d.suit === tile.suit && d.rank === tile.rank && d.honor === tile.honor
      );
      
      if (isSafeCard) {
        safety += 30;
      } else {
        safety -= 20; // 新しい牌は危険
      }
    }

    return Math.max(0, Math.min(100, safety));
  }

  // 役のポテンシャル評価
  private static evaluateYakuPotential(tiles: Tile[], melds: Meld[], gameState: GameState, player: Player): number {
    let potential = 0;

    // 現在の役をチェック
    try {
      const currentYaku = HandAnalyzer.analyzeYaku(tiles, melds, {
        isRiichi: player.status === 'riichi',
        isTsumo: false,
        isDealer: player.isDealer,
        seatWind: player.wind,
        roundWind: gameState.round.prevailingWind,
        doraCount: this.countDora(tiles, gameState)
      });

      potential += currentYaku.reduce((sum, yaku) => sum + yaku.han, 0) * 10;
    } catch (error) {
      // エラーの場合は基本評価
    }

    // タンヤオのポテンシャル
    const hasTerminalsOrHonors = tiles.some(t => t.honor || t.rank === 1 || t.rank === 9);
    if (!hasTerminalsOrHonors) {
      potential += 15; // タンヤオ確定
    }

    // 清一色・混一色のポテンシャル
    const suits = new Set(tiles.filter(t => !t.honor).map(t => t.suit));
    if (suits.size === 1) {
      const hasHonors = tiles.some(t => t.honor);
      potential += hasHonors ? 25 : 50; // 混一色または清一色
    }

    // 対々和のポテンシャル
    const pairs = this.countPairs(tiles);
    if (pairs >= 3) {
      potential += 20;
    }

    return potential;
  }

  // 効率性評価
  private static evaluateEfficiency(tile: Tile, remainingTiles: Tile[], gameState: GameState): number {
    let efficiency = 0;

    // 受け入れ枚数の計算（簡易版）
    const acceptanceCount = this.calculateAcceptance(tile, remainingTiles, gameState);
    efficiency += acceptanceCount * 5;

    // 孤立牌の評価
    if (this.isIsolatedTile(tile, remainingTiles)) {
      efficiency -= 15;
    }

    // 両面搭子の価値
    if (this.isPartOfRyanmen(tile, remainingTiles)) {
      efficiency += 10;
    }

    return efficiency;
  }

  // 戦略的選択メソッド群
  private static selectBalancedDiscard(discardOptions: any[]): Tile {
    // バランス型: 安全性、効率性、役のポテンシャルを総合評価
    const scored = discardOptions.map(option => ({
      ...option,
      totalScore: option.safety * 0.4 + option.efficiency * 0.4 + option.yakuPotential * 0.2 - option.shantenChange * 100
    }));

    scored.sort((a, b) => a.totalScore - b.totalScore);
    return scored[0].tile;
  }

  private static selectAggressiveDiscard(discardOptions: any[]): Tile {
    // 攻撃型: 効率性と役のポテンシャル重視
    const scored = discardOptions.map(option => ({
      ...option,
      totalScore: option.efficiency * 0.6 + option.yakuPotential * 0.4 - option.shantenChange * 150
    }));

    scored.sort((a, b) => a.totalScore - b.totalScore);
    return scored[0].tile;
  }

  private static selectDefensiveDiscard(discardOptions: any[]): Tile {
    // 守備型: 安全性最優先
    const scored = discardOptions.map(option => ({
      ...option,
      totalScore: option.safety * 0.8 + option.efficiency * 0.2 - option.shantenChange * 50
    }));

    scored.sort((a, b) => a.totalScore - b.totalScore);
    return scored[0].tile;
  }

  private static selectYakuFocusedDiscard(discardOptions: any[]): Tile {
    // 役重視型: 高得点役のポテンシャル最優先
    const scored = discardOptions.map(option => ({
      ...option,
      totalScore: option.yakuPotential * 0.7 + option.efficiency * 0.3 - option.shantenChange * 200
    }));

    scored.sort((a, b) => a.totalScore - b.totalScore);
    return scored[0].tile;
  }

  private static selectSafestTempaiDiscard(discardOptions: any[], gameState: GameState): Tile {
    // テンパイ時: 安全性を最重視
    const safest = discardOptions.reduce((best, current) => 
      current.safety > best.safety ? current : best
    );

    return safest.tile;
  }

  // ヘルパーメソッド群
  private static classifyHandType(tiles: Tile[], melds: Meld[]): string {
    const honors = tiles.filter(t => t.honor).length;
    const suits = new Set(tiles.filter(t => !t.honor).map(t => t.suit));
    
    if (honors > 6) return 'honor_heavy';
    if (suits.size === 1) return 'flush';
    if (suits.size === 2) return 'two_suit';
    return 'mixed';
  }

  private static determineGamePhase(gameState: GameState): string {
    const remaining = gameState.remainingTiles;
    if (remaining > 60) return 'early';
    if (remaining > 30) return 'middle';
    return 'late';
  }

  private static countDora(tiles: Tile[], gameState: GameState): number {
    let count = 0;
    
    // 赤ドラ
    count += tiles.filter(t => t.isRed).length;
    
    // 表ドラ（簡易実装）
    if (gameState.doraIndicators && gameState.doraIndicators.length > 0) {
      const indicator = gameState.doraIndicators[0];
      count += tiles.filter(t => this.isDoraMatch(t, indicator)).length;
    }
    
    return count;
  }

  private static isDoraMatch(tile: Tile, indicator: Tile): boolean {
    if (tile.honor && indicator.honor) {
      const honorOrder = ['east', 'south', 'west', 'north', 'white', 'green', 'red'];
      const indicatorIndex = honorOrder.indexOf(indicator.honor);
      const nextIndex = (indicatorIndex + 1) % honorOrder.length;
      return tile.honor === honorOrder[nextIndex];
    } else if (!tile.honor && !indicator.honor && tile.suit === indicator.suit) {
      const nextRank = indicator.rank === 9 ? 1 : indicator.rank! + 1;
      return tile.rank === nextRank;
    }
    return false;
  }

  private static countPairs(tiles: Tile[]): number {
    const counts = new Map<string, number>();
    tiles.forEach(tile => {
      const key = tile.honor ? `ji_${tile.honor}` : `${tile.suit}_${tile.rank}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    
    return Array.from(counts.values()).filter(count => count >= 2).length;
  }

  private static calculateAcceptance(tile: Tile, remainingTiles: Tile[], gameState: GameState): number {
    // 簡易実装: この牌を捨てることで改善される受け入れ枚数
    if (tile.honor) return 2;
    if (tile.rank === 1 || tile.rank === 9) return 3;
    return 5; // 中張牌はより多くの受け入れ
  }

  private static isIsolatedTile(tile: Tile, tiles: Tile[]): boolean {
    if (tile.honor) return true;
    
    // 前後の牌があるかチェック
    const hasAdjacent = tiles.some(t => 
      t.suit === tile.suit && Math.abs(t.rank! - tile.rank!) === 1
    );
    
    const hasSame = tiles.some(t => 
      t.suit === tile.suit && t.rank === tile.rank && t.id !== tile.id
    );
    
    return !hasAdjacent && !hasSame;
  }

  private static isPartOfRyanmen(tile: Tile, tiles: Tile[]): boolean {
    if (tile.honor || tile.rank === 1 || tile.rank === 9) return false;
    
    const hasLeft = tiles.some(t => t.suit === tile.suit && t.rank === tile.rank! - 1);
    const hasRight = tiles.some(t => t.suit === tile.suit && t.rank === tile.rank! + 1);
    
    return hasLeft || hasRight;
  }

  // 改善された鳴き判定
  static shouldMeld(player: Player, discardedTile: Tile, fromPlayer: number, gameState: GameState): string | null {
    const possibleMelds = player.canMeld(discardedTile, fromPlayer);
    
    if (possibleMelds.length === 0) {
      return null;
    }

    const hand = [...player.hand.tiles];
    const currentShanten = WaitAnalyzer.calculateShanten(hand, [...player.hand.melds]);
    
    // カンは基本的に有利
    if (possibleMelds.some(m => m.type === 'kan')) {
      return 'kan';
    }
    
    // ポンの評価
    if (possibleMelds.some(m => m.type === 'pon')) {
      // 対々和を狙える場合
      const pairs = this.countPairs(hand);
      if (pairs >= 2 || currentShanten <= 2) {
        return 'pon';
      }
      
      // 役牌の場合は積極的に
      if (['white', 'green', 'red'].includes(discardedTile.honor!)) {
        return 'pon';
      }
    }
    
    // チーの評価（上家からのみ）
    if (possibleMelds.some(m => m.type === 'chi') && fromPlayer === (player.position + 3) % 4) {
      // シャンテンが進む場合のみ
      const testHand = hand.filter(t => t.id !== discardedTile.id);
      const newShanten = WaitAnalyzer.calculateShanten(testHand, [...player.hand.melds]);
      
      if (newShanten < currentShanten) {
        // タンヤオが崩れないかチェック
        const wouldBreakTanyao = discardedTile.honor || discardedTile.rank === 1 || discardedTile.rank === 9;
        const isCurrentlyTanyao = hand.every(t => !t.honor && t.rank !== 1 && t.rank !== 9);
        
        if (!isCurrentlyTanyao || !wouldBreakTanyao) {
          return 'chi';
        }
      }
    }
    
    return null;
  }

  // 改善された和了判定
  static shouldWin(player: Player, winType: 'tsumo' | 'ron', gameState: GameState): boolean {
    const hand = [...player.hand.tiles];
    const melds = [...player.hand.melds];
    
    try {
      // 役があるかチェック
      const yaku = HandAnalyzer.analyzeYaku(hand, melds, {
        isRiichi: player.status === 'riichi',
        isTsumo: winType === 'tsumo',
        isDealer: player.isDealer,
        seatWind: player.wind,
        roundWind: gameState.round.prevailingWind,
        doraCount: this.countDora(hand, gameState)
      });
      
      if (yaku.length === 0) {
        return false; // 役なしでは和了できない
      }
      
      // 点数計算
      const scoreResult = HandAnalyzer.calculateScore(yaku, 30, player.isDealer);
      
      // 低得点でも終盤なら和了
      if (gameState.remainingTiles < 20) {
        return true;
      }
      
      // 満貫以上なら積極的に和了
      if (scoreResult.han >= 5) {
        return true;
      }
      
      // 戦略に応じた判定
      switch (this.strategy) {
        case AIStrategy.AGGRESSIVE:
          return scoreResult.han >= 2;
        case AIStrategy.YAKU_HUNTER:
          return scoreResult.han >= 3;
        default:
          return scoreResult.han >= 1;
      }
      
    } catch (error) {
      return false;
    }
  }

  // ツモ判定（既存のメソッドを改善）
  static shouldDraw(player: Player, gameState: GameState): boolean {
    return player.hand.tiles.length === 13;
  }

  // AI行動の統合決定メソッド
  static decideAction(player: Player, gameState: GameState, context: {
    hasDrawn: boolean;
    lastDiscard?: Tile;
    lastDiscardPlayer?: number;
  }): { type: string; tile?: Tile; meldType?: string } | null {
    
    // 和了可能かチェック
    if (context.hasDrawn && player.hand.tiles.length === 14) {
      if (this.shouldWin(player, 'tsumo', gameState)) {
        return { type: 'tsumo' };
      }
    }
    
    // ロン和了チェック
    if (context.lastDiscard && context.lastDiscardPlayer !== undefined) {
      if (this.shouldWin(player, 'ron', gameState)) {
        return { type: 'ron', tile: context.lastDiscard };
      }
    }
    
    // 鳴きチェック
    if (context.lastDiscard && context.lastDiscardPlayer !== undefined) {
      const meldType = this.shouldMeld(player, context.lastDiscard, context.lastDiscardPlayer, gameState);
      if (meldType) {
        return { type: meldType, tile: context.lastDiscard };
      }
    }
    
    // ツモ
    if (!context.hasDrawn && this.shouldDraw(player, gameState)) {
      return { type: 'draw' };
    }
    
    // 捨牌
    if (context.hasDrawn && player.hand.tiles.length === 14) {
      const discardTile = this.selectDiscardTile(player, gameState);
      if (discardTile) {
        return { type: 'discard', tile: discardTile };
      }
    }
    
    return null;
  }
}

// enumをエクスポート
export { AILevel, AIStrategy };
