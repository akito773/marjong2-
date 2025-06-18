import { Player as IPlayer, PlayerStatus } from '../../shared/types/Player';
import { Hand, Meld } from '../../shared/types/Hand';
import { Tile, Rank } from '../../shared/types/Tile';

export class Player implements IPlayer {
  readonly id: string;
  readonly name: string;
  private _hand: Hand;
  private _score: number;
  private _position: number;
  private _isDealer: boolean;
  private _isBot: boolean;
  private _status: PlayerStatus;
  private _wind: 'east' | 'south' | 'west' | 'north';

  constructor(
    id: string,
    name: string,
    position: number,
    isBot = false,
    initialScore = 25000
  ) {
    this.id = id;
    this.name = name;
    this._position = position;
    this._isBot = isBot;
    this._score = initialScore;
    this._isDealer = position === 0;
    this._status = 'waiting';
    this._wind = this.getWindByPosition(position) || 'east';
    
    // 初期手牌（空）
    this._hand = {
      tiles: [],
      melds: [],
      discards: [],
      riichi: false,
    };
  }

  // Getters
  get hand(): Hand {
    return { ...this._hand };
  }

  // 総牌数カウント（デバッグ用）
  getTotalTileCount(): number {
    const handTiles = this._hand.tiles.length;
    const meldTiles = this._hand.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
    const discardTiles = this._hand.discards.length;
    return handTiles + meldTiles + discardTiles;
  }

  // 手牌+メルドのみのカウント（プレイ中の保持牌数）
  getActiveTileCount(): number {
    return this._hand.tiles.length + this._hand.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
  }

  get score(): number {
    return this._score;
  }

  get position(): number {
    return this._position;
  }

  get isDealer(): boolean {
    return this._isDealer;
  }

  get isBot(): boolean {
    return this._isBot;
  }

  get status(): PlayerStatus {
    return this._status;
  }

  get wind(): 'east' | 'south' | 'west' | 'north' {
    return this._wind;
  }

  // 座席位置から自風を計算
  private getWindByPosition(position: number): 'east' | 'south' | 'west' | 'north' {
    const winds: ('east' | 'south' | 'west' | 'north')[] = ['east', 'south', 'west', 'north'];
    return winds[position];
  }

  // 手牌設定（配牌時）
  setInitialHand(tiles: Tile[]): void {
    this._hand = {
      tiles: [...tiles],
      melds: [],
      discards: [],
      riichi: false,
    };
    this._status = 'playing';
  }

  // ツモ
  drawTile(tile: Tile): void {
    if (this._status !== 'playing') {
      throw new Error(`Player ${this.name} is not in playing status`);
    }
    
    this._hand = {
      ...this._hand,
      tiles: [...this._hand.tiles, tile].sort(this.compareTiles),
    };
  }

  // 捨牌
  discardTile(tile: Tile): void {
    const tileIndex = this._hand.tiles.findIndex(t => t.id === tile.id);
    if (tileIndex === -1) {
      throw new Error(`Tile ${tile.displayName} not found in hand`);
    }

    const newTiles = [...this._hand.tiles];
    newTiles.splice(tileIndex, 1);

    this._hand = {
      ...this._hand,
      tiles: newTiles,
      discards: [...this._hand.discards, tile],
    };
  }

