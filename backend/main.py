from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
import httpx
import os
from dotenv import load_dotenv
from typing import Dict, Any, List, Optional
from json.decoder import JSONDecodeError
import json
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import re
import pandas as pd
import joblib
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()

# API Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL_NAME = os.getenv("OPENAI_MODEL_NAME")
API_BASE_URL = "https://litellm.deriv.ai/v1"
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

# Constants
MAX_CHUNK_SIZE = 400  # Further reduced chunk size for faster processing
DEFAULT_TIMEOUT = 30.0
MAX_TIMEOUT = 55.0  # Maximum allowed timeout
MAX_RETRIES = 3
DELAY_BETWEEN_CHUNKS = 0.5  # Reduced delay

# Additional headers for API requests
API_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "User-Agent": "ComplyRadar/1.0",
    "Accept": "application/json",
    "Connection": "keep-alive"
}

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,
)

# Load the model
model_path = os.path.join(os.path.dirname(__file__), 'rf_model.joblib')
rf_model = joblib.load(model_path)

# Store upload timestamps for rate limiting (in-memory for local development)
upload_history = {}

class AnalyzeRequest(BaseModel):
    technicalProcess: str
    timeout: float = DEFAULT_TIMEOUT  # Optional timeout parameter
    
    class Config:
        max_length = 4000

    @validator('timeout')
    def validate_timeout(cls, v):
        if v < 1 or v > MAX_TIMEOUT:
            return DEFAULT_TIMEOUT
        return v

class PolicySearchRequest(BaseModel):
    query: str
    domains: List[str]
    
    class Config:
        max_length = 1000

    @validator('domains')
    def validate_domains(cls, v):
        if not v:
            raise ValueError("At least one domain must be specified")
        return v

class SentinelResponse(BaseModel):
    status: str
    message: str
    type: Optional[str] = None

def is_cloudflare_challenge(response_text: str) -> bool:
    """Check if the response is a Cloudflare challenge page."""
    return any(indicator in response_text.lower() for indicator in [
        "attention required! | cloudflare",
        "please turn javascript on",
        "please enable cookies",
        "ray id:",
        "cdn-cgi"
    ])

def should_retry_error(exception: Exception) -> bool:
    """Determine if we should retry based on the exception."""
    if isinstance(exception, HTTPException):
        return exception.status_code in [429, 503, 502, 500]
    if isinstance(exception, httpx.HTTPError):
        return True
    return False

def split_into_chunks(text: str, max_length: int = MAX_CHUNK_SIZE) -> List[str]:
    """Split text into chunks at logical boundaries."""
    # Clean and normalize the text
    text = text.replace('\n', ' ').strip()
    
    # Split by common delimiters
    delimiters = r'(?<=[.!?])\s+|\.\s+|\?\s+|\!\s+|;\s+|\n+|\. |\? |\! '
    sentences = re.split(delimiters, text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    chunks = []
    current_chunk = []
    current_length = 0
    
    for sentence in sentences:
        sentence_length = len(sentence)
        
        # If a single sentence is too long, split it further
        if sentence_length > max_length:
            words = sentence.split()
            temp_chunk = []
            temp_length = 0
            
            for word in words:
                word_length = len(word) + 1  # +1 for space
                if temp_length + word_length > max_length:
                    if temp_chunk:
                        chunks.append(' '.join(temp_chunk) + '.')
                    temp_chunk = [word]
                    temp_length = word_length
                else:
                    temp_chunk.append(word)
                    temp_length += word_length
            
            if temp_chunk:
                chunks.append(' '.join(temp_chunk) + '.')
            continue
        
        # For normal sentences
        if current_length + sentence_length > max_length:
            if current_chunk:
                chunks.append(' '.join(current_chunk) + '.')
            current_chunk = [sentence]
            current_length = sentence_length
        else:
            current_chunk.append(sentence)
            current_length += sentence_length
    
    # Add the last chunk
    if current_chunk:
        chunks.append(' '.join(current_chunk) + '.')
    
    return chunks

@retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=2, max=4),
    retry=retry_if_exception_type((httpx.HTTPError, HTTPException))
)
async def make_api_request(client: httpx.AsyncClient, url: str, method: str, headers: Dict[str, str], json_data: Dict[str, Any]) -> httpx.Response:
    try:
        request_headers = {**API_HEADERS, **headers}
        response = await client.request(
            method,
            url,
            headers=request_headers,
            json=json_data,
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True
        )
        
        if response.status_code in [403, 503] and is_cloudflare_challenge(response.text):
            raise HTTPException(
                status_code=503,
                detail="API access is temporarily restricted. Please try again in a few minutes."
            )
            
        response.raise_for_status()
        return response
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Request timed out. The system is processing a high volume of requests."
        )
    except httpx.HTTPStatusError as e:
        error_detail = handle_http_error(e)
        raise HTTPException(
            status_code=e.response.status_code,
            detail=error_detail
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Service temporarily unavailable. Please try again later."
        )

