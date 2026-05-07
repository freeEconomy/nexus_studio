// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// AI 뉴스 키워드 필터 (제목에 하나라도 포함되면 AI 뉴스로 분류)
const AI_KEYWORDS = [
  // 핵심 기술
  'AI', '인공지능', '머신러닝', '딥러닝', '신경망',
  'LLM', 'GPT', '챗GPT', 'ChatGPT', '제미나이', 'Gemini', '클로드', 'Claude',
  '라마', 'Llama', '코파일럿', 'Copilot',
  // 기업/서비스
  '오픈AI', 'OpenAI', '앤트로픽', 'Anthropic', '엔비디아', 'NVIDIA',
  '구글 AI', '마이크로소프트 AI', '삼성 AI', 'SK AI',
  // 응용 분야
  '생성형 AI', '멀티모달', '거대언어모델', '파운데이션 모델',
  'AI 반도체', 'AI칩', 'NPU', 'GPU',
  'AI 에이전트', 'AI 로봇', 'AI 의료', 'AI 자율주행',
  // 트렌드
  'AI 규제', 'AI 윤리', 'AI 안전', 'AI 보안',
  'AI 스타트업', 'AI 투자', 'AI 인재',
]

function isAiNews(title: string): boolean {
  const t = title.toLowerCase()
  return AI_KEYWORDS.some(kw => t.includes(kw.toLowerCase()))
}

// 국내 주요 언론사 RSS 피드
const RSS_FEEDS = {
  ai: [
    { name: '전자신문 IT', url: 'https://rss.etnews.com/03.xml' },
    { name: '전자신문', url: 'https://rss.etnews.com/Section901.xml' },
  ],
  general: [
    { name: '연합뉴스 사회', url: 'https://www.yna.co.kr/rss/society.xml' },
    { name: '연합뉴스 경제', url: 'https://www.yna.co.kr/rss/economy.xml' },
    { name: '연합뉴스 정치', url: 'https://www.yna.co.kr/rss/politics.xml' },
    { name: '연합뉴스 국제', url: 'https://www.yna.co.kr/rss/international.xml' },
  ],
}

// RSS XML 파싱 (Deno 환경 - DOMParser 없으므로 정규식 사용)
function parseRSS(xml: string, sourceName: string, limit = 5): any[] {
  const items: any[] = []

  // <item> 블록 추출
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]

    const title = extractTag(block, 'title')
    const link  = extractTag(block, 'link') || extractTag(block, 'guid')
    const pubDate = extractTag(block, 'pubDate')

    if (title && link) {
      items.push({
        title: cleanText(title),
        url: cleanText(link),
        published_date: pubDate ? new Date(pubDate).toISOString() : null,
        source: sourceName,
      })
    }

    if (items.length >= limit) break
  }

  return items
}

function extractTag(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = text.match(regex)
  if (!m) return ''
  return (m[1] || m[2] || '').trim()
}

function cleanText(text: string): string {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

// 단일 RSS 피드 fetch
async function fetchFeed(feed: { name: string; url: string }, limit = 5): Promise<any[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexusStudio/1.0)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSS(xml, feed.name, limit)
  } catch {
    return []
  }
}

// 여러 피드에서 최신 뉴스 수집 후 최대 maxItems개 반환
// filterAi=true 이면 AI 키워드 포함 기사만 반환, 부족하면 일반 IT 기사로 보완
async function collectNews(
  feeds: { name: string; url: string }[],
  maxItems = 5,
  filterAi = false,
): Promise<any[]> {
  // 더 많이 가져와서 필터 후 충분한 수를 확보
  const fetchLimit = filterAi ? 50 : maxItems
  const results = await Promise.allSettled(
    feeds.map(feed => fetchFeed(feed, fetchLimit))
  )
  const all: any[] = []

  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value)
  }

  // 날짜 기준 정렬 (최신순)
  all.sort((a, b) => {
    if (!a.published_date) return 1
    if (!b.published_date) return -1
    return new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
  })

  // 중복 제거 (title 기준)
  const seen = new Set<string>()
  const deduped = all.filter(item => {
    if (seen.has(item.title)) return false
    seen.add(item.title)
    return true
  })

  if (filterAi) {
    return deduped.filter(item => isAiNews(item.title)).slice(0, maxItems)
  }

  return deduped.slice(0, maxItems)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { type = 'both', max_results = 5 } = req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : {}

    const tasks: Record<string, Promise<any[]>> = {}

    if (type === 'ai' || type === 'both') {
      tasks.ai = collectNews(RSS_FEEDS.ai, max_results, true)  // AI 키워드 필터 적용
    }
    if (type === 'general' || type === 'both') {
      tasks.general = collectNews(RSS_FEEDS.general, max_results)
    }

    const [aiNews, generalNews] = await Promise.all([
      tasks.ai ?? Promise.resolve([]),
      tasks.general ?? Promise.resolve([]),
    ])

    return new Response(
      JSON.stringify({ ai: aiNews, general: generalNews }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
