import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const JIRA_HOST = Deno.env.get("JIRA_HOST") || "https://jira.tde.sktelecom.com"
const JIRA_TOKEN = Deno.env.get("JIRA_TOKEN")

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { issueKey, jql, maxResults = 50 } = await req.json()

    if (!issueKey && !jql) {
      // issueKey나 jql 둘 중 하나는 필수
      return new Response(
        JSON.stringify({ error: "issueKey or jql is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!JIRA_TOKEN) {
      return new Response(
        JSON.stringify({ error: "JIRA_TOKEN is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 1. JQL 검색 모드
    if (jql) {
      console.log(`Searching Jira with JQL: ${jql}`)
      const response = await fetch(`${JIRA_HOST}/rest/api/2/search`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${JIRA_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql,
          maxResults,
          fields: ["summary", "status", "assignee", "updated", "priority"]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        return new Response(
          JSON.stringify({ error: `Jira Search API error: ${response.status}`, details: errorText }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const data = await response.json()
      const issues = data.issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName || "Unassigned",
        priority: issue.fields.priority?.name,
        url: `${JIRA_HOST}/browse/${issue.key}`,
        updated: issue.fields.updated
      }))

      return new Response(
        JSON.stringify({ issues }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. 단일 이슈 조회 모드 (기존 호환성 유지)
    console.log(`Fetching Jira issue: ${issueKey}`)
    const response = await fetch(`${JIRA_HOST}/rest/api/2/issue/${issueKey}`, {
      headers: {
        "Authorization": `Bearer ${JIRA_TOKEN}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Jira API error: ${response.status}`, errorText)
      return new Response(
        JSON.stringify({ error: `Jira API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const data = await response.json()
    const result = {
      key: data.key,
      summary: data.fields.summary,
      status: data.fields.status.name,
      assignee: data.fields.assignee?.displayName || "Unassigned",
      priority: data.fields.priority?.name,
      url: `${JIRA_HOST}/browse/${data.key}`,
      updated: data.fields.updated
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error(`Internal error: ${error.message}`)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
