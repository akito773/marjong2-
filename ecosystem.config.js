module.exports = {
  apps: [{
    name: 'marjong2-test',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      PORT: 3000,
      NODE_ENV: 'development'
    },
    env_production: {
      PORT: 3000,
      NODE_ENV: 'production'
    },
    // ログ設定
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // 再起動設定
    watch: false,
    max_restarts: 5,
    min_uptime: '10s',
    
    // メモリ管理
    max_memory_restart: '1G'
  }]
};