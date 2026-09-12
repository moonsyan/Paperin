export interface DemoNote {
  id: string
  title: string
  folder: string
  markdown: string
  favorite: boolean
  related: string[]
  edited?: boolean
}

export type Collection = 'all' | 'recent' | 'favorites'
export type Panel = 'outline' | 'links' | 'ai'
export type Overlay = 'search' | 'settings' | 'more' | null

// 合成样本只用于交互评估，不映射磁盘文件、正式会话或生产编辑器状态。
export const sampleNotes: DemoNote[] = [
  {
    id: 'thinking', title: '让笔记成为下一次思考的起点', folder: '随笔', favorite: true,
    related: ['cards', 'walk'],
    markdown: '# 让笔记成为下一次思考的起点\n\n记录不是思考的终点。那些留下来的文字，应该在下一次需要时，重新回到我们手边。\n\n## 从收集，到理解\n\n以前，我习惯把喜欢的文章保存下来。文件夹越来越满，却很少再次打开。后来发现，真正有用的往往不是原文，而是读完之后，用自己的话写下的几句话。\n\n> 不必记住所有事情，给重要的想法留一个可以回来的地方。\n\n## 给想法一个连接\n\n一条笔记不需要独自完整。当它与读过的书、正在做的项目、生活里的一个问题联系起来，知识才开始变成自己的。\n\n今天重新读了卡片笔记法，想到一个小练习：每次记完一条笔记，问自己，它还能用在哪里？\n\n## 留下一个小小的下一步\n\n- 用自己的话，重述一个值得留下的观点\n- 找到一篇旧笔记，补上新的理解\n- 把两条相关的想法，写进正在进行的项目\n\n不追求一次整理完。只让今天的思考，比昨天多一个可以继续的地方。',
  },
  {
    id: 'reading', title: '九月阅读计划', folder: '项目', favorite: false, related: ['cards'],
    markdown: '# 九月阅读计划\n\n这个月，少读一点，多理解一点。\n\n## 正在阅读\n\n《如何阅读一本书》：阅读之后，试着把一个观点用到手边的工作中。\n\n## 本周的小计划\n\n- 读完第二章，写一页自己的理解\n- 把卡片笔记法应用到读书摘录\n- 周末整理一篇可以分享的短文\n\n## 可以交付的成果\n\n一篇读书笔记，一份可复用的阅读提问清单。资料、任务和成果，都留在这个项目里。',
  },
  {
    id: 'cards', title: '卡片笔记法：用自己的话重述', folder: '阅读', favorite: true, related: ['thinking', 'reading'],
    markdown: '# 卡片笔记法：用自己的话重述\n\n整理阅读笔记时，先试着离开原文。\n\n## 一个观点，一张笔记\n\n摘录能保留原话，重述才能检验理解。一张笔记只表达一个清楚的观点，并保留出处。\n\n## 连接已有的想法\n\n这与「让笔记成为下一次思考的起点」相互补充。链接不是为了让图谱更好看，而是为了在写作时找回可用的材料。',
  },
  {
    id: 'walk', title: '散步时想到的事', folder: '随笔', favorite: false, related: ['thinking'],
    markdown: '# 散步时想到的事\n\n傍晚绕着街区走了一圈，没有听播客。\n\n## 给注意力一点空间\n\n一些没有想清楚的问题，往往在离开屏幕后慢慢有了答案。下一次卡住时，可以先出门走走。\n\n## 想留下的句子\n\n留白也是思考的一部分。',
  },
  {
    id: 'home', title: '个人主页改版', folder: '项目', favorite: false, related: ['thinking'],
    markdown: '# 个人主页改版\n\n把个人介绍、写过的文章和正在做的事，放在一个清楚的地方。\n\n## 项目目标\n\n访客能很快知道我在关注什么，并找到一篇值得读的文章。\n\n## 待办事项\n\n- 整理已有文章\n- 确认首页内容顺序\n- 检查小屏阅读体验\n\n## 参考资料\n\n从现有随笔中选择三篇，先整理文字，再考虑展示方式。',
  },
]

export function findNotes(notes: DemoNote[], query: string): DemoNote[] {
  const value = query.trim().toLocaleLowerCase()
  return notes.filter(note => `${note.title}\n${note.folder}\n${note.markdown}`.toLocaleLowerCase().includes(value))
}

export function headings(markdown: string): string[] {
  return markdown.split('\n').filter(line => line.startsWith('## ')).map(line => line.slice(3))
}
