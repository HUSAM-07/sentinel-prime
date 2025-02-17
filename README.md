# Sentinel Platform

Sentinel is a comprehensive security and compliance platform that combines two powerful tools: Sentinel Comply for compliance analysis and Sentinel Prime for threat detection.

## Features

### 1. Sentinel Comply
- AI-powered compliance analysis for technical processes
- Policy search across official sources (EU, Government, International Organizations)
- Automated compliance requirement identification
- Detailed recommendations and next steps
- Support for multiple regulatory frameworks (GDPR, CCPA, HIPAA, etc.)

### 2. Sentinel Prime
- Real-time network traffic analysis
- AI-powered threat detection
- Attack pattern recognition
- Support for multiple attack types:
  - DoS/DDoS attacks
  - Probe/Port scanning
  - Remote access attempts
  - Privilege escalation
  - Data exfiltration
  - Brute force attacks
  - Man-in-the-middle attacks

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: FastAPI, Python, scikit-learn
- **AI/ML**: OpenAI API, Custom Random Forest model
- **APIs**: Tavily API for policy search

## Prerequisites

- Node.js 18+ for frontend
- Python 3.9+ for backend
- pip (Python package manager)
- npm or yarn

## Setup Instructions



### 1. Frontend Setup
```bash
# Install dependencies
npm install
# or
yarn install

# Run development server
npm run dev
# or
yarn dev
```

### 2. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\\Scripts\\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Environment Configuration

Create two .env files:

1. Root directory `.env` for frontend:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

2. Backend directory `backend/.env`:
```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL_NAME=your_preferred_model
TAVILY_API_KEY=your_tavily_api_key
```

### 4. Start the Backend Server
```bash
# From the backend directory with venv activated
uvicorn main:app --reload
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## API Keys Required

1. **OpenAI API Key**
   - Required for: Compliance analysis
   - Get it from: https://platform.openai.com/api-keys

2. **Tavily API Key**
   - Required for: Policy search functionality
   - Get it from: https://tavily.com/api

## Usage Guide

### Sentinel Comply
1. Navigate to the home page
2. Enter your technical process description
3. Select relevant domains for policy search
4. Click "Search Relevant Policies"
5. Review compliance requirements and recommendations

### Sentinel Prime
1. Navigate to the Sentinel Prime page
2. Upload network traffic data in JSON format
3. Optional: Provide a username for rate limiting
4. Click "Analyze Traffic"
5. Review threat detection results

## Sample Data

The `public/samples` directory contains example traffic data files:
- `clean-traffic.json`: Normal network traffic pattern
- `dos-attack.json`: DoS attack pattern
- `probe-attack.json`: Network probe pattern

## API Documentation

### Backend Endpoints

1. **Compliance Analysis**
   - POST `/api/analyze`
   - Analyzes technical processes for compliance requirements

2. **Policy Search**
   - POST `/api/search-policies`
   - Searches for relevant compliance policies

3. **Threat Detection**
   - POST `/api/sentinel/analyze`
   - Analyzes network traffic for security threats

## Development

### Frontend Structure
- `app/page.tsx`: Main compliance analysis page
- `app/sentinel-prime/page.tsx`: Threat detection page
- `components/`: Reusable UI components
- `lib/`: Utility functions

### Backend Structure
- `main.py`: FastAPI application and endpoints
- `rf_model.joblib`: Pre-trained Random Forest model
- `requirements.txt`: Python dependencies

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - See LICENSE file for details

## Support

For support, please:
1. Check the documentation
2. Open an issue on GitHub
3. Contact support team

---

Built with ❤️ by husam, bhavya and keane
