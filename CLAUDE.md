# 麻雀ゲーム開発メモ

## メルド機能（チー・ポン・カン）実装完了

### 実装内容
- サーバー側メルド処理ロジック完全実装
- クライアント側メルド表示・操作システム完全実装
- WebSocket通信によるリアルタイムメルド機会通知
- ファイルベースログシステム実装

### 発生した問題と解決策

#### 問題1: メルドボタンクリック時に「チーできません/ポンできません」エラー
**原因**: `lastDiscardedTile`変数が`null`のままで、meld関数が早期リターンしていた

**解決策**: 
- `meldOpportunities`イベントハンドラー内で`lastDiscardedTile`を直接設定
- デバッグログ追加で問題箇所を特定

```javascript
// meldOpportunitiesイベントで直接設定
if (data.discardedTile && data.discardPlayerId !== undefined) {
    lastDiscardedTile = data.discardedTile;
    lastDiscardedPlayer = data.discardPlayerId;
}
```

#### 問題2: サーバーでplayerActionイベントが受信されない
**原因**: サーバー再起動時の不適切な起動方法

**解決策**: 正しいバックグラウンド起動コマンド使用
```bash
# 正しい方法
cd /mnt/c/Users/akar0/Documents/marjong2 && nohup node server.js &

# 間違った方法（接続エラーの原因）
node server.js &  # フォアグラウンドで実行され、接続が不安定
```

#### 問題3: WebSocketメッセージがサーバーに到達しない
**原因**: サーバープロセスの不完全な起動・停止

**トラブルシューティング手順**:
1. プロセス確認: `ps aux | grep "node.*server.js"`
2. プロセス停止: `pkill -f "node.*server.js"`
3. 正しい再起動: `nohup node server.js &`

### 学んだ教訓
1. **デバッグログの重要性**: 各段階でのログ出力により問題箇所を迅速に特定できた
2. **サーバー起動方法の統一**: 毎回同じ方法でサーバーを起動することの重要性
3. **変数の状態管理**: クライアント側の状態変数が正しく更新されているかの確認が必須

### メルド機能仕様
- **チー**: 前のプレイヤーの捨牌+手牌2枚で順子を作成
- **ポン**: 任意のプレイヤーの捨牌+手牌2枚で刻子を作成  
- **カン**: 任意のプレイヤーの捨牌+手牌3枚で槓子を作成（明槓）
- **暗カン**: 手牌4枚で槓子を作成（暗槓）

### 次回開発時の注意事項
1. サーバー起動は必ず `nohup node server.js &` を使用
2. WebSocket通信問題は必ずサーバーログで playerAction 受信を確認
3. クライアント側の状態変数（lastDiscardedTile等）は適切なタイミングで更新
4. メルド機能のテストは実際のゲームフローで行う（CPUとの対戦で捨牌→メルドの流れ）

## 実行コマンド
```bash
# サーバー起動
cd /mnt/c/Users/akar0/Documents/marjong2 && nohup node server.js &

# ログ確認
tail -f game.log
tail -f debug.log

# プロセス確認・停止
ps aux | grep "node.*server.js"
pkill -f "node.*server.js"
```