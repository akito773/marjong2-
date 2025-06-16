const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイルの配信
app.use(express.static('public'));

// ルートパス
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ヘルスチェック用API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: '麻雀ゲームサーバーが動作中です',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404エラーハンドリング
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'Error',
    message: 'ページが見つかりません',
    path: req.originalUrl
  });
});

app.listen(PORT, () => {
  console.log(`🀄 麻雀ゲームサーバーがポート ${PORT} で起動しました`);
  console.log(`🌐 http://localhost:${PORT} でアクセスできます`);
  console.log(`📊 ヘルスチェック: http://localhost:${PORT}/api/health`);
});