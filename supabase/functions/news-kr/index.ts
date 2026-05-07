// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// AI 뉴스 키워드 필터 (제목에 하나라도 포함되면 AI 뉴스로 분류)
const AI_KEYWORDS = [
  // 핵심 단어 (단독으로도 충분한 것들)
  '인공지능', '머신러닝', '딥러닝', '신경망', '생성형',
  'LLM', 'sLLM', 'RAG', 'NPU', 'GPU',

  // 모델/서비스명
  'ChatGPT', '챗GPT', 'GPT-4', 'GPT-5', 'o1', 'o3',
  'Gemini', '제미나이', 'Gemma',
  'Claude', '클로드',
  'Llama', '라마', 'Mistral', 'Qwen', 'DeepSeek', '딥시크',
  'Copilot', '코파일럿', 'Grok',
  'Sora', 'Midjourney', 'DALL-E', 'Stable Diffusion',

  // 기업명 (AI 맥락)
  'OpenAI', '오픈AI',
  'Anthropic', '앤트로픽',
  'NVIDIA', '엔비디아',
  'Hugging Face', '허깅페이스',
  'Perplexity',

  // 복합 키워드 (AI + 분야)
  'AI 반도체', 'AI칩', 'AI 에이전트', 'AI 로봇',
  'AI 의료', 'AI 자율주행', 'AI 데이터센터',
  'AI 규제', 'AI 윤리', 'AI 안전', 'AI 보안',
  'AI 스타트업', 'AI 투자', 'AI 인재', 'AI 교육',
  'AI 서비스', 'AI 솔루션', 'AI 플랫폼', 'AI 모델',
  'AI 개발', 'AI 학습', 'AI 추론',

  // 기술 용어
  '거대언어모델', '파운데이션 모델', '멀티모달', '파인튜닝',
  '프롬프트', '임베딩', '벡터DB', '벡터 데이터베이스',
  '자연어처리', 'NLP', 'AGI', '초거대',

  // 단독 'AI' 는 오탐 가능성이 있어 마지막에 별도 처리
  ' AI ', 'AI가 ', 'AI를 ', 'AI의 ', 'AI로 ', 'AI와 ', 'AI은 ', 'AI는 ',
  '"AI', 'AI"', '·AI', 'AI·',
]

function isAiNews(title: string): boolean {
  const t = title.toLowerCase()
  // 공백 포함 패턴들은 원문 그대로, 나머지는 소문자 비교
  return AI_KEYWORDS.some(kw => {
    if (kw.includes(' ') || kw.includes('"') || kw.includes('·')) {
      // 공백/특수문자 포함 패턴: 원문 제목에서 직접 검색
      return title.includes(kw)
    }
    return t.includes(kw.toLowerCase())
  })
}

// 국내 주요 언론사 RSS 피드
const RSS_FEEDS = {
  ai: [
    { name: '전자신문', url: 'https://rss.etnews.com/Section901.xml' },
    { name: '연합뉴스 IT', url: 'https://www.yna.co.kr/rss/it.xml' },
    { name: 'Google News AI', url: 'https://news.google.com/rss/search?q=%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5&hl=ko&gl=KR&ceid=KR:ko' },
  ],
  general: [
    { name: '연합뉴스 사회', url: 'https://www.yna.co.kr/rss/society.xml' },
    { name: '연합뉴스 경제', url: 'https://www.yna.co.kr/rss/economy.xml' },
    { name: '연합뉴스 정치', url: 'https://www.yna.co.kr/rss/politics.xml' },
    { name: '연합뉴스 국제', url: 'https://www.yna.co.kr/rss/international.xml' },
    { name: '한국경제', url: 'https://www.hankyung.com/feed/all-news' },
    { name: 'SBS 뉴스', url: 'https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01' },
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
// filterAi=true 이면 AI 키워드 포함 기사만 반환
async function collectNews(
  feeds: { name: string; url: string }[],
  maxItems = 5,
  filterAi = false,
): Promise<any[]> {
  // 더 많이 가져와서 필터 후 충분한 수를 확보
  const fetchLimit = filterAi ? 20 : maxItems
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
    // AI 키워드 매칭된 기사만 표시 (보완 없음 - 관련 없는 기사 노출 방지)
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