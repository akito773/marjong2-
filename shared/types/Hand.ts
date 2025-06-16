import { Tile } from './Tile';

// 鳴きの種類
export type MeldType = 'chi' | 'pon' | 'kan' | 'ankan';

// 鳴き情報
export interface Meld {
  readonly id: string;
  readonly type: MeldType;
  readonly tiles: readonly Tile[];
  readonly fromPlayer: number; // 鳴いた相手のプレイヤー番号（0-3）
  readonly isConcealed: boolean; // 暗槓フラグ
  readonly calledTile?: Tile; // 鳴いた牌（暗槓の場合はnull）
}

// 手牌情報
export interface Hand {
  readonly tiles: readonly Tile[]; // 手牌（13枚または14枚）
  readonly melds: readonly Meld[]; // 鳴き
  readonly discards: readonly Tile[]; // 捨牌
  readonly riichi: boolean; // リーチ状態
  readonly riichiTile?: Tile; // リーチ宣言牌
  readonly riichiTurn?: number; // リーチ宣言した巡目
}

// 和了形の判定結果
export interface WinningHand {
  readonly isWinning: boolean;
  readonly waitingTiles: readonly Tile[]; // 待ち牌
  readonly winningGroups?: readonly TileGroup[]; // 和了形の組み合わせ
}

// 牌のグループ（順子・刻子・雀頭）
export interface TileGroup {
  readonly type: 'sequence' | 'triplet' | 'pair';
  readonly tiles: readonly Tile[];
}