def handle_http_error(e: httpx.HTTPStatusError) -> str:
    try:
        error_response = e.response.json()
        if isinstance(error_response, dict):
            if "error" in error_response and isinstance(error_response["error"], dict):
                error_msg = error_response["error"].get("message", "Unknown error")
                if "Authentication Error" in error_msg:
                    raise HTTPException(
                        status_code=401,
                        detail="API authentication failed. Please check your API key configuration."
                    )
                return f"API Error: {error_msg}"
    except JSONDecodeError:
        if is_cloudflare_challenge(e.response.text):
            return "API access is temporarily restricted. Please try again in a few minutes."
    return "The API service is currently unavailable. Please try again later."

async def process_chunk(
    client: httpx.AsyncClient,
    chunk: str,
    chunk_index: int,
    total_chunks: int,
    timeout: float
) -> Dict[str, Any]:
    """Process a single chunk of text with timeout."""
    system_prompt = """You are a compliance expert. Analyze the technical process and identify key regulations. Be concise and focused."""

    context = f"Part {chunk_index + 1}/{total_chunks}"
    
    user_prompt = f"""Analyze this process segment for compliance requirements:
Context: {context}
Process: {chunk}

Provide brief:
1. Key regulations (priority)
2. Technical requirements
3. Next steps"""

    try:
        openai_response = await make_api_request(
            client,
            f"{API_BASE_URL}/chat/completions",
            "POST",
            headers={},
            json_data={
                "model": OPENAI_MODEL_NAME,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 400,  # Reduced token limit
                "timeout": timeout
            }
        )
        
        openai_data = openai_response.json()
        return {
            "chunk_index": chunk_index,
            "analysis": openai_data["choices"][0]["message"]["content"]
        }
    except Exception as e:
        print(f"Error processing chunk {chunk_index + 1}: {str(e)}")
        raise

@app.post("/api/analyze")
async def analyze_compliance(request: AnalyzeRequest):
    if not all([OPENAI_API_KEY, OPENAI_MODEL_NAME]):
        raise HTTPException(
            status_code=500,
            detail="API configuration error: Missing required API keys or model name"
        )

    if len(request.technicalProcess) > 4000:
        raise HTTPException(
            status_code=400,
            detail="Technical process description is too long. Please limit to 4000 characters."
        )

    try:
        transport = httpx.AsyncHTTPTransport(retries=3)
        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
        
        async with httpx.AsyncClient(
            timeout=request.timeout,
            transport=transport,
            limits=limits,
            http2=True
        ) as client:
            # Optimize text before chunking
            text = request.technicalProcess.replace('\n', ' ').strip()
            text = re.sub(r'\s+', ' ', text)  # Remove extra whitespace
            
            # Split into smaller chunks
            process_chunks = split_into_chunks(text, MAX_CHUNK_SIZE)
            total_chunks = len(process_chunks)
            
            if total_chunks > 1:
                # Process chunks concurrently with semaphore to control concurrency
                sem = asyncio.Semaphore(3)  # Limit concurrent processing
                
                async def process_with_semaphore(chunk, index):
                    async with sem:
                        return await process_chunk(client, chunk, index, total_chunks, request.timeout)
                
                tasks = [
                    process_with_semaphore(chunk, i)
                    for i, chunk in enumerate(process_chunks)
                ]
                
                # Gather results with timeout
                try:
                    chunk_results = await asyncio.gather(*tasks)
                    chunk_results.sort(key=lambda x: x["chunk_index"])
                    all_analyses = [result["analysis"] for result in chunk_results]
                except asyncio.TimeoutError:
                    raise HTTPException(
                        status_code=504,
                        detail="Analysis took too long. Please break down your description into smaller, more focused parts."
                    )
            else:
                # Single chunk processing
                result = await process_chunk(client, process_chunks[0], 0, 1, request.timeout)
                all_analyses = [result["analysis"]]

            if not all_analyses:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to analyze the technical process. Please try again."
                )

            # Combine and parse results
            combined_analysis = "\n\n".join(all_analyses)
            parsed_response = parse_compliance_analysis(combined_analysis)
            
            return {
                "summary": parsed_response
            }

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        if isinstance(e, asyncio.TimeoutError):
            raise HTTPException(
                status_code=504,
                detail="Analysis timeout. Please try with a shorter or more focused description."
            )
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

