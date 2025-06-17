import { Tile } from '../../shared/types/Tile';
import { Hand, Meld } from '../../shared/types/Hand';
import { Player } from '../models/Player';
import { GameState } from '../../shared/types/Game';
import { WaitAnalyzer } from '../utils/WaitAnalyzer';
import { ScoreCalculator } from '../utils/ScoreCalculator';

// 麻雀AI思考エンジン
export class MahjongAI {
  
  // 高度AI: 捨牌を決定
  static selectDiscardTile(player: Player, gameState: GameState): Tile | null {
    const tiles = [...player.hand.tiles];
    
    if (tiles.length !== 14) {
      return null; // 14枚でない場合は捨牌できない
    }

    // 待ち牌分析
    const waitAnalysis = WaitAnalyzer.analyzeWaits(tiles, [...player.hand.melds]);
    
    // テンパイしている場合は危険度を考慮
    if (waitAnalysis.tempai) {
      return this.selectSafestDiscard(tiles, gameState, player);
    }
    
    // 各牌の価値を評価して最適な捨て牌を選択
    const tileScores = tiles.map(tile => ({
      tile,
      score: this.evaluateTileValue(tile, tiles, gameState, player)
    }));
    
    // 最も価値の低い牌を捨てる
    tileScores.sort((a, b) => a.score - b.score);
    return tileScores[0].tile;
  }
  
  // 牌の価値評価
  private static evaluateTileValue(
    tile: Tile, 
    hand: Tile[], 
    gameState: GameState, 
    player: Player
  ): number {
    let score = 0;
    
    // 基本的な危険度（字牌・端牌は安全）
    if (tile.honor) {
      score -= 10; // 字牌は比較的安全
    } else if (tile.rank === 1 || tile.rank === 9) {
      score -= 5; // 端牌も比較的安全
    }
    
    // 手牌改善への貢献度
    const remainingHand = hand.filter(t => t !== tile);
    const originalShanten = WaitAnalyzer.analyzeWaits(hand, [...player.hand.melds]).shanten;
    const newShanten = WaitAnalyzer.analyzeWaits(remainingHand, [...player.hand.melds]).shanten;
    
    if (newShanten < originalShanten) {
      score += 50; // シャンテンが進む場合は捨てやすい
    } else if (newShanten > originalShanten) {
      score -= 30; // シャンテンが戻る場合は捨てにくい
    }
    
    // 同じ牌の枚数
    const sameCount = hand.filter(t => 
      t.suit === tile.suit && t.rank === tile.rank && t.honor === tile.honor
    ).length;
    if (sameCount >= 2) {
      score += 20; // 重複牌は捨てやすい
    }
    
    // リーチプレイヤーがいる場合の安全度
    const hasRiichiPlayer = gameState.players.some(p => p.status === 'riichi');
    if (hasRiichiPlayer) {
      const opponentDiscards = gameState.players.map(p => [...p.hand.discards]);
      const riichiPlayers = gameState.players.map(p => p.status === 'riichi');
      const safety = WaitAnalyzer.isSafeTile(tile, opponentDiscards, riichiPlayers);
      
      switch (safety.safety) {
        case 'safe':
          score -= 30;
          break;
        case 'risky':
          score += 10;
          break;
        case 'dangerous':
          score += 50;
          break;
      }
    }
    
    return score;
  }
  
  // 最も安全な捨て牌を選択
  private static selectSafestDiscard(
    hand: Tile[], 
    gameState: GameState, 
    player: Player
  ): Tile {
    const opponentDiscards = gameState.players.map(p => [...p.hand.discards]);
    const riichiPlayers = gameState.players.map(p => p.status === 'riichi');
    
    const safeTiles = hand.filter(tile => {
      const safety = WaitAnalyzer.isSafeTile(tile, opponentDiscards, riichiPlayers);
      return safety.safety === 'safe';
    });
    
    if (safeTiles.length > 0) {
      return safeTiles[0];
    }
    
    // 安全牌がない場合は最もリスクの低い牌
    const riskyTiles = hand.filter(tile => {
      const safety = WaitAnalyzer.isSafeTile(tile, opponentDiscards, riichiPlayers);
      return safety.safety === 'risky';
    });
    
    return riskyTiles.length > 0 ? riskyTiles[0] : hand[0];
  }

  // ツモするかどうかを判定
  static shouldDraw(player: Player, gameState: GameState): boolean {
    // 手牌が13枚の時のみツモ
    return player.hand.tiles.length === 13;
  }

