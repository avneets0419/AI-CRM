"""
Run once to seed realistic mock leads into the DB for demo purposes.
Usage: python seed.py
"""
import httpx, time

LEADS = [
    {
        "name": "Priya Sharma",
        "company": "Finova Capital",
        "source": "Google Ads",
        "utm_campaign": "q2-enterprise-crm",
        "pages_viewed": ["/pricing", "/case-studies", "/contact"],
        "form_data": {"role": "VP Sales", "team_size": "50+", "message": "Looking for CRM automation for our sales team"},
    },
    {
        "name": "James Okafor",
        "company": "MedSync Health",
        "source": "LinkedIn",
        "utm_campaign": "healthcare-ai",
        "pages_viewed": ["/features", "/integrations"],
        "form_data": {"role": "CTO", "team_size": "10-50", "message": "Interested in AI agents for patient follow-up"},
    },
    {
        "name": "Sara Kim",
        "company": "BuildRight SaaS",
        "source": "Organic",
        "utm_campaign": "",
        "pages_viewed": ["/blog/what-is-ai-crm"],
        "form_data": {"role": "Founder", "team_size": "1-10", "message": "Just exploring options"},
    },
    {
        "name": "Carlos Mendes",
        "company": "TruckFleet Logistics",
        "source": "Referral",
        "utm_campaign": "partner-referral",
        "pages_viewed": ["/pricing", "/demo", "/contact", "/case-studies"],
        "form_data": {"role": "COO", "team_size": "200+", "message": "Need a demo ASAP — our current CRM is failing us"},
    },
    {
        "name": "Aisha Patel",
        "company": "EduPath Online",
        "source": "Google Ads",
        "utm_campaign": "edtech-lead-gen",
        "pages_viewed": ["/features"],
        "form_data": {"role": "Marketing Manager", "team_size": "10-50", "message": ""},
    },
]

BASE = "http://localhost:8000"

for lead in LEADS:
    r = httpx.post(f"{BASE}/leads", json=lead)
    print(f"Created: {lead['name']} → {r.status_code}")
    time.sleep(0.5)

print("\nDone. Agent pipelines running in background...")
