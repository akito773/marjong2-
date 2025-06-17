// リーチシステムの簡易テスト
const { Player } = require('./dist/src/models/Player');

console.log('🧪 リーチシステムテスト開始');

// TC017: 基本リーチ宣言テスト
console.log('\n📋 TC017: 基本リーチ宣言テスト');
try {
  const player = new Player('test', 'テストプレイヤー', 0, false, 25000);
  
  // 手牌を13枚にセット（聴牌形の例）
  const testTiles = [
    { id: '1m1', suit: 'man', rank: 1, isRed: false, displayName: '1m', unicode: '🀇' },
    { id: '1m2', suit: 'man', rank: 1, isRed: false, displayName: '1m', unicode: '🀇' },
    { id: '2m1', suit: 'man', rank: 2, isRed: false, displayName: '2m', unicode: '🀈' },
    { id: '3m1', suit: 'man', rank: 3, isRed: false, displayName: '3m', unicode: '🀉' },
    { id: '4m1', suit: 'man', rank: 4, isRed: false, displayName: '4m', unicode: '🀊' },
    { id: '5m1', suit: 'man', rank: 5, isRed: false, displayName: '5m', unicode: '🀋' },
    { id: '6m1', suit: 'man', rank: 6, isRed: false, displayName: '6m', unicode: '🀌' },
    { id: '7m1', suit: 'man', rank: 7, isRed: false, displayName: '7m', unicode: '🀍' },
    { id: '8m1', suit: 'man', rank: 8, isRed: false, displayName: '8m', unicode: '🀎' },
    { id: '9m1', suit: 'man', rank: 9, isRed: false, displayName: '9m', unicode: '🀏' },
    { id: '9m2', suit: 'man', rank: 9, isRed: false, displayName: '9m', unicode: '🀏' },
    { id: '9m3', suit: 'man', rank: 9, isRed: false, displayName: '9m', unicode: '🀏' },
    { id: '9m4', suit: 'man', rank: 9, isRed: false, displayName: '9m', unicode: '🀏' }
  ];
  
  player.setStatus('playing');
  testTiles.forEach(tile => player.drawTile(tile));
  
  console.log(`  手牌枚数: ${player.hand.tiles.length}`);
  console.log(`  リーチ前スコア: ${player.score}`);
  console.log(`  リーチ可能判定: ${player.canDeclareRiichi()}`);
  
  if (player.canDeclareRiichi()) {
    console.log('  ✅ TC017 PASS: リーチ宣言可能');
  } else {
    console.log('  ❌ TC017 FAIL: リーチ宣言不可');
  }
  
} catch (error) {
  console.log('  ❌ TC017 ERROR:', error.message);
}

// TC018: 持点不足テスト
console.log('\n📋 TC018: 持点不足テスト');
try {
  const poorPlayer = new Player('poor', '貧乏プレイヤー', 0, false, 900);
  console.log(`  持点: ${poorPlayer.score}`);
  console.log(`  リーチ可能判定: ${poorPlayer.canDeclareRiichi()}`);
  
  if (!poorPlayer.canDeclareRiichi()) {
    console.log('  ✅ TC018 PASS: 持点不足でリーチ不可');
  } else {
    console.log('  ❌ TC018 FAIL: 持点不足でもリーチ可能');
  }
  
} catch (error) {
  console.log('  ❌ TC018 ERROR:', error.message);
}

console.log('\n🏁 テスト完了');