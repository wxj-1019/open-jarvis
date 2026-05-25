/**
 * Emoji 风格预设配置
 * 
 * 提供多种 emoji 风格供用户选择，避免过于 AI 化的感觉
 */

export interface EmojiStylePreset {
  id: string;
  name: string;
  description: string;
  preview: string;
  tools: Record<string, {
    running: string;
    done: string;
    failed: string;
  }>;
}

export const EMOJI_STYLE_PRESETS: Record<string, EmojiStylePreset> = {
  // 默认科技风（当前）
  default: {
    id: 'default',
    name: 'emojiStyle.default.name',
    description: 'emojiStyle.default.description',
    preview: '🌐',
    tools: {
      web_search: {
        running: '🌐 {name} 正在互联网冲浪',
        done: '🌐 {name} 冲浪回来了',
        failed: '🌐 {name} 没冲到浪',
      },
      web_fetch: {
        running: '📄 {name} 正在获取网页',
        done: '📄 {name} 获取到网页内容',
        failed: '📄 {name} 获取网页失败',
      },
      file_search: {
        running: '🔍 {name} 正在搜索文件',
        done: '🔍 {name} 找到了文件',
        failed: '🔍 {name} 没找到文件',
      },
      code_interpreter: {
        running: '💻 {name} 正在运行代码',
        done: '💻 {name} 代码执行完成',
        failed: '💻 {name} 代码执行出错',
      },
    },
  },

  // 樱花系 - 温暖日系可爱风
  sakura: {
    id: 'sakura',
    name: 'emojiStyle.sakura.name',
    description: 'emojiStyle.sakura.description',
    preview: '🌸',
    tools: {
      web_search: {
        running: '🌸 {name} 正在花海里寻觅',
        done: '🌸 {name} 带着花香回来了',
        failed: '🌸 {name} 没有找到花瓣呢',
      },
      web_fetch: {
        running: '🌸 {name} 正在采摘花瓣',
        done: '🌸 {name} 收集到了花瓣',
        failed: '🌸 {name} 花瓣飘走了',
      },
      file_search: {
        running: '🌸 {name} 在花丛中寻找',
        done: '🌸 {name} 找到了宝藏',
        failed: '🌸 {name} 什么也没找到',
      },
      code_interpreter: {
        running: '🌸 {name} 正在编织花瓣',
        done: '🌸 {name} 编织完成了',
        failed: '🌸 {name} 线团乱了',
      },
    },
  },

  // 小动物系 - Q弹萌宠风
  animal: {
    id: 'animal',
    name: 'emojiStyle.animal.name',
    description: 'emojiStyle.animal.description',
    preview: '🐾',
    tools: {
      web_search: {
        running: '🐾 {name} 正在外出探险',
        done: '🐾 {name} 叼着宝贝回来了',
        failed: '🐾 {name} 空手回来了',
      },
      web_fetch: {
        running: '🐾 {name} 正在追踪气味',
        done: '🐾 {name} 找到了线索',
        failed: '🐾 {name} 跟丢了',
      },
      file_search: {
        running: '🐾 {name} 正在嗅来嗅去',
        done: '🐾 {name} 挖到了宝贝',
        failed: '🐾 {name} 什么都没挖到',
      },
      code_interpreter: {
        running: '🐾 {name} 正在玩毛线球',
        done: '🐾 {name} 织好了小围巾',
        failed: '🐾 {name} 把毛线弄乱了',
      },
    },
  },

  // 魔法系 - 梦幻魔法风
  magic: {
    id: 'magic',
    name: 'emojiStyle.magic.name',
    description: 'emojiStyle.magic.description',
    preview: '✨',
    tools: {
      web_search: {
        running: '✨ {name} 正在施展魔法',
        done: '✨ {name} 魔法生效了',
        failed: '✨ {name} 魔法失效了',
      },
      web_fetch: {
        running: '✨ {name} 正在念咒语',
        done: '✨ {name} 召唤出了内容',
        failed: '✨ {name} 咒语念错了',
      },
      file_search: {
        running: '✨ {name} 正在使用探测魔法',
        done: '✨ {name} 探测到了目标',
        failed: '✨ {name} 探测失败',
      },
      code_interpreter: {
        running: '✨ {name} 正在炼制魔法阵',
        done: '✨ {name} 炼制成功',
        failed: '✨ {name} 炼制失败了',
      },
    },
  },

  // 蝴蝶结系 - 甜美蝴蝶结风
  ribbon: {
    id: 'ribbon',
    name: 'emojiStyle.ribbon.name',
    description: 'emojiStyle.ribbon.description',
    preview: '🎀',
    tools: {
      web_search: {
        running: '🎀 {name} 正在精心包装礼物',
        done: '🎀 {name} 带着礼物回来了',
        failed: '🎀 {name} 包装失败了',
      },
      web_fetch: {
        running: '🎀 {name} 正在系蝴蝶结',
        done: '🎀 {name} 系好了蝴蝶结',
        failed: '🎀 {name} 蝴蝶结散了',
      },
      file_search: {
        running: '🎀 {name} 正在礼盒堆里寻找',
        done: '🎀 {name} 找到了想要的礼盒',
        failed: '🎀 {name} 礼盒都空空的',
      },
      code_interpreter: {
        running: '🎀 {name} 正在编织丝带',
        done: '🎀 {name} 编织出了漂亮的图案',
        failed: '🎀 {name} 丝带缠在一起了',
      },
    },
  },

  // 星空系 - 浪漫星空风
  starry: {
    id: 'starry',
    name: 'emojiStyle.starry.name',
    description: 'emojiStyle.starry.description',
    preview: '⭐',
    tools: {
      web_search: {
        running: '⭐ {name} 正在星海中遨游',
        done: '⭐ {name} 带着星光回来了',
        failed: '⭐ {name} 迷失在星海',
      },
      web_fetch: {
        running: '⭐ {name} 正在捕捉流星',
        done: '⭐ {name} 捕捉到了流星',
        failed: '⭐ {name} 流星溜走了',
      },
      file_search: {
        running: '⭐ {name} 正在星座间寻找',
        done: '⭐ {name} 找到了星座',
        failed: '⭐ {name} 没看到星星',
      },
      code_interpreter: {
        running: '⭐ {name} 正在连接星图',
        done: '⭐ {name} 星图连接完成',
        failed: '⭐ {name} 星图断开了',
      },
    },
  },
};

export const EMOJI_STYLE_IDS = Object.keys(EMOJI_STYLE_PRESETS);

export function getEmojiStylePreset(styleId: string): EmojiStylePreset {
  return EMOJI_STYLE_PRESETS[styleId] ?? EMOJI_STYLE_PRESETS.default;
}

export function getDefaultEmojiStyle(): EmojiStylePreset {
  return EMOJI_STYLE_PRESETS.default;
}

export function getSavedEmojiStyle(): string {
  try {
    return typeof window !== 'undefined'
      ? (localStorage.getItem('hana-emoji-style') || 'default')
      : 'default';
  } catch {
    return 'default';
  }
}

export function saveEmojiStyle(styleId: string): boolean {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hana-emoji-style', styleId);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
