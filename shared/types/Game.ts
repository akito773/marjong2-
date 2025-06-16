import { Player, PlayerAction } from './Player';
import { Tile } from './Tile';

// ゲームのフェーズ
export type GamePhase = 'waiting' | 'playing' | 'finished';

// 局の情報
export interface Round {
  readonly roundNumber: number; // 局数（1-16）
  readonly dealerPosition: number; // 親の座席位置
  readonly prevailingWind: 'east' | 'south' | 'west' | 'north'; // 場風
  readonly honbaCount: number; // 本場数
  readonly riichiSticks: number; // リーチ棒の数
}

// ゲーム状態
export interface GameState {
  readonly id: string;
  readonly players: readonly Player[];
  readonly currentPlayer: number; // 現在のプレイヤー番号（0-3）
  readonly phase: GamePhase;
  readonly round: Round;
  readonly wall: readonly Tile[]; // 牌山
  readonly deadWall: readonly Tile[]; // 王牌
  readonly doraIndicators: readonly Tile[]; // ドラ表示牌
  readonly uraDoraIndicators: readonly Tile[]; // 裏ドラ表示牌
  readonly remainingTiles: number; // 残り牌数
  readonly lastDiscard?: Tile; // 最後の捨牌
  readonly lastDiscardPlayer?: number; // 最後に捨牌したプレイヤー
  readonly availableActions: readonly PlayerAction[]; // 現在可能なアクション
  readonly gameLog: readonly GameAction[]; // ゲームログ
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ゲームで発生するアクション
export interface GameAction {
  readonly id: string;
  readonly type: 'deal' | 'draw' | 'discard' | 'meld' | 'riichi' | 'win' | 'draw_game' | 'next_round';
  readonly playerId?: string;
  readonly data?: unknown;
  readonly timestamp: number;
  readonly description: string; // ログ表示用の説明文
}

// ゲーム設定
export interface GameSettings {
  readonly maxPlayers: number; // 最大プレイヤー数（通常4）
  readonly botCount: number; // AIプレイヤー数
  readonly initialScore: number; // 初期持ち点（通常25000）
  readonly endScore: number; // 終了点数（通常30000）
  readonly redDora: boolean; // 赤ドラ有無
  readonly openTanyao: boolean; // 喰いタン有無
  readonly doubleRon: boolean; // ダブロン有無
  readonly nagashiMangan: boolean; // 流し満貫有無
}

// ゲーム結果
export interface GameResult {
  readonly gameId: string;
  readonly players: readonly Player[];
  readonly finalScores: readonly number[];
  readonly rankings: readonly number[]; // 順位（1-4）
  readonly gameLog: readonly GameAction[];
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly duration: number; // ゲーム時間（ミリ秒）
}