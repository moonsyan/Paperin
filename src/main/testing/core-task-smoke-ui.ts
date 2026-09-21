/** 更多菜单路径点击：必须在同一次 executeJavaScript 里走完，避免面板失焦关闭。 */
export const buildCompactMenuPathScript = (
  labels: readonly string[],
  successExpression: string,
  timeoutMs = 8000,
): string => `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const listedLabels = () => [...document.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label'))
  const clickByLabel = (label) => {
    const button = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label') === label)
    if (!(button instanceof HTMLButtonElement)) return { ok: false, reason: 'missing', label }
    if (button.disabled) return { ok: false, reason: 'disabled', label }
    button.click()
    return { ok: true }
  }
  for (const label of ${JSON.stringify(labels)}) {
    const clicked = clickByLabel(label)
    if (!clicked.ok) return { ...clicked, labels: listedLabels() }
    await sleep(120)
  }
  const deadline = Date.now() + ${JSON.stringify(timeoutMs)}
  while (Date.now() < deadline) {
    if (${successExpression}) return { ok: true }
    await sleep(50)
  }
  return {
    ok: false,
    reason: 'success-timeout',
    labels: listedLabels(),
    workspaceState: document.querySelector('[role="region"][aria-label="工作区"]')?.getAttribute('data-workspace-state') ?? null,
    toast: document.querySelector('.toast')?.textContent ?? null,
  }
})()
`
