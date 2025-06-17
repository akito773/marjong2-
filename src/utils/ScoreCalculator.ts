import { Tile } from '../../shared/types/Tile';
import { Meld } from '../../shared/types/Player';

export interface YakuResult {
  name: string;
  han: number;
  description: string;
}

export interface ScoreResult {
  basicPoints: number;
  han: number;
  fu: number;
  finalScore: number;
  yakuList: YakuResult[];
  isDealer: boolean;
  isTsumo: boolean;
}

/**
 * 麻雀点数計算システム
 */
export class ScoreCalculator {
  /**
   * 和了点数を計算
   */
  static calculateScore(
    winningTiles: Tile[],
    winningTile: Tile,
    melds: Meld[],
    context: {
      isDealer: boolean;
      isTsumo: boolean;
      isRiichi: boolean;
      isDoubleRiichi: boolean;
      isIppatsu: boolean;
      isRinshan: boolean;
      isHaitei: boolean;
      isHoutei: boolean;
      isChankan: boolean;
      doraCount: number;
      uraDoraCount?: number;
      redDoraCount?: number;
      seatWind: '東' | '南' | '西' | '北';
      roundWind: '東' | '南' | '西' | '北';
    }
  ): ScoreResult {
    const yakuList: YakuResult[] = [];
    
    // 役の判定
    yakuList.push(...this.detectYaku(winningTiles, winningTile, melds, context));
    
    // 合計翻数計算
    const totalHan = yakuList.reduce((sum, yaku) => sum + yaku.han, 0) + context.doraCount;
    
    // 符計算
    const fu = this.calculateFu(winningTiles, winningTile, melds, context);
    
    // 基本点計算
    const basicPoints = this.calculateBasicPoints(totalHan, fu);
    
    // 最終得点計算
    const finalScore = this.calculateFinalScore(basicPoints, context.isDealer, context.isTsumo);
    
    return {
      basicPoints,
      han: totalHan,
      fu,
      finalScore,
      yakuList,
      isDealer: context.isDealer,
      isTsumo: context.isTsumo
    };
  }
  
  /**
   * 役の検出
   */
  private static detectYaku(
    tiles: Tile[],
    winningTile: Tile,
    melds: Meld[],
    context: any
  ): YakuResult[] {
    const yakuList: YakuResult[] = [];
    
    // 門前役
    const isMenzen = melds.every(meld => meld.type === 'ankan');
    
    // リーチ
    if (context.isRiichi) {
      yakuList.push({
        name: 'リーチ',
        han: 1,
        description: '門前でリーチ宣言'
      });
    }
    
    // ダブルリーチ
    if (context.isDoubleRiichi) {
      yakuList.push({
        name: 'ダブルリーチ',
        han: 2,
        description: '第一打でリーチ'
      });
    }
    
    // 一発
    if (context.isIppatsu) {
      yakuList.push({
        name: '一発',
        han: 1,
        description: 'リーチ後即和了'
      });
    }
    
    // ツモ
    if (context.isTsumo && isMenzen) {
      yakuList.push({
        name: 'ツモ',
        han: 1,
        description: '門前ツモ'
      });
    }
    
    // 状況役
    if (context.isRinshan) {
      yakuList.push({
        name: '嶺上開花',
        han: 1,
        description: 'カン後のツモ'
      });
    }
    
    if (context.isHaitei) {
      yakuList.push({
        name: '海底摸月',
        han: 1,
        description: '最後の牌でツモ'
      });
    }
    
    if (context.isHoutei) {
      yakuList.push({
        name: '河底撈魚',
        han: 1,
        description: '最後の捨て牌でロン'
      });
    }
    
    if (context.isChankan) {
      yakuList.push({
        name: '搶槓',
        han: 1,
        description: '加カンに対するロン'
      });
    }
    
    // 手牌役の判定
    yakuList.push(...this.detectHandYaku(tiles, melds, context));
    
    return yakuList;
  }
  
