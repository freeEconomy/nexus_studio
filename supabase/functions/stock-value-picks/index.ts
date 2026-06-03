// @ts-nocheck
import { getKisToken } from "../_shared/kis-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

// ── JSON 추출 헬퍼 ─────────────────────────────────────────────────
function extractJSON(text: string): any {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const target = fence ? fence[1].trim() : cleaned;
  const s = target.indexOf("{"), e = target.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("JSON not found");
  return JSON.parse(target.slice(s, e + 1));
}

// ── KIS 현재가 조회 ────────────────────────────────────────────────
async function fetchKrPrice(
  ticker: string,
  accessToken: string,
  appKey: string,
  appSecret: string,
): Promise<{ price: number; changePercent: number } | null> {
  try {
    const code = ticker.replace(/\D/g, "").padStart(6, "0");
    const url  = new URL(
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
    return {
      price:         parseFloat(d.output.stck_prpr),
      changePercent: parseFloat(d.output.prdy_ctrt),
    };
  } catch { return null; }
}

// ── Finnhub 현재가 조회 ────────────────────────────────────────────
async function fetchUsPrice(
  ticker: string,
  finnhubKey: string,
): Promise<{ price: number; changePercent: number } | null> {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`);
    const d = await r.json();
    if (!d.c) return null;
    return { price: d.c, changePercent: d.dp };
  } catch { return null; }
}

// ── Finnhub 애널리스트 컨센서스 ────────────────────────────────────
async function fetchFinnhubConsensus(ticker: string, finnhubKey: string) {
  try {
    const r    = await fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${finnhubKey}`);
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const l     = data[0];
    const total = (l.strongBuy||0) + (l.buy||0) + (l.hold||0) + (l.sell||0) + (l.strongSell||0);
    if (total === 0) return null;
    const buy = (l.strongBuy||0) + (l.buy||0);
    const pct = Math.round((buy / total) * 100);
    return { rating: pct >= 60 ? "Buy" : pct >= 40 ? "Hold" : "Sell", buyCount: buy, totalCount: total, period: l.period };
  } catch { return null; }
}

