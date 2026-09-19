export type WritingTemplateId = 'article' | 'decision'

export const isWritingTemplate = (template: string): template is WritingTemplateId =>
  template === 'article' || template === 'decision'

/** 可携带的普通 Markdown 骨架。不写品牌署名，也不生成第二套字段。 */
export const renderWritingTemplate = (
  template: WritingTemplateId,
  variables: Record<string, string>,
): string => {
  if (template === 'article') {
    return `# ${variables.title}

## 这篇要解决什么

读者读完后应该能独立完成的一件事。

## 前提

- 已有的环境、版本或背景知识

## 步骤

### 1. 第一步

说明为什么这样做。下面的示例可以整段复制。

\`\`\`text
在这里放可复制的命令或代码
\`\`\`

## 常见问题

- 现象：
- 原因：
- 处理：

## 参考

- [来源标题](https://example.com)
`
  }

  return `# ${variables.title}

- 日期：${variables.date}
- 状态：草案

## 问题

需要决定的一件事，以及继续不决定的代价。

## 资料来源

- [来源标题](相对路径或公开链接)

## 可选方案

### 方案 A

优点与代价。

### 方案 B

优点与代价。

## 结论

现在选择哪一个，以及为什么。

## 交付检查

- [ ] 没参加讨论的人也能看懂结论
- [ ] 来源链接仍然可以打开
- [ ] 没有改写原始资料
`
}
