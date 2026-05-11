// @ts-nocheck
import { getKisToken } from "../_shared/kis-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const CANDIDATES_QUERY_URL = Deno.env.get("CANDIDATES_QUERY_URL") || "";
const CANDIDATES_QUERY_PARAMS = Deno.env.get("CANDIDATES_QUERY_PARAMS") || "";

const US_CANDIDATES: { ticker: string; name: string; sector: string }[] = [];
const KR_CANDIDATES: { ticker: string; name: string; sector: string }[] = [];

const initializeCandidates = async () => {
  if (CANDIDATES_QUERY_URL) {
    // Fetch candidates dynamically
    try {
      const response = await fetch(
        `${CANDIDATES_QUERY_URL}?${CANDIDATES_QUERY_PARAMS}`,
      );
      if (!response.ok) {
        console.error(
          `Failed to fetch candidates: ${response.status} ${response.statusText}`,
        );
      } else {
        const allCandidates = await response.json();
        allCandidates.forEach((c: any) => {
          if (c.market === "US") {
            US_CANDIDATES.push(c);
          } else if (c.market === "KR") {
            KR_CANDIDATES.push(c);
          }
        });
      }
    } catch (e) {
      console.error("Error fetching candidates:", e.message);
    }
  } else {
    // Fallback to static lists if URL not configured
    US_CANDIDATES.push(
      { ticker: "NVDA", name: "NVIDIA", sector: "AI반도체" },
      { ticker: "AMD", name: "AMD", sector: "AI반도체" },
      { ticker: "AVGO", name: "Broadcom", sector: "AI반도체" },
      { ticker: "TSM", name: "TSMC", sector: "AI반도체" },
      { ticker: "MU", name: "Micron", sector: "AI반도체" },
      { ticker: "ARM", name: "ARM", sector: "AI반도체" },
      { ticker: "PLTR", name: "Palantir", sector: "AI/SW" },
      { ticker: "SMCI", name: "Super Micro", sector: "AI Infra" },
      { ticker: "VRT", name: "Vertiv", sector: "AI Infra" },
      { ticker: "DELL", name: "Dell", sector: "AI Infra" },
      { ticker: "ANET", name: "Arista", sector: "Networking" },
      { ticker: "CELH", name: "Celsius", sector: "Consumer" },
      { ticker: "DKNG", name: "DraftKings", sector: "Consumer" },
      { ticker: "COIN", name: "Coinbase", sector: "Fintech" },
      { ticker: "HOOD", name: "Robinhood", sector: "Fintech" },
      { ticker: "APP", name: "AppLovin", sector: "Adtech" },
      { ticker: "RDDT", name: "Reddit", sector: "Adtech" },
      { ticker: "LUNR", name: "Intuitive Machines", sector: "Space" },
      { ticker: "RKLB", name: "Rocket Lab", sector: "Space" },
      { ticker: "SMR", name: "NuScale", sector: "Nuclear" },
      { ticker: "OKLO", name: "Oklo", sector: "Nuclear" },
      { ticker: "SOFI", name: "SoFi", sector: "Fintech" },
      { ticker: "MSTR", name: "MicroStrategy", sector: "Crypto" },
      { ticker: "MARA", name: "Mara Holdings", sector: "Crypto" },
      { ticker: "GME", name: "GameStop", sector: "Meme" },
    );
    KR_CANDIDATES.push(
      { ticker: "005930", name: "삼성전자", sector: "반도체" },
      { ticker: "000660", name: "SK하이닉스", sector: "반도체" },
      { ticker: "004770", name: "써니전자", sector: "정치테마" },
      { ticker: "011000", name: "진양산업", sector: "정치테마" },
      { ticker: "019170", name: "신풍제약", sector: "바이오" },
      { ticker: "068270", name: "셀트리온", sector: "바이오" },
      { ticker: "207940", name: "삼성바이오로직스", sector: "바이오" },
      { ticker: "322000", name: "HD현대일렉트릭", sector: "전력기기" },
      { ticker: "006260", name: "LS", sector: "전력기기" },
      { ticker: "042700", name: "한미반도체", sector: "반도체장비" },
      { ticker: "462330", name: "에이프릴바이오", sector: "바이오" },
      { ticker: "403490", name: "알테오젠", sector: "바이오" },
      { ticker: "243070", name: "휴젤", sector: "바이오" },
      { ticker: "012450", name: "한화에어로스페이스", sector: "방산" },
      { ticker: "066570", name: "LG전자", sector: "가전" },
      { ticker: "259960", name: "크래프톤", sector: "게임" },
      { ticker: "036570", name: "NC소프트", sector: "게임" },
      { ticker: "035420", name: "NAVER", sector: "플랫폼" },
      { ticker: "035720", name: "카카오", sector: "플랫폼" },
      { ticker: "000270", name: "기아", sector: "자동차" },
      { ticker: "373220", name: "LG에너지솔루션", sector: "2차전지" },
      { ticker: "006400", name: "삼성SDI", sector: "2차전지" },
      { ticker: "247540", name: "에코프로비엠", sector: "2차전지" },
      { ticker: "086520", name: "에코프로", sector: "2차전지" },
      { ticker: "010140", name: "삼성중공업", sector: "조선" },
    );
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await initializeCandidates(); // Initialize candidates at the start of each request

    const { market = "US" } = await req.json();
    const mkt = market === "KR" ? "KR" : "US";
    const cacheKey = `__REC2_${mkt}__`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY");

    // ── 캐시 확인 (1시간 TTL) ────────────────────────
    if (supabaseUrl && serviceKey) {
      const cacheRes = await fetch(
        `${supabaseUrl}/rest/v1/stock_quote_cache?ticker=eq.${encodeURIComponent(
          cacheKey,
        )}&select=data,updated_at`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      const cached = await cacheRes.json();
      if (Array.isArray(cached) && cached.length > 0) {
        const ageMs = Date.now() - new Date(cached[0].updated_at).getTime();
        if (ageMs < CACHE_TTL_MS) {
          return new Response(JSON.stringify(cached[0].data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ── 주식 데이터 수집 ──────────────────────────────
    let stockData: any[] = [];
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    if (mkt === "US") {
      // Finnhub 시세 병렬 조회
      const quoteResults = await Promise.allSettled(
        US_CANDIDATES.map(async (c) => {
          const r = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${c.ticker}&token=${finnhubKey}`,
          );
          const d = await r.json();
          return { ...c, c: d.c ?? 0, dp: d.dp ?? 0, h: d.h ?? 0, l: d.l ?? 0, pc: d.pc ?? 0 };
        }),
      );
      stockData = quoteResults
        .filter((r) => r.status === "fulfilled" && (r.value as any).c > 0)
        .map((r) => (r as any).value)
        .sort((a, b) => Math.abs(b.dp) - Math.abs(a.dp));

      // 상위 10개 종목 감성 분석
      const topTickers = stockData.slice(0, 10).map((s) => s.ticker);
      const sentResults = await Promise.allSettled(
        topTickers.map(async (ticker) => {
          const r = await fetch(
            `https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${finnhubKey}`,
          );
          const d = await r.json();
          return {
            ticker,
            bullishPercent: d.sentiment?.bullishPercent ?? null,
            articleCount: d.buzz?.articlesInLastWeek ?? 0,
            weeklyAvgScore: d.sentiment?.score ?? null,
          };
        }),
      );
      const sentMap: Record<string, any> = {};
      sentResults.forEach((r) => {
        if (r.status === "fulfilled") sentMap[(r.value as any).ticker] = r.value;
      });
      stockData = stockData.map((s) => ({
        ...s,
        sentiment: sentMap[s.ticker] ?? null,
      }));
    } else {
      // KIS API 시세 병렬 조회
      const appKey = Deno.env.get("KIS_APP_KEY");
      const appSecret = Deno.env.get("KIS_APP_SECRET");
      if (!appKey || !appSecret) throw new Error("KIS credentials not configured");

      const accessToken = await getKisToken(appKey, appSecret);
      const krResults = await Promise.allSettled(
        KR_CANDIDATES.map(async (c) => {
          const code = c.ticker.padStart(6, "0");
          const url = new URL(
            "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price",
          );
          url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
          url.searchParams.set("FID_INPUT_ISCD", code);
          const r = await fetch(url.toString(), {
            headers: {
              authorization: `Bearer ${accessToken}`,
              appkey: appKey,
              appsecret: appSecret,
              tr_id: "FHKST01010100",
            },
          });
          const d = await r.json();
          if (d.rt_cd !== "0") return null;
          const o = d.output;
          return {
            ...c,
            price: parseFloat(o.stck_prpr),
            changePercent: parseFloat(o.prdy_ctrt),
            change: parseFloat(o.prdy_vrss),
            volume: parseInt(o.acml_vol),
            high52: parseFloat(o.w52_hgpr),
            low52: parseFloat(o.w52_lwpr),
            per: parseFloat(o.per),
            pbr: parseFloat(o.pbr),
            foreignRatio: parseFloat(o.hts_frgn_ehrt),
          };
        }),
      );
      stockData = krResults
        .filter((r) => r.status === "fulfilled" && (r.value as any))
        .map((r) => (r as any).value);
    }

    if (stockData.length === 0) throw new Error("주식 데이터를 가져올 수 없습니다");

    // ── LLM 데이터 테이블 구성 ────────────────────────
    let dataTable = "";
    if (mkt === "US") {
      dataTable = stockData
        .map((s) => {
          const dp = (s.dp ?? 0).toFixed(2);
          const bull = s.sentiment?.bullishPercent != null
            ? (s.sentiment.bullishPercent * 100).toFixed(0) + "%"
            : "N/A";
          const art = s.sentiment?.articleCount ?? 0;
          return `${s.ticker}(${s.name})[${s.sector}]: $${(s.c ?? 0).toFixed(2)}, ${Number(
            dp,
          ) >= 0 ? "+" : ""}${dp}%, Bullish ${bull}, 기사수 ${art}`;
        })
        .join("\n");
    } else {
      dataTable = stockData
        .map((s) => {
          const pct = (s.changePercent ?? 0).toFixed(2);
          return `${s.ticker}(${s.name})[${s.sector}]: ₩${(s.price ?? 0).toLocaleString(
            "ko-KR",
          )}, ${Number(pct) >= 0 ? "+" : ""}${pct}%, PER ${(s.per ?? 0).toFixed(1)}, PBR ${(
            s.pbr ?? 0
          ).toFixed(2)}, 외국인 ${(s.foreignRatio ?? 0).toFixed(1)}%`;
        })
        .join("\n");
    }

    // ── Groq LLM 호출 ─────────────────────────────────
    if (!groqKey) throw new Error("Groq API key not configured");
    const groqHeaders = { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" };

    let model: string;
    let systemPrompt: string;
    let userPrompt: string;

    if (mkt === "US") {
      model = "compound-beta";
      systemPrompt = `You are a professional stock analyst specializing in momentum and catalyst-driven trading.\nYour job is to identify stocks with near-term upside potential based on real catalysts — NOT general market leaders or blue chips.\nFocus on:\n- Stocks with specific upcoming or recent catalysts (earnings beats, FDA approvals, contract wins, policy tailwinds, sector rotation)\n- Under-the-radar names with unusual volume or analyst upgrades\n- Stocks reacting to macro/geopolitical/regulatory events\nAvoid: AAPL, MSFT, NVDA, TSLA, GOOGL, AMZN unless there\\'s a very specific non-consensus catalyst.\nAlways output in Korean for recommendations details, and you MUST use the following JSON structure exactly.`;
      userPrompt = `Today is ${today}.\nSearch for stocks likely to move UP in the next 1–4 weeks based on SPECIFIC catalysts.\nCriteria:\n1. US listed stocks\n2. Market cap: preferably $500M ~ $20B\n3. Must have at least ONE specific catalyst (Earnings, FDA, Contract, Theme, Institutional buying)\n4. Exclude stocks already up 30%+ in the past month unless still early stage\n\nMarket Data for Analysis:\n${dataTable}\n\nYou MUST return a JSON object with this EXACT structure:\n{\n  \"marketSummary\": \"오늘 미국 시장 한 줄 요약\",\n  \"hotSectors\": [\"섹터1\", \"섹터2\"],\n  \"recommendations\": [\n    {\n      \"rank\": 1,\n      \"ticker\": \"TICKER\",\n      \"name\": \"NAME\",\n      \"catalyst\": \"상세 촉매제 설명 (한국어)\",\n      \"catalyst_date\": \"예상 날짜\",\n      \"time_horizon\": \"1W / 2W / 1M\",\n      \"risk\": \"Low / Med / High\",\n      \"entry_logic\": \"진입 논리 및 포인트 (한국어)\",\n      \"watch_price\": \"관심 가격대\",\n      \"sector\": \"섹터\",\n      \"compositeScore\": 85,\n      \"scoreBreakdown\": { \"momentum\": 80, \"sentiment\": 85, \"technical\": 80, \"volume\": 80 },\n      \"reason\": \"전체 요약\"\n    }\n  ]\n}`; 
    } else {
      model = "qwen/qwen3-32b";
      systemPrompt = `You are a professional stock analyst specializing in momentum and catalyst-driven trading.\nYour job is to identify stocks with near-term upside potential based on real catalysts.\nAlways output in Korean for recommendations details, and you MUST use the following JSON structure exactly.`;
      userPrompt = `Today is ${today}.\nSearch for Korean listed stocks (KOSPI/KOSDAQ) likely to move UP in the next 1–4 weeks based on SPECIFIC catalysts.\nCriteria:\n1. Market cap: preferably $500M ~ $20B\n2. Must have at least ONE specific catalyst\n3. Exclude stocks already up 30%+ in the past month\n\nMarket Data for Analysis:\n${dataTable}\n\nYou MUST return a JSON object with this EXACT structure:\n{\n  \"marketSummary\": \"오늘 국내 시장 한 줄 요약\",\n  \"hotSectors\": [\"섹터1\", \"섹터2\"],\n  \"recommendations\": [\n    {\n      \"rank\": 1,\n      \"ticker\": \"TICKER\",\n      \"name\": \"NAME\",\n      \"catalyst\": \"상세 촉매제 설명 (한국어)\",\n      \"catalyst_date\": \"예상 날짜\",\n      \"time_horizon\": \"1W / 2W / 1M\",\n      \"risk\": \"Low / Med / High\",\n      \"entry_logic\": \"진입 논리 및 포인트 (한국어)\",\n      \"watch_price\": \"관심 가격대\",\n      \"sector\": \"섹터\",\n      \"compositeScore\": 85,\n      \"scoreBreakdown\": { \"momentum\": 80, \"institutional\": 85, \"technical\": 80, \"volume\": 80 },\n      \"reason\": \"전체 요약\"\n    }\n  ]\n}`; 
    }

    const llmRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: groqHeaders,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 3500,
        temperature: 0.4,
      }),
    });
    const llmData = await llmRes.json();
    const rawText = llmData.choices?.[0]?.message?.content || "";

    let result: any;
    try {
      result = extractJSON(rawText);
    } catch {
      // compound-beta 파싱 실패 시 llama-3.3-70b fallback
      const fallbackRes = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: groqHeaders,
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 3500,
          temperature: 0.4,
        }),
      });
      const fallbackData = await fallbackRes.json();
      const fallbackText = fallbackData.choices?.[0]?.message?.content || "{}";
      result = JSON.parse(fallbackText);
    }

    result.updatedAt = new Date().toISOString();
    result.market = mkt;

    // ── 추천 종목에 현재가 enrichment ─────────────────
    if (Array.isArray(result.recommendations)) {
      const priceMap: Record<string, any> = {};
      stockData.forEach((s) => {
        priceMap[s.ticker] = s;
      });

      result.recommendations = result.recommendations.map((rec: any) => {
        const s = priceMap[rec.ticker];
        if (!s) return rec;
        return mkt === "US"
          ? { ...rec, currentPrice: s.c, changePercent: s.dp }
          : { ...rec, currentPrice: s.price, changePercent: s.changePercent };
      });
    }

    // ── 캐시 저장 ─────────────────────────────────────
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/stock_quote_cache`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({ ticker: cacheKey, data: result, updated_at: new Date().toISOString() }),
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
