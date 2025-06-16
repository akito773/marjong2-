// 牌の種類
export type Suit = 'man' | 'pin' | 'sou' | 'ji';

// 牌のランク（1-9、字牌は無視）
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

// 字牌の種類
export type Honor = 'east' | 'south' | 'west' | 'north' | 'white' | 'green' | 'red';

// 牌の基本情報
export interface Tile {
  readonly id: number; // 0-135 (各牌種4枚×34種類)
  readonly suit: Suit;
  readonly rank?: Rank; // 字牌の場合はundefined
  readonly honor?: Honor; // 数牌の場合はundefined
  readonly isRed: boolean; // 赤ドラフラグ
  readonly displayName: string; // 表示名（"1m", "東"など）
  readonly unicode: string; // Unicode文字
}

// 牌の生成用ヘルパー型
export interface TileDefinition {
  suit: Suit;
  rank?: Rank;
  honor?: Honor;
  count: number; // 通常は4枚
  redCount?: number; // 赤ドラの枚数
}