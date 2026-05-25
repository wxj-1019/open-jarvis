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
      browser: {
        running: '🖥️ {name} 正在操作浏览器',
        done: '🖥️ {name} 浏览器操作完成',
        failed: '🖥️ {name} 浏览器操作失败',
      },
      computer_use: {
        running: '🖱️ {name} 正在使用电脑',
        done: '🖱️ {name} 电脑操作完成',
        failed: '🖱️ {name} 电脑操作失败',
      },
      bash: {
        running: '⚙️ {name} 正在执行命令',
        done: '⚙️ {name} 命令执行完成',
        failed: '⚙️ {name} 命令执行出错',
      },
      write: {
        running: '✏️ {name} 正在写入文件',
        done: '✏️ {name} 文件写入完成',
        failed: '✏️ {name} 文件写入失败',
      },
      edit: {
        running: '📝 {name} 正在编辑文件',
        done: '📝 {name} 文件编辑完成',
        failed: '📝 {name} 文件编辑失败',
      },
      wait: {
        running: '⏳ {name} 正在等待',
        done: '⏳ {name} 等待结束',
        failed: '⏳ {name} 等待超时',
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
      browser: {
        running: '🌸 {name} 正在赏花',
        done: '🌸 {name} 赏完花回来了',
        failed: '🌸 {name} 花都谢了',
      },
      computer_use: {
        running: '🌸 {name} 正在打理花园',
        done: '🌸 {name} 花园打理好了',
        failed: '🌸 {name} 花园乱糟糟的',
      },
      bash: {
        running: '🌸 {name} 正在浇灌花田',
        done: '🌸 {name} 浇灌完成了',
        failed: '🌸 {name} 水壶空了',
      },
      write: {
        running: '🌸 {name} 正在绘制花卷',
        done: '🌸 {name} 花卷绘制好了',
        failed: '🌸 {name} 画纸皱了',
      },
      edit: {
        running: '🌸 {name} 正在修剪花枝',
        done: '🌸 {name} 修剪完成了',
        failed: '🌸 {name} 剪错了地方',
      },
      wait: {
        running: '🌸 {name} 正在等待花开',
        done: '🌸 {name} 花开了',
        failed: '🌸 {name} 花期过了',
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
      browser: {
        running: '🐾 {name} 正在探索新领地',
        done: '🐾 {name} 巡视完了',
        failed: '🐾 {name} 迷路了',
      },
      computer_use: {
        running: '🐾 {name} 正在扒拉键盘',
        done: '🐾 {name} 操作完了',
        failed: '🐾 {name} 把东西弄乱了',
      },
      bash: {
        running: '🐾 {name} 正在刨土',
        done: '🐾 {name} 刨完了',
        failed: '🐾 {name} 什么都没刨到',
      },
      write: {
        running: '🐾 {name} 正在藏骨头',
        done: '🐾 {name} 藏好了',
        failed: '🐾 {name} 被别的狗发现了',
      },
      edit: {
        running: '🐾 {name} 正在整理窝窝',
        done: '🐾 {name} 整理完了',
        failed: '🐾 {name} 越弄越乱',
      },
      wait: {
        running: '🐾 {name} 正在等主人',
        done: '🐾 {name} 等到了',
        failed: '🐾 {name} 等睡着了',
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
      browser: {
        running: '✨ {name} 正在打开魔法书',
        done: '✨ {name} 魔法书合上了',
        failed: '✨ {name} 魔法书打不开',
      },
      computer_use: {
        running: '✨ {name} 正在操控魔法棒',
        done: '✨ {name} 魔法棒操作完成',
        failed: '✨ {name} 魔法棒断了',
      },
      bash: {
        running: '✨ {name} 正在释放魔力',
        done: '✨ {name} 魔力释放完毕',
        failed: '✨ {name} 魔力不足',
      },
      write: {
        running: '✨ {name} 正在书写魔法符文',
        done: '✨ {name} 符文书写完成',
        failed: '✨ {name} 符文画错了',
      },
      edit: {
        running: '✨ {name} 正在调配魔法药',
        done: '✨ {name} 魔法药调配好了',
        failed: '✨ {name} 药水爆炸了',
      },
      wait: {
        running: '✨ {name} 正在等待魔法冷却',
        done: '✨ {name} 冷却好了',
        failed: '✨ {name} 魔力耗尽了',
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
      browser: {
        running: '🎀 {name} 正在翻阅礼品册',
        done: '🎀 {name} 翻阅完了',
        failed: '🎀 {name} 册子撕坏了',
      },
      computer_use: {
        running: '🎀 {name} 正在装饰礼品盒',
        done: '🎀 {name} 装饰好了',
        failed: '🎀 {name} 盒子弄坏了',
      },
      bash: {
        running: '🎀 {name} 正在裁剪彩带',
        done: '🎀 {name} 裁剪完了',
        failed: '🎀 {name} 剪刀钝了',
      },
      write: {
        running: '🎀 {name} 正在写祝福卡片',
        done: '🎀 {name} 卡片写好了',
        failed: '🎀 {name} 卡片写坏了',
      },
      edit: {
        running: '🎀 {name} 正在整理礼品单',
        done: '🎀 {name} 整理好了',
        failed: '🎀 {name} 清单乱了',
      },
      wait: {
        running: '🎀 {name} 正在等待派对开始',
        done: '🎀 {name} 派对开始了',
        failed: '🎀 {name} 派对取消了',
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
      browser: {
        running: '⭐ {name} 正在观测星空',
        done: '⭐ {name} 观测完了',
        failed: '⭐ {name} 望远镜坏了',
      },
      computer_use: {
        running: '⭐ {name} 正在调整望远镜',
        done: '⭐ {name} 调整好了',
        failed: '⭐ {name} 镜头模糊了',
      },
      bash: {
        running: '⭐ {name} 正在记录星轨',
        done: '⭐ {name} 记录完了',
        failed: '⭐ {name} 笔记丢了',
      },
      write: {
        running: '⭐ {name} 正在绘制星图',
        done: '⭐ {name} 星图画好了',
        failed: '⭐ {name} 图纸皱了',
      },
      edit: {
        running: '⭐ {name} 正在整理星座表',
        done: '⭐ {name} 整理好了',
        failed: '⭐ {name} 数据乱了',
      },
      wait: {
        running: '⭐ {name} 正在等待流星雨',
        done: '⭐ {name} 流星雨来了',
        failed: '⭐ {name} 云层遮住了',
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
