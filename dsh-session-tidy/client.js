/**
 * Browser half of the Session Title Tidy plugin.
 *
 * Owns the "任务名" page, the per-row "整理标题…" menu entry, and the rename
 * dialog. Titles are session state: renaming pins a session, so every surface
 * here previews the change before writing it and keeps an undo stack.
 */

// Assigned once the module loader materializes this bundle, before any slot
// component renders. Module-level component helpers read them through closure.
let React
let h

const NS = 'session-tidy-v2'
const PANEL_ID = 'session-tidy'
const API = '/plugin/session-tidy/v2'
const MAX_CHARS = 12
const DAY = 86_400_000
const STALE_DAYS = 30
const AUTO_KEY = 'dsh.session-tidy.autoName'
const TITLE_PATTERN = /^\d{4}｜(功能|设计|修复|优化|发布|探索|文档|研究)｜/u

const zh = {
  panel: '任务批量命名助手',
  title: '任务批量命名助手',
  subtitle: '统一成 MMDD｜类型｜主题。规范名自动跳过；改动前先预览，整理即定稿。',
  'filter.all': '全部',
  'filter.tidy': '待整理',
  'filter.dup': '重名',
  'filter.generic': '太泛',
  'filter.stale': '30 天未动',
  'filter.archived': '已归档',
  'toggle.archived': '显示已归档',
  'action.selectAll': '选中本页',
  'action.clear': '清除选择',
  'action.apply': '应用 {n} 项',
  'action.ai': 'AI 重命名 {n} 项',
  'action.undo': '撤销上次整理',
  'action.archive': '归档所选',
  'action.pin': '置顶所选',
  'action.unarchive': '取消归档',
  'action.unpin': '取消置顶',
  'status.applied': '已更新 {n} 个标题',
  'status.failed': '{n} 个标题更新失败',
  'status.undone': '已撤销 {n} 个标题',
  'status.ai': 'AI 给出 {n} 个建议，确认后再应用',
  'status.aiFailed': 'AI 建议失败：{msg}',
  'status.archived': '已归档 {n} 个会话',
  'status.pinned': '已置顶 {n} 个会话',
  'status.unarchived': '已取消归档 {n} 个会话',
  'status.unpinned': '已取消置顶 {n} 个会话',
  'status.empty': '没有可执行的修改',
  empty: '这个工作区还没有会话。',
  emptyFilter: '当前筛选下没有会话。',
  'reason.untitled': '无标题',
  'reason.convention': '未规范',
  'reason.long': '过长',
  'reason.generic': '太泛',
  'reason.dup': '重名',
  'reason.filler': '口语前缀',
  'badge.pinned': '已置顶',
  'badge.archived': '已归档',
  'badge.stale': '{n} 天未动',
  'badge.ai': 'AI',
  'badge.formatted': '规范',
  'toggle.auto': '自动命名新任务',
  'auto.hint': '首次加载和每次新建任务后，按规范自动命名当前会话一次，每个任务只做一次；关掉后仅手动整理。',
  'action.edit': '改名',
  'menu.tidy': '整理标题…',
  'dialog.title': '整理标题',
  'dialog.current': '当前标题',
  'dialog.new': '新标题',
  'dialog.hint': '确认后这个标题会被钉住，之后对话中的自动标题不再覆盖它。',
  'dialog.apply': '应用',
  'dialog.cancel': '取消',
  'dialog.ai': 'AI 建议',
  'dialog.aiFailed': 'AI 建议失败：{msg}',
  'dialog.untitled': '（无标题）',
  'dialog.limit': '标题上限 80 字节',
  'ai.unavailable': 'Host 未加载或没有默认模型，AI 重命名不可用',
  'group.ungrouped': '未分组',
  'hint': '分组、排序与归档筛选也可以在侧栏「视图选项」里调整；这里负责批量改名、归档与置顶。',
  'count.total': '{n} 个会话',
  'count.tidy': '{n} 个待整理',
  'count.selected': '已选 {n} 项',
  justNow: '刚刚',
  'minutesAgo': '{n} 分钟前',
  'hoursAgo': '{n} 小时前',
  'daysAgo': '{n} 天前',
}

