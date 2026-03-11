# EcoPulse 🌱
**Intelligent Carbon Footprint Tracker & AI-Driven Sustainability Dashboard**

EcoPulse is a production-ready, full-stack web application designed to track, analyze, and optimize personal carbon emissions. It replaces manual logging with advanced Computer Vision (CV) data extraction, offers a gamified leaderboard experience, and employs machine learning to generate personalized, targeted sustainability insights.

---

## 🚀 Key Features

*   **Computer Vision Odometer Tracking:** Users can simply upload a picture of their vehicle's dashboard. Integrating with the **Google Gemini 2.0 Flash API**, EcoPulse extracts the odometer reading and automatically calculates the trip distance and emissions.
*   **AI-Powered Insights:** Employs K-Means Clustering and Random Forest Regression on the backend to classify users, forecast weekly emissions, and generate real-time, actionable, and token-efficient recommendations via Gemini.
*   **Gamification & Leaderboards:** A competitive ranking ecosystem with streaks, levels (e.g., "Eco Warrior"), and daily goals to incentivize sustainable behavior.
*   **Enterprise-Grade Scalability:** Fully migrated to **Supabase PostgreSQL** for distributed, cloud-ready data persistence. 
*   **MLOps CI/CD Pipeline:** Includes an automated evaluation pipeline (`evaluate.py`) running on **GitHub Actions** to prevent model degradation and test interpolation logic on Pull Requests.
*   **Progressive Web App (PWA):** Installable on mobile devices with local caching strategies and rich interactive UI/UX (glassmorphism, micro-animations).

---

## 🛠️ Tech Stack

**Frontend:**
*   React 19 + TypeScript
*   Vite (Build Tool)
*   Tailwind CSS (Styling & Dark Mode)
*   Recharts (Interactive Visualizations)
*   Supabase JS Client

**Backend (Machine Learning & Analytics):**
*   Python 3.12 + FastAPI
*   Supabase-py (PostgreSQL DB Driver)
*   Pandas & Scikit-learn (Data Interpolation, Clustering, RandomForest Regression)
*   Google GenAI SDK (Gemini Integration)
*   Uvicorn

---

## ⚙️ Local Development Setup

### 1. Configure Environment Variables
You will need API keys for Gemini and Supabase. Create a `.env.local` file in the root directory:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Machine Learning Backend Configuration
VITE_ML_ENABLED=true
VITE_ML_API_URL=http://localhost:8000/api
VITE_ML_API_KEY=your_secure_api_key

VITE_GEMINI_API_KEY=your_google_gemini_api_key
```

### 2. Start the React Frontend
```bash
npm install
npm run dev
```

### 3. Start the FastAPI ML Backend
```bash
cd backend
pip install -r requirements.txt
# Export your ML validation key to secure the endpoints locally
export ML_API_KEY=your_secure_api_key
uvicorn app:app --reload --port 8000
```

---

## 🌍 Production Deployment

### Frontend (Vercel / Netlify / Render)
1.  Connect your GitHub repository to your host.
2.  Set the Build Command to `npm run build` and Publish Directory to `dist`.
3.  Inject all `VITE_*` environment variables in the deployment dashboard.
4.  Ensure `VITE_ML_API_URL` points to your deployed Python backend URL.

### Backend (Render / Heroku)
1.  Deploy the `backend` directory.
2.  Set exactly two environment variables:
    *   `ML_API_KEY` (Must strictly match the `VITE_ML_API_KEY` in your frontend's environment)
    *   `CORS_ORIGINS` (Comma-separated list of allowed frontend domains, e.g., `https://ecopulse-ui.vercel.app`)

---

*Built with ❤️ for a sustainable future.*
