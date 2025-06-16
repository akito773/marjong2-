import { Tile, Suit, Honor } from '../../shared/types/Tile';
import { Hand, Meld } from '../../shared/types/Hand';

// 和了判定と役判定を行うユーティリティクラス
export class HandAnalyzer {
  
  // 和了判定
  static isWinningHand(tiles: Tile[], melds: Meld[] = []): boolean {
    // 国士無双チェック
    if (this.isKokushimusou(tiles)) {
      return true;
    }

    // 七対子チェック
    if (this.isChiitoi(tiles)) {
      return true;
    }

    // 通常の和了形チェック（4面子1雀頭）
    return this.isStandardWin(tiles, melds);
  }

  // 通常の和了形チェック（4面子1雀頭）
  private static isStandardWin(tiles: Tile[], melds: Meld[]): boolean {
    // 鳴いた面子の数を計算
    const meldCount = melds.length;
    const remainingTiles = [...tiles];
    
    // 必要な面子数（4 - 鳴いた数）
    const neededMentsu = 4 - meldCount;
    
    // 雀頭を見つけて、残りが面子で構成できるかチェック
    return this.findJantou(remainingTiles, neededMentsu);
  }

  // 雀頭を探して残りを面子構成できるかチェック
  private static findJantou(tiles: Tile[], neededMentsu: number): boolean {
    const tileCounts = this.countTiles(tiles);
    
    for (const [tileKey, count] of tileCounts) {
      if (count >= 2) {
        // この牌を雀頭として使用
        const remainingCounts = new Map(tileCounts);
        remainingCounts.set(tileKey, count - 2);
        
        // 残りの牌で必要な面子数を作れるかチェック
        if (this.canFormMentsu(remainingCounts, neededMentsu)) {
          return true;
        }
      }
    }
    
    return false;
  }

  // 面子を構成できるかチェック
  private static canFormMentsu(tileCounts: Map<string, number>, neededCount: number): boolean {
    if (neededCount === 0) {
      // すべての牌が使われているかチェック
      return Array.from(tileCounts.values()).every(count => count === 0);
    }

    // 刻子を探す
    for (const [tileKey, count] of tileCounts) {
      if (count >= 3) {
        const newCounts = new Map(tileCounts);
        newCounts.set(tileKey, count - 3);
        if (this.canFormMentsu(newCounts, neededCount - 1)) {
          return true;
        }
      }
    }

    // 順子を探す（字牌以外）
    const suits: Suit[] = ['man', 'pin', 'sou'];
    for (const suit of suits) {
      for (let rank = 1; rank <= 7; rank++) {
        const key1 = `${suit}_${rank}`;
        const key2 = `${suit}_${rank + 1}`;
        const key3 = `${suit}_${rank + 2}`;
        
        if (tileCounts.has(key1) && tileCounts.has(key2) && tileCounts.has(key3) &&
            tileCounts.get(key1)! > 0 && tileCounts.get(key2)! > 0 && tileCounts.get(key3)! > 0) {
          
          const newCounts = new Map(tileCounts);
          newCounts.set(key1, newCounts.get(key1)! - 1);
          newCounts.set(key2, newCounts.get(key2)! - 1);
          newCounts.set(key3, newCounts.get(key3)! - 1);
          
          if (this.canFormMentsu(newCounts, neededCount - 1)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // 国士無双チェック
  private static isKokushimusou(tiles: Tile[]): boolean {
    if (tiles.length !== 14) return false;
    
    const requiredTiles = [
      'man_1', 'man_9', 'pin_1', 'pin_9', 'sou_1', 'sou_9',
      'ji_ton', 'ji_nan', 'ji_sha', 'ji_pei', 'ji_haku', 'ji_hatsu', 'ji_chun'
    ];
    
    const tileCounts = this.countTiles(tiles);
    let pairFound = false;
    
    for (const required of requiredTiles) {
      const count = tileCounts.get(required) || 0;
      if (count === 0) return false;
      if (count === 2) {
        if (pairFound) return false;
        pairFound = true;
      } else if (count !== 1) {
        return false;
      }
    }
    
    return pairFound;
  }

  // 七対子チェック
  private static isChiitoi(tiles: Tile[]): boolean {
    if (tiles.length !== 14) return false;
    
    const tileCounts = this.countTiles(tiles);
    let pairCount = 0;
    
    for (const count of tileCounts.values()) {
      if (count === 2) {
        pairCount++;
      } else if (count !== 0) {
        return false;
      }
    }
    
    return pairCount === 7;
  }

  // 牌をカウント
  private static countTiles(tiles: Tile[]): Map<string, number> {
    const counts = new Map<string, number>();
    
    for (const tile of tiles) {
      const key = tile.honor ? `ji_${tile.honor}` : `${tile.suit}_${tile.rank}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    
    return counts;
  }

  // 基本的な役判定
  static getYaku(tiles: Tile[], melds: Meld[] = [], isRiichi: boolean = false, isTsumo: boolean = false): string[] {
    const yaku: string[] = [];
    
    if (isRiichi) {
      yaku.push('リーチ');
    }
    
    if (isTsumo) {
      yaku.push('ツモ');
    }
    
    // 国士無双
    if (this.isKokushimusou(tiles)) {
      yaku.push('国士無双');
      return yaku; // 役満なので他の役は関係ない
    }
    
    // 七対子
    if (this.isChiitoi(tiles)) {
      yaku.push('七対子');
    }
    
    // 断ヤオ九
    if (this.isTanyao(tiles, melds)) {
      yaku.push('断ヤオ九');
    }
    
    // 平和
    if (this.isPinfu(tiles, melds)) {
      yaku.push('平和');
    }
    
    return yaku;
  }

  // 断ヤオ九判定
  private static isTanyao(tiles: Tile[], melds: Meld[]): boolean {
    // 全ての牌が2-8の数牌かチェック
    const allTiles = [...tiles];
    for (const meld of melds) {
      allTiles.push(...meld.tiles);
    }
    
    return allTiles.every(tile => {
      if (tile.honor) return false;
      return tile.rank! >= 2 && tile.rank! <= 8;
    });
  }

  // 平和判定（簡易版）
  private static isPinfu(tiles: Tile[], melds: Meld[]): boolean {
    // 鳴きがある場合は平和にならない
    if (melds.length > 0) return false;
    
    // より詳細な判定が必要だが、ここでは簡易版
    // 字牌がない場合を平和とする（本来はより複雑）
    return tiles.every(tile => !tile.honor);
  }
}