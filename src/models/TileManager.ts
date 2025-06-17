import { Tile } from '../../shared/types/Tile';
import { Hand } from '../../shared/types/Hand';
import { 
  TILE_DEFINITIONS, 
  getTileDisplayName, 
  getTileUnicode,
  DEAD_WALL_COUNT,
  INITIAL_HAND_SIZE,
  MAX_DORA_INDICATORS
} from '../../shared/constants/tiles';

export class TileManager {
  private tiles: Tile[] = [];
  private wall: Tile[] = [];
  private deadWall: Tile[] = [];
  private doraIndicators: Tile[] = [];
  private uraDoraIndicators: Tile[] = [];
  private wallPosition = 0;

  constructor(useRedDora = true) {
    this.generateAllTiles(useRedDora);
    this.shuffleWall();
    this.setupDeadWall();
  }

  // 全ての牌を生成
  private generateAllTiles(useRedDora: boolean): void {
    let tileId = 0;
    this.tiles = [];

    for (const definition of TILE_DEFINITIONS) {
      // 通常の牌
      for (let i = 0; i < definition.count; i++) {
        const tile: Tile = {
          id: tileId++,
          suit: definition.suit,
          rank: definition.rank,
          honor: definition.honor,
          isRed: false,
          displayName: getTileDisplayName(definition, false),
          unicode: getTileUnicode(definition, false),
        };
        this.tiles.push(tile);
      }

      // 赤ドラ
      if (useRedDora && definition.redCount) {
        for (let i = 0; i < definition.redCount; i++) {
          const redTile: Tile = {
            id: tileId++,
            suit: definition.suit,
            rank: definition.rank,
            honor: definition.honor,
            isRed: true,
            displayName: getTileDisplayName(definition, true),
            unicode: getTileUnicode(definition, true),
          };
          this.tiles.push(redTile);
        }
      }
    }

    // 牌山にコピー
    this.wall = [...this.tiles];
  }