  // 鳴き処理
  addMeld(meld: Meld, calledTile: Tile): void {
    const initialHandCount = this._hand.tiles.length;
    console.log(`🔧 [${this.name}] Meld processing: initial hand = ${initialHandCount} tiles`);
    console.log(`🔧 [${this.name}] Called tile: ${calledTile.displayName} (ID: ${calledTile.id})`);
    console.log(`🔧 [${this.name}] Meld tiles:`, meld.tiles.map(t => `${t.displayName}(${t.id})`));
    
    // 鳴いた牌（相手から受け取る牌）以外を手牌から除去
    // calledTileは手牌にないので、meld.tilesから手牌にある牌のみを削除
    let newTiles = [...this._hand.tiles];
    let removedCount = 0;
    
    // メルドの期待削除数を計算
    const expectedRemoveCount = meld.type === 'kan' || meld.type === 'ankan' ? 
      (meld.isConcealed ? 4 : 3) : 2;
    
    console.log(`🔧 [${this.name}] Expected to remove ${expectedRemoveCount} tiles from hand for ${meld.type}`);
    
    // 手牌から削除する牌を特定（calledTile以外）
    const tilesToRemove = [];
    for (const meldTile of meld.tiles) {
      // calledTileではない、かつ手牌に存在する牌を探す
      if (meldTile.id !== calledTile.id) {
        const handIndex = newTiles.findIndex(t => t.id === meldTile.id);
        if (handIndex !== -1) {
          tilesToRemove.push({ tile: meldTile, index: handIndex });
        } else {
          // IDで見つからない場合、同じ牌を手牌から探す（フロントエンドの牌IDが異なる場合の対応）
          const sameTypeIndex = newTiles.findIndex(t => this.tilesEqual(t, meldTile));
          if (sameTypeIndex !== -1) {
            tilesToRemove.push({ tile: newTiles[sameTypeIndex], index: sameTypeIndex });
          }
        }
      }
    }
    
    // 必要な枚数が削除できない場合のエラーハンドリング
    if (tilesToRemove.length < expectedRemoveCount) {
      console.error(`🔧 [${this.name}] Cannot find enough tiles to remove for ${meld.type}`);
      console.error(`🔧 [${this.name}] Found ${tilesToRemove.length}, expected ${expectedRemoveCount}`);
      throw new Error(`Cannot find enough tiles in hand for ${meld.type}: found ${tilesToRemove.length}, expected ${expectedRemoveCount}`);
    }
    
    // 手牌から牌を削除（インデックスの大きい順に削除）
    tilesToRemove.sort((a, b) => b.index - a.index);
    for (let i = 0; i < expectedRemoveCount; i++) {
      const { tile, index } = tilesToRemove[i];
      newTiles.splice(index, 1);
      removedCount++;
      console.log(`🔧 [${this.name}] Removed tile: ${tile.displayName || tile.unicode} (${i + 1}/${expectedRemoveCount})`);
    }
    
    // 期待される手牌数を計算
    const expectedHandSize = initialHandCount - expectedRemoveCount;
    
    if (newTiles.length !== expectedHandSize) {
      console.error(`🔧 [${this.name}] Hand size mismatch: expected ${expectedHandSize}, got ${newTiles.length}`);
      throw new Error(`Hand size error: expected ${expectedHandSize}, got ${newTiles.length} after ${meld.type}`);
    }

    this._hand = {
      ...this._hand,
      tiles: newTiles.sort(this.compareTiles),
      melds: [...this._hand.melds, meld],
    };
    
    console.log(`✅ [${this.name}] Meld complete: ${newTiles.length} hand tiles + ${this._hand.melds.length} melds`);
    console.log(`✅ [${this.name}] Total tiles controlled: ${this.getTotalTileCount()}`);
  }

  // リーチ宣言
  declareRiichi(tile: Tile, isDoubleRiichi: boolean = false): void {
    if (this._hand.riichi) {
      throw new Error(`Player ${this.name} is already in riichi`);
    }

    if (!this.canDeclareRiichi()) {
      throw new Error(`Player ${this.name} cannot declare riichi`);
    }

    this.discardTile(tile);
    this._hand = {
      ...this._hand,
      riichi: true,
      riichiTile: tile,
      doubleRiichi: isDoubleRiichi,
    };
    this._status = 'riichi';
    this._score -= 1000; // リーチ棒
  }

  // リーチ可能判定
  canDeclareRiichi(): boolean {
    return (
      this._status === 'playing' &&
      !this._hand.riichi &&
      this._hand.melds.length === 0 && // 鳴いていない
      this._score >= 1000 && // リーチ棒を払える
      this.isTenpai() &&
      !this.isFuriten() // フリテンでない
    );
  }

  // 聴牌判定（簡易版）
  isTenpai(): boolean {
    const { HandAnalyzer } = require('../utils/HandAnalyzer');
    
    // 13枚の場合、1枚足して和了形になるかチェック
    if (this._hand.tiles.length !== 13) return false;
    
    // 手牌から待ち牌を特定（既存のHandAnalyzerを利用）
    const waitingTiles: Tile[] = [];
    
    // 手牌にある牌から推測
    for (const existingTile of this._hand.tiles) {
      const testHand = [...this._hand.tiles, existingTile];
      if (HandAnalyzer.isWinningHand(testHand, this._hand.melds)) {
        // 役があるかチェック
        const yaku = HandAnalyzer.analyzeYaku(testHand, this._hand.melds, {
          isRiichi: this._hand.riichi,
          isTsumo: false,
          isDealer: this._isDealer,
          seatWind: this._wind,
          roundWind: 'east',
          doraCount: 0
        });
        
        if (yaku.length > 0 && !waitingTiles.some(t => this.tilesEqual(t, existingTile))) {
          waitingTiles.push(existingTile);
        }
      }
    }
    
    return waitingTiles.length > 0;
  }

