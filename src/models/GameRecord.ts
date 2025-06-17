import { Player as IPlayer } from '../../shared/types/Player';
import { GameState } from '../../shared/types/Game';

// ゲーム記録の基本情報
export interface GameRecord {
  readonly gameId: string;
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly gameType: 'ai' | 'multiplayer' | 'tutorial';
  readonly players: PlayerRecord[];
  readonly rounds: RoundRecord[];
  readonly finalScores: number[];
  readonly winner?: number; // プレイヤーインデックス
  readonly gameLength: number; // 秒
  readonly totalHands: number;
}

// プレイヤー記録
export interface PlayerRecord {
  readonly playerId: string;
  readonly playerName: string;
  readonly isBot: boolean;
  readonly position: number;
  readonly initialScore: number;
  readonly finalScore: number;
  readonly scoreChange: number;
  readonly handsWon: number;
  readonly handsPlayed: number;
  readonly averageHand: number;
  readonly yakuAchieved: YakuRecord[];
  readonly riichCount: number;
  readonly tsumoCount: number;
  readonly ronCount: number;
  readonly meldCount: number;
}

// 局記録
export interface RoundRecord {
  readonly roundNumber: number;
  readonly honba: number;
  readonly dealer: number;
  readonly winner?: number;
  readonly winType?: 'tsumo' | 'ron';
  readonly winningHand?: WinningHandRecord;
  readonly scoreChanges: number[];
  readonly duration: number; // 秒
  readonly totalTurns: number;
}

// 和了記録
export interface WinningHandRecord {
  readonly tiles: string[]; // 牌ID配列
  readonly winningTile: string;
  readonly melds: string[][];
  readonly yaku: YakuRecord[];
  readonly han: number;
  readonly fu: number;
  readonly basicPoints: number;
  readonly finalPoints: number;
  readonly isDealer: boolean;
  readonly isTsumo: boolean;
  readonly doraCount: number;
}

// 役記録
export interface YakuRecord {
  readonly name: string;
  readonly han: number;
  readonly description: string;
}

// 統計データ
export interface PlayerStats {
  readonly playerId: string;
  readonly playerName: string;
  readonly totalGames: number;
  readonly totalWins: number;
  readonly winRate: number;
  readonly averageScore: number;
  readonly averageRank: number;
  readonly totalPlayTime: number; // 秒
  readonly favoriteYaku: string[];
  readonly achievements: Achievement[];
  readonly rating: number;
  readonly rank: string;
}

// 実績
export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly achievedAt: Date;
  readonly rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

/**
 * ゲーム記録管理クラス
 */
