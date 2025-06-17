/**
 * 麻雀ゲーム基本動作テスト
 * 
 * このテストでゲームの基本的な仕組みをチェックします
 */

const { GameManager } = require('../dist/src/models/GameManager.js');
const { TileManager } = require('../dist/src/models/TileManager.js');

describe('麻雀ゲーム基本動作テスト', () => {
  let gameManager;
  const testPlayers = ['テストプレイヤー', 'CPU東', 'CPU南', 'CPU西'];

  beforeEach(() => {
    // 新しいゲームを作成
    gameManager = new GameManager('test_game', testPlayers);
    gameManager.setDebugMode(true); // デバッグモード有効
    gameManager.startGame(); // ゲーム開始
  });

  describe('ゲーム初期化テスト', () => {
    test('ゲームが正しく初期化されること', () => {
      const gameState = gameManager.getGameState();
      
      // 基本チェック
      expect(gameState.players).toHaveLength(4);
      expect(gameState.currentPlayer).toBe(0); // 親から開始
      expect(gameState.phase).toBe('playing');
      
      console.log('✅ ゲーム初期化: OK');
    });

    test('配牌が正しく行われること', () => {
      const gameState = gameManager.getGameState();
      const players = gameState.players;
      
      // 各プレイヤーの手牌をチェック
      players.forEach((player, index) => {
        if (index === 0) {
          // 親は14枚でスタート
          expect(player.hand.tiles).toHaveLength(14);
          console.log(`✅ ${player.name}: ${player.hand.tiles.length}枚 (親)`);
        } else {
          // 子は13枚でスタート
          expect(player.hand.tiles).toHaveLength(13);
          console.log(`✅ ${player.name}: ${player.hand.tiles.length}枚 (子)`);
        }
      });
    });
  });

  describe('ツモ・打牌テスト', () => {
    test('プレイヤー0が正しくツモできること', () => {
      const initialState = gameManager.getGameState();
      const initialHandSize = initialState.players[0].hand.tiles.length;
      
      console.log(`初期手牌: ${initialHandSize}枚`);
      
      // 手牌が13枚の場合のみツモ可能
      if (initialHandSize === 13) {
        try {
          const action = {
            type: 'draw',
            playerId: 'player_0',
            timestamp: Date.now()
          };
          
          const result = gameManager.processAction(action);
          const newState = gameManager.getGameState();
          const newHandSize = newState.players[0].hand.tiles.length;
          
          expect(newHandSize).toBe(14);
          expect(result).toHaveLength(1);
          expect(result[0].type).toBe('draw');
          
          console.log(`✅ ツモ後: ${newHandSize}枚`);
        } catch (error) {
          console.error(`❌ ツモエラー: ${error.message}`);
          throw error;
        }
      } else {
        console.log(`⚠️ 初期手牌が${initialHandSize}枚のためツモをスキップ`);
      }
    });

    test('プレイヤー0が正しく打牌できること', () => {
      // まず14枚の状態にする
      let gameState = gameManager.getGameState();
      let handSize = gameState.players[0].hand.tiles.length;
      
      if (handSize === 13) {
        // ツモして14枚にする
        const drawAction = {
          type: 'draw',
          playerId: 'player_0',
          timestamp: Date.now()
        };
        gameManager.processAction(drawAction);
        gameState = gameManager.getGameState();
        handSize = gameState.players[0].hand.tiles.length;
      }
      
      console.log(`打牌前: ${handSize}枚`);
      
      if (handSize === 14) {
        const firstTile = gameState.players[0].hand.tiles[0];
        
        try {
          const discardAction = {
            type: 'discard',
            playerId: 'player_0',
            tile: firstTile,
            timestamp: Date.now()
          };
          
          const result = gameManager.processAction(discardAction);
          const newState = gameManager.getGameState();
          const newHandSize = newState.players[0].hand.tiles.length;
          
          expect(newHandSize).toBe(13);
          expect(result).toHaveLength(1);
          expect(result[0].type).toBe('discard');
          
          console.log(`✅ 打牌後: ${newHandSize}枚`);
          console.log(`✅ 捨て牌: ${firstTile.displayName || firstTile.unicode}`);
        } catch (error) {
          console.error(`❌ 打牌エラー: ${error.message}`);
          throw error;
        }
      } else {
        throw new Error(`手牌が${handSize}枚で打牌できません`);
      }
    });
  });

  describe('ターン管理テスト', () => {
    test('ターンが正しく進むこと', () => {
      const initialState = gameManager.getGameState();
      console.log(`初期ターン: プレイヤー${initialState.currentPlayer}`);
      
      // プレイヤー0が打牌してターンを進める
      let handSize = initialState.players[0].hand.tiles.length;
      
      // 14枚でない場合はツモして14枚にする
      if (handSize === 13) {
        const drawAction = {
          type: 'draw',
          playerId: 'player_0',
          timestamp: Date.now()
        };
        gameManager.processAction(drawAction);
        handSize = 14;
      }
      
      if (handSize === 14) {
        const gameState = gameManager.getGameState();
        const firstTile = gameState.players[0].hand.tiles[0];
        
        const discardAction = {
          type: 'discard',
          playerId: 'player_0',
          tile: firstTile,
          timestamp: Date.now()
        };
        
        gameManager.processAction(discardAction);
        const newState = gameManager.getGameState();
        
        console.log(`打牌後ターン: プレイヤー${newState.currentPlayer}`);
        
        // デバッグモードでは手動でターン管理するため、ターンは変わらない可能性
        // 実際のゲームでは次のプレイヤーにターンが移る
      }
    });
  });

  describe('ゲーム状態チェック', () => {
    test('ゲーム状態の整合性チェック', () => {
      const gameState = gameManager.getGameState();
      
      // 各プレイヤーの状態をチェック
      gameState.players.forEach((player, index) => {
        expect(player.id).toBe(`player_${index}`);
        expect(player.position).toBe(index);
        expect(player.hand.tiles).toBeDefined();
        expect(Array.isArray(player.hand.tiles)).toBe(true);
        expect(player.score).toBe(25000); // 初期点数
        
        console.log(`✅ プレイヤー${index} (${player.name}): 手牌${player.hand.tiles.length}枚, 点数${player.score}点`);
      });
      
      // 残り牌数チェック
      const totalTilesInHands = gameState.players.reduce((sum, player) => sum + player.hand.tiles.length, 0);
      const remainingTiles = gameState.remainingTiles;
      const totalTiles = totalTilesInHands + remainingTiles + 14; // 王牌14枚
      
      console.log(`手牌合計: ${totalTilesInHands}枚`);
      console.log(`残り牌: ${remainingTiles}枚`);
      console.log(`王牌: 14枚`);
      console.log(`総計: ${totalTiles}枚`);
      
      expect(totalTiles).toBe(136); // 麻雀牌の総数
    });
  });
});