def parse_compliance_analysis(analysis: str) -> Dict[str, Any]:
    """Parse the LLM response into structured format."""
    # Initialize the structure
    result = {
        "regulations": [],
        "technicalRequirements": [],
        "nextSteps": []
    }
    
    # Split the analysis into sections
    sections = analysis.split("\n\n")
    current_section = None
    current_regulation = None
    
    for section in sections:
        lines = section.strip().split("\n")
        for line in lines:
            line = line.strip()
            
            # Skip empty lines
            if not line:
                continue
                
            # Check for section headers
            if "Technical Requirements:" in line or "Technical Implementation:" in line:
                current_section = "technical"
                continue
            elif "Next Steps:" in line or "Recommended Steps:" in line:
                current_section = "steps"
                continue
            
            # Process regulations
            if any(reg in line for reg in ["GDPR", "CCPA", "HIPAA", "PCI DSS", "SOC 2", "ISO"]):
                # Start a new regulation entry
                if current_regulation:
                    result["regulations"].append(current_regulation)
                
                # Initialize new regulation
                current_regulation = {
                    "name": line.split(":")[0].strip(),
                    "relevance": "",
                    "requirements": [],
                    "priority": determine_priority(line)
                }
                
                # Add description if present
                if ":" in line:
                    current_regulation["relevance"] = line.split(":", 1)[1].strip()
                
                continue
            
            # Add items to appropriate sections
            if current_section == "technical" and line.strip("- "):
                result["technicalRequirements"].append(line.strip("- "))
            elif current_section == "steps" and line.strip("- "):
                result["nextSteps"].append(line.strip("- "))
            elif current_regulation and line.strip("- "):
                if not current_regulation["relevance"] and ":" in line:
                    current_regulation["relevance"] = line.split(":", 1)[1].strip()
                else:
                    current_regulation["requirements"].append(line.strip("- "))
    
    # Add the last regulation if exists
    if current_regulation:
        result["regulations"].append(current_regulation)
    
    return result

def determine_priority(text: str) -> str:
    """Determine priority level from text."""
    text_lower = text.lower()
    if any(word in text_lower for word in ["critical", "high priority", "urgent", "immediate"]):
        return "high"
    elif any(word in text_lower for word in ["moderate", "medium priority", "important"]):
        return "medium"
    return "low"

@app.post("/api/search-policies")
async def search_policies(request: PolicySearchRequest):
    """Search for relevant policy documents from specified domains."""
    if not TAVILY_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Tavily API key not configured"
        )

    try:
        # Build domain-specific query parts
        domain_queries = []
        for domain in request.domains:
            if domain.startswith("."):
                domain_queries.append(f"site:{domain[1:]}")
            else:
                domain_queries.append(f"site:.{domain}")
        
        domain_filter = " OR ".join(domain_queries)
        search_query = f"({request.query}) ({domain_filter})"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {TAVILY_API_KEY}"
                },
                json={
                    "query": search_query,
                    "search_depth": "advanced",
                    "max_results": 10,
                    "filter_language": "en",
                    "include_answer": False,
                    "include_raw_content": False,
                    "include_domains": request.domains,
                    "exclude_domains": [],
                    "search_type": "keyword"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Failed to fetch policy information"
                )
            
            data = response.json()
            
            # Extract and format relevant results
            results = []
            seen_urls = set()  # To prevent duplicate results
            
            for result in data.get("results", []):
                url = result.get("url")
                if url and url not in seen_urls and result.get("title"):
                    seen_urls.add(url)
                    domain = extract_domain(url)
                    category = categorize_domain(domain, request.domains)
                    
                    results.append({
                        "title": result["title"],
                        "url": url,
                        "snippet": result.get("snippet", ""),
                        "relevance_score": result.get("score", 0),
                        "domain": domain,
                        "category": category
                    })
            
            # Sort by relevance score
            results.sort(key=lambda x: x["relevance_score"], reverse=True)
            
            return {
                "policies": results,
                "query": request.query,
                "domains": request.domains
            }

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Request timed out while searching for policies"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to search for policies: {str(e)}"
        )