  /**
   * 手牌役の検出
   */
  private static detectHandYaku(
    tiles: Tile[],
    melds: Meld[],
    context: any
  ): YakuResult[] {
    const yakuList: YakuResult[] = [];
    const allTiles = [...tiles, ...melds.flatMap(meld => meld.tiles)];
    
    // タンヤオ
    if (this.isTanyao(allTiles)) {
      yakuList.push({
        name: 'タンヤオ',
        han: 1,
        description: '2-8のみ'
      });
    }
    
    // ピンフ
    if (this.isPinfu(tiles, melds)) {
      yakuList.push({
        name: 'ピンフ',
        han: 1,
        description: '門前で全て順子'
      });
    }
    
    // 一盃口
    if (this.isIipeikou(tiles)) {
      yakuList.push({
        name: '一盃口',
        han: 1,
        description: '同じ順子2組'
      });
    }
    
    // 役牌
    yakuList.push(...this.detectYakuhai(tiles, melds, context));
    
    // 七対子
    if (this.isChiitoi(tiles)) {
      yakuList.push({
        name: '七対子',
        han: 2,
        description: '7つの対子'
      });
    }
    
    // 対々和
    if (this.isToitoi(tiles, melds)) {
      yakuList.push({
        name: '対々和',
        han: 2,
        description: '刻子のみ'
      });
    }
    
    // 三暗刻
    const anko = this.countAnko(tiles, melds);
    if (anko === 3) {
      yakuList.push({
        name: '三暗刻',
        han: 2,
        description: '暗刻3組'
      });
    }
    
    // 四暗刻
    if (anko === 4) {
      yakuList.push({
        name: '四暗刻',
        han: 13,
        description: '暗刻4組（役満）'
      });
    }
    
    // 混一色
    if (this.isHonitsu(allTiles)) {
      yakuList.push({
        name: '混一色',
        han: melds.length > 0 ? 2 : 3,
        description: '1種類の数牌+字牌'
      });
    }
    
    // 清一色
    if (this.isChinitsu(allTiles)) {
      yakuList.push({
        name: '清一色',
        han: melds.length > 0 ? 5 : 6,
        description: '1種類の数牌のみ'
      });
    }
    
    // 国士無双
    if (this.isKokushi(tiles)) {
      yakuList.push({
        name: '国士無双',
        han: 13,
        description: '13種の字牌・老頭牌（役満）'
      });
    }
    
    return yakuList;
  }
  
  /**
   * 符計算
   */
  private static calculateFu(
    tiles: Tile[],
    winningTile: Tile,
    melds: Meld[],
    context: any
  ): number {
    let fu = 20; // 副底
    
    // 門前ロンの場合+10符
    const isMenzen = melds.every(meld => meld.type === 'ankan');
    if (isMenzen && !context.isTsumo) {
      fu += 10;
    }
    
    // 自摸の場合+2符
    if (context.isTsumo) {
      fu += 2;
    }
    
    // 雀頭の符
    const jantou = this.findJantou(tiles);
    if (jantou) {
      if (jantou.honor === context.seatWind || jantou.honor === context.roundWind) {
        fu += 2;
      }
      if (['白', '發', '中'].includes(jantou.honor || '')) {
        fu += 2;
      }
    }
    
    // 面子の符
    for (const meld of melds) {
      fu += this.getMeldFu(meld, winningTile);
    }
    
    // 待ちの符
    fu += this.getWaitFu(tiles, winningTile);
    
    // 符は10の倍数に切り上げ
    return Math.ceil(fu / 10) * 10;
  }
  
  /**
   * 基本点計算
   */
  private static calculateBasicPoints(han: number, fu: number): number {
    // 役満の場合
    if (han >= 13) {
      return 8000;
    }
    
    // 跳満以上
    if (han >= 11) return 6000; // 三倍満
    if (han >= 8) return 4000;  // 倍満
    if (han >= 6) return 3000;  // 跳満
    if (han >= 5) return 2000;  // 満貫
    
    // 通常計算
    let basicPoints = fu * Math.pow(2, han + 2);
    
    // 満貫の上限
    if (basicPoints > 2000) {
      basicPoints = 2000;
    }
    
    return basicPoints;
  }
  
  /**
   * 最終得点計算
   */
  private static calculateFinalScore(
    basicPoints: number,
    isDealer: boolean,
    isTsumo: boolean
  ): number {
    if (isDealer) {
      return isTsumo ? Math.ceil(basicPoints * 2 / 100) * 100 : Math.ceil(basicPoints * 6 / 100) * 100;
    } else {
      return isTsumo ? Math.ceil(basicPoints * 1 / 100) * 100 : Math.ceil(basicPoints * 4 / 100) * 100;
    }
  }
  
  // 役判定メソッド群
  private static isTanyao(tiles: Tile[]): boolean {
    return tiles.every(tile => 
      (tile.rank && tile.rank >= 2 && tile.rank <= 8) && !tile.honor
    );
  }
  
  private static isPinfu(tiles: Tile[], melds: Meld[]): boolean {
    // 門前かつ全て順子で、雀頭が役牌でない場合
    const isMenzen = melds.every(meld => meld.type === 'ankan');
    const hasOnlySequences = melds.every(meld => meld.type === 'chi');
    
    return isMenzen && hasOnlySequences;
  }
  
  private static isIipeikou(tiles: Tile[]): boolean {
    // 同じ順子が2組ある場合（簡易判定）
    const sequences = this.findSequences(tiles);
    const sequenceStrings = sequences.map(seq => 
      seq.map(t => `${t.suit}_${t.rank}`).join(',')
    );
    
    return sequenceStrings.length !== new Set(sequenceStrings).size;
  }
  