// ── Groq 호출 (모델 폴백 포함) ────────────────────────────────────
async function callGroq(
  groqKey: string,
  messages: any[],
  models: string[],
  maxTokens = 4500,
): Promise<string> {
  const headers = { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" };
  for (const model of models) {
    try {
      const useJsonMode = !model.includes("compound");
      const body: any = { model, messages, max_tokens: maxTokens, temperature: 0.3 };
      if (useJsonMode) body.response_format = { type: "json_object" };
      const res  = await fetch(GROQ_API_URL, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) {
        console.warn(`[${model}] error: ${data.error.message}`);
        continue;
      }
      const text = data.choices?.[0]?.message?.content ?? "";
      if (text) return text;
    } catch (e) {
      console.warn(`[${model}] threw: ${e.message}`);
    }
  }
  throw new Error("All Groq models failed");
}

// ── 메인 핸들러 ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { market = "US" } = await req.json();
    const mkt      = market === "KR" ? "KR" : "US";
    const cacheKey = `__VALUEPICKS_${mkt}__`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const groqKey     = Deno.env.get("GROQ_API_KEY");
    const finnhubKey  = Deno.env.get("FINNHUB_API_KEY");

    if (!groqKey) throw new Error("Groq API key not configured");

    // ── 캐시 확인 ────────────────────────────────────────────────────
    if (supabaseUrl && serviceKey) {
      const cacheRes = await fetch(
        `${supabaseUrl}/rest/v1/stock_quote_cache?ticker=eq.${encodeURIComponent(cacheKey)}&select=data,updated_at`,
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

    const today = new Date().toISOString().split("T")[0];

    // ── 저평가 기준 정의 ─────────────────────────────────────────────
    const krCriteria = `
[한국 저평가 분석 기준 — 12개 조건]
밸류에이션(4): valuation1=PBR 0.5이하, valuation2=PER 15이하, valuation3=부채비율 150%이하, valuation4=시총 500억이상
실적(3): earnings1=최근 분기 영업이익 개선 추이, earnings2=적자→흑자 또는 어닝서프라이즈, earnings3=매출 성장 우상향
수급(2): supply1=기관/외국인 순매수 누적, supply2=거래량 급증 후 주가 횡보
정성(3): quality1=업황 턴어라운드 초기, quality2=자사주/배당/오너 지분 매입, quality3=정책수혜/숨은자산
제외 기준(하나라도 해당 시 탈락): 이익 감소 중인데 PER만 낮음 / 대주주 지분 매도 중 / 부채비율 200% 초과 / 거래량 수개월째 극도 낮음
대장주 제외: 삼성전자(005930), SK하이닉스(000660), NAVER(035420), 현대차(005380) 등 시총 상위`;

    const usCriteria = `
[미국 저평가 분석 기준 — 11개 조건]
밸류에이션(3): valuation1=PEG 1이하(PER÷EPS성장률), valuation2=EPS성장률 전년대비 10%이상, valuation3=Debt/Equity 1이하
실적(3): earnings1=최근 분기 영업이익 개선, earnings2=어닝 서프라이즈 이력, earnings3=매출 성장 우상향
수급(2): supply1=기관 순매수 누적(13F), supply2=거래량 급증 후 주가 횡보
정성(3): quality1=업황 턴어라운드, quality2=자사주/배당 확대, quality3=정책수혜/숨은자산
제외 기준: 이익 감소 중인데 PER만 낮음 / 내부자 대규모 매도 / Debt/Equity 2 초과 / 거래량 극도 낮음
대장주 제외: NVDA, AAPL, MSFT, AMZN, GOOGL, META, TSLA 등 메가캡`;

    const criteria    = mkt === "KR" ? krCriteria : usCriteria;
    const totalCrit   = mkt === "KR" ? 12 : 11;
    const v4Line      = mkt === "KR" ? `"valuation4": { "label": "시총 500억 이상", "pass": true, "value": "1.2조" },` : "";
    const e2Label     = mkt === "KR" ? "적자→흑자·어닝서프라이즈" : "어닝 서프라이즈 이력";
    const q2Label     = mkt === "KR" ? "자사주/배당/오너매입" : "자사주/배당 확대";
    const v1Label     = mkt === "KR" ? "PBR 0.5 이하" : "PEG 1 이하";
    const v2Label     = mkt === "KR" ? "PER 15 이하" : "EPS 성장률 10% 이상";
    const v3Label     = mkt === "KR" ? "부채비율 150% 이하" : "Debt/Equity 1 이하";

    const systemPrompt = `You are a professional value investing analyst with real-time web search.
Today is ${today}.
Your task: Search the web to find and analyze undervalued ${mkt === "KR" ? "Korean (KOSPI/KOSDAQ)" : "US"} stocks.
Use web search to verify current financial metrics (PBR, PER, debt ratio, EPS growth, analyst targets, recent news).
Respond in Korean. Return ONLY valid JSON, no markdown, no explanation outside JSON.`;

    const userPrompt = `${criteria}

오늘(${today}) 기준으로 위 조건을 충족하는 저평가 종목을 웹 검색하여 발굴하고, 각 조건의 pass/fail을 평가하라.
저평가 함정(제외 기준)에 해당하는 종목은 반드시 제외하라.
조건 충족 개수가 많은 순으로 8개를 선정하라.

각 종목마다 다음을 포함하라:
- criteria: 모든 조건 pass/fail + value(수치 근거)
- analystConsensus: 최근 증권사 투자의견·목표가·괴리율 (없으면 null)
- supportingNews: 최근 1개월 호재 뉴스 헤드라인 2~3건

반드시 아래 JSON만 반환하라:
{
  "marketContext": "시장 한 줄 요약 (한국어)",
  "picks": [
    {
      "rank": 1,
      "ticker": "${mkt === "KR" ? "6자리코드" : "TICKER"}",
      "name": "종목명",
      "sector": "섹터",
      "criteria": {
        "valuation1": { "label": "${v1Label}", "pass": true, "value": "0.42" },
        "valuation2": { "label": "${v2Label}", "pass": true, "value": "7.8" },
        "valuation3": { "label": "${v3Label}", "pass": true, "value": "98%" },
        ${v4Line}
        "earnings1":  { "label": "영업이익 개선 추이",  "pass": true,  "value": null },
        "earnings2":  { "label": "${e2Label}",         "pass": false, "value": null },
        "earnings3":  { "label": "매출 성장 우상향",   "pass": true,  "value": null },
        "supply1":    { "label": "기관/외국인 순매수", "pass": false, "value": null },
        "supply2":    { "label": "거래량 급증+횡보",   "pass": false, "value": null },
        "quality1":   { "label": "업황 턴어라운드",    "pass": true,  "value": null },
        "quality2":   { "label": "${q2Label}",         "pass": false, "value": null },
        "quality3":   { "label": "정책수혜/숨은자산",  "pass": false, "value": null }
      },
      "criteriaCount": 7,
      "reason": "핵심 투자 포인트 2~3문장 (한국어)",
      "risk": "Low",
      "analystConsensus": { "rating": "매수", "targetPrice": "...", "firm": "...", "upside": "+N%" },
      "supportingNews": [{ "headline": "...", "date": "${today}" }]
    }
  ]
}`;

    // ── compound-beta 우선, 실패 시 qwen3/llama fallback ─────────────
    const models = mkt === "KR"
      ? ["compound-beta", "qwen/qwen3-32b", "llama-3.3-70b-versatile"]
      : ["compound-beta", "llama-3.3-70b-versatile", "qwen/qwen3-32b"];

    const rawText = await callGroq(groqKey, [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ], models);

    let result: any;
    try {
      result = extractJSON(rawText);
    } catch {
      // 마지막 시도: 빈 JSON 파싱
      result = {};
    }

    // picks가 없으면 빈 결과 반환 (500 대신 200으로 처리)
    if (!Array.isArray(result?.picks) || result.picks.length === 0) {
      return new Response(JSON.stringify({
        market: mkt,
        analysisDate: today,
        updatedAt: new Date().toISOString(),
        marketContext: "현재 분석 데이터를 가져오는 데 실패했습니다. 잠시 후 새로고침 해주세요.",
        picks: [],
        totalCriteria: totalCrit,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 현재가 enrichment (KIS / Finnhub) ────────────────────────────
    if (mkt === "KR") {
      const appKey    = Deno.env.get("KIS_APP_KEY");
      const appSecret = Deno.env.get("KIS_APP_SECRET");
      if (appKey && appSecret) {
        try {
          const accessToken = await getKisToken(appKey, appSecret);
          const priceResults = await Promise.allSettled(
            result.picks.map((p: any) => fetchKrPrice(p.ticker, accessToken, appKey, appSecret)),
          );
          result.picks = result.picks.map((p: any, i: number) => {
            const r = priceResults[i];
            const q = r.status === "fulfilled" ? r.value : null;
            return q ? { ...p, currentPrice: q.price, changePercent: q.changePercent } : p;
          });
        } catch { /* KIS 실패 시 가격 없이 진행 */ }
      }
    } else if (finnhubKey) {
      const priceResults = await Promise.allSettled(
        result.picks.map((p: any) => fetchUsPrice(p.ticker, finnhubKey)),
      );
      result.picks = result.picks.map((p: any, i: number) => {
        const r = priceResults[i];
        const q = r.status === "fulfilled" ? r.value : null;
        return q ? { ...p, currentPrice: q.price, changePercent: q.changePercent } : p;
      });

      // Finnhub 공식 애널리스트 컨센서스 보강
      const consensusResults = await Promise.allSettled(
        result.picks.map((p: any) => fetchFinnhubConsensus(p.ticker, finnhubKey)),
      );
      result.picks = result.picks.map((p: any, i: number) => {
        const r = consensusResults[i];
        const c = r.status === "fulfilled" ? r.value : null;
        if (!c) return p;
        return {
          ...p,
          analystConsensus: {
            ...p.analystConsensus,
            rating:     p.analystConsensus?.rating || c.rating,
            buyCount:   c.buyCount,
            totalCount: c.totalCount,
            period:     c.period,
          },
        };
      });
    }

    // ── criteriaCount 재계산 + 정렬 ────────────────────────────────────
    result.picks = result.picks
      .map((p: any) => ({
        ...p,
        criteriaCount: Object.values(p.criteria || {}).filter((c: any) => c?.pass === true).length,
      }))
      .sort((a: any, b: any) => (b.criteriaCount ?? 0) - (a.criteriaCount ?? 0))
      .slice(0, 8)
      .map((p: any, i: number) => ({ ...p, rank: i + 1 }));

    result.market        = mkt;
    result.analysisDate  = today;
    result.updatedAt     = new Date().toISOString();
    result.totalCriteria = totalCrit;

    // ── 캐시 저장 ─────────────────────────────────────────────────────
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/stock_quote_cache`, {
        method: "POST",
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
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