def extract_domain(url: str) -> str:
    """Extract the main domain from a URL."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.netloc
    except:
        return url

def categorize_domain(domain: str, search_domains: List[str]) -> str:
    """Categorize a domain based on the search domains."""
    domain_lower = domain.lower()
    
    if any(d in domain_lower for d in ["europa.eu", "ec.europa.eu", "edpb.europa.eu"]):
        return "EU Domain"
    elif any(d in domain_lower for d in ["gov", "government"]):
        return "Government Domain"
    elif any(d in domain_lower for d in ["int", "un.org", "who.int"]):
        return "International Organization"
    elif domain_lower.endswith(".org"):
        return "Non-Profit Organization"
    else:
        return "Other"

def analyze_traffic_data(data: List[float]) -> SentinelResponse:
    """Analyze traffic data using the random forest model."""
    try:
        # Define the column names as per model's training data
        columns = ['sbytes', 'rate', 'sttl', 'dttl', 'sload', 'dload', 'smean', 'ct_state_ttl', 'ct_dst_src_ltm', 'ct_srv_dst']
        
        # Convert input to DataFrame
        input_df = pd.DataFrame([data], columns=columns)
        
        # Make prediction
        prediction = rf_model.predict(input_df)[0]
        print(f"Debug - Raw prediction value: {prediction}")  # Debug log
        
        # Map prediction to response
        if prediction == 0:  # Normal traffic
            return SentinelResponse(
                status="clean",
                message="No threats detected in the traffic data.",
                type=None
            )
        else:
            # Updated attack type mapping based on common network attack categories
            attack_types = {
                1: "DoS Attack",  # Denial of Service
                2: "Probe Attack",  # Network Probe/Port Scan
                3: "Remote Access Attack",  # Remote-to-Local
                4: "Privilege Escalation Attack",  # User-to-Root
                5: "Data Exfiltration Attack",
                6: "Brute Force Attack",
                7: "Man-in-the-Middle Attack"
            }
            
            attack_type = attack_types.get(prediction, f"Unknown Attack (Type {prediction})")
            message = get_attack_description(attack_type)
            
            return SentinelResponse(
                status="malicious",
                message=message,
                type=attack_type
            )
    except Exception as e:
        print(f"Debug - Error in analysis: {str(e)}")  # Debug log
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing traffic data: {str(e)}"
        )

def get_attack_description(attack_type: str) -> str:
    """Get a detailed description for each attack type."""
    descriptions = {
        "DoS Attack": "Detected a potential Denial of Service attack pattern. High volume of traffic attempting to overwhelm system resources.",
        "Probe Attack": "Detected network probe activity. Possible port scanning or network mapping attempt.",
        "Remote Access Attack": "Detected suspicious remote access attempt. Possible unauthorized access to system resources.",
        "Privilege Escalation Attack": "Detected potential privilege escalation attempt. Possible unauthorized elevation of system access.",
        "Data Exfiltration Attack": "Detected unusual data transfer patterns. Possible unauthorized data extraction attempt.",
        "Brute Force Attack": "Detected repeated access attempts. Possible brute force attack on authentication.",
        "Man-in-the-Middle Attack": "Detected suspicious traffic interception patterns. Possible man-in-the-middle attack."
    }
    return descriptions.get(attack_type, "Potential security threat detected with unusual traffic pattern.")

@app.post("/api/sentinel/analyze")
async def analyze_traffic(
    file: UploadFile = File(...),
    username: str = Form(None)
):
    """Endpoint to analyze network traffic data for security threats."""
    
    # Check file size (5MB limit for example)
    if file.size > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File size too large. Please upload a file smaller than 5MB."
        )
    
    # Rate limiting (1 upload per minute per user/IP)
    client_id = username or "anonymous"
    current_time = datetime.now()
    
    if client_id in upload_history:
        last_upload = upload_history[client_id]
        if current_time - last_upload < timedelta(minutes=1):
            raise HTTPException(
                status_code=429,
                detail="Please wait a minute before uploading another file."
            )
    
    upload_history[client_id] = current_time
    
    try:
        # Read file content
        content = await file.read()
        
        try:
            # Try to parse as JSON
            data = json.loads(content)
            if not isinstance(data, list) or len(data) != 10:
                raise ValueError("Invalid data format")
            
            # Convert all values to float
            traffic_data = [float(x) for x in data]
            
        except (json.JSONDecodeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="Invalid file format. Please upload a JSON file with the correct traffic data format."
            )
        
        # Analyze the traffic data
        result = analyze_traffic_data(traffic_data)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing file: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    # Configure Uvicorn with increased timeout
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_keep_alive=60) 