  // 和了可能判定
  canWin(tile?: Tile): boolean {
    const { HandAnalyzer } = require('../utils/HandAnalyzer');
    
    let handToCheck = [...this._hand.tiles];
    if (tile) {
      handToCheck.push(tile);
    }
    
    // 14枚で和了形かチェック
    if (handToCheck.length !== 14) return false;
    
    // 和了形判定
    if (!HandAnalyzer.isWinningHand(handToCheck, this._hand.melds)) {
      return false;
    }
    
    // 役があるかチェック
    const yaku = HandAnalyzer.analyzeYaku(handToCheck, this._hand.melds, {
      isRiichi: this._hand.riichi,
      isTsumo: !tile, // tileがない場合はツモ
      isDealer: this._isDealer,
      seatWind: this._wind,
      roundWind: 'east', // 簡易実装
      doraCount: 0 // 簡易実装
    });
    
    return yaku.length > 0;
  }

  // フリテン判定
  isFuriten(): boolean {
    const { HandAnalyzer } = require('../utils/HandAnalyzer');
    
    if (this._hand.tiles.length !== 13) return false;
    
    // 簡易フリテン判定：手牌にある牌で捨牌をチェック
    for (const handTile of this._hand.tiles) {
      for (const discardedTile of this._hand.discards) {
        if (this.tilesEqual(handTile, discardedTile)) {
          // 同じ牌を持っていて捨てている場合はフリテンの可能性
          const testHand = [...this._hand.tiles, discardedTile];
          if (HandAnalyzer.isWinningHand(testHand, this._hand.melds)) {
            return true; // フリテン
          }
        }
      }
    }
    
    return false;
  }

  // 牌の比較
  private tilesEqual(tile1: Tile, tile2: Tile): boolean {
    if (tile1.suit !== tile2.suit) return false;
    if (tile1.suit === 'ji') {
      return tile1.honor === tile2.honor;
    }
    return tile1.rank === tile2.rank;
  }

  // 鳴き可能判定
  canMeld(discardedTile: Tile, fromPlayer: number): Meld[] {
    if (this._status !== 'playing' || this._hand.riichi) {
      return [];
    }

    const possibleMelds: Meld[] = [];

    // チー判定（前のプレイヤーからのみ）
    if ((this._position + 3) % 4 === fromPlayer) {
      const chiMelds = this.checkChi(discardedTile);
      possibleMelds.push(...chiMelds);
    }

    // ポン判定（誰からでも）
    const ponMeld = this.checkPon(discardedTile);
    if (ponMeld) {
      possibleMelds.push(ponMeld);
    }

    // カン判定（誰からでも）
    const kanMeld = this.checkKan(discardedTile);
    if (kanMeld) {
      possibleMelds.push(kanMeld);
    }

    return possibleMelds;
  }

  // チー判定
  private checkChi(tile: Tile): Meld[] {
    if (tile.suit === 'ji') return []; // 字牌はチーできない

    const melds: Meld[] = [];
    const rank = tile.rank!;
    const suit = tile.suit;

    // 下位順子（例：4が捨てられた時の 2-3-4）
    if (rank >= 3) {
      const tile1 = this.findTileInHand(suit, (rank - 2) as Rank);
      const tile2 = this.findTileInHand(suit, (rank - 1) as Rank);
      if (tile1 && tile2) {
        melds.push({
          id: `chi_${Date.now()}_1`,
          type: 'chi',
          tiles: [tile1, tile2, tile],
          fromPlayer: (this._position + 3) % 4,
          isConcealed: false,
          calledTile: tile,
        });
      }
    }

    // 中位順子（例：4が捨てられた時の 3-4-5）
    if (rank >= 2 && rank <= 8) {
      const tile1 = this.findTileInHand(suit, (rank - 1) as Rank);
      const tile2 = this.findTileInHand(suit, (rank + 1) as Rank);
      if (tile1 && tile2) {
        melds.push({
          id: `chi_${Date.now()}_2`,
          type: 'chi',
          tiles: [tile1, tile, tile2],
          fromPlayer: (this._position + 3) % 4,
          isConcealed: false,
          calledTile: tile,
        });
      }
    }

    // 上位順子（例：4が捨てられた時の 4-5-6）
    if (rank <= 7) {
      const tile1 = this.findTileInHand(suit, (rank + 1) as Rank);
      const tile2 = this.findTileInHand(suit, (rank + 2) as Rank);
      if (tile1 && tile2) {
        melds.push({
          id: `chi_${Date.now()}_3`,
          type: 'chi',
          tiles: [tile, tile1, tile2],
          fromPlayer: (this._position + 3) % 4,
          isConcealed: false,
          calledTile: tile,
        });
      }
    }

    return melds;
  }

