import { Tile } from '../../shared/types/Tile';
import { Meld } from '../../shared/types/Player';

/**
 * 待ち牌分析ユーティリティ
 */
export class WaitAnalyzer {
  /**
   * 手牌から待ち牌を分析
   */
  static analyzeWaits(tiles: Tile[], melds: Meld[] = []): {
    waitTiles: Tile[];
    waitType: 'tanki' | 'ryanmen' | 'kanchan' | 'penchan' | 'shanpon' | 'complex';
    shanten: number;
    tempai: boolean;
  } {
    const sortedTiles = [...tiles].sort((a, b) => this.compareTiles(a, b));
    const waitTiles: Tile[] = [];
    
    // シャンテン数計算
    const shanten = this.calculateShanten(sortedTiles, melds);
    const tempai = shanten === 0;
    
    if (tempai) {
      // テンパイ時の待ち牌分析
      const waits = this.findWaitTiles(sortedTiles, melds);
      waitTiles.push(...waits.tiles);
      
      return {
        waitTiles,
        waitType: waits.type,
        shanten,
        tempai: true
      };
    } else {
      // 非テンパイ時は有効牌分析
      const usefulTiles = this.findUsefulTiles(sortedTiles);
      waitTiles.push(...usefulTiles);
      
      return {
        waitTiles,
        waitType: 'complex',
        shanten,
        tempai: false
      };
    }
  }
  
  /**
   * シャンテン数計算
   */
  static calculateShanten(tiles: Tile[], melds: Meld[] = []): number {
    // 簡易シャンテン計算（基本的な4面子1雀頭形）
    const tileCount = tiles.length;
    const meldCount = melds.length;
    const handTileCount = tileCount - (meldCount * 3);
    
    if (handTileCount < 2) return 8; // 異常値
    
    // 基本的なシャンテン計算
    // 実際の麻雀では複雑なアルゴリズムが必要だが、簡易版として実装
    
    const groups = this.groupTiles(tiles);
    let menTsu = 0;
    let jantou = 0;
    let taraTsu = 0; // 塔子（順子や刻子になりうる組み合わせ）
    
    // 刻子チェック
    for (const [key, count] of groups) {
      if (count >= 3) {
        menTsu += Math.floor(count / 3);
      } else if (count === 2) {
        if (jantou === 0) {
          jantou = 1;
        } else {
          taraTsu++;
        }
      }
    }
    
    // 順子チェック（簡易版）
    const manTiles = tiles.filter(t => t.suit === 'man').sort((a, b) => a.rank! - b.rank!);
    const pinTiles = tiles.filter(t => t.suit === 'pin').sort((a, b) => a.rank! - b.rank!);
    const souTiles = tiles.filter(t => t.suit === 'sou').sort((a, b) => a.rank! - b.rank!);
    
    menTsu += this.countSequences(manTiles);
    menTsu += this.countSequences(pinTiles);
    menTsu += this.countSequences(souTiles);
    
    const totalMenTsu = menTsu + meldCount;
    const neededMenTsu = 4;
    const neededJantou = jantou > 0 ? 0 : 1;
    
    return Math.max(0, (neededMenTsu - totalMenTsu) * 2 + neededJantou - taraTsu);
  }
  
  /**
   * 待ち牌を特定（テンパイ時）
   */
  private static findWaitTiles(tiles: Tile[], melds: Meld[]): {
    tiles: Tile[];
    type: 'tanki' | 'ryanmen' | 'kanchan' | 'penchan' | 'shanpon';
  } {
    // 簡易実装：全ての可能な牌をチェックして和了できるものを見つける
    const possibleTiles = this.getAllPossibleTiles();
    const waitTiles: Tile[] = [];
    
    for (const testTile of possibleTiles) {
      const testHand = [...tiles, testTile];
      if (this.isWinningHand(testHand, melds)) {
        waitTiles.push(testTile);
      }
    }
    
    // 待ちタイプの判定（簡易版）
    const waitType = waitTiles.length === 1 ? 'tanki' : 
                    waitTiles.length === 2 ? 'ryanmen' : 'shanpon';
    
    return { tiles: waitTiles, type: waitType };
  }
  
  /**
   * 有効牌分析（非テンパイ時）
   */
  private static findUsefulTiles(tiles: Tile[]): Tile[] {
    const possibleTiles = this.getAllPossibleTiles();
    const usefulTiles: Tile[] = [];
    const currentShanten = this.calculateShanten(tiles);
    
    for (const testTile of possibleTiles) {
      const testHand = [...tiles, testTile];
      // 1枚捨てた状態での最小シャンテン数をチェック
      for (let i = 0; i < testHand.length; i++) {
        const discardHand = testHand.filter((_, index) => index !== i);
        const newShanten = this.calculateShanten(discardHand);
        
        if (newShanten < currentShanten) {
          usefulTiles.push(testTile);
          break;
        }
      }
    }
    
    return usefulTiles;
  }
  
