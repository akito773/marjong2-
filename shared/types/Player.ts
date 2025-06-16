import { Hand, Meld } from './Hand';
import { Tile } from './Tile';

// プレイヤーの状態
export type PlayerStatus = 'waiting' | 'playing' | 'riichi' | 'finished';

// プレイヤー情報
export interface Player {
  readonly id: string;
  readonly name: string;
  readonly hand: Hand;
  readonly score: number; // 持ち点
  readonly position: number; // 座席位置（0-3）
  readonly isDealer: boolean; // 親フラグ
  readonly isBot: boolean; // AIプレイヤーフラグ
  readonly status: PlayerStatus;
  readonly wind: 'east' | 'south' | 'west' | 'north'; // 自風
}

// プレイヤーのアクション
export interface PlayerAction {
  readonly type: 'discard' | 'chi' | 'pon' | 'kan' | 'riichi' | 'tsumo' | 'ron' | 'pass';
  readonly playerId: string;
  readonly tile?: Tile;
  readonly meld?: Meld;
  readonly priority: number; // 0: パス/捨牌, 1: チー, 2: ポン, 3: カン, 4: ロン
  readonly timestamp: number;
}

// プレイヤーの統計情報
export interface PlayerStats {
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly totalScore: number;
  readonly averageScore: number;
  readonly riichiRate: number;
  readonly winRate: number;
}