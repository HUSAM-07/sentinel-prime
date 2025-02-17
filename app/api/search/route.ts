import { NextResponse } from "next/server";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME;
const API_BASE_URL = "https://litellm.deriv.ai/v1";

interface SearchRequest {
  query: string;
}

export async function POST(request: Request) {
  if (!TAVILY_API_KEY || !OPENAI_API_KEY || !OPENAI_MODEL_NAME) {
    return NextResponse.json(
      { error: "API keys or model name not configured" },
      { status: 500 }
    );
  }

  try {
    const body: SearchRequest = await request.json();
    const { query } = body;

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    // 1. Search for compliance information using Tavily
    const tavilyResponse = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query: `${query} GDPR compliance privacy policy site:.eu`,
        search_depth: "advanced",
        include_domains: ["europa.eu", "ico.org.uk"],
      }),
    });

    if (!tavilyResponse.ok) {
      throw new Error("Failed to fetch data from Tavily");
    }

    const tavilyData = await tavilyResponse.json();
    
    // 2. Analyze the results using LiteLLM
    const searchResults = tavilyData.results.map((result: any) => 
      `${result.title}\n${result.content}`
    ).join("\n\n");

    const openaiResponse = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL_NAME,
        messages: [
          {
            role: "system",
            content: "You are a compliance expert analyzing GDPR and privacy compliance information. Provide clear, concise summaries and actionable recommendations."
          },
          {
            role: "user",
            content: `Based on the following search results about ${query}, analyze its GDPR compliance status. Focus on key compliance signals, potential issues, and recommendations:\n\n${searchResults}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!openaiResponse.ok) {
      throw new Error("Failed to analyze data with LiteLLM");
    }

    const openaiData = await openaiResponse.json();
    const analysis = openaiData.choices[0].message.content;

    // 3. Parse the analysis into structured format
    const complianceStatus = determineComplianceStatus(analysis);
    const findings = extractFindings(analysis);
    const recommendations = extractRecommendations(analysis);

    return NextResponse.json({
      summary: {
        status: complianceStatus,
        findings,
        recommendations,
      },
    });

  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Failed to process compliance analysis" },
      { status: 500 }
    );
  }
}

function determineComplianceStatus(analysis: string): string {
  if (analysis.toLowerCase().includes("compliant") && !analysis.toLowerCase().includes("not compliant")) {
    return "Likely Compliant";
  } else if (analysis.toLowerCase().includes("not compliant") || analysis.toLowerCase().includes("non-compliant")) {
    return "Likely Non-Compliant";
  } else {
    return "Compliance Status Unclear";
  }
}

function extractFindings(analysis: string): string[] {
  const findings: string[] = [];
  const lines = analysis.split("\n");
  
  let inFindingsSection = false;
  for (const line of lines) {
    if (line.toLowerCase().includes("finding") || line.includes("•") || line.includes("-")) {
      inFindingsSection = true;
      const finding = line.replace(/^[•\-\s]+/, "").trim();
      if (finding && !finding.toLowerCase().includes("recommendation")) {
        findings.push(finding);
      }
    } else if (inFindingsSection && line.toLowerCase().includes("recommendation")) {
      break;
    }
  }

  return findings.length > 0 ? findings : ["No specific findings available"];
}

function extractRecommendations(analysis: string): string[] {
  const recommendations: string[] = [];
  const lines = analysis.split("\n");
  
  let inRecommendationsSection = false;
  for (const line of lines) {
    if (line.toLowerCase().includes("recommend") || line.includes("•") || line.includes("-")) {
      inRecommendationsSection = true;
      const recommendation = line.replace(/^[•\-\s]+/, "").trim();
      if (recommendation && !recommendation.toLowerCase().includes("finding")) {
        recommendations.push(recommendation);
      }
    }
  }

  return recommendations.length > 0 ? recommendations : ["No specific recommendations available"];
} 