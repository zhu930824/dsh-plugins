/**
 * Host half of the Session Title Tidy plugin (v2).
 *
 * Implements the naming convention: MMDD｜类型｜主题.
 *   - MMDD comes from the session header's createdAt in Asia/Shanghai, never
 *     from updatedAt; a missing createdAt falls back to the request time.
 *   - 类型 is one of eight fixed categories; the model may not invent one.
 *   - 主题 is a 2–12 character topic with no project name, punctuation or
 *     separator characters.
 *
 * The browser half owns every write. This half only reads session headers and
 * opening prompts, and asks the default model for a type plus topic.
 */

const ROUTE_PREFIX = '/plugin/session-tidy/v2'
const MAX_ITEMS = 12
const MAX_BODY_BYTES = 96 * 1024
const MAX_PROMPT_CHARS = 420
const MAX_PROMPT_MESSAGES = 3
const MAX_TOPIC_CHARS = 12
const REQUEST_TIMEOUT_MS = 60_000
const TYPES = ['功能', '设计', '修复', '优化', '发布', '探索', '文档', '研究']

export const inject = ['webServer', 'llm', 'sessionQuery']

export function apply(ctx) {
  const originOf = () => {
    try {
      return ctx.webServer.getOrigin()
    } catch {
      return undefined
    }
  }

  const isSameOrigin = (req) => {
    const origin = req.headers.origin
    if (origin === undefined) return true
    const expected = originOf()
    return expected === undefined || origin === expected
  }

  const modelSelection = () => {
    const service = ctx.get('agentDefaultModel')
    const selection = service?.currentSelection?.()
    if (selection?.provider && selection?.model) return selection
    return undefined
  }

  const readBody = async (req) => {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) throw new Error('request body is too large')
      chunks.push(chunk)
    }
    if (chunks.length === 0) return undefined
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }

  const send = (res, status, value) => {
    const body = JSON.stringify(value)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  const fail = (res, status, message) => send(res, status, { ok: false, error: message })

  /** MMDD in Asia/Shanghai, derived from the session's creation instant. */
  const mmdd = (createdAt) => {
    const instant = Number.isFinite(createdAt) ? createdAt : Date.now()
    const date = new Date(instant)
    if (Number.isNaN(date.getTime())) return mmdd(Date.now())
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const month = parts.find((part) => part.type === 'month')?.value ?? '01'
    const day = parts.find((part) => part.type === 'day')?.value ?? '01'
    return `${month}${day}`
  }

  /** Last path segment of a project directory, for the "do not repeat it" rule. */
  const projectOf = (cwd) => {
    if (typeof cwd !== 'string' || cwd === '') return ''
    const parts = cwd.split(/[\\/]+/).filter((part) => part !== '')
    return parts.at(-1) ?? ''
  }

  const userText = (event) => {
    if (event?.type !== 'user/message') return ''
    if (event.data?.source?.kind !== 'user') return ''
    const content = Array.isArray(event.data.content) ? event.data.content : []
    return content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim()
  }

  /** Read creation time, project and opening prompts without activating the session. */
  const contextOf = async (sessionId) => {
    try {
      const read = await ctx.sessionQuery.readSession(sessionId)
      const header = read?.session ?? {}
      const events = Array.isArray(read?.events) ? read.events : []
      const prompts = []
      for (const event of events) {
        const text = userText(event)
        if (text === '') continue
        prompts.push(text.length > MAX_PROMPT_CHARS ? `${text.slice(0, MAX_PROMPT_CHARS)}…` : text)
        if (prompts.length >= MAX_PROMPT_MESSAGES) break
      }
      return { createdAt: Number(header.createdAt), cwd: header.cwd, prompts }
    } catch {
      return { createdAt: undefined, cwd: undefined, prompts: [] }
    }
  }

  const SYSTEM_RULES = [
    '你是会话标题命名器。为每条会话给出一个「类型」和一个「主题」，日期前缀由系统拼接。',
    '要求：',
    '1. 类型只能取以下之一：功能、设计、修复、优化、发布、探索、文档、研究。不得自造或组合。',
    '2. 主题 2–12 个汉字，概括实际任务对象与动作；不要重复项目名；不加标点、引号、书名号、表情、编号。',
    '3. 主题要具体、能在左侧栏一眼看懂，例如「侧栏任务名整理」「PDF 批量合并」。',
    '4. 如果从给出的内容判断不出主题，输出 {"id":"...","keep":true}，不要猜测。',
    '5. 同一批内主题避免重复；内容相近时用不同侧重点区分。',
    '6. 只输出 JSON 数组，形如 [{"id":"...","type":"功能","topic":"..."}]；不要代码块标记，不要解释。',
  ].join('\n')

  const buildMessages = (items) => {
    const lines = items.map((item, index) => {
      const prompts = (item.prompts ?? []).map((text) => `- ${text.replace(/\s+/g, ' ')}`).join('\n')
      return [
        `#${index + 1} id=${item.id}`,
        `创建日期：${item.mmdd}`,
        item.project === '' ? '项目名：（）' : `项目名：${item.project}`,
        `当前标题：${item.title || '（无标题）'}`,
        prompts === '' ? '用户开头：（）' : `用户开头：\n${prompts}`,
      ].join('\n')
    })
    return [
      {
        role: 'user',
        content: [{ type: 'text', text: `${SYSTEM_RULES}\n\n会话列表：\n\n${lines.join('\n\n')}` }],
      },
    ]
  }

  const collectText = async (messages) => {
    const selection = modelSelection()
    if (selection === undefined) throw new Error('没有可用的默认模型，请先在设置里选择模型')
    let text = ''
    let failure
    const stream = ctx.llm.stream({
      provider: selection.provider,
      model: selection.model,
      messages,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    for await (const chunk of stream) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      else if (chunk?.type === 'finish' && chunk.kind === 'error') failure = chunk.failure
    }
    if (failure !== undefined) {
      const code = failure.code ?? 'LLM_ERROR'
      const message = failure.message ?? '模型请求失败'
      throw new Error(`${code}: ${message}`)
    }
    return text
  }

  const parseEntries = (raw) => {
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start < 0 || end <= start) throw new Error('模型没有返回 JSON 数组')
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(parsed)) throw new Error('模型返回的不是数组')
    return parsed
  }

  const sanitizeTopic = (value, project) => {
    if (typeof value !== 'string') return ''
    let topic = value
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[｜|]/g, ' ')
      .replace(/^["'“”‘’「」『』《》(\[（]+/, '')
      .replace(/["'“”‘’「」『』《》)\]）]+$/, '')
      .replace(/[。！？!?；;，,、：:]+$/g, '')
      .trim()
    if (project !== '' && topic.startsWith(project)) topic = topic.slice(project.length).trim()
    let chars = Array.from(topic)
    if (chars.length > MAX_TOPIC_CHARS) topic = chars.slice(0, MAX_TOPIC_CHARS).join('').trim()
    chars = Array.from(topic)
    if (chars.length < 2) return ''
    if (!/[\p{L}\p{N}]/u.test(topic)) return ''
    return topic
  }

  const suggest = async (res, body) => {
    const items = Array.isArray(body?.items) ? body.items : []
    const requested = items
      .filter((item) => typeof item?.id === 'string' && item.id !== '')
      .slice(0, MAX_ITEMS)
      .map((item) => ({ id: item.id, title: typeof item.title === 'string' ? item.title : '' }))
    if (requested.length === 0) return fail(res, 400, '没有需要命名的会话')

    const enriched = []
    for (const item of requested) {
      const context = await contextOf(item.id)
      enriched.push({
        ...item,
        prompts: context.prompts,
        project: projectOf(context.cwd),
        mmdd: mmdd(context.createdAt),
      })
    }

    const raw = await collectText(buildMessages(enriched))
    const entries = parseEntries(raw)
    const byId = new Map(enriched.map((item) => [item.id, item]))
    const suggestions = []
    for (const entry of entries) {
      if (typeof entry?.id !== 'string' || !byId.has(entry.id)) continue
      if (entry.keep === true) continue
      const item = byId.get(entry.id)
      const type = typeof entry.type === 'string' ? entry.type.trim() : ''
      if (!TYPES.includes(type)) continue
      const topic = sanitizeTopic(entry.topic, item.project)
      if (topic === '') continue
      suggestions.push({ id: item.id, title: `${item.mmdd}｜${type}｜${topic}`, type, topic })
    }
    if (suggestions.length === 0) {
      return send(res, 200, { ok: true, suggestions: [], kept: enriched.length })
    }
    send(res, 200, { ok: true, suggestions })
  }

  const handle = async (req, res) => {
    try {
      if (!isSameOrigin(req)) return fail(res, 403, 'cross-origin request rejected')
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      if (path === `${ROUTE_PREFIX}/info`) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method not allowed')
        const selection = modelSelection()
        return send(res, 200, {
          ok: selection !== undefined,
          provider: selection?.provider,
          model: selection?.model,
          types: TYPES,
          format: 'MMDD｜类型｜主题',
        })
      }
      if (path === `${ROUTE_PREFIX}/suggest`) {
        if (req.method !== 'POST') return fail(res, 405, 'method not allowed')
        const body = await readBody(req)
        return await suggest(res, body)
      }
      return fail(res, 404, 'not found')
    } catch (error) {
      ctx.logger?.warn?.(`session-tidy: ${error instanceof Error ? error.message : String(error)}`)
      return fail(res, 502, error instanceof Error ? error.message : 'request failed')
    }
  }

  ctx.effect(() => {
    const disposeInfo = ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/info`,
      handler: handle,
    })
    const disposeSuggest = ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/suggest`,
      handler: handle,
    })
    return () => {
      disposeInfo()
      disposeSuggest()
    }
  }, 'session-tidy: suggest routes')
}
