"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Shield, Upload, AlertTriangle, FileText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Hero } from "@/components/ui/animated-hero";

export default function SentinelPrime() {
  const [file, setFile] = useState<File | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    status: "clean" | "malicious";
    type?: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (userName) {
        formData.append('username', userName);
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sentinel/analyze`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to analyze file');
      }

      setResult({
        status: data.status as "clean" | "malicious",
        type: data.type,
        message: data.message
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSampleFileSelect = async (sampleName: string) => {
    try {
      const response = await fetch(`/samples/${sampleName}`);
      if (!response.ok) throw new Error('Failed to load sample file');
      
      const blob = await response.blob();
      const file = new File([blob], sampleName, { type: 'application/json' });
      setFile(file);
    } catch (error) {
      setError('Failed to load sample file');
    }
  };

  return (
    <div className="min-h-screen">
      <Hero />

      <main className="max-w-4xl mx-auto px-4 py-16" id="scan-form">
        {/* Sample Data Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Sample Data</CardTitle>
            <CardDescription>
              Try these sample files to test different traffic patterns
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => handleSampleFileSelect('clean-traffic.json')}
              >
                <FileText className="w-4 h-4" />
                Clean Traffic
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => handleSampleFileSelect('dos-attack.json')}
              >
                <FileText className="w-4 h-4" />
                DoS Attack
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => handleSampleFileSelect('probe-attack.json')}
              >
                <FileText className="w-4 h-4" />
                Probe Attack
              </Button>
            </div>
            <Alert>
              <AlertTitle>Sample Data Format</AlertTitle>
              <AlertDescription>
                Each sample contains 10 network traffic metrics: source bytes, packet rate, TTL values, 
                load measurements, and connection statistics. View the samples in the 
                <a 
                  href="https://github.com/yourusername/comply-radar-prod/tree/main/public/samples" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 mx-1"
                >
                  samples directory
                </a>
                for more details.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security Analysis</CardTitle>
            <CardDescription>
              Upload your network traffic data for AI-powered threat detection.
              The file should be a JSON array containing 10 numeric values representing traffic metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name (Optional)</label>
                <Input
                  type="text"
                  placeholder="Enter your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Traffic Data File</label>
                <div className="mt-1">
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-4 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">
                          JSON file with traffic data metrics
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept=".json"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>
                {file && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Selected file: {file.name}
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleAnalyze}
                disabled={!file || loading}
              >
                {loading ? "Analyzing..." : "Analyze Traffic"}
              </Button>

              {error && (
                <div className="p-4 rounded-lg mt-4 bg-red-100 dark:bg-red-900/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {result && (
                <div className={`p-4 rounded-lg mt-4 ${
                  result.status === "clean" 
                    ? "bg-green-100 dark:bg-green-900/20" 
                    : "bg-red-100 dark:bg-red-900/20"
                }`}>
                  <div className="flex items-start gap-3">
                    {result.status === "clean" ? (
                      <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                    <div>
                      <h4 className={`font-medium ${
                        result.status === "clean"
                          ? "text-green-800 dark:text-green-200"
                          : "text-red-800 dark:text-red-200"
                      }`}>
                        {result.status === "clean" ? "Clean Traffic" : "Threat Detected"}
                      </h4>
                      <p className={`text-sm ${
                        result.status === "clean"
                          ? "text-green-700 dark:text-green-300"
                          : "text-red-700 dark:text-red-300"
                      }`}>
                        {result.message}
                      </p>
                      {result.type && (
                        <p className="text-sm font-medium mt-2">
                          Attack Type: {result.type}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
