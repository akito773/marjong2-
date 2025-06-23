/**
 * 麻雀ゲーム音効管理システム
 */
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.sounds = new Map();
        this.volume = 0.7;
        this.muted = false;
        this.initialized = false;
        
        // 音効設定
        this.soundConfig = {
            tilePlace: { frequency: 440, duration: 0.1, type: 'square' },
            tileSelect: { frequency: 660, duration: 0.05, type: 'sine' },
            chi: { frequency: 523, duration: 0.3, type: 'sawtooth' },
            pon: { frequency: 659, duration: 0.3, type: 'sawtooth' },
            kan: { frequency: 784, duration: 0.4, type: 'sawtooth' },
            riichi: { frequency: 880, duration: 0.5, type: 'triangle' },
            tsumo: { frequency: 1047, duration: 0.8, type: 'sine' },
            ron: { frequency: 1175, duration: 0.8, type: 'sine' },
            gameStart: { frequency: 523, duration: 1.0, type: 'triangle' },
            gameEnd: { frequency: 392, duration: 1.5, type: 'triangle' },
            notification: { frequency: 800, duration: 0.2, type: 'sine' },
            error: { frequency: 220, duration: 0.3, type: 'square' },
            success: { frequency: 1320, duration: 0.4, type: 'sine' },
            warning: { frequency: 740, duration: 0.3, type: 'triangle' }
        };
    }

    /**
     * 音効システム初期化
     */
    async init() {
        if (this.initialized) return;

        try {
            // Web Audio API初期化
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // ユーザーインタラクション後にコンテキストを再開
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.initialized = true;
            console.log('🎵 音効システム初期化完了');
        } catch (error) {
            console.error('🚫 音効システム初期化失敗:', error);
        }
    }

    /**
     * 音効再生
     */
    playSound(soundType, customConfig = {}) {
        if (!this.initialized || this.muted || !this.audioContext) {
            return;
        }

        const config = { ...this.soundConfig[soundType], ...customConfig };
        if (!config) {
            console.warn(`未知の音効タイプ: ${soundType}`);
            return;
        }

        try {
            this.generateTone(config.frequency, config.duration, config.type);
        } catch (error) {
            console.error('音効再生エラー:', error);
        }
    }

    /**
     * トーン生成
     */
    generateTone(frequency, duration, type = 'sine') {
        if (!this.audioContext) {
            console.warn('AudioContext not initialized');
            return;
        }
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = type;

        // ボリュームエンベロープ
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    /**
     * 複合音効（和音）
     */
    playChord(frequencies, duration = 0.5, type = 'sine') {
        if (!this.initialized || this.muted || !this.audioContext) return;

        frequencies.forEach((freq, index) => {
            setTimeout(() => {
                this.generateTone(freq, duration, type);
            }, index * 50);
        });
    }

    /**
     * 特別な音効
     */
    playRiichi() {
        // リーチ音：上昇音階
        const frequencies = [440, 523, 659, 784];
        this.playChord(frequencies, 0.4, 'triangle');
    }

    playTsumo() {
        // ツモ音：勝利の和音
        const frequencies = [523, 659, 784, 1047];
        this.playChord(frequencies, 0.6, 'sine');
    }

    playRon() {
        // ロン音：決定的な和音
        const frequencies = [659, 831, 1047, 1319];
        this.playChord(frequencies, 0.8, 'sine');
    }

    playGameStart() {
        // ゲーム開始：希望的な音階
        const melody = [523, 587, 659, 784, 880];
        melody.forEach((freq, index) => {
            setTimeout(() => {
                this.generateTone(freq, 0.3, 'triangle');
            }, index * 200);
        });
    }

    playGameEnd() {
        // ゲーム終了：終了の音階
        const melody = [880, 784, 659, 587, 523];
        melody.forEach((freq, index) => {
            setTimeout(() => {
                this.generateTone(freq, 0.4, 'triangle');
            }, index * 250);
        });
    }

    playWin() {
        // 勝利音：祝福の旋律
        const melody = [523, 659, 784, 1047, 1319, 1047, 784, 659, 523];
        melody.forEach((freq, index) => {
            setTimeout(() => {
                this.generateTone(freq, 0.2, 'sine');
            }, index * 100);
        });
    }

    playLose() {
        // 敗北音：下降音階
        const melody = [440, 392, 349, 294];
        melody.forEach((freq, index) => {
            setTimeout(() => {
                this.generateTone(freq, 0.4, 'sawtooth');
            }, index * 200);
        });
    }

    /**
     * 環境音
     */
    playAmbientClick() {
        this.playSound('tileSelect', { volume: 0.3 });
    }

    playHover() {
        this.generateTone(1200, 0.05, 'sine');
    }

    /**
     * ボリューム制御
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }

    getVolume() {
        return this.volume;
    }

    /**
     * ミュート制御
     */
    mute() {
        this.muted = true;
    }

    unmute() {
        this.muted = false;
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    isMuted() {
        return this.muted;
    }

    /**
     * 音効テスト
     */
    testSound() {
        if (!this.initialized) {
            console.warn('音効システムが初期化されていません');
            return;
        }

        console.log('🎵 音効テスト開始');
        
        const testSequence = [
            { type: 'tileSelect', delay: 0 },
            { type: 'tilePlace', delay: 200 },
            { type: 'chi', delay: 400 },
            { type: 'pon', delay: 800 },
            { type: 'kan', delay: 1200 },
            { type: 'notification', delay: 1800 },
            { type: 'success', delay: 2200 }
        ];

        testSequence.forEach(({ type, delay }) => {
            setTimeout(() => {
                this.playSound(type);
                console.log(`♪ ${type}`);
            }, delay);
        });

        setTimeout(() => {
            console.log('🎵 音効テスト完了');
        }, 3000);
    }

    /**
     * 設定保存・読み込み
     */
    saveSettings() {
        const settings = {
            volume: this.volume,
            muted: this.muted
        };
        localStorage.setItem('mahjong_sound_settings', JSON.stringify(settings));
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('mahjong_sound_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.volume = settings.volume ?? 0.7;
                this.muted = settings.muted ?? false;
            }
        } catch (error) {
            console.warn('音効設定読み込みエラー:', error);
        }
    }

    /**
     * クリーンアップ
     */
    destroy() {
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.sounds.clear();
        this.initialized = false;
    }
}

// グローバルインスタンス
const soundManager = new SoundManager();

// 自動初期化（ユーザーインタラクション後）
document.addEventListener('click', async () => {
    if (!soundManager.initialized) {
        await soundManager.init();
        soundManager.loadSettings();
    }
}, { once: true });

// キーボードインタラクション対応
document.addEventListener('keydown', async () => {
    if (!soundManager.initialized) {
        await soundManager.init();
        soundManager.loadSettings();
    }
}, { once: true });

// ページ離脱時の設定保存
window.addEventListener('beforeunload', () => {
    soundManager.saveSettings();
});

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SoundManager;
}