  // 鳴くかどうかを判定
  static shouldMeld(player: Player, discardedTile: Tile, fromPlayer: number, gameState: GameState): string | null {
    const possibleMelds = player.canMeld(discardedTile, fromPlayer);
    
    if (possibleMelds.length === 0) {
      return null;
    }

    // 簡易判定: ポン・カンを優先
    if (possibleMelds.some(m => m.type === 'kan')) {
      return 'kan';
    }
    
    if (possibleMelds.some(m => m.type === 'pon')) {
      return 'pon';
    }
    
    // チーは条件が良い場合のみ
    if (possibleMelds.some(m => m.type === 'chi')) {
      // 手牌の進行度が低い場合のみチー
      const handProgress = this.evaluateHandProgress([...player.hand.tiles]);
      if (handProgress < 0.5) {
        return 'chi';
      }
    }
    
    return null; // 鳴かない
  }

  // 和了するかどうかを判定
  static shouldWin(player: Player, winType: 'tsumo' | 'ron', gameState: GameState): boolean {
    // 常に和了を狙う（簡易AI）
    return true;
  }

  // 役牌でない字牌を探す
  private static findNonYakumanHonors(tiles: Tile[], gameState: GameState): Tile[] {
    const result: Tile[] = [];
    
    for (const tile of tiles) {
      if (tile.honor) {
        // 自風・場風・三元牌以外は優先的に捨てる
        const isPlayerWind = tile.honor === gameState.players[0].wind; // 簡易判定
        const isPrevailingWind = tile.honor === gameState.round.prevailingWind;
        const isDragon = ['haku', 'hatsu', 'chun'].includes(tile.honor);
        
        if (!isPlayerWind && !isPrevailingWind && !isDragon) {
          result.push(tile);
        }
      }
    }
    
    return result;
  }

  // 孤立した端牌を探す
  private static findIsolatedTerminals(tiles: Tile[]): Tile[] {
    const result: Tile[] = [];
    const tileCounts = this.countTilesByType(tiles);
    
    for (const tile of tiles) {
      if (!tile.honor && (tile.rank === 1 || tile.rank === 9)) {
        const key = `${tile.suit}_${tile.rank}`;
        
        // この牌が1枚しかなく、隣接する牌もない場合
        if (tileCounts.get(key) === 1) {
          const hasAdjacent = this.hasAdjacentTiles(tile, tileCounts);
          if (!hasAdjacent) {
            result.push(tile);
          }
        }
      }
    }
    
    return result;
  }

  // 最も不要そうな牌を探す（簡易評価）
  private static findLeastUsefulTile(tiles: Tile[]): Tile {
    // ランダムに選択（より高度なAIでは牌効率を計算）
    return tiles[Math.floor(Math.random() * tiles.length)];
  }

  // 手牌の進行度を評価（0-1）
  private static evaluateHandProgress(tiles: Tile[]): number {
    // 簡易評価: 対子・搭子の数をカウント
    const tileCounts = this.countTilesByType([...tiles]);
    let pairs = 0;
    let sequences = 0;
    
    for (const count of tileCounts.values()) {
      if (count >= 2) pairs++;
    }
    
    // より詳細な評価が必要だが、ここでは簡易版
    return Math.min(1.0, (pairs + sequences) / 6);
  }

  // 隣接する牌があるかチェック
  private static hasAdjacentTiles(tile: Tile, tileCounts: Map<string, number>): boolean {
    if (tile.honor) return false;
    
    const suit = tile.suit!;
    const rank = tile.rank!;
    
    // 左隣
    if (rank > 1) {
      const leftKey = `${suit}_${rank - 1}`;
      if (tileCounts.has(leftKey) && tileCounts.get(leftKey)! > 0) {
        return true;
      }
    }
    
    // 右隣
    if (rank < 9) {
      const rightKey = `${suit}_${rank + 1}`;
      if (tileCounts.has(rightKey) && tileCounts.get(rightKey)! > 0) {
        return true;
      }
    }
    
    return false;
  }

  // 牌の種類別カウント
  private static countTilesByType(tiles: Tile[]): Map<string, number> {
    const counts = new Map<string, number>();
    
    for (const tile of tiles) {
      const key = tile.honor ? `ji_${tile.honor}` : `${tile.suit}_${tile.rank}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    
    return counts;
  }

  // AI行動の決定（統合）
  static decideAction(player: Player, gameState: GameState, context: {
    hasDrawn: boolean;
    lastDiscard?: Tile;
    lastDiscardPlayer?: number;
  }): { type: string; tile?: Tile; meldType?: string } | null {
    
    // 和了可能かチェック
    if (context.hasDrawn && player.hand.tiles.length === 14) {
      // ツモ和了チェック（簡易）
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
    
    return null; // パス
  }
}