  // 牌山をシャッフル（Fisher-Yatesアルゴリズム）
  private shuffleWall(): void {
    for (let i = this.wall.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.wall[i], this.wall[j]] = [this.wall[j]!, this.wall[i]!];
    }
    this.wallPosition = 0;
  }

  // 王牌の設定
  private setupDeadWall(): void {
    // 牌山の末尾から王牌を取る
    this.deadWall = this.wall.splice(-DEAD_WALL_COUNT);
    
    // ドラ表示牌を設定（王牌の3枚目から）
    this.doraIndicators = [this.deadWall[2]!];
    
    // 裏ドラ表示牌を設定（王牌の9枚目から）
    this.uraDoraIndicators = [this.deadWall[8]!];
  }

  // 配牌（4人分の手牌を生成）
  dealInitialHands(): Hand[] {
    const hands: Hand[] = [];

    for (let player = 0; player < 4; player++) {
      const tiles: Tile[] = [];
      
      // 各プレイヤーに13枚配牌
      for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
        const tile = this.drawTile();
        if (tile) {
          tiles.push(tile);
        }
      }

      // 手牌をソート
      tiles.sort(this.compareTiles);

      const hand: Hand = {
        tiles,
        melds: [],
        discards: [],
        riichi: false,
      };
      
      hands.push(hand);
    }

    return hands;
  }

  // ツモ（牌山から1枚引く）
  drawTile(): Tile | null {
    if (this.wallPosition >= this.wall.length) {
      return null; // 牌山が尽きた
    }
    
    const tile = this.wall[this.wallPosition];
    this.wallPosition++;
    return tile ?? null;
  }

  // 残り牌数
  getRemainingTileCount(): number {
    return this.wall.length - this.wallPosition;
  }

  // ドラ表示牌を追加（カンした時）
  addDoraIndicator(): void {
    if (this.doraIndicators.length < MAX_DORA_INDICATORS) {
      const nextIndicatorIndex = 4 + this.doraIndicators.length;
      if (nextIndicatorIndex < this.deadWall.length) {
        const indicator = this.deadWall[nextIndicatorIndex];
        if (indicator) {
          this.doraIndicators.push(indicator);
        }
        
        // 対応する裏ドラも追加
        const nextUraIndicatorIndex = 10 + this.uraDoraIndicators.length;
        if (nextUraIndicatorIndex < this.deadWall.length) {
          const uraIndicator = this.deadWall[nextUraIndicatorIndex];
          if (uraIndicator) {
            this.uraDoraIndicators.push(uraIndicator);
          }
        }
      }
    }
  }

  // ドラ牌を取得
  getDoraTiles(): Tile[] {
    return this.doraIndicators.filter(Boolean).map(indicator => this.getNextTile(indicator));
  }

  // 裏ドラ牌を取得
  getUraDoraTiles(): Tile[] {
    return this.uraDoraIndicators.filter(Boolean).map(indicator => this.getNextTile(indicator));
  }

  // ドラ表示牌から実際のドラ牌を計算
  private getNextTile(indicator: Tile): Tile {
    if (indicator.suit === 'ji') {
      // 字牌の場合
      if (indicator.honor === 'east') return this.createTile('ji', undefined, 'south');
      if (indicator.honor === 'south') return this.createTile('ji', undefined, 'west');
      if (indicator.honor === 'west') return this.createTile('ji', undefined, 'north');
      if (indicator.honor === 'north') return this.createTile('ji', undefined, 'east');
      if (indicator.honor === 'white') return this.createTile('ji', undefined, 'green');
      if (indicator.honor === 'green') return this.createTile('ji', undefined, 'red');
      if (indicator.honor === 'red') return this.createTile('ji', undefined, 'white');
    } else if (indicator.rank) {
      // 数牌の場合
      const nextRank = indicator.rank === 9 ? 1 : (indicator.rank + 1) as typeof indicator.rank;
      return this.createTile(indicator.suit, nextRank);
    }
    
    // フォールバック
    return indicator;
  }

  // 牌を生成（ヘルパー）
  private createTile(suit: Tile['suit'], rank?: Tile['rank'], honor?: Tile['honor']): Tile {
    const definition = TILE_DEFINITIONS.find(def => 
      def.suit === suit && def.rank === rank && def.honor === honor
    );
    
    if (!definition) {
      throw new Error(`Invalid tile: ${suit} ${rank || honor}`);
    }

    return {
      id: -1, // 実際のゲームでは使用されない（ドラ判定用）
      suit,
      rank,
      honor,
      isRed: false,
      displayName: getTileDisplayName(definition, false),
      unicode: getTileUnicode(definition, false),
    };
  }

  // 牌のソート比較関数
  private compareTiles = (a: Tile, b: Tile): number => {
    // 牌種順: man < pin < sou < ji
    const suitOrder = { man: 0, pin: 1, sou: 2, ji: 3 };
    if (a.suit !== b.suit) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }

    // 字牌の場合
    if (a.suit === 'ji') {
      const honorOrder = { east: 0, south: 1, west: 2, north: 3, white: 4, green: 5, red: 6 };
      return honorOrder[a.honor!] - honorOrder[b.honor!];
    }

    // 数牌の場合
    if (a.rank && b.rank) {
      return a.rank - b.rank;
    }

    return 0;
  };

  // ドラ表示牌を取得
  getDoraIndicators(): Tile[] {
    return [...this.doraIndicators];
  }

  // デバッグ用: 現在の状態を取得
  getDebugInfo(): {
    totalTiles: number;
    wallRemaining: number;
    deadWallCount: number;
    doraIndicators: Tile[];
    doraTiles: Tile[];
  } {
    return {
      totalTiles: this.tiles.length,
      wallRemaining: this.getRemainingTileCount(),
      deadWallCount: this.deadWall.length,
      doraIndicators: this.doraIndicators,
      doraTiles: this.getDoraTiles(),
    };
  }
}