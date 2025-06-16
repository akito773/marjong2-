import { TileDefinition, Honor } from '../types/Tile';

// 牌の定義データ
export const TILE_DEFINITIONS: TileDefinition[] = [
  // 萬子（マンズ）
  { suit: 'man', rank: 1, count: 4 },
  { suit: 'man', rank: 2, count: 4 },
  { suit: 'man', rank: 3, count: 4 },
  { suit: 'man', rank: 4, count: 4 },
  { suit: 'man', rank: 5, count: 3, redCount: 1 }, // 赤5萬
  { suit: 'man', rank: 6, count: 4 },
  { suit: 'man', rank: 7, count: 4 },
  { suit: 'man', rank: 8, count: 4 },
  { suit: 'man', rank: 9, count: 4 },

  // 筒子（ピンズ）
  { suit: 'pin', rank: 1, count: 4 },
  { suit: 'pin', rank: 2, count: 4 },
  { suit: 'pin', rank: 3, count: 4 },
  { suit: 'pin', rank: 4, count: 4 },
  { suit: 'pin', rank: 5, count: 3, redCount: 1 }, // 赤5筒
  { suit: 'pin', rank: 6, count: 4 },
  { suit: 'pin', rank: 7, count: 4 },
  { suit: 'pin', rank: 8, count: 4 },
  { suit: 'pin', rank: 9, count: 4 },

  // 索子（ソーズ）
  { suit: 'sou', rank: 1, count: 4 },
  { suit: 'sou', rank: 2, count: 4 },
  { suit: 'sou', rank: 3, count: 4 },
  { suit: 'sou', rank: 4, count: 4 },
  { suit: 'sou', rank: 5, count: 3, redCount: 1 }, // 赤5索
  { suit: 'sou', rank: 6, count: 4 },
  { suit: 'sou', rank: 7, count: 4 },
  { suit: 'sou', rank: 8, count: 4 },
  { suit: 'sou', rank: 9, count: 4 },

  // 字牌
  { suit: 'ji', honor: 'east', count: 4 },
  { suit: 'ji', honor: 'south', count: 4 },
  { suit: 'ji', honor: 'west', count: 4 },
  { suit: 'ji', honor: 'north', count: 4 },
  { suit: 'ji', honor: 'white', count: 4 },
  { suit: 'ji', honor: 'green', count: 4 },
  { suit: 'ji', honor: 'red', count: 4 },
];

// 牌の表示名生成
export const getTileDisplayName = (definition: TileDefinition, isRed = false): string => {
  if (definition.suit === 'ji' && definition.honor) {
    const honorNames: Record<Honor, string> = {
      east: '東',
      south: '南',
      west: '西',
      north: '北',
      white: '白',
      green: '發',
      red: '中',
    };
    return honorNames[definition.honor];
  }

  if (definition.rank !== undefined) {
    const suitSuffixes = { man: 'm', pin: 'p', sou: 's', ji: '' };
    const prefix = isRed ? '赤' : '';
    return `${prefix}${definition.rank}${suitSuffixes[definition.suit] || ''}`;
  }

  throw new Error('Invalid tile definition');
};

// 牌のUnicode文字生成
export const getTileUnicode = (definition: TileDefinition, isRed = false): string => {
  if (definition.suit === 'ji' && definition.honor) {
    const honorUnicodes: Record<Honor, string> = {
      east: '🀀',
      south: '🀁', 
      west: '🀂',
      north: '🀃',
      white: '🀆',
      green: '🀅',
      red: '🀄',
    };
    return honorUnicodes[definition.honor];
  }

  if (definition.rank !== undefined) {
    // 萬子
    if (definition.suit === 'man') {
      const manUnicodes = ['🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏'];
      return isRed && definition.rank === 5 ? '🀋' : manUnicodes[definition.rank - 1] || '🀫';
    }
    // 筒子  
    if (definition.suit === 'pin') {
      const pinUnicodes = ['🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡'];
      return isRed && definition.rank === 5 ? '🀝' : pinUnicodes[definition.rank - 1] || '🀫';
    }
    // 索子
    if (definition.suit === 'sou') {
      const souUnicodes = ['🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘'];
      return isRed && definition.rank === 5 ? '🀔' : souUnicodes[definition.rank - 1] || '🀫';
    }
  }

  return '🀫'; // 牌の裏面
};

// 牌山の総数
export const TOTAL_TILES = 136;

// 王牌の枚数
export const DEAD_WALL_COUNT = 14;

// 配牌枚数
export const INITIAL_HAND_SIZE = 13;

// ドラ表示牌の最大数
export const MAX_DORA_INDICATORS = 5;