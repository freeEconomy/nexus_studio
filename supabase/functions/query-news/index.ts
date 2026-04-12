import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query, messages } = await req.json();

    // Use the latest user message as the search term if query not provided
    const searchTerm = query || (messages?.length ? messages[messages.length - 1].content : "");

    if (!searchTerm) {
      return new Response(
        JSON.stringify({ error: "query or messages is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const newsApiKey = Deno.env.get("NEWS_API_KEY");
    if (!newsApiKey) throw new Error("NEWS_API_KEY not set");

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
      searchTerm,
    )}&pageSize=5&apiKey=${newsApiKey}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`News API error: ${errText}`);
    }

    const data = await response.json();

    // Format the news results
    const articles = data.articles || [];
    const result = articles
      .map(
        (a: { title: string; url: string; source: { name: string } }) =>
          `- ${a.title} (${a.source.name})\n  ${a.url}`,
      )
      .join("\n\n") || "No news articles found.";

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});