const en = {
  panel: 'Batch Naming',
  title: 'Task naming assistant',
  subtitle: 'Enforce MMDD｜type｜topic. Conforming titles are skipped; preview before writing, and tidying pins the title.',
  'filter.all': 'All',
  'filter.tidy': 'Needs tidy',
  'filter.dup': 'Duplicates',
  'filter.generic': 'Vague',
  'filter.stale': 'Idle 30d',
  'filter.archived': 'Archived',
  'toggle.archived': 'Show archived',
  'action.selectAll': 'Select shown',
  'action.clear': 'Clear',
  'action.apply': 'Apply {n}',
  'action.ai': 'AI rename {n}',
  'action.undo': 'Undo last tidy',
  'action.archive': 'Archive selected',
  'action.pin': 'Pin selected',
  'action.unarchive': 'Unarchive',
  'action.unpin': 'Unpin',
  'status.applied': 'Updated {n} titles',
  'status.failed': '{n} titles failed',
  'status.undone': 'Reverted {n} titles',
  'status.ai': 'AI suggested {n} titles; review before applying',
  'status.aiFailed': 'AI failed: {msg}',
  'status.archived': 'Archived {n} sessions',
  'status.pinned': 'Pinned {n} sessions',
  'status.unarchived': 'Unarchived {n} sessions',
  'status.unpinned': 'Unpinned {n} sessions',
  'status.empty': 'Nothing to change',
  empty: 'No sessions in this workspace yet.',
  emptyFilter: 'No sessions match this filter.',
  'reason.untitled': 'Untitled',
  'reason.convention': 'Not conventional',
  'reason.long': 'Too long',
  'reason.generic': 'Vague',
  'reason.dup': 'Duplicate',
  'reason.filler': 'Filler prefix',
  'badge.pinned': 'Pinned',
  'badge.archived': 'Archived',
  'badge.stale': 'Idle {n}d',
  'badge.ai': 'AI',
  'badge.formatted': 'Conforms',
  'toggle.auto': 'Auto-name new tasks',
  'auto.hint': 'After load and after each new task, names the current session once; turn off for manual tidying only.',
  'action.edit': 'Rename',
  'menu.tidy': 'Tidy title…',
  'dialog.title': 'Tidy title',
  'dialog.current': 'Current title',
  'dialog.new': 'New title',
  'dialog.hint': 'Confirming pins this title; automatic titles stop overwriting it.',
  'dialog.apply': 'Apply',
  'dialog.cancel': 'Cancel',
  'dialog.ai': 'AI suggestion',
  'dialog.aiFailed': 'AI failed: {msg}',
  'dialog.untitled': '(untitled)',
  'dialog.limit': 'Titles are capped at 80 bytes',
  'ai.unavailable': 'Host or default model unavailable; AI rename is disabled',
  'group.ungrouped': 'Ungrouped',
  'hint': 'Grouping, sorting and archive filters also live under View options in the sidebar; this page does batch rename, archive and pin.',
  'count.total': '{n} sessions',
  'count.tidy': '{n} need tidy',
  'count.selected': '{n} selected',
  justNow: 'just now',
  'minutesAgo': '{n} min ago',
  'hoursAgo': '{n} h ago',
  'daysAgo': '{n} d ago',
}

const FILLER_PREFIXES = [
  '麻烦你帮我',
  '麻烦帮我',
  '请帮我',
  '帮我看看',
  '帮我看看这个',
  '帮我',
  '请帮忙',
  '我想',
  '我要',
  '能不能',
  '可以帮我',
  '你好',
  '您好',
  '嗯',
  '那个',
  '就是',
]

const GENERIC = new Set([
  '你好',
  '您好',
  '在吗',
  '继续',
  '测试',
  'test',
  'hi',
  'hello',
  '新会话',
  '未命名',
  '看看',
  '整理',
  '问题',
  '求助',
  '请问',
  '帮我',
  '开始',
  '你好呀',
  '早上好',
  '看一下',
])

const GENERIC_PATTERN = /^(帮我)?(看看|看一下|处理一下|搞一下|弄一下|整理一下)(这个|下)?$/

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function cx(...values) {
  return values.filter(Boolean).join(' ')
}

function useStore(store) {
  const subscribe = React.useCallback((listener) => store.subscribe(listener), [store])
  const read = React.useCallback(() => store.getSnapshot(), [store])
  return React.useSyncExternalStore(subscribe, read, read)
}

