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

  /**
   * 詳細な役判定
   */
  static analyzeYaku(tiles: Tile[], melds: Meld[] = [], context: {
    isRiichi?: boolean;
    isTsumo?: boolean;
    isDealer?: boolean;
    seatWind?: string;
    roundWind?: string;
    doraCount?: number;
  } = {}): Array<{ name: string; han: number; description: string }> {
    const yaku: Array<{ name: string; han: number; description: string }> = [];
    const allTiles = [...tiles, ...melds.flatMap(m => m.tiles)];
    const isMenzen = melds.every(m => m.type === 'ankan' || m.type === 'kan');

    // 基本役
    if (context.isRiichi && isMenzen) {
      yaku.push({ name: 'リーチ', han: 1, description: '門前でリーチ宣言' });
    }

    if (context.isTsumo && isMenzen) {
      yaku.push({ name: 'ツモ', han: 1, description: '門前ツモ' });
    }

    // タンヤオ
    if (this.isTanyao(allTiles, melds)) {
      yaku.push({ name: 'タンヤオ', han: 1, description: '2-8牌のみ' });
    }

    // ピンフ
    if (this.isPinfu(tiles, melds) && isMenzen) {
      yaku.push({ name: 'ピンフ', han: 1, description: '門前で全て順子' });
    }

    // 一盃口
    if (this.isIipeikou(tiles) && isMenzen) {
      yaku.push({ name: '一盃口', han: 1, description: '同じ順子2組' });
    }

    // 二盃口
    if (this.isRyanpeikou(tiles) && isMenzen) {
      yaku.push({ name: '二盃口', han: 3, description: '同じ順子2組が2セット' });
    }

    // 三色同順
    if (this.isSanshokuDoujun(tiles, melds)) {
      const han = isMenzen ? 2 : 1;
      yaku.push({ name: '三色同順', han, description: '同じ数字の順子3色' });
    }

    // 三色同刻
    if (this.isSanshokuDoukou(tiles, melds)) {
      yaku.push({ name: '三色同刻', han: 2, description: '同じ数字の刻子3色' });
    }

    // 一気通貫
    if (this.isIttsu(tiles, melds)) {
      const han = isMenzen ? 2 : 1;
      yaku.push({ name: '一気通貫', han, description: '同色で123456789' });
    }

    // 七対子
    if (this.isChiitoi(tiles)) {
      yaku.push({ name: '七対子', han: 2, description: '7つの対子' });
    }

    // 対々和
    if (this.isToitoi(melds)) {
      yaku.push({ name: '対々和', han: 2, description: '刻子のみ' });
    }

    // 三暗刻
    const ankoCount = this.countAnko(tiles, melds);
    if (ankoCount === 3) {
      yaku.push({ name: '三暗刻', han: 2, description: '暗刻3組' });
    }

    // 四暗刻
    if (ankoCount === 4) {
      yaku.push({ name: '四暗刻', han: 13, description: '暗刻4組（役満）' });
    }

    // 混一色
    if (this.isHonitsu(allTiles)) {
      const han = isMenzen ? 3 : 2;
      yaku.push({ name: '混一色', han, description: '1種類の数牌+字牌' });
    }

    // 清一色
    if (this.isChinitsu(allTiles)) {
      const han = isMenzen ? 6 : 5;
      yaku.push({ name: '清一色', han, description: '1種類の数牌のみ' });
    }

    // 国士無双
    if (this.isKokushimusou(tiles)) {
      yaku.push({ name: '国士無双', han: 13, description: '13種の字牌・老頭牌（役満）' });
    }

    // 小三元
    if (this.isShouSangen(allTiles)) {
      yaku.push({ name: '小三元', han: 2, description: '三元牌2組と雀頭' });
    }

    // 大三元
    if (this.isDaiSangen(allTiles)) {
      yaku.push({ name: '大三元', han: 13, description: '三元牌3組（役満）' });
    }

    // 小四喜
    if (this.isShouSuushi(allTiles)) {
      yaku.push({ name: '小四喜', han: 13, description: '風牌3組と雀頭（役満）' });
    }

    // 大四喜
    if (this.isDaiSuushi(allTiles)) {
      yaku.push({ name: '大四喜', han: 13, description: '風牌4組（役満）' });
    }

    // 字一色
    if (this.isTsuuiisou(allTiles)) {
      yaku.push({ name: '字一色', han: 13, description: '字牌のみ（役満）' });
    }

    // 緑一色
    if (this.isRyuuiisou(allTiles)) {
      yaku.push({ name: '緑一色', han: 13, description: '緑色の牌のみ（役満）' });
    }

    // 清老頭
    if (this.isChinroutou(allTiles)) {
      yaku.push({ name: '清老頭', han: 13, description: '1・9牌のみ（役満）' });
    }

    // 九蓮宝燈
    if (this.isChuuren(tiles)) {
      yaku.push({ name: '九蓮宝燈', han: 13, description: '同色111234567999+1牌（役満）' });
    }

    // 役牌
    yaku.push(...this.analyzeYakuhai(allTiles, context));

    // ドラ
    if (context.doraCount && context.doraCount > 0) {
      yaku.push({ name: 'ドラ', han: context.doraCount, description: `ドラ${context.doraCount}枚` });
    }

    return yaku;
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

  // 一盃口判定
  private static isIipeikou(tiles: Tile[]): boolean {
    const tileCounts = this.countTiles(tiles);
    const sequences = this.findSequences(tileCounts);
    return sequences.filter(seq => seq.count >= 2).length >= 1;
  }

  // 二盃口判定
  private static isRyanpeikou(tiles: Tile[]): boolean {
    const tileCounts = this.countTiles(tiles);
    const sequences = this.findSequences(tileCounts);
    return sequences.filter(seq => seq.count >= 2).length >= 2;
  }

  // 三色同順判定
  private static isSanshokuDoujun(tiles: Tile[], melds: Meld[]): boolean {
    const allSequences = new Set<number>();
    
    // 手牌から順子を探す
    const tileCounts = this.countTiles(tiles);
    const handSequences = this.findSequences(tileCounts);
    handSequences.forEach(seq => allSequences.add(seq.startRank));
    
    // 鳴いた順子をチェック
    melds.filter(m => m.type === 'chi').forEach(meld => {
      const sortedTiles = [...meld.tiles].sort((a: Tile, b: Tile) => a.rank! - b.rank!);
      allSequences.add(sortedTiles[0].rank!);
    });
    
    // 同じ数字の順子が3色にあるかチェック
    for (const startRank of allSequences) {
      let colorCount = 0;
      const suits: Suit[] = ['man', 'pin', 'sou'];
      
      for (const suit of suits) {
        if (this.hasSequence(tiles, melds, suit, startRank)) {
          colorCount++;
        }
      }
      
      if (colorCount >= 3) return true;
    }
    
    return false;
  }

  // 三色同刻判定
  private static isSanshokuDoukou(tiles: Tile[], melds: Meld[]): boolean {
    const triplets = new Set<number>();
    
    // 手牌から刻子を探す
    const tileCounts = this.countTiles(tiles);
    for (const [tileKey, count] of tileCounts) {
      if (count >= 3 && !tileKey.startsWith('ji_')) {
        const rank = parseInt(tileKey.split('_')[1]);
        triplets.add(rank);
      }
    }
    
    // 鳴いた刻子をチェック
    melds.filter(m => m.type === 'pon' || m.type === 'kan' || m.type === 'ankan').forEach(meld => {
      if (!meld.tiles[0].honor) {
        triplets.add(meld.tiles[0].rank!);
      }
    });
    
    // 同じ数字の刻子が3色にあるかチェック
    for (const rank of triplets) {
      let colorCount = 0;
      const suits: Suit[] = ['man', 'pin', 'sou'];
      
      for (const suit of suits) {
        if (this.hasTriplet(tiles, melds, suit, rank)) {
          colorCount++;
        }
      }
      
      if (colorCount >= 3) return true;
    }
    
    return false;
  }

  // 一気通貫判定
  private static isIttsu(tiles: Tile[], melds: Meld[]): boolean {
    const suits: Suit[] = ['man', 'pin', 'sou'];
    
    for (const suit of suits) {
      if (this.hasSequence(tiles, melds, suit, 1) &&
          this.hasSequence(tiles, melds, suit, 4) &&
          this.hasSequence(tiles, melds, suit, 7)) {
        return true;
      }
    }
    
    return false;
  }

  // 対々和判定
  private static isToitoi(melds: Meld[]): boolean {
    return melds.every(meld => meld.type === 'pon' || meld.type === 'kan' || meld.type === 'ankan');
  }

  // 暗刻数カウント
  private static countAnko(tiles: Tile[], melds: Meld[]): number {
    let count = 0;
    
    // 手牌の暗刻
    const tileCounts = this.countTiles(tiles);
    for (const tileCount of tileCounts.values()) {
      if (tileCount >= 3) count++;
    }
    
    // 暗槓
    count += melds.filter(m => m.type === 'ankan').length;
    
    return count;
  }

  // 混一色判定
  private static isHonitsu(tiles: Tile[]): boolean {
    const suits = new Set<Suit>();
    let hasHonor = false;
    
    for (const tile of tiles) {
      if (tile.honor) {
        hasHonor = true;
      } else {
        suits.add(tile.suit!);
      }
    }
    
    return suits.size === 1 && hasHonor;
  }

  // 清一色判定
  private static isChinitsu(tiles: Tile[]): boolean {
    const suits = new Set<Suit>();
    
    for (const tile of tiles) {
      if (tile.honor) return false;
      suits.add(tile.suit!);
    }
    
    return suits.size === 1;
  }

  // 小三元判定
  private static isShouSangen(tiles: Tile[]): boolean {
    const sangenpaiCounts = new Map<Honor, number>();
    const sangenpai: Honor[] = ['white', 'green', 'red'];
    
    for (const tile of tiles) {
      if (tile.honor && sangenpai.includes(tile.honor)) {
        sangenpaiCounts.set(tile.honor, (sangenpaiCounts.get(tile.honor) || 0) + 1);
      }
    }
    
    let tripletCount = 0;
    let pairCount = 0;
    
    for (const count of sangenpaiCounts.values()) {
      if (count >= 3) tripletCount++;
      else if (count === 2) pairCount++;
    }
    
    return tripletCount === 2 && pairCount === 1;
  }

  // 大三元判定
  private static isDaiSangen(tiles: Tile[]): boolean {
    const sangenpaiCounts = new Map<Honor, number>();
    const sangenpai: Honor[] = ['white', 'green', 'red'];
    
    for (const tile of tiles) {
      if (tile.honor && sangenpai.includes(tile.honor)) {
        sangenpaiCounts.set(tile.honor, (sangenpaiCounts.get(tile.honor) || 0) + 1);
      }
    }
    
    return sangenpai.every(honor => (sangenpaiCounts.get(honor) || 0) >= 3);
  }

  // 小四喜判定
  private static isShouSuushi(tiles: Tile[]): boolean {
    const kazepaiCounts = new Map<Honor, number>();
    const kazepai: Honor[] = ['east', 'south', 'west', 'north'];
    
    for (const tile of tiles) {
      if (tile.honor && kazepai.includes(tile.honor)) {
        kazepaiCounts.set(tile.honor, (kazepaiCounts.get(tile.honor) || 0) + 1);
      }
    }
    
    let tripletCount = 0;
    let pairCount = 0;
    
    for (const count of kazepaiCounts.values()) {
      if (count >= 3) tripletCount++;
      else if (count === 2) pairCount++;
    }
    
    return tripletCount === 3 && pairCount === 1;
  }

  // 大四喜判定
  private static isDaiSuushi(tiles: Tile[]): boolean {
    const kazepaiCounts = new Map<Honor, number>();
    const kazepai: Honor[] = ['east', 'south', 'west', 'north'];
    
    for (const tile of tiles) {
      if (tile.honor && kazepai.includes(tile.honor)) {
        kazepaiCounts.set(tile.honor, (kazepaiCounts.get(tile.honor) || 0) + 1);
      }
    }
    
    return kazepai.every(honor => (kazepaiCounts.get(honor) || 0) >= 3);
  }

  // 字一色判定
  private static isTsuuiisou(tiles: Tile[]): boolean {
    return tiles.every(tile => tile.honor);
  }

  // 緑一色判定
  private static isRyuuiisou(tiles: Tile[]): boolean {
    const greenTiles = ['sou_2', 'sou_3', 'sou_4', 'sou_6', 'sou_8', 'ji_green'];
    
    return tiles.every(tile => {
      const key = tile.honor ? `ji_${tile.honor}` : `${tile.suit}_${tile.rank}`;
      return greenTiles.includes(key);
    });
  }

  // 清老頭判定
  private static isChinroutou(tiles: Tile[]): boolean {
    return tiles.every(tile => {
      if (tile.honor) return false;
      return tile.rank === 1 || tile.rank === 9;
    });
  }

  // 九蓮宝燈判定
  private static isChuuren(tiles: Tile[]): boolean {
    if (tiles.length !== 14) return false;
    
    const suits = new Set<Suit>();
    for (const tile of tiles) {
      if (tile.honor) return false;
      suits.add(tile.suit!);
    }
    
    if (suits.size !== 1) return false;
    
    const suit = Array.from(suits)[0];
    const tileCounts = this.countTiles(tiles);
    
    // 1,9が3枚以上、2-8が1枚以上、そのうち1枚が2枚
    const pattern = [3, 1, 1, 1, 1, 1, 1, 1, 3]; // 1-9の理想パターン
    let extraTile = false;
    
    for (let rank = 1; rank <= 9; rank++) {
      const key = `${suit}_${rank}`;
      const count = tileCounts.get(key) || 0;
      const expectedMin = pattern[rank - 1];
      
      if (count < expectedMin) return false;
      if (count === expectedMin + 1) {
        if (extraTile) return false;
        extraTile = true;
      } else if (count > expectedMin + 1) {
        return false;
      }
    }
    
    return extraTile;
  }

  // 役牌判定
  private static analyzeYakuhai(tiles: Tile[], context: any): Array<{ name: string; han: number; description: string }> {
    const yaku: Array<{ name: string; han: number; description: string }> = [];
    const tileCounts = this.countTiles(tiles);
    
    // 三元牌
    const sangenpai = ['white', 'green', 'red'];
    const sangenpaiNames = ['白', '發', '中'];
    
    sangenpai.forEach((honor, index) => {
      const count = tileCounts.get(`ji_${honor}`) || 0;
      if (count >= 3) {
        yaku.push({ name: sangenpaiNames[index], han: 1, description: `${sangenpaiNames[index]}の刻子` });
      }
    });
    
    // 風牌（自風、場風）
    if (context.seatWind) {
      const count = tileCounts.get(`ji_${context.seatWind}`) || 0;
      if (count >= 3) {
        yaku.push({ name: '自風', han: 1, description: '自風の刻子' });
      }
    }
    
    if (context.roundWind && context.roundWind !== context.seatWind) {
      const count = tileCounts.get(`ji_${context.roundWind}`) || 0;
      if (count >= 3) {
        yaku.push({ name: '場風', han: 1, description: '場風の刻子' });
      }
    }
    
    return yaku;
  }

  // ヘルパーメソッド: 順子を見つける
  private static findSequences(tileCounts: Map<string, number>): Array<{ suit: Suit; startRank: number; count: number }> {
    const sequences: Array<{ suit: Suit; startRank: number; count: number }> = [];
    const suits: Suit[] = ['man', 'pin', 'sou'];
    
    for (const suit of suits) {
      for (let rank = 1; rank <= 7; rank++) {
        const key1 = `${suit}_${rank}`;
        const key2 = `${suit}_${rank + 1}`;
        const key3 = `${suit}_${rank + 2}`;
        
        const count1 = tileCounts.get(key1) || 0;
        const count2 = tileCounts.get(key2) || 0;
        const count3 = tileCounts.get(key3) || 0;
        
        const minCount = Math.min(count1, count2, count3);
        if (minCount > 0) {
          sequences.push({ suit, startRank: rank, count: minCount });
        }
      }
    }
    
    return sequences;
  }

  // ヘルパーメソッド: 特定の順子があるかチェック
  private static hasSequence(tiles: Tile[], melds: Meld[], suit: Suit, startRank: number): boolean {
    // 鳴いた順子をチェック
    const chiMelds = melds.filter(m => m.type === 'chi');
    for (const meld of chiMelds) {
      if (meld.tiles[0].suit === suit && meld.tiles[0].rank === startRank) {
        return true;
      }
    }
    
    // 手牌の順子をチェック
    const tileCounts = this.countTiles(tiles);
    const key1 = `${suit}_${startRank}`;
    const key2 = `${suit}_${startRank + 1}`;
    const key3 = `${suit}_${startRank + 2}`;
    
    return (tileCounts.get(key1) || 0) >= 1 &&
           (tileCounts.get(key2) || 0) >= 1 &&
           (tileCounts.get(key3) || 0) >= 1;
  }

  // ヘルパーメソッド: 特定の刻子があるかチェック
  private static hasTriplet(tiles: Tile[], melds: Meld[], suit: Suit, rank: number): boolean {
    // 鳴いた刻子をチェック
    const tripletMelds = melds.filter(m => m.type === 'pon' || m.type === 'kan' || m.type === 'ankan');
    for (const meld of tripletMelds) {
      if (meld.tiles[0].suit === suit && meld.tiles[0].rank === rank) {
        return true;
      }
    }
    
    // 手牌の刻子をチェック
    const tileCounts = this.countTiles(tiles);
    const key = `${suit}_${rank}`;
    
    return (tileCounts.get(key) || 0) >= 3;
  }

  /**
   * 点数計算
   */
  static calculateScore(
    yaku: Array<{ name: string; han: number; description: string }>,
    fu: number = 30,
    isDealer: boolean = false
  ): { han: number; fu: number; baseScore: number; finalScore: number; scoreName: string } {
    let totalHan = 0;
    let isYakuman = false;
    
    // 翻数合計と役満判定
    for (const y of yaku) {
      if (y.han >= 13) {
        isYakuman = true;
        totalHan = Math.max(totalHan, y.han);
      } else {
        totalHan += y.han;
      }
    }
    
    let baseScore: number;
    let scoreName: string;
    
    if (isYakuman) {
      // 役満
      const yakumanCount = Math.floor(totalHan / 13);
      baseScore = 8000 * yakumanCount;
      scoreName = yakumanCount === 1 ? '役満' : `${yakumanCount}倍役満`;
    } else if (totalHan >= 13) {
      // 数え役満
      baseScore = 8000;
      scoreName = '数え役満';
    } else if (totalHan >= 11) {
      // 三倍満
      baseScore = 6000;
      scoreName = '三倍満';
    } else if (totalHan >= 8) {
      // 倍満
      baseScore = 4000;
      scoreName = '倍満';
    } else if (totalHan >= 6) {
      // 跳満
      baseScore = 3000;
      scoreName = '跳満';
    } else if (totalHan >= 5) {
      // 満貫
      baseScore = 2000;
      scoreName = '満貫';
    } else if (totalHan >= 1) {
      // 通常計算: fu * 2^(han+2)
      baseScore = fu * Math.pow(2, totalHan + 2);
      // 最大2000点まで
      if (baseScore >= 2000) {
        baseScore = 2000;
        scoreName = '満貫';
      } else {
        scoreName = `${totalHan}翻${fu}符`;
      }
    } else {
      // 役なし
      baseScore = 0;
      scoreName = '役なし';
    }
    
    // 最終得点計算（親は1.5倍、子は1倍）
    const finalScore = isDealer ? Math.ceil(baseScore * 1.5 / 100) * 100 : baseScore;
    
    return {
      han: totalHan,
      fu,
      baseScore,
      finalScore,
      scoreName
    };
  }
}