  // ポン判定
  private checkPon(tile: Tile): Meld | null {
    const matchingTiles = this.findMatchingTilesInHand(tile, 2);
    if (matchingTiles.length >= 2) {
      return {
        id: `pon_${Date.now()}`,
        type: 'pon',
        tiles: [matchingTiles[0], matchingTiles[1], tile],
        fromPlayer: -1, // 呼び出し時に設定
        isConcealed: false,
        calledTile: tile,
      };
    }
    return null;
  }

  // カン判定
  private checkKan(tile: Tile): Meld | null {
    const matchingTiles = this.findMatchingTilesInHand(tile, 3);
    if (matchingTiles.length >= 3) {
      return {
        id: `kan_${Date.now()}`,
        type: 'kan',
        tiles: [matchingTiles[0], matchingTiles[1], matchingTiles[2], tile],
        fromPlayer: -1, // 呼び出し時に設定
        isConcealed: false,
        calledTile: tile,
      };
    }
    return null;
  }

  // 手牌から指定の牌を検索
  private findTileInHand(suit: Tile['suit'], rank: Tile['rank']): Tile | null {
    return this._hand.tiles.find(t => t.suit === suit && t.rank === rank) || null;
  }

  // 手牌から同じ牌を複数検索
  private findMatchingTilesInHand(targetTile: Tile, count: number): Tile[] {
    return this._hand.tiles.filter(tile => 
      tile.suit === targetTile.suit && 
      tile.rank === targetTile.rank && 
      tile.honor === targetTile.honor
    ).slice(0, count);
  }

  // 点数変更
  changeScore(delta: number): void {
    this._score += delta;
  }

  // ステータス変更
  setStatus(status: PlayerStatus): void {
    this._status = status;
  }

  // 親設定
  setDealer(isDealer: boolean): void {
    this._isDealer = isDealer;
    if (isDealer) {
      this._wind = 'east';
    }
  }

  // 風設定（局の進行に応じて）
  setWind(wind: 'east' | 'south' | 'west' | 'north'): void {
    this._wind = wind;
  }

  // 牌のソート
  private compareTiles = (a: Tile, b: Tile): number => {
    const suitOrder = { man: 0, pin: 1, sou: 2, ji: 3 };
    if (a.suit !== b.suit) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }

    if (a.suit === 'ji') {
      const honorOrder = { east: 0, south: 1, west: 2, north: 3, white: 4, green: 5, red: 6 };
      return honorOrder[a.honor!] - honorOrder[b.honor!];
    }

    if (a.rank && b.rank) {
      return a.rank - b.rank;
    }

    return 0;
  };

  // 手牌クリア
  clearHand(): void {
    this._hand = {
      tiles: [],
      melds: [],
      discards: [],
      riichi: false,
      doubleRiichi: false
    };
  }

  // 手牌設定
  setHand(hand: Hand): void {
    this._hand = {
      ...hand
    };
  }

  // 点数加算
  addScore(points: number): void {
    this._score += points;
    if (this._score < 0) this._score = 0; // 0点未満にはならない
  }

  // 位置・風・親フラグ更新
  updatePosition(position: number, wind: 'east' | 'south' | 'west' | 'north', isDealer: boolean): void {
    this._position = position;
    this._wind = wind;
    this._isDealer = isDealer;
  }

  // デバッグ情報
  getDebugInfo(): {
    id: string;
    name: string;
    position: number;
    score: number;
    status: PlayerStatus;
    wind: string;
    handSize: number;
    meldCount: number;
    discardCount: number;
    isRiichi: boolean;
  } {
    return {
      id: this.id,
      name: this.name,
      position: this._position,
      score: this._score,
      status: this._status,
      wind: this._wind,
      handSize: this._hand.tiles.length,
      meldCount: this._hand.melds.length,
      discardCount: this._hand.discards.length,
      isRiichi: this._hand.riichi,
    };
  }
}