function createDialogStore() {
  let value = null
  const listeners = new Set()
  const read = () => value
  return {
    getSnapshot: read,
    set: (next) => {
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function normalizeKey(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

function charLength(text) {
  return Array.from(String(text ?? '')).length
}

function stripFiller(raw) {
  let out = String(raw ?? '').trim()
  let changed = true
  while (changed) {
    changed = false
    for (const prefix of FILLER_PREFIXES) {
      if (!out.startsWith(prefix)) continue
      if (out.length <= prefix.length + 1) continue
      out = out.slice(prefix.length).replace(/^[，,、:：\s]+/, '')
      changed = true
      break
    }
  }
  return out
}

function cleanTitle(raw, maxChars = MAX_CHARS) {
  let out = String(raw ?? '').trim()
  if (out === '') return ''
  out = stripFiller(out)
  out = out
    .replace(/^["'“”‘’「」『』《》(\[（]+/, '')
    .replace(/["'“”‘’「」『』《》)\]）]+$/, '')
    .replace(/(谢谢|多谢|感谢)(你|您|啦|了)?$/u, '')
    .replace(/[。！？!?；;，,、\s]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (out === '') return ''
  return clampTitle(out, maxChars)
}

function clampTitle(text, maxChars) {
  const chars = Array.from(text)
  if (chars.length <= maxChars) return text
  let cut = chars.slice(0, maxChars).join('')
  const boundary = Math.max(
    cut.lastIndexOf('，'),
    cut.lastIndexOf('。'),
    cut.lastIndexOf('、'),
    cut.lastIndexOf('：'),
    cut.lastIndexOf(' '),
  )
  if (boundary >= Math.max(2, Math.floor(maxChars / 2))) cut = cut.slice(0, boundary)
  return cut.replace(/[，。、：\s]+$/u, '').trim()
}

function isGeneric(raw) {
  const key = String(raw ?? '').trim().toLowerCase()
  if (key === '') return false
  return GENERIC.has(key) || GENERIC_PATTERN.test(key)
}

function formatWhen(timestamp, t) {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  if (diff < 60_000) return t('justNow')
  if (diff < 3_600_000) return t('minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < DAY) return t('hoursAgo', { n: Math.floor(diff / 3_600_000) })
  return t('daysAgo', { n: Math.floor(diff / DAY) })
}

function buildRows(workspacesSnapshot, sessionsSnapshot) {
  const byId = sessionsSnapshot?.byId ?? {}
  const archived = new Set(workspacesSnapshot?.archivedSessionIds ?? [])
  const pinned = new Set(workspacesSnapshot?.pinnedSessionIds ?? [])
  const rows = []
  const seen = new Set()

  const push = (session, workspaceId, workspaceTitle) => {
    if (!session) return
    if (session.parentId !== undefined || session.origin === 'subagent') return
    if (session.blank) return
    rows.push({
      id: session.id,
      title: typeof session.title === 'string' ? session.title : '',
      displayTitle: session.displayTitle ?? session.title ?? '',
      updatedAt: session.updatedAt ?? 0,
      running: session.running === true,
      workspaceId,
      workspaceTitle,
      archived: archived.has(session.id),
      pinned: pinned.has(session.id),
    })
  }

  for (const workspace of workspacesSnapshot?.items ?? []) {
    for (const id of workspace.sessionIds ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      push(byId[id], workspace.workspaceId, workspace.title || workspace.path || '')
    }
  }
  for (const id of sessionsSnapshot?.ids ?? []) {
    if (seen.has(id)) continue
    seen.add(id)
    push(byId[id], undefined, '')
  }
  return rows
}

function isFormatted(title) {
  return TITLE_PATTERN.test(String(title ?? ''))
}

function analyzeRows(rows, maxChars = MAX_CHARS) {
  const counts = new Map()
  for (const row of rows) {
    const key = normalizeKey(row.title || row.displayTitle)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const seen = new Map()
  const result = new Map()
  for (const row of rows) {
    const raw = row.title
    // A title that already follows MMDD｜类型｜主题 is final: no rule may trim
    // it, number it, or call it long. Only an explicit AI request may rewrite it.
    if (isFormatted(raw)) {
      result.set(row.id, { suggestion: raw, reasons: [], changed: false })
      continue
    }
    const key = normalizeKey(raw || row.displayTitle)
    const reasons = ['convention']
    if (raw.trim() === '') reasons.push('untitled')
    if (charLength(raw) > 16) reasons.push('long')
    if (isGeneric(raw)) reasons.push('generic')
    if ((counts.get(key) ?? 0) > 1) {
      reasons.push('dup')
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    if (raw.trim() !== '' && cleanTitle(raw, maxChars) !== raw.trim()) reasons.push('filler')
    // Under the naming convention no local rule may invent a title: the date
    // and type need the session header and the model, so the suggestion stays
    // empty until an explicit AI request fills it.
    result.set(row.id, { suggestion: '', reasons, changed: true })
  }
  return result
}

function matchesFilter(row, analysis, filter, showArchived) {
  if (filter === 'archived') return row.archived
  if (row.archived && !showArchived) return false
  const info = analysis.get(row.id)
  const changed = info?.changed === true
  const reasons = info?.reasons ?? []
  switch (filter) {
    case 'tidy':
      return !row.archived && (changed || reasons.length > 0)
    case 'dup':
      return !row.archived && reasons.includes('dup')
    case 'generic':
      return !row.archived && (reasons.includes('generic') || reasons.includes('untitled'))
    case 'stale':
      return !row.archived && row.updatedAt > 0 && Date.now() - row.updatedAt > STALE_DAYS * DAY
    default:
      return true
  }
}

function groupRows(rows, ungroupedLabel) {
  const groups = []
  const index = new Map()
  for (const row of rows) {
    const key = row.workspaceId ?? '__ungrouped__'
    let group = index.get(key)
    if (group === undefined) {
      group = { key, title: row.workspaceId === undefined ? ungroupedLabel : row.workspaceTitle || ungroupedLabel, rows: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

function autoNamingEnabled() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Name each new current task exactly once, after its first prompt lands.
 *
 * Only the session selected in the main view is considered: the rule is
 * "rename the current task", not "scan the list". A per-browser ledger records
 * every session the plugin has auto-named, so the once-only rule survives
 * reloads even if the user later renames the session away from the convention.
 */
const NAMED_KEY = 'dsh.session-tidy.named.v2'

function readNamedLedger() {
  try {
    const raw = localStorage.getItem(NAMED_KEY)
    const parsed = raw === null ? [] : JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function rememberNamed(id) {
  try {
    const ledger = readNamedLedger()
    ledger.add(id)
    localStorage.setItem(NAMED_KEY, JSON.stringify([...ledger].slice(-500)))
  } catch {
    // A blocked storage only weakens the ledger; the title pattern still guards.
  }
}

function installAutoNamer({ sessions, uiWorkspace }) {
  const blankSeen = new Map()
  const attempted = readNamedLedger()
  const timers = new Map()
  let disposed = false

  const currentId = () => {
    const saved = uiWorkspace?.selection?.getSnapshot?.()
    return typeof saved?.sessionId === 'string' ? saved.sessionId : undefined
  }

  const schedule = (id, delay) => {
    if (timers.has(id)) return
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        void nameOnce(id)
      }, delay),
    )
  }

  const nameOnce = async (id) => {
    if (disposed || attempted.has(id) || !autoNamingEnabled()) return
    // The rule names the current task only: a session that stopped being the
    // main view before the timer fired is left untouched.
    if (currentId() !== id) return
    const summary = sessions.list.getSnapshot()?.byId?.[id]
    if (!summary || summary.blank !== false) return
    if (summary.parentId !== undefined || summary.origin === 'subagent') return
    const raw = typeof summary.title === 'string' ? summary.title : ''
    if (isFormatted(raw)) {
      attempted.add(id)
      rememberNamed(id)
      return
    }
    attempted.add(id)
    try {
      const response = await fetch(`${API}/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ id, title: raw }] }),
      })
      const payload = await response.json()
      if (!response.ok || payload?.ok !== true) return
      // The model made a decision (a title or an explicit "keep"); record it so
      // a later reload does not ask again. Transport failures are not recorded.
      rememberNamed(id)
      const suggested = payload.suggestions?.[0]?.title
      if (typeof suggested !== 'string' || !isFormatted(suggested)) return
      if (suggested === raw) return
      await sessions.manager.rename(id, suggested)
    } catch {
      // The rule says to keep the original title when naming is unavailable.
    }
  }

  // Session restore and the plugin's own activation race each other: the
  // selection may be empty when apply runs and arrive a moment later. This
  // window lets the restored current session be named once, without turning
  // every later task switch into an automatic rename.
  const startupUntil = Date.now() + 60_000
  let startupConsumed = false

  const check = () => {
    const id = currentId()
    if (id === undefined) return
    const summary = sessions.list.getSnapshot()?.byId?.[id]
    if (!summary) return
    const wasBlank = blankSeen.get(id)
    blankSeen.set(id, summary.blank === true)
    if (summary.blank !== false || attempted.has(id)) return
    const raw = typeof summary.title === 'string' ? summary.title : ''
    if (isFormatted(raw)) {
      attempted.add(id)
      rememberNamed(id)
      return
    }
    const restorable = !startupConsumed && Date.now() < startupUntil
    if (wasBlank !== true && !restorable) return
    if (restorable) startupConsumed = true
    schedule(id, wasBlank === true ? 2000 : 1200)
  }

  const offList = sessions.list.subscribe(check)
  const offSelection = uiWorkspace?.selection?.subscribe?.(check) ?? (() => {})
  check()

  return () => {
    disposed = true
    offList()
    offSelection()
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }
}

// ---------------------------------------------------------------------------
// Styles: host tokens only, everything else local to this plugin.
// ---------------------------------------------------------------------------

const CSS = `
.dsh-tidy-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.45;
}
.dsh-tidy-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh-tidy-heading { min-width: 0; }
.dsh-tidy-title { margin: 0; font-size: 16px; font-weight: 600; }
.dsh-tidy-subtitle { margin: 6px 0 0; max-width: 680px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.dsh-tidy-counts { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-tidy-count-warn { color: var(--dsw-alias-state-business-primary); }
.dsh-tidy-filters { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 24px 0; }
.dsh-tidy-filter {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  padding: 3px 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-tidy-filter:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tidy-filter.is-active { background: var(--dsw-alias-button-ghost-active-fill); border-color: var(--dsw-alias-button-ghost-active-border); color: var(--dsw-alias-label-primary); }
.dsh-tidy-toggle { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 12px; cursor: pointer; }
.dsh-tidy-auto { display: flex; align-items: center; gap: 10px; padding: 8px 24px 0; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsh-tidy-auto .dsh-tidy-toggle { margin-left: 0; font-size: 11px; }
.dsh-tidy-auto-hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tidy-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 24px; }
.dsh-tidy-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: var(--dsw-radius-md);
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-tidy-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tidy-btn:disabled { opacity: 0.45; cursor: default; }
.dsh-tidy-btn.is-primary { background: var(--dsw-alias-state-business-primary); border-color: transparent; color: var(--dsw-static-neutral-00, #fff); }
.dsh-tidy-btn.is-ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.dsh-tidy-btn.is-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-tidy-spacer { flex: 1; }
.dsh-tidy-list { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 24px; }
.dsh-tidy-group { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsh-tidy-group-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tidy-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid transparent; border-radius: var(--dsw-radius-md); }
.dsh-tidy-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tidy-row.is-selected { background: var(--dsw-alias-button-ghost-active-fill); border-color: var(--dsw-alias-button-ghost-active-border); }
.dsh-tidy-check { flex: none; width: 14px; height: 14px; accent-color: var(--dsw-alias-state-business-primary); cursor: pointer; }
.dsh-tidy-main { flex: 1 1 40%; min-width: 0; }
.dsh-tidy-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dsh-tidy-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text; }
.dsh-tidy-name-text:hover { text-decoration: underline; text-decoration-style: dotted; }
.dsh-tidy-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 3px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsh-tidy-arrow { flex: none; color: var(--dsw-alias-label-dimmed, var(--dsw-alias-label-tertiary)); }
.dsh-tidy-suggest { flex: 1 1 30%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-state-business-primary); }
.dsh-tidy-suggest.is-empty { color: var(--dsw-alias-label-dimmed, var(--dsw-alias-label-tertiary)); }
.dsh-tidy-actions { flex: none; display: flex; align-items: center; gap: 2px; opacity: 0; }
.dsh-tidy-row:hover .dsh-tidy-actions, .dsh-tidy-row:focus-within .dsh-tidy-actions { opacity: 1; }
.dsh-tidy-mini { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 11px; padding: 2px 6px; border-radius: var(--dsw-radius-sm); cursor: pointer; }
.dsh-tidy-mini:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-tidy-tag { display: inline-flex; align-items: center; gap: 3px; border-radius: var(--dsw-radius-sm); padding: 0 5px; font-size: 10px; line-height: 16px; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-tertiary); }
.dsh-tidy-tag.is-warn { border-color: var(--dsw-alias-state-warn-tertiary, var(--dsw-alias-border-l3)); color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-secondary)); }
.dsh-tidy-tag.is-ai { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); }
.dsh-tidy-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 56px 24px; color: var(--dsw-alias-label-tertiary); }
.dsh-tidy-empty-icon { font-size: 22px; }
.dsh-tidy-footer { flex: none; min-height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 24px; border-top: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsh-tidy-footer.is-error { color: var(--dsw-alias-state-error-primary); }
.dsh-tidy-overlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.32); }
.dsh-tidy-dialog { width: min(520px, calc(100vw - 48px)); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-lg); box-shadow: var(--dsw-elevation-prominent); padding: 18px 20px; }
.dsh-tidy-dialog-title { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
.dsh-tidy-field { margin-bottom: 12px; }
.dsh-tidy-label { display: block; margin-bottom: 4px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsh-tidy-static { padding: 6px 8px; border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-skeleton)); color: var(--dsw-alias-label-secondary); font-size: 12px; word-break: break-all; }
.dsh-tidy-input { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 7px 9px; font: inherit; font-size: 13px; }
.dsh-tidy-input:focus { outline: none; border-color: var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); }
.dsh-tidy-dialog-hint { margin: 0 0 12px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsh-tidy-dialog-error { margin: 0 0 12px; color: var(--dsw-alias-state-error-primary); font-size: 11px; }
.dsh-tidy-dialog-actions { display: flex; align-items: center; gap: 8px; }
.dsh-tidy-menu-item { display: flex; width: 100%; align-items: center; gap: 8px; border: 0; background: transparent; color: var(--dsw-alias-label-primary); padding: 6px 10px; border-radius: var(--dsw-radius-sm); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.dsh-tidy-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
`

function Styles() {
  return h('style', { key: 'dsh-tidy-styles' }, CSS)
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PanelIcon() {
  return h(
    'svg',
    {
      viewBox: '0 0 20 20',
      width: 18,
      height: 18,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    h('path', { d: 'M3.5 6h13M3.5 10h8M3.5 14h5' }),
    h('path', { d: 'M15.2 11.8l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z' }),
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

const FILTERS = ['tidy', 'all', 'dup', 'generic', 'stale', 'archived']

function Panel(props) {
  const { t, sessions, workspaces, uiWorkspace, dialog } = props
  const sessionsSnapshot = useStore(sessions.list)
  const workspacesSnapshot = useStore(workspaces.list)
  const [filter, setFilter] = React.useState('tidy')
  const [showArchived, setShowArchived] = React.useState(false)
  const [selected, setSelected] = React.useState(() => new Set())
  const [aiTitles, setAiTitles] = React.useState({})
  const [aiBusy, setAiBusy] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState(false)
  const [aiInfo, setAiInfo] = React.useState(null)
  const [autoName, setAutoName] = React.useState(autoNamingEnabled)
  const undoRef = React.useRef([])
  const [undoCount, setUndoCount] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    fetch(`${API}/info`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value) => {
        if (!cancelled && value) setAiInfo(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const rows = React.useMemo(
    () => buildRows(workspacesSnapshot, sessionsSnapshot),
    [workspacesSnapshot, sessionsSnapshot],
  )
  const analysis = React.useMemo(() => analyzeRows(rows, MAX_CHARS), [rows])
  const visible = React.useMemo(
    () => rows.filter((row) => matchesFilter(row, analysis, filter, showArchived)),
    [rows, analysis, filter, showArchived],
  )
  const groups = React.useMemo(() => groupRows(visible, t('group.ungrouped')), [visible, t])
  const tidyCount = React.useMemo(
    () => rows.filter((row) => !row.archived && (analysis.get(row.id)?.changed || (analysis.get(row.id)?.reasons.length ?? 0) > 0)).length,
    [rows, analysis],
  )

  const effectiveTitle = (row) => {
    const ai = aiTitles[row.id]
    if (typeof ai === 'string' && ai !== '') return ai
    return analysis.get(row.id)?.suggestion ?? ''
  }

  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const next = new Set()
    for (const row of visible) {
      if (!row.archived) next.add(row.id)
    }
    setSelected(next)
  }

  const applySelected = async () => {
    const changes = rows
      .filter((row) => selected.has(row.id) && !row.archived)
      .map((row) => ({ row, title: effectiveTitle(row) }))
      .filter((item) => item.title !== '' && item.title !== item.row.title)
    if (changes.length === 0) {
      setError(false)
      setStatus(t('status.empty'))
      return
    }
    setBusy(true)
    setError(false)
    const done = []
    let failed = 0
    for (const change of changes) {
      try {
        const result = await sessions.manager.rename(change.row.id, change.title)
        if (!result?.ok) throw new Error(result?.error?.message ?? 'rename failed')
        if (typeof change.row.title === 'string' && change.row.title !== '') {
          done.push({ id: change.row.id, title: change.row.title })
        }
      } catch {
        failed += 1
      }
    }
    undoRef.current = done
    setUndoCount(done.length)
    setSelected(new Set())
    setAiTitles({})
    setBusy(false)
    if (failed > 0) {
      setError(true)
      setStatus(`${t('status.applied', { n: done.length })} · ${t('status.failed', { n: failed })}`)
    } else {
      setStatus(t('status.applied', { n: done.length }))
    }
  }

  const undo = async () => {
    const changes = undoRef.current
    if (changes.length === 0) return
    setBusy(true)
    let done = 0
    for (const change of changes) {
      try {
        const result = await sessions.manager.rename(change.id, change.title)
        if (result?.ok) done += 1
      } catch {
        // Keep going: one failure should not block the rest of the undo.
      }
    }
    undoRef.current = []
    setUndoCount(0)
    setBusy(false)
    setStatus(t('status.undone', { n: done }))
  }

  const requestAi = async (ids) => {
    const items = rows
      .filter((row) => ids.includes(row.id))
      .map((row) => ({ id: row.id, title: row.title || row.displayTitle }))
    if (items.length === 0) return
    setAiBusy(true)
    setError(false)
    try {
      const response = await fetch(`${API}/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const payload = await response.json()
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      const next = { ...aiTitles }
      for (const suggestion of payload.suggestions ?? []) {
        if (typeof suggestion?.id === 'string' && typeof suggestion?.title === 'string') {
          next[suggestion.id] = suggestion.title
        }
      }
      setAiTitles(next)
      setStatus(t('status.ai', { n: (payload.suggestions ?? []).length }))
    } catch (cause) {
      setError(true)
      setStatus(t('status.aiFailed', { msg: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      setAiBusy(false)
    }
  }

  const aiTargetIds = () => {
    if (selected.size > 0) return [...selected].slice(0, 12)
    return visible.slice(0, 12).map((row) => row.id)
  }

  const archiveSelected = async () => {
    if (selected.size === 0) return
    setBusy(true)
    let done = 0
    for (const id of selected) {
      try {
        await uiWorkspace.archiveSession(id)
        done += 1
      } catch {
        // Running sessions refuse a plain archive; count the rest.
      }
    }
    setSelected(new Set())
    setBusy(false)
    setStatus(t('status.archived', { n: done }))
  }

  const pinSelected = async () => {
    if (selected.size === 0) return
    setBusy(true)
    let done = 0
    for (const id of selected) {
      try {
        await uiWorkspace.pinSession(id)
        done += 1
      } catch {
        // Ignore one refusal and keep the rest.
      }
    }
    setSelected(new Set())
    setBusy(false)
    setStatus(t('status.pinned', { n: done }))
  }

  const toggleRowFlag = async (row, action) => {
    try {
      if (action === 'archive') await uiWorkspace.archiveSession(row.id)
      else if (action === 'unarchive') await uiWorkspace.unarchiveSession(row.id)
      else if (action === 'pin') await uiWorkspace.pinSession(row.id)
      else if (action === 'unpin') await uiWorkspace.unpinSession(row.id)
    } catch (cause) {
      setError(true)
      setStatus(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const aiAvailable = aiInfo?.ok === true
  const aiCount = aiTargetIds().length

  return h(
    'div',
    { className: 'dsh-tidy-root' },
    h(Styles),
    h(
      'header',
      { className: 'dsh-tidy-header' },
      h(
        'div',
        { className: 'dsh-tidy-heading' },
        h('h1', { className: 'dsh-tidy-title' }, t('title')),
        h('p', { className: 'dsh-tidy-subtitle' }, t('subtitle')),
      ),
      h(
        'div',
        { className: 'dsh-tidy-counts' },
        h('span', null, t('count.total', { n: rows.length })),
        h('span', { className: 'dsh-tidy-count-warn' }, t('count.tidy', { n: tidyCount })),
        selected.size > 0 ? h('span', null, t('count.selected', { n: selected.size })) : null,
      ),
    ),
    h(
      'div',
      { className: 'dsh-tidy-filters' },
      ...FILTERS.map((key) =>
        h(
          'button',
          {
            key,
            type: 'button',
            className: cx('dsh-tidy-filter', filter === key && 'is-active'),
            onClick: () => setFilter(key),
          },
          t(`filter.${key}`),
        ),
      ),
      h(
        'label',
        { className: 'dsh-tidy-toggle' },
        h('input', {
          type: 'checkbox',
          checked: showArchived,
          onChange: (event) => setShowArchived(event.currentTarget.checked),
        }),
        t('toggle.archived'),
      ),
    ),
    h(
      'div',
      { className: 'dsh-tidy-auto' },
      h(
        'label',
        { className: 'dsh-tidy-toggle' },
        h('input', {
          type: 'checkbox',
          checked: autoName,
          onChange: (event) => {
            const next = event.currentTarget.checked
            setAutoName(next)
            try {
              localStorage.setItem(AUTO_KEY, next ? '1' : '0')
            } catch {
              // A blocked storage still keeps the in-memory toggle.
            }
          },
        }),
        t('toggle.auto'),
      ),
      h('span', { className: 'dsh-tidy-auto-hint' }, t('auto.hint')),
    ),
    h(
      'div',
      { className: 'dsh-tidy-toolbar' },
      h(
        'button',
        { type: 'button', className: 'dsh-tidy-btn', onClick: selectAll, disabled: busy },
        t('action.selectAll'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-tidy-btn',
          onClick: () => setSelected(new Set()),
          disabled: busy || selected.size === 0,
        },
        t('action.clear'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-tidy-btn is-primary',
          onClick: applySelected,
          disabled: busy || selected.size === 0,
        },
        t('action.apply', { n: selected.size }),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-tidy-btn',
          onClick: () => requestAi(aiTargetIds()),
          disabled: busy || aiBusy || !aiAvailable || aiCount === 0,
          title: aiAvailable ? undefined : t('ai.unavailable'),
        },
        t('action.ai', { n: aiCount }),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-tidy-btn',
          onClick: archiveSelected,
          disabled: busy || selected.size === 0,
        },
        t('action.archive'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-tidy-btn',
          onClick: pinSelected,
          disabled: busy || selected.size === 0,
        },
        t('action.pin'),
      ),
      h('span', { className: 'dsh-tidy-spacer' }),
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-tidy-btn is-ghost',
          onClick: undo,
          disabled: busy || undoCount === 0,
        },
        t('action.undo'),
      ),
    ),
    h(
      'div',
      { className: 'dsh-tidy-list' },
      groups.length === 0
        ? h(
            'div',
            { className: 'dsh-tidy-empty' },
            h('div', { className: 'dsh-tidy-empty-icon' }, '☰'),
            h('div', null, filter === 'all' ? t('empty') : t('emptyFilter')),
          )
        : groups.map((group) =>
            h(
              'section',
              { key: group.key },
              h(
                'div',
                { className: 'dsh-tidy-group' },
                h('span', { className: 'dsh-tidy-group-name' }, group.title),
                h('span', null, `${group.rows.length}`),
              ),
              group.rows.map((row) => {
                const info = analysis.get(row.id)
                const suggestion = effectiveTitle(row)
                const stale = row.updatedAt > 0 && Date.now() - row.updatedAt > STALE_DAYS * DAY
                return h(
                  'div',
                  { key: row.id, className: cx('dsh-tidy-row', selected.has(row.id) && 'is-selected') },
                  h('input', {
                    type: 'checkbox',
                    className: 'dsh-tidy-check',
                    checked: selected.has(row.id),
                    onChange: () => toggle(row.id),
                    'aria-label': row.displayTitle,
                  }),
                  h(
                    'div',
                    { className: 'dsh-tidy-main' },
                    h(
                      'div',
                      { className: 'dsh-tidy-name' },
                      h(
                        'span',
                        {
                          className: 'dsh-tidy-name-text',
                          title: t('action.edit'),
                          onClick: () =>
                            dialog.set({
                              id: row.id,
                              title: row.title,
                              suggestion: suggestion || row.title,
                            }),
                        },
                        row.title || row.displayTitle,
                      ),
                    ),
                    h(
                      'div',
                      { className: 'dsh-tidy-meta' },
                      isFormatted(row.title) ? h('span', { className: 'dsh-tidy-tag' }, t('badge.formatted')) : null,
                      row.pinned ? h('span', { className: 'dsh-tidy-tag' }, t('badge.pinned')) : null,
                      row.archived ? h('span', { className: 'dsh-tidy-tag' }, t('badge.archived')) : null,
                      stale ? h('span', { className: 'dsh-tidy-tag is-warn' }, t('badge.stale', { n: Math.floor((Date.now() - row.updatedAt) / DAY) })) : null,
                      ...(info?.reasons ?? []).map((reason) =>
                        h('span', { key: reason, className: 'dsh-tidy-tag is-warn' }, t(`reason.${reason}`)),
                      ),
                      h('span', null, formatWhen(row.updatedAt, t)),
                    ),
                  ),
                  h('div', { className: 'dsh-tidy-arrow' }, '→'),
                  h(
                    'div',
                    {
                      className: cx('dsh-tidy-suggest', suggestion === '' && 'is-empty'),
                      title: suggestion,
                    },
                    suggestion === '' ? '—' : suggestion,
                    aiTitles[row.id] ? h('span', { className: 'dsh-tidy-tag is-ai', style: { marginLeft: 6 } }, t('badge.ai')) : null,
                  ),
                  h(
                    'div',
                    { className: 'dsh-tidy-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-tidy-mini',
                        onClick: () => toggleRowFlag(row, row.pinned ? 'unpin' : 'pin'),
                      },
                      row.pinned ? t('action.unpin') : t('action.pin'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-tidy-mini',
                        onClick: () => toggleRowFlag(row, row.archived ? 'unarchive' : 'archive'),
                      },
                      row.archived ? t('action.unarchive') : t('action.archive'),
                    ),
                  ),
                )
              }),
            ),
          ),
    ),
    h(
      'div',
      { className: cx('dsh-tidy-footer', error && 'is-error') },
      status !== '' ? status : t('hint'),
    ),
  )
}

// ---------------------------------------------------------------------------
// Session row menu entry
// ---------------------------------------------------------------------------

function MenuRow(props) {
  const { t, openTidy, sessionId, displayTitle } = props
  const useMenuOpenState = props.useMenuOpenState
  const opener = typeof useMenuOpenState === 'function' ? useMenuOpenState : () => [null, () => {}]
  const [, setMenuOpen] = opener()
  return h(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      className: 'dsh-tidy-menu-item',
      onClick: () => {
        if (typeof setMenuOpen === 'function') setMenuOpen(false)
        openTidy(sessionId, displayTitle)
      },
    },
    h(PanelIcon),
    t('menu.tidy'),
  )
}

// ---------------------------------------------------------------------------
// Rename dialog (shell.overlay)
// ---------------------------------------------------------------------------

function DialogHost(props) {
  const { t, dialog, sessions, requestAi } = props
  const target = useStore(dialog)
  const [value, setValue] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [aiBusy, setAiBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    if (target === null) return
    setValue(target.suggestion || target.title || '')
    setError('')
    const handle = (event) => {
      if (event.key === 'Escape') dialog.set(null)
    }
    window.addEventListener('keydown', handle)
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      window.removeEventListener('keydown', handle)
      clearTimeout(timer)
    }
  }, [target, dialog])

  if (target === null) return null

  const close = () => {
    if (busy) return
    dialog.set(null)
  }

  const apply = async () => {
    const title = value.trim()
    if (title === '') {
      setError(t('dialog.untitled'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await sessions.manager.rename(target.id, title)
      if (!result?.ok) throw new Error(result?.error?.message ?? 'rename failed')
      dialog.set(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const askAi = async () => {
    setAiBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ id: target.id, title: target.title || target.suggestion || '' }] }),
      })
      const payload = await response.json()
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      const suggestion = payload.suggestions?.[0]?.title
      if (typeof suggestion === 'string' && suggestion !== '') setValue(suggestion)
      else throw new Error(t('dialog.aiFailed', { msg: 'empty' }))
    } catch (cause) {
      setError(t('dialog.aiFailed', { msg: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      setAiBusy(false)
    }
  }

  return h(
    'div',
    {
      className: 'dsh-tidy-overlay',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) close()
      },
    },
    h(Styles),
    h(
      'div',
      { className: 'dsh-tidy-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': t('dialog.title') },
      h('h2', { className: 'dsh-tidy-dialog-title' }, t('dialog.title')),
      h(
        'div',
        { className: 'dsh-tidy-field' },
        h('span', { className: 'dsh-tidy-label' }, t('dialog.current')),
        h('div', { className: 'dsh-tidy-static' }, target.title || t('dialog.untitled')),
      ),
      h(
        'div',
        { className: 'dsh-tidy-field' },
        h('span', { className: 'dsh-tidy-label' }, t('dialog.new')),
        h('input', {
          ref: inputRef,
          className: 'dsh-tidy-input',
          value,
          maxLength: 80,
          onChange: (event) => setValue(event.currentTarget.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') apply()
          },
        }),
      ),
      h('p', { className: 'dsh-tidy-dialog-hint' }, t('dialog.hint')),
      error !== '' ? h('p', { className: 'dsh-tidy-dialog-error' }, error) : null,
      h(
        'div',
        { className: 'dsh-tidy-dialog-actions' },
        h(
          'button',
          { type: 'button', className: 'dsh-tidy-btn', onClick: askAi, disabled: busy || aiBusy },
          aiBusy ? '…' : t('dialog.ai'),
        ),
        h('span', { className: 'dsh-tidy-spacer' }),
        h('button', { type: 'button', className: 'dsh-tidy-btn is-ghost', onClick: close, disabled: busy }, t('dialog.cancel')),
        h(
          'button',
          { type: 'button', className: 'dsh-tidy-btn is-primary', onClick: apply, disabled: busy },
          busy ? '…' : t('dialog.apply'),
        ),
      ),
    ),
  )
}

// ---------------------------------------------------------------------------
// Plugin body
// ---------------------------------------------------------------------------

window.__ModuleLoader__.load({
  id: 'dsh-session-tidy',
  factory(require) {
    React = require('react')
    h = React.createElement

    function apply(ctx) {
      const sessions = ctx.get('sessions')
      const workspaces = ctx.get('workspaces')
      const uiWorkspace = ctx.get('uiWorkspace')
      const t = ctx.locale.bind(NS)
      const dialog = createDialogStore()

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-tidy: dictionaries')
      ctx.effect(() => installAutoNamer({ sessions, uiWorkspace }), 'session-tidy: auto naming')

      const lookupTitle = (sessionId) => {
        const summary = sessions.list.getSnapshot()?.byId?.[sessionId]
        return typeof summary?.title === 'string' ? summary.title : ''
      }

      const openTidy = (sessionId, displayTitle) => {
        const raw = lookupTitle(sessionId)
        // An untitled session has no text to clean: start empty and let the
        // user (or the model) write the first title instead of pinning the
        // localized "Untitled" placeholder.
        dialog.set({
          id: sessionId,
          title: raw,
          suggestion: raw,
          displayTitle,
        })
      }

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 20,
            locale: NS,
            label: () => t('panel'),
          },
          PanelIcon,
        ),
      )

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ sessions, workspaces, uiWorkspace, dialog }),
          },
          Panel,
        ),
      )

      ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
        ctx.slots.register(
          {
            name: 'sidebar.workspaces.session.menu.item',
            id: 'session-tidy.open',
            order: 250,
            locale: NS,
            inject: () => ({ openTidy }),
          },
          MenuRow,
        ),
      )

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'session-tidy.dialog',
            locale: NS,
            inject: () => ({ dialog, sessions }),
          },
          DialogHost,
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'],
      apply,
    }
  },
})
