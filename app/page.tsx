"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { HeroSection } from "@/components/blocks/hero-section";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ShieldCheck, Shield } from "lucide-react";

interface ComplianceResult {
  summary: {
    regulations: {
      name: string;
      relevance: string;
      requirements: string[];
      priority: "high" | "medium" | "low";
    }[];
    technicalRequirements: string[];
    nextSteps: string[];
  };
}

interface ErrorResponse {
  detail: string;
}

interface PolicyResult {
  title: string;
  url: string;
  snippet: string;
  relevance_score: number;
}

interface PolicySearchResponse {
  policies: PolicyResult[];
  query: string;
}

interface DomainOption {
  id: string;
  label: string;
  domains: string[];
}

const DOMAIN_OPTIONS: DomainOption[] = [
  {
    id: "eu",
    label: "EU Domains",
    domains: ["europa.eu", "edpb.europa.eu", "ec.europa.eu", "enisa.europa.eu"]
  },
  {
    id: "gov",
    label: "Government Domains",
    domains: ["gov", "gov.uk", "bundesregierung.de", "gouvernement.fr"]
  },
  {
    id: "int",
    label: "International Organizations",
    domains: ["int", "who.int", "un.org", "oecd.org", "wto.org"]
  },
  {
    id: "org",
    label: "Non-Profit Organizations",
    domains: ["iso.org", "iapp.org", "privacyinternational.org", "epic.org"]
  }
];