  /**
   * 牌のグループ化
   */
  private static groupTiles(tiles: Tile[]): Map<string, number> {
    const groups = new Map<string, number>();
    
    for (const tile of tiles) {
      const key = `${tile.suit || 'honor'}_${tile.rank || tile.honor}`;
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    
    return groups;
  }
  
  /**
   * 順子の数をカウント（簡易版）
   */
  private static countSequences(suitTiles: Tile[]): number {
    if (suitTiles.length < 3) return 0;
    
    let sequences = 0;
    const ranks = suitTiles.map(t => t.rank!);
    
    for (let i = 0; i <= ranks.length - 3; i++) {
      if (ranks[i] && ranks[i + 1] && ranks[i + 2] &&
          ranks[i + 1] === ranks[i] + 1 && 
          ranks[i + 2] === ranks[i] + 2) {
        sequences++;
        i += 2; // 使用した牌をスキップ
      }
    }
    
    return sequences;
  }
  
  /**
   * 全ての可能な牌を生成（簡易版）
   */
  private static getAllPossibleTiles(): Tile[] {
    // 実際の実装では TileManager から取得すべきだが、
    // 簡易版として空配列を返す
    return [];
  }
  
  /**
   * 牌のUnicode取得
   */
  private static getTileUnicode(suit: string, rank: number): string {
    const unicodeBases = {
      man: 0x1F007, // 🀇
      pin: 0x1F019, // 🀙  
      sou: 0x1F010  // 🀐
    };
    
    const base = unicodeBases[suit as keyof typeof unicodeBases];
    return String.fromCodePoint(base + rank - 1);
  }
  
  /**
   * 和了判定（簡易版）
   */
  private static isWinningHand(tiles: Tile[], melds: Meld[] = []): boolean {
    // HandAnalyzerを使用
    try {
      const HandAnalyzer = require('./HandAnalyzer').HandAnalyzer;
      return HandAnalyzer.isWinningHand(tiles, melds);
    } catch {
      // フォールバック：簡易判定
      return tiles.length === 14 && this.calculateShanten(tiles, melds) === -1;
    }
  }
  

  /**
   * 牌の比較関数
   */
  private static compareTiles(a: Tile, b: Tile): number {
    // スート別ソート
    const suitOrder = { 'man': 1, 'pin': 2, 'sou': 3, 'honor': 4 };
    const aSuit = a.suit || 'honor';
    const bSuit = b.suit || 'honor';
    
    if (aSuit !== bSuit) {
      return suitOrder[aSuit as keyof typeof suitOrder] - suitOrder[bSuit as keyof typeof suitOrder];
    }
    
    // 同じスート内での数字順
    if (a.rank && b.rank) {
      return a.rank - b.rank;
    }
    
    // 字牌の場合
    const honorOrder = ['東', '南', '西', '北', '白', '發', '中'];
    const aHonor = a.honor || '';
    const bHonor = b.honor || '';
    
    return honorOrder.indexOf(aHonor) - honorOrder.indexOf(bHonor);
  }
  
  /**
   * 安全牌判定
   */
  static isSafeTile(tile: Tile, opponentDiscards: Tile[][], riichiPlayers: boolean[]): {
    safety: 'safe' | 'dangerous' | 'risky';
    reason: string;
  } {
    // 全員の捨て牌をチェック
    const allDiscards = opponentDiscards.flat();
    const isAlreadyDiscarded = allDiscards.some(d => 
      d.suit === tile.suit && d.rank === tile.rank && d.honor === tile.honor
    );
    
    if (isAlreadyDiscarded) {
      return {
        safety: 'safe',
        reason: '既に捨てられた牌'
      };
    }
    
    // リーチプレイヤーがいる場合の危険度判定
    const hasRiichiPlayer = riichiPlayers.some(riichi => riichi);
    if (hasRiichiPlayer) {
      // 端牌（1,9）と字牌は比較的安全
      if (tile.honor || tile.rank === 1 || tile.rank === 9) {
        return {
          safety: 'risky',
          reason: 'リーチに対して端牌・字牌'
        };
      } else {
        return {
          safety: 'dangerous',
          reason: 'リーチに対して危険牌'
        };
      }
    }
    
    return {
      safety: 'risky',
      reason: '通常の危険度'
    };
  }
}