export class GameRecordManager {
  private static instance: GameRecordManager;
  private records: Map<string, GameRecord> = new Map();
  private playerStats: Map<string, PlayerStats> = new Map();

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): GameRecordManager {
    if (!GameRecordManager.instance) {
      GameRecordManager.instance = new GameRecordManager();
    }
    return GameRecordManager.instance;
  }

  /**
   * 新しいゲーム記録を開始
   */
  startGameRecord(gameId: string, players: IPlayer[], gameType: 'ai' | 'multiplayer' | 'tutorial'): void {
    const record: GameRecord = {
      gameId,
      startTime: new Date(),
      gameType,
      players: players.map((player, index) => ({
        playerId: player.id,
        playerName: player.name,
        isBot: player.isBot,
        position: index,
        initialScore: player.score,
        finalScore: player.score,
        scoreChange: 0,
        handsWon: 0,
        handsPlayed: 0,
        averageHand: 0,
        yakuAchieved: [],
        riichCount: 0,
        tsumoCount: 0,
        ronCount: 0,
        meldCount: 0,
      })),
      rounds: [],
      finalScores: players.map(p => p.score),
      gameLength: 0,
      totalHands: 0,
    };

    this.records.set(gameId, record);
    console.log(`📊 ゲーム記録開始: ${gameId}`);
  }

  /**
   * 局の記録を追加
   */
  recordRound(
    gameId: string, 
    roundData: {
      roundNumber: number;
      honba: number;
      dealer: number;
      winner?: number;
      winType?: 'tsumo' | 'ron';
      winningHand?: WinningHandRecord;
      scoreChanges: number[];
      duration: number;
      totalTurns: number;
    }
  ): void {
    const record = this.records.get(gameId);
    if (!record) return;

    const roundRecord: RoundRecord = {
      ...roundData
    };

    // 記録を更新
    const updatedRecord: GameRecord = {
      ...record,
      rounds: [...record.rounds, roundRecord],
      totalHands: record.totalHands + 1,
    };

    // プレイヤー統計を更新
    if (roundData.winner !== undefined) {
      const updatedPlayers = updatedRecord.players.map((player, index) => {
        if (index === roundData.winner) {
          return {
            ...player,
            handsWon: player.handsWon + 1,
            handsPlayed: player.handsPlayed + 1,
            tsumoCount: roundData.winType === 'tsumo' ? player.tsumoCount + 1 : player.tsumoCount,
            ronCount: roundData.winType === 'ron' ? player.ronCount + 1 : player.ronCount,
            yakuAchieved: roundData.winningHand ? 
              [...player.yakuAchieved, ...roundData.winningHand.yaku] : 
              player.yakuAchieved,
          };
        } else {
          return {
            ...player,
            handsPlayed: player.handsPlayed + 1,
          };
        }
      });
      
      // 更新されたプレイヤー配列で記録を更新
      this.records.set(gameId, {
        ...updatedRecord,
        players: updatedPlayers,
      });
    } else {
      this.records.set(gameId, updatedRecord);
    }
  }

  /**
   * ゲーム終了記録
   */
  finishGameRecord(gameId: string, finalScores: number[], winner?: number): void {
    const record = this.records.get(gameId);
    if (!record) return;

    const endTime = new Date();
    const gameLength = Math.floor((endTime.getTime() - record.startTime.getTime()) / 1000);

    const finishedRecord: GameRecord = {
      ...record,
      endTime,
      finalScores,
      winner,
      gameLength,
      players: record.players.map((player, index) => ({
        ...player,
        finalScore: finalScores[index],
        scoreChange: finalScores[index] - player.initialScore,
        averageHand: player.handsPlayed > 0 ? 
          (finalScores[index] - player.initialScore) / player.handsPlayed : 0,
      })),
    };

    this.records.set(gameId, finishedRecord);
    
    // プレイヤー統計を更新
    this.updatePlayerStats(finishedRecord);
    
    // 実績チェック
    this.checkAchievements(finishedRecord);
    
    this.saveToStorage();
    console.log(`📊 ゲーム記録完了: ${gameId}, 勝者: プレイヤー${winner}`);
  }

  /**
   * プレイヤー統計を更新
   */
  private updatePlayerStats(record: GameRecord): void {
    record.players.forEach((playerRecord, index) => {
      if (playerRecord.isBot) return; // BOTの統計は除外

      const existingStats = this.playerStats.get(playerRecord.playerId);
      const isWinner = record.winner === index;
      
      const rating = this.calculateRating(playerRecord, isWinner);
      const totalGames = (existingStats?.totalGames || 0) + 1;
      const totalWins = (existingStats?.totalWins || 0) + (isWinner ? 1 : 0);
      
      const updatedStats: PlayerStats = {
        playerId: playerRecord.playerId,
        playerName: playerRecord.playerName,
        totalGames,
        totalWins,
        winRate: totalWins / totalGames,
        averageScore: this.calculateAverageScore(playerRecord.playerId),
        averageRank: this.calculateAverageRank(playerRecord.playerId),
        totalPlayTime: (existingStats?.totalPlayTime || 0) + record.gameLength,
        favoriteYaku: this.calculateFavoriteYaku(playerRecord.yakuAchieved),
        achievements: existingStats?.achievements || [],
        rating,
        rank: this.calculateRank(rating),
      };

      this.playerStats.set(playerRecord.playerId, updatedStats);
    });
  }

  /**
   * 実績チェック
   */
  private checkAchievements(record: GameRecord): void {
    record.players.forEach(playerRecord => {
      if (playerRecord.isBot) return;

      const stats = this.playerStats.get(playerRecord.playerId);
      if (!stats) return;

      const newAchievements: Achievement[] = [];

      // 初回勝利
      if (stats.totalWins === 1 && playerRecord.handsWon > 0) {
        newAchievements.push({
          id: 'first_win',
          name: '初勝利',
          description: '初めて勝利しました',
          achievedAt: new Date(),
          rarity: 'common'
        });
      }

      // 10勝達成
      if (stats.totalWins === 10) {
        newAchievements.push({
          id: 'ten_wins',
          name: '熟練者',
          description: '10勝を達成しました',
          achievedAt: new Date(),
          rarity: 'rare'
        });
      }

      // 役満達成
      const hasYakuman = playerRecord.yakuAchieved.some(yaku => yaku.han >= 13);
      if (hasYakuman) {
        newAchievements.push({
          id: 'yakuman',
          name: '役満達成',
          description: '役満を達成しました',
          achievedAt: new Date(),
          rarity: 'epic'
        });
      }

      // 統計を更新
      if (newAchievements.length > 0) {
        const updatedStats = {
          ...stats,
          achievements: [...stats.achievements, ...newAchievements]
        };
        this.playerStats.set(playerRecord.playerId, updatedStats);
      }
    });
  }

  /**
   * お気に入り役を計算
   */
  private calculateFavoriteYaku(yakuAchieved: YakuRecord[]): string[] {
    const yakuCount = new Map<string, number>();
    
    yakuAchieved.forEach(yaku => {
      yakuCount.set(yaku.name, (yakuCount.get(yaku.name) || 0) + 1);
    });

    return Array.from(yakuCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }

  /**
   * レーティング計算
   */
  private calculateRating(playerRecord: PlayerRecord, isWinner: boolean): number {
    // 簡易レーティング計算
    let rating = 1000; // 初期値
    
    if (isWinner) {
      rating += 50;
    } else {
      rating -= 10;
    }
    
    // 和了率ボーナス
    if (playerRecord.handsPlayed > 0) {
      const winRate = playerRecord.handsWon / playerRecord.handsPlayed;
      rating += Math.floor(winRate * 100);
    }
    
    return Math.max(0, Math.min(3000, rating));
  }

  /**
   * ランク計算
   */
  private calculateRank(rating: number): string {
    if (rating >= 2500) return '雀聖';
    if (rating >= 2000) return '雀豪';
    if (rating >= 1500) return '雀傑';
    if (rating >= 1000) return '雀士';
    return '新人';
  }

  /**
   * 平均スコア計算
   */
  private calculateAverageScore(playerId: string): number {
    const playerRecords = Array.from(this.records.values())
      .flatMap(record => record.players.filter(p => p.playerId === playerId));
    
    if (playerRecords.length === 0) return 0;
    
    const totalScore = playerRecords.reduce((sum, record) => sum + record.scoreChange, 0);
    return totalScore / playerRecords.length;
  }

  /**
   * 平均順位計算
   */
  private calculateAverageRank(playerId: string): number {
    const gameRecords = Array.from(this.records.values())
      .filter(record => record.players.some(p => p.playerId === playerId));
    
    if (gameRecords.length === 0) return 0;
    
    let totalRank = 0;
    gameRecords.forEach(record => {
      const sortedPlayers = [...record.players].sort((a, b) => b.finalScore - a.finalScore);
      const playerRank = sortedPlayers.findIndex(p => p.playerId === playerId) + 1;
      totalRank += playerRank;
    });
    
    return totalRank / gameRecords.length;
  }

  /**
   * プレイヤー統計取得
   */
  getPlayerStats(playerId: string): PlayerStats | null {
    return this.playerStats.get(playerId) || null;
  }

  /**
   * 全プレイヤー統計取得
   */
  getAllPlayerStats(): PlayerStats[] {
    return Array.from(this.playerStats.values())
      .sort((a, b) => b.rating - a.rating);
  }

  /**
   * ゲーム記録取得
   */
  getGameRecord(gameId: string): GameRecord | null {
    return this.records.get(gameId) || null;
  }

  /**
   * 全ゲーム記録取得
   */
  getAllGameRecords(): GameRecord[] {
    return Array.from(this.records.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * 統計サマリー取得
   */
  getStatsSummary(): {
    totalGames: number;
    totalPlayers: number;
    averageGameLength: number;
    mostPopularYaku: string;
    topPlayer: string;
  } {
    const allRecords = this.getAllGameRecords();
    const allStats = this.getAllPlayerStats();
    
    // 最も人気の役
    const allYaku = allRecords.flatMap(record => 
      record.players.flatMap(player => player.yakuAchieved)
    );
    const yakuCount = new Map<string, number>();
    allYaku.forEach(yaku => {
      yakuCount.set(yaku.name, (yakuCount.get(yaku.name) || 0) + 1);
    });
    const mostPopularYaku = Array.from(yakuCount.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'なし';

    return {
      totalGames: allRecords.length,
      totalPlayers: allStats.length,
      averageGameLength: allRecords.length > 0 ? 
        allRecords.reduce((sum, record) => sum + record.gameLength, 0) / allRecords.length : 0,
      mostPopularYaku,
      topPlayer: allStats[0]?.playerName || 'なし',
    };
  }

  /**
   * ローカルストレージに保存
   */
  private saveToStorage(): void {
    try {
      // サーバー環境では何もしない (Node.jsではlocalStorageは利用不可)
      console.log('📊 ゲーム記録を保存しました (メモリ内)');
    } catch (error) {
      console.warn('Failed to save to storage:', error);
    }
  }

  /**
   * ローカルストレージから読み込み
   */
  private loadFromStorage(): void {
    try {
      // サーバー環境では何もしない (Node.jsではlocalStorageは利用不可)
      console.log('📊 ゲーム記録を読み込みました (メモリ内)');
    } catch (error) {
      console.warn('Failed to load from storage:', error);
    }
  }

  /**
   * データをクリア
   */
  clearAllData(): void {
    this.records.clear();
    this.playerStats.clear();
    this.saveToStorage();
    console.log('📊 全ゲーム記録をクリアしました');
  }
}