export default function Home() {
  const [technicalProcess, setTechnicalProcess] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ComplianceResult | null>(null);
  const [policyResults, setPolicyResults] = useState<PolicyResult[]>([]);
  const [error, setError] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("Analyzing...");
  const [progress, setProgress] = useState(0);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set(["eu"]));

  const getErrorMessage = (status: number, detail: string) => {
    switch (status) {
      case 401:
        return "Authentication failed. Please try again later or contact support.";
      case 400:
        return detail || "Please check your input and try again.";
      case 504:
        return "The analysis is taking longer than expected. Please try breaking your description into smaller, focused parts.";
      case 503:
        return "The service is temporarily busy. Please wait a moment and try again.";
      case 500:
        if (detail.includes("API configuration")) {
          return "System configuration error. Please contact support.";
        }
        if (detail.includes("rate limit")) {
          return "Too many requests. Please wait a moment and try again.";
        }
        return detail || "An unexpected error occurred. Please try again.";
      default:
        return detail || "An error occurred while analyzing compliance requirements. Please try again.";
    }
  };

  const handleAnalyze = async () => {
    const processText = technicalProcess.trim();
    
    if (!processText) {
      setError("Please describe your technical processes");
      return;
    }

    if (processText.length > 4000) {
      setError("Process description is too long. Please limit to 4000 characters and try to be more focused.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResults(null);
      setProgress(0);
      setLoadingMessage("Initializing analysis...");
      
      // Estimate progress steps
      const totalSteps = Math.ceil(processText.length / 500);
      const progressIncrement = 100 / (totalSteps + 1);
      
      // Set up timeout for the fetch request - increased to 60 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      try {
        setLoadingMessage("Analyzing your technical processes...");
        setProgress(progressIncrement);
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            technicalProcess: processText,
            timeout: 55 // Send timeout preference to backend
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        setProgress(90);

        const data = await response.json();
        setProgress(100);

        if (!response.ok) {
          const errorData = data as ErrorResponse;
          throw new Error(getErrorMessage(response.status, errorData.detail));
        }

        setResults(data as ComplianceResult);
      } catch (fetchError) {
        if (fetchError instanceof Error) {
          if (fetchError.name === "AbortError") {
            setShowGuidelines(true);
            // Instead of throwing error, set it directly
            setError(
              "Your process description might be too complex. Try these tips:\n" +
              "1. Break your description into smaller parts (focus on one system/process at a time)\n" +
              "2. Be more specific about what you want to analyze\n" +
              "3. Remove any unnecessary technical details\n\n" +
              "Example: Instead of describing your entire system, focus on specific aspects like:\n" +
              "- How you handle user data\n" +
              "- Your payment processing system\n" +
              "- Your data storage practices"
            );
            return; // Prevent further error propagation
          }
          setError(fetchError.message);
          return;
        }
        setError("Failed to connect to the analysis service. Please try again.");
      }
    } catch (error) {
      console.error("Error details:", error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Failed to connect to the server. Please check your internet connection and try again.");
      }
    } finally {
      setLoading(false);
      setLoadingMessage("Analyzing...");
      setProgress(0);
    }
  };

  const handleSearch = async () => {
    const processText = technicalProcess.trim();
    
    if (!processText) {
      setError("Please describe your technical processes");
      return;
    }

    if (selectedDomains.size === 0) {
      setError("Please select at least one domain category to search");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setPolicyResults([]);
      setProgress(0);
      setLoadingMessage("Searching for relevant policies...");
      
      // Get all domains from selected categories
      const selectedDomainsList = Array.from(selectedDomains)
        .map(id => DOMAIN_OPTIONS.find(opt => opt.id === id)?.domains || [])
        .flat();

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search-policies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          query: processText,
          domains: selectedDomainsList
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as ErrorResponse;
        throw new Error(getErrorMessage(response.status, errorData.detail));
      }

      const searchResponse = data as PolicySearchResponse;
      setPolicyResults(searchResponse.policies);

    } catch (error) {
      console.error("Error details:", error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Failed to search for policies. Please try again.");
      }
    } finally {
      setLoading(false);
      setLoadingMessage("Analyzing...");
      setProgress(0);
    }
  };

  const toggleDomain = (domainId: string) => {
    setSelectedDomains(prev => {
      const newSet = new Set(prev);
      if (newSet.has(domainId)) {
        newSet.delete(domainId);
      } else {
        newSet.add(domainId);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen">
      <HeroSection
        title="Security & Compliance Platform"
        description="Powerful tools for security analysis and compliance management"
        actions={[
          {
            text: "Try Sentinel Comply",
            href: "#analysis",
            icon: <Shield className="h-5 w-5" />,
            variant: "default"
          },
          {
            text: "Try Sentinel Prime",
            href: "/sentinel-prime",
            icon: <Shield className="h-5 w-5" />,
            variant: "outline"
          }
        ]}
        image={{
          light: "/hero-light.png",
          dark: "/hero-dark.png",
          alt: "Sentinel Platform Interface"
        }}
      />

      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Sentinel Comply Card */}
          <Card>
            <CardHeader>
              <CardTitle>Sentinel Comply</CardTitle>
              <CardDescription>
                AI-powered compliance analysis for your technical processes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Automated compliance requirement analysis</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Policy search across official sources</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Detailed compliance recommendations</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Sentinel Prime Card */}
          <Card>
            <CardHeader>
              <CardTitle>Sentinel Prime</CardTitle>
              <CardDescription>
                Advanced threat detection and network security analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Real-time network traffic analysis</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>AI-powered threat detection</span>
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Detailed attack pattern recognition</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <main className="space-y-8 p-8 max-w-4xl mx-auto">
        {/* Input Guidelines */}
        {showGuidelines && (
          <Card>
            <CardHeader>
              <CardTitle>Writing Guidelines</CardTitle>
              <CardDescription>
                Follow these tips for better analysis results:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-disc pl-4 space-y-2">
                <li>Focus on one process or aspect at a time</li>
                <li>Be specific about data handling and storage</li>
                <li>Mention specific technologies and services used</li>
                <li>Include relevant security measures</li>
                <li>Describe user data collection methods</li>
              </ul>
              <Button 
                variant="outline" 
                onClick={() => setShowGuidelines(false)}
                className="w-full"
              >
                Hide Guidelines
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Sentinel Comply Analysis</CardTitle>
            <CardDescription>
              Describe your technical process to find relevant compliance requirements.
              For best results, focus on one aspect at a time.
              <Button 
                variant="link" 
                onClick={() => setShowGuidelines(!showGuidelines)}
                className="p-0 h-auto font-normal text-blue-500 hover:text-blue-700"
              >
                View writing guidelines
              </Button>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea 
                placeholder="Example: We collect user email addresses and store them in AWS EU servers..." 
                className="min-h-[150px]"
                value={technicalProcess}
                onChange={(e) => setTechnicalProcess(e.target.value)}
                maxLength={4000}
              />
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <p>Be specific and focused for better results</p>
                <p className={technicalProcess.length > 3500 ? "text-yellow-600" : ""}>
                  {technicalProcess.length}/4000 characters
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <span>Select Domains</span>
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuLabel>Domain Categories</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {DOMAIN_OPTIONS.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.id}
                        checked={selectedDomains.has(option.id)}
                        onCheckedChange={() => toggleDomain(option.id)}
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(selectedDomains).map(id => {
                  const option = DOMAIN_OPTIONS.find(opt => opt.id === id);
                  return option ? (
                    <div
                      key={id}
                      className="bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm flex items-center gap-1"
                    >
                      {option.label}
                      <button
                        onClick={() => toggleDomain(id)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
              <Button 
                onClick={handleSearch}
                disabled={loading || selectedDomains.size === 0}
                className="w-full"
              >
                {loading ? loadingMessage : "Search Relevant Policies"}
              </Button>
              {loading && progress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Policy Results Section */}
        {policyResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Relevant EU Policies</CardTitle>
              <CardDescription>
                Found {policyResults.length} relevant policy documents from official EU sources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                {policyResults.map((policy, index) => (
                  <Card key={index}>
                    <CardContent className="pt-6">
                      <div className="space-y-2">
                        <h4 className="font-semibold">
                          <a 
                            href={policy.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {policy.title}
                          </a>
                        </h4>
                        <p className="text-sm text-muted-foreground">{policy.snippet}</p>
                        <p className="text-xs text-muted-foreground">
                          Source: {new URL(policy.url).hostname}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        {(loading || results) && (
          <Card>
            <CardHeader>
              <CardTitle>Compliance Requirements Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : results && (
                <div className="space-y-8">
                  {/* Applicable Regulations */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Applicable Regulations</h3>
                    <div className="grid gap-4">
                      {results.summary.regulations.map((reg, index) => (
                        <Card key={index}>
                          <CardContent className="pt-6">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-semibold">{reg.name}</h4>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                reg.priority === "high" 
                                  ? "bg-red-100 text-red-800" 
                                  : reg.priority === "medium"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-green-100 text-green-800"
                              }`}>
                                {reg.priority.charAt(0).toUpperCase() + reg.priority.slice(1)} Priority
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{reg.relevance}</p>
                            <ul className="list-disc pl-4 space-y-1">
                              {reg.requirements.map((req, reqIndex) => (
                                <li key={reqIndex} className="text-sm">{req}</li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Technical Requirements */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Technical Requirements</h3>
                    <ul className="list-disc pl-4 space-y-2">
                      {results.summary.technicalRequirements.map((req, index) => (
                        <li key={index}>{req}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Next Steps */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Recommended Next Steps</h3>
                    <ul className="list-disc pl-4 space-y-2">
                      {results.summary.nextSteps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Disclaimer */}
        <Alert>
          <AlertDescription className="text-sm text-muted-foreground">
            Disclaimer: This tool provides automated compliance requirement analysis based on your technical processes. 
            The results are for guidance only and should not be considered as legal advice. 
            Always consult with legal professionals to ensure complete compliance with all applicable regulations.
          </AlertDescription>
        </Alert>
      </main>
    </div>
  );
}