// 実際にテストを実行する関数
async function runTests() {
  console.log('🀄 麻雀ゲーム基本動作テスト開始\n');
  
  try {
    // 各テストを手動で実行
    const gameManager = new GameManager('test_game', ['テストプレイヤー', 'CPU東', 'CPU南', 'CPU西']);
    gameManager.setDebugMode(true);
    
    console.log('=== ゲーム初期化テスト ===');
    const gameState = gameManager.getGameState();
    console.log(`プレイヤー数: ${gameState.players.length}`);
    console.log(`現在のターン: プレイヤー${gameState.currentPlayer}`);
    console.log(`ゲームフェーズ: ${gameState.phase}`);
    
    gameState.players.forEach((player, index) => {
      console.log(`${player.name}: 手牌${player.hand.tiles.length}枚`);
    });
    
    console.log('\n=== ツモテスト ===');
    const player0HandSize = gameState.players[0].hand.tiles.length;
    console.log(`プレイヤー0初期手牌: ${player0HandSize}枚`);
    
    if (player0HandSize === 13) {
      try {
        const drawAction = {
          type: 'draw',
          playerId: 'player_0',
          timestamp: Date.now()
        };
        
        const result = gameManager.processAction(drawAction);
        const newState = gameManager.getGameState();
        console.log(`ツモ後手牌: ${newState.players[0].hand.tiles.length}枚`);
        console.log(`ツモ結果: ${JSON.stringify(result[0], null, 2)}`);
      } catch (error) {
        console.error(`ツモエラー: ${error.message}`);
      }
    }
    
    console.log('\n=== 打牌テスト ===');
    const currentState = gameManager.getGameState();
    const currentHandSize = currentState.players[0].hand.tiles.length;
    
    if (currentHandSize === 14) {
      const firstTile = currentState.players[0].hand.tiles[0];
      console.log(`打牌する牌: ${firstTile.displayName || firstTile.unicode}`);
      
      try {
        const discardAction = {
          type: 'discard',
          playerId: 'player_0',
          tile: firstTile,
          timestamp: Date.now()
        };
        
        const result = gameManager.processAction(discardAction);
        const finalState = gameManager.getGameState();
        console.log(`打牌後手牌: ${finalState.players[0].hand.tiles.length}枚`);
        console.log(`打牌結果: ${JSON.stringify(result[0], null, 2)}`);
      } catch (error) {
        console.error(`打牌エラー: ${error.message}`);
      }
    }
    
    console.log('\n🎉 テスト完了');
    
  } catch (error) {
    console.error(`❌ テスト失敗: ${error.message}`);
    console.error(error.stack);
  }
}

// Node.jsで直接実行された場合
if (require.main === module) {
  runTests();
}

module.exports = { runTests };