  private static detectYakuhai(tiles: Tile[], melds: Meld[], context: any): YakuResult[] {
    const yakuList: YakuResult[] = [];
    const allTiles = [...tiles, ...melds.flatMap(meld => meld.tiles)];
    
    // 各役牌の刻子をチェック
    const yakuhaiTiles = ['白', '發', '中', context.seatWind, context.roundWind];
    
    for (const yakuhai of yakuhaiTiles) {
      const count = allTiles.filter(tile => tile.honor === yakuhai).length;
      if (count >= 3) {
        yakuList.push({
          name: yakuhai,
          han: 1,
          description: `${yakuhai}の刻子`
        });
      }
    }
    
    return yakuList;
  }
  
  private static isChiitoi(tiles: Tile[]): boolean {
    if (tiles.length !== 14) return false;
    
    const groups = new Map<string, number>();
    for (const tile of tiles) {
      const key = `${tile.suit || 'honor'}_${tile.rank || tile.honor}`;
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    
    return groups.size === 7 && Array.from(groups.values()).every(count => count === 2);
  }
  
  private static isToitoi(tiles: Tile[], melds: Meld[]): boolean {
    // 全て刻子（槓子含む）
    return melds.every(meld => meld.type === 'pon' || meld.type === 'kan' || meld.type === 'ankan');
  }
  
  private static countAnko(tiles: Tile[], melds: Meld[]): number {
    let anko = 0;
    
    // 明刻・暗刻・暗槓をカウント
    for (const meld of melds) {
      if (meld.type === 'ankan' || meld.type === 'pon') {
        anko++;
      }
    }
    
    return anko;
  }
  
  private static isHonitsu(tiles: Tile[]): boolean {
    const suits = new Set(tiles.map(tile => tile.suit).filter(suit => suit));
    const hasHonor = tiles.some(tile => tile.honor);
    
    return suits.size === 1 && hasHonor;
  }
  
  private static isChinitsu(tiles: Tile[]): boolean {
    const suits = new Set(tiles.map(tile => tile.suit).filter(suit => suit));
    const hasHonor = tiles.some(tile => tile.honor);
    
    return suits.size === 1 && !hasHonor;
  }
  
  private static isKokushi(tiles: Tile[]): boolean {
    const yaochuTiles = ['1m', '9m', '1p', '9p', '1s', '9s', '東', '南', '西', '北', '白', '發', '中'];
    const tileStrings = tiles.map(tile => 
      tile.honor || `${tile.rank}${tile.suit === 'man' ? 'm' : tile.suit === 'pin' ? 'p' : 's'}`
    );
    
    return yaochuTiles.every(yaochu => tileStrings.includes(yaochu));
  }
  
  // ヘルパーメソッド
  private static findJantou(tiles: Tile[]): Tile | null {
    const groups = new Map<string, Tile[]>();
    
    for (const tile of tiles) {
      const key = `${tile.suit || 'honor'}_${tile.rank || tile.honor}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(tile);
    }
    
    for (const [key, group] of groups) {
      if (group.length === 2) {
        return group[0];
      }
    }
    
    return null;
  }
  
  private static findSequences(tiles: Tile[]): Tile[][] {
    // 順子を見つける（簡易実装）
    const sequences: Tile[][] = [];
    const manTiles = tiles.filter(t => t.suit === 'man').sort((a, b) => a.rank! - b.rank!);
    const pinTiles = tiles.filter(t => t.suit === 'pin').sort((a, b) => a.rank! - b.rank!);
    const souTiles = tiles.filter(t => t.suit === 'sou').sort((a, b) => a.rank! - b.rank!);
    
    [manTiles, pinTiles, souTiles].forEach(suitTiles => {
      for (let i = 0; i <= suitTiles.length - 3; i++) {
        const tile1 = suitTiles[i];
        const tile2 = suitTiles[i + 1];
        const tile3 = suitTiles[i + 2];
        
        if (tile1.rank! + 1 === tile2.rank! && tile2.rank! + 1 === tile3.rank!) {
          sequences.push([tile1, tile2, tile3]);
          i += 2; // 使用した牌をスキップ
        }
      }
    });
    
    return sequences;
  }
  
  private static getMeldFu(meld: Meld, winningTile: Tile): number {
    const isTerminalOrHonor = (tile: Tile) => 
      tile.honor || tile.rank === 1 || tile.rank === 9;
    
    const isTerminalMeld = meld.tiles.some(isTerminalOrHonor);
    
    switch (meld.type) {
      case 'pon':
        return isTerminalMeld ? 4 : 2;
      case 'kan':
        return isTerminalMeld ? 16 : 8;
      case 'ankan':
        return isTerminalMeld ? 32 : 16;
      default:
        return 0;
    }
  }
  
  private static getWaitFu(tiles: Tile[], winningTile: Tile): number {
    // 簡易版：単騎・嵌張・辺張待ちの場合+2符
    // 実際の実装では詳細な待ち分析が必要
    return 2;
  }
}