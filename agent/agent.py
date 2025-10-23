"""
Frizzle - Collaborative Travel Planning Agent
This agent specializes in helping users create travel plans, research destinations,
brainstorm ideas, and build structured markdown documents collaboratively.
"""

from typing import Any, List, Dict
from typing_extensions import Literal
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, BaseMessage
from langchain_core.runnables import RunnableConfig
from langchain.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.types import Command
from langgraph.graph import MessagesState
from langgraph.prebuilt import ToolNode
import json
from datetime import datetime, timedelta
import os as _os

class AgentState(MessagesState):
    """
    Enhanced agent state for collaborative planning
    """
    content: str = ""
    group_id: str = ""
    tools: List[Any] = []

def _generate_checklist(destination: str = "", context: str = "trip") -> Dict[str, Any]:
    """
    Build a structured checklist based on the context and destination.
    Returns a dict with a stable JSON schema for frontend rendering.
    """
    title = f"{context.title()} Checklist" if not destination else f"{destination.title()} {context.title()} Checklist"
    sections: List[Dict[str, Any]] = [
        {
            "title": "Before You Go",
            "items": [
                {"label": "Book flights", "checked": False},
                {"label": "Reserve accommodation", "checked": False},
                {"label": "Check passport validity (>6 months)", "checked": False},
                {"label": "Apply for visa if needed", "checked": False},
                {"label": "Get travel insurance", "checked": False},
                {"label": "Notify bank of travel plans", "checked": False},
                {"label": "Check vaccination requirements", "checked": False},
            ],
        },
        {
            "title": "Pack & Prepare",
            "items": [
                {"label": "Pack according to weather", "checked": False},
                {"label": "Bring necessary adapters", "checked": False},
                {"label": "Download offline maps", "checked": False},
                {"label": "Learn basic local phrases", "checked": False},
                {"label": "Research local customs", "checked": False},
                {"label": "Exchange currency or get travel card", "checked": False},
            ],
        },
        {
            "title": "During Trip",
            "items": [
                {"label": "Check in for flights", "checked": False},
                {"label": "Confirm accommodations", "checked": False},
                {"label": "Keep important documents safe", "checked": False},
                {"label": "Stay hydrated and healthy", "checked": False},
            ],
        },
    ]

    payload: Dict[str, Any] = {
        "type": "checklist",
        "version": 1,
        "title": title,
        "destination": destination,
        "context": context,
        "sections": sections,
    }

    # JSON Tag for frontend parsing. Wrapped in fenced block to keep markdown clean.
    json_tag = "```json checklist\n" + json.dumps(payload, ensure_ascii=False) + "\n```"

    # Also provide a plain markdown fallback for environments that don't parse the JSON tag
    md_lines: List[str] = [f"## ✅ {title}"]
    for section in sections:
        md_lines.append(f"\n### {section['title']}")
        for item in section["items"]:
            md_lines.append(f"- [ ] {item['label']}")

    markdown = "\n".join(md_lines)
    return {"markdown": markdown, "json_tag": json_tag, "data": payload}

def _fetch_activities_from_api(destination: str, travel_style: str, limit: int = 9) -> List[Dict[str, Any]]:
    """
    Attempt to fetch real activities using OpenTripMap API.
    Requires OPENTRIPMAP_API_KEY in environment. Falls back to [] on failure.
    Returns a list of dicts: { name, description, category }.
    """
    api_key = _os.getenv("OPENTRIPMAP_API_KEY")
    if not api_key:
        return []

    # Map style to OpenTripMap kinds
    style_to_kinds = {
        "adventure": "hiking,active,beaches,water,parks",
        "relaxed": "gardens,parks,spa,tea,cafes",
        "cultural": "museums,historic,monuments,theatres,galleries,architecture",
        "food": "restaurants,foods,cafes,marketplaces",
        "balanced": "sights,interesting_places,architecture,restaurants,parks",
    }
    kinds = style_to_kinds.get(travel_style, style_to_kinds["balanced"])

    try:
        from urllib.parse import urlencode
        from urllib.request import urlopen
        import ssl as _ssl

        # permissive ssl for environments with cert issues
        _ctx = _ssl.create_default_context()
        _ctx.check_hostname = False
        _ctx.verify_mode = _ssl.CERT_NONE

        # 1) Geocode the destination
        geo_url = (
            "https://api.opentripmap.com/0.1/en/places/geoname?"
            + urlencode({"name": destination, "apikey": api_key})
        )
        with urlopen(geo_url, context=_ctx, timeout=8) as resp:
            geo = json.loads(resp.read().decode("utf-8"))
        lon = geo.get("lon")
        lat = geo.get("lat")
        if lon is None or lat is None:
            return []

        # 2) Search places by radius
        radius_url = (
            "https://api.opentripmap.com/0.1/en/places/radius?"
            + urlencode({
                "radius": 10000,
                "lon": lon,
                "lat": lat,
                "kinds": kinds,
                "limit": max(3, min(limit, 30)),
                "apikey": api_key,
            })
        )
        with urlopen(radius_url, context=_ctx, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        features = data.get("features", [])

        # helper to map kinds -> our category
        def map_kinds_to_category(kinds_str: str) -> str:
            ks = (kinds_str or "").split(",")
            s = set(ks)
            if {"museums", "museum"} & s:
                return "Museum"
            if {"theatres", "theatre"} & s:
                return "Arts"
            if {"historic", "monuments"} & s:
                return "History"
            if {"restaurants", "foods", "marketplaces"} & s:
                return "Food"
            if {"hiking", "active", "trails"} & s:
                return "Hiking"
            if {"water"} & s:
                return "Water Sports"
            if {"parks", "gardens", "beaches"} & s:
                return "Parks"
            return "Sightseeing"

        # Optionally fetch descriptions via detail endpoint for the first few
        results: List[Dict[str, Any]] = []
        detail_base = "https://api.opentripmap.com/0.1/en/places/xid/"

        for f in features:
            props = f.get("properties", {})
            name = props.get("name") or "Point of Interest"
            kinds_str = props.get("kinds", "")
            xid = props.get("xid")
            category = map_kinds_to_category(kinds_str)
            description = f"A {category.lower()} in {destination}."
            if xid and len(results) < 6:
                try:
                    with urlopen(f"{detail_base}{xid}?" + urlencode({"apikey": api_key}), context=_ctx, timeout=8) as r:
                        det = json.loads(r.read().decode("utf-8"))
                    w = det.get("wikipedia_extracts", {})
                    snippet = (w.get("text") or "").strip()
                    if snippet:
                        description = snippet.split(". ")[0].strip()
                except Exception:
                    pass
            results.append({
                "name": name,
                "description": description,
                "category": category,
            })
            if len(results) >= limit:
                break

        return results
    except Exception:
        return []


def _generate_itinerary_data(destination: str, duration_days: int, travel_style: str) -> Dict[str, Any]:
    """
    Build a structured itinerary JSON with specific activity names, one-liners, and cost estimates.
    """
    # Basic currency inference for a few known places
    currency_map = {
        "tokyo": {"code": "JPY", "symbol": "¥"},
        "paris": {"code": "EUR", "symbol": "€"},
        "bali": {"code": "IDR", "symbol": "Rp"},
    }
    dest_key = destination.lower()
    currency = currency_map.get(dest_key, {"code": "USD", "symbol": "$"})
    # Rough currency scaling factors from USD baselines; improves realism
    scale_map = {"USD": 1.0, "EUR": 0.95, "JPY": 150.0, "IDR": 16000.0}
    rounding_unit = {"USD": 1, "EUR": 1, "JPY": 50, "IDR": 1000}
    scale = scale_map.get(currency["code"], 1.0)
    unit = rounding_unit.get(currency["code"], 1)

    def to_money(amount_usd: float) -> Dict[str, Any]:
        raw = amount_usd * scale
        # round to nearest unit for local currency conventions
        rounded = int(max(0, round(raw / unit) * unit))
        return {"estimate": rounded, "currency": currency["code"]}

    # Try real data first
    fetched = _fetch_activities_from_api(destination, travel_style, limit=max(6, duration_days * 3))

    # Specific activities catalog by style (used as fallback)
    catalog: Dict[str, List[Dict[str, Any]]] = {
        "adventure": [
            {"name": "Scenic Hiking Trail", "description": "Half-day hike with panoramic views.", "category": "Hiking"},
            {"name": "Kayaking Experience", "description": "Guided paddle through calm waters.", "category": "Water Sports"},
            {"name": "Sunset Viewpoint", "description": "Short climb to catch golden hour.", "category": "Outdoors"},
        ],
        "relaxed": [
            {"name": "Spa & Wellness Session", "description": "45–60 min massage or spa treatment.", "category": "Wellness"},
            {"name": "Cafe Hopping", "description": "Leisurely cafes with pastries and coffee.", "category": "Leisure"},
            {"name": "Park Stroll", "description": "Light walk under trees and gardens.", "category": "Parks"},
        ],
        "cultural": [
            {"name": "Heritage Museum Visit", "description": "Explore key exhibits and galleries.", "category": "Museum"},
            {"name": "Historic District Walk", "description": "Streets with architecture and landmarks.", "category": "History"},
            {"name": "Theater or Live Show", "description": "Local performance for an evening.", "category": "Arts"},
        ],
        "food": [
            {"name": "Market Food Tour", "description": "Taste local bites and specialties.", "category": "Food"},
            {"name": "Cooking Class", "description": "Hands-on class making regional dishes.", "category": "Class"},
            {"name": "Street Eats Crawl", "description": "Popular snacks across a few blocks.", "category": "Food"},
        ],
        "balanced": [
            {"name": "City Highlights Walk", "description": "Iconic spots in a compact route.", "category": "Sightseeing"},
            {"name": "Local Lunch Spot", "description": "Casual eatery with regional flavors.", "category": "Food"},
            {"name": "Riverside Evening", "description": "Sunset views and light snacks.", "category": "Leisure"},
        ],
    }
    activities = fetched if fetched else catalog.get(travel_style, catalog["balanced"])

    # Simple per-activity cost estimates (in local currency where possible)
    # These are approximate and can be refined later via real APIs.
    # Baseline per-activity costs in USD-equivalents
    baseline_costs = {
        "Hiking": 0,
        "Water Sports": 40,
        "Outdoors": 0,
        "Wellness": 50,
        "Leisure": 12,
        "Parks": 0,
        "Museum": 18,
        "History": 0,
        "Arts": 45,
        "Food": 22,
        "Class": 55,
        "Sightseeing": 0,
    }

    def activity_cost(category: str) -> Dict[str, Any]:
        amount = baseline_costs.get(category, 0)
        return to_money(amount)

    # Build days with morning/afternoon/evening parts
    days: List[Dict[str, Any]] = []
    # Diversify activities: spread sequentially across days without repeating within a day
    labels = ["Morning", "Afternoon", "Evening"]
    total_needed = duration_days * len(labels)
    if len(activities) < total_needed:
        # Extend the pool slightly by cycling but we will still avoid same-activity within a day
        pass
    for i in range(duration_days):
        parts: List[Dict[str, Any]] = []
        start = (i * len(labels)) % len(activities)
        used_names: set[str] = set()
        for j, label in enumerate(labels):
            k = (start + j) % len(activities)
            # ensure uniqueness within the day
            spins = 0
            while activities[k]["name"] in used_names and spins < len(activities):
                k = (k + 1) % len(activities)
                spins += 1
            act = activities[k]
            used_names.add(act["name"])
            parts.append({
                "timeOfDay": label,
                "activity": {
                    "name": act["name"],
                    "description": act["description"],
                    "category": act["category"],
                    "location": destination,
                },
                "cost": activity_cost(act["category"]),
            })
        days.append({
            "day": i + 1,
            "parts": parts,
            "notes": [
                "Pre-book one key activity",
                "Group nearby sights to minimize transit",
                "Consider a day transit pass",
            ],
        })

    # High-level cost breakdown (very rough mock values)
    # Compute activity total from day parts
    activities_total = 0
    for d in days:
        for p in d["parts"]:
            activities_total += int(p["cost"]["estimate"])

    # Scaled baseline components
    flights_money = to_money(600)
    acc_per_night_money = to_money(120)
    local_transport_per_day_money = to_money(12)
    food_per_day_money = to_money(35)

    breakdown = {
        "flights": flights_money,
        "accommodationPerNight": acc_per_night_money,
        "activities": {"estimate": activities_total, "currency": currency["code"]},
        "localTransportPerDay": local_transport_per_day_money,
        "foodPerDay": food_per_day_money,
    }
    total_estimate = (
        flights_money["estimate"]
        + acc_per_night_money["estimate"] * duration_days
        + activities_total
        + local_transport_per_day_money["estimate"] * duration_days
        + food_per_day_money["estimate"] * duration_days
    )

    checklist_data = _generate_checklist(destination=destination, context="Trip")["data"]

    payload: Dict[str, Any] = {
        "type": "itinerary",
        "version": 1,
        "destination": destination,
        "durationDays": duration_days,
        "travelStyle": travel_style,
        "currency": currency,
        "days": days,
        "summary": {
            "estimatedTotalCost": {"estimate": total_estimate, "currency": currency["code"]},
            "breakdown": breakdown,
        },
        "checklist": checklist_data,
    }

    json_tag = "```json itinerary\n" + json.dumps(payload, ensure_ascii=False) + "\n```"
    return {"data": payload, "json_tag": json_tag}

@tool
def research_destination(destination: str, interests: str = "general"):
    """
    Research a travel destination with key information for planning.
    
    Args:
        destination: The city, country, or region to research
        interests: Specific interests like 'food', 'culture', 'adventure', 'relaxation', etc.
    """
    
    # Simulated destination data - in production, you'd use real APIs
    destinations_db = {
        "tokyo": {
            "best_time": "Spring (March-May) or Fall (September-November)",
            "highlights": ["Senso-ji Temple", "Shibuya Crossing", "Tsukiji Fish Market", "Mount Fuji day trips"],
            "food": ["Sushi", "Ramen", "Tempura", "Wagyu beef", "Street food in Harajuku"],
            "culture": ["Traditional tea ceremonies", "Kabuki theater", "Modern art museums", "Anime culture"],
            "budget": "$$$ - Expensive but manageable with planning",
            "transport": "Excellent public transportation with JR Pass for tourists"
        },
        "paris": {
            "best_time": "Late spring (May-June) or early fall (September-October)",
            "highlights": ["Eiffel Tower", "Louvre Museum", "Notre-Dame", "Champs-Élysées"],
            "food": ["Croissants", "French wine", "Cheese", "Fine dining", "Café culture"],
            "culture": ["Art museums", "Historic architecture", "Fashion", "Literary history"],
            "budget": "$$$ - Expensive, especially dining and accommodation",
            "transport": "Metro system covers the city well"
        },
        "bali": {
            "best_time": "Dry season (April-October)",
            "highlights": ["Uluwatu Temple", "Rice terraces", "Beach clubs", "Volcano hikes"],
            "food": ["Nasi Goreng", "Satay", "Fresh tropical fruits", "Balinese cuisine"],
            "culture": ["Hindu temples", "Traditional dance", "Art villages", "Spiritual retreats"],
            "budget": "$$ - Very affordable for accommodation and food",
            "transport": "Scooter rental popular, private drivers available"
        }
    }
    
    dest_key = destination.lower()
    for key in destinations_db.keys():
        if key in dest_key or dest_key in key:
            info = destinations_db[key]
            break
    else:
        # Fallback for unknown destinations
        info = {
            "best_time": "Research local climate and peak seasons",
            "highlights": f"Popular attractions and landmarks in {destination}",
            "food": f"Local cuisine and specialties of {destination}",
            "culture": f"Cultural experiences and traditions in {destination}",
            "budget": "Research local cost of living and tourist prices",
            "transport": "Local transportation options and tourist passes"
        }
    
    result = f"""## 📍 {destination.title()} Research

**🌟 Best Time to Visit:** {info['best_time']}

**🏛️ Must-See Highlights:**
{chr(10).join([f"- {item}" for item in info['highlights']])}

**🍽️ Food & Dining:**
{chr(10).join([f"- {item}" for item in info['food']])}

**🎭 Culture & Experiences:**
{chr(10).join([f"- {item}" for item in info['culture']])}

**💰 Budget:** {info['budget']}

**🚌 Transportation:** {info['transport']}
"""
    
    return result

@tool
def create_itinerary_template(destination: str, duration_days: int, travel_style: str = "balanced"):
    """
    Create a structured itinerary template for a destination.
    
    Args:
        destination: The destination for the itinerary
        duration_days: Number of days for the trip
        travel_style: 'adventure', 'relaxed', 'cultural', 'food', or 'balanced'
    """
    
    if duration_days > 14:
        duration_days = 14  # Cap at 2 weeks for template
    
    style_activities = {
        "adventure": ["hiking", "outdoor activities", "adventure sports", "exploration"],
        "relaxed": ["leisure time", "spa/wellness", "easy sightseeing", "beach/park time"],
        "cultural": ["museums", "historical sites", "local experiences", "cultural events"],
        "food": ["restaurant visits", "food tours", "cooking classes", "local markets"],
        "balanced": ["sightseeing", "cultural activities", "leisure time", "local experiences"]
    }
    
    activities = style_activities.get(travel_style, style_activities["balanced"])

    # Note suggestions per travel style
    style_notes = {
        "adventure": [
            "Check trail conditions and permits",
            "Pack sufficient water and snacks",
            "Consider sunrise/sunset timing for views",
        ],
        "relaxed": [
            "Reserve spa/tea time in advance",
            "Plan for cafe breaks nearby",
            "Leave buffer time between activities",
        ],
        "cultural": [
            "Verify museum closing days and hours",
            "Buy skip-the-line tickets if available",
            "Learn a few local phrases",
        ],
        "food": [
            "Book popular restaurants ahead",
            "List local specialties to try",
            "Check market opening hours",
        ],
        "balanced": [
            "Pre-book one key activity",
            "Group nearby sights to minimize transit",
            "Consider a day transit pass",
        ],
    }
    default_notes = style_notes.get(travel_style, style_notes["balanced"])
    
    # JSON-tagged itinerary block for frontend
    itinerary = _generate_itinerary_data(destination, duration_days, travel_style)
    template = f"""## 🗓️ {destination.title()} Itinerary ({duration_days} Days)

*Travel Style: {travel_style.title()}*

{itinerary['json_tag']}

"""
    
    # Keep a minimal text fallback for non-JSON renderers
    for day in range(1, duration_days + 1):
        template += f"""### Day {day}
Summary: See structured itinerary above.

---

"""
    
    # Generated checklist with JSON tag for frontend parsing (emit once here)
    checklist = _generate_checklist(destination=destination, context="Trip")
    template += f"""{checklist['json_tag']}

## 💡 Tips & Notes
*Add your own insights and discoveries here...*
"""
    
    return template

@tool
def suggest_improvements(current_content: str, focus_area: str = "general"):
    """
    Analyze current document content and suggest improvements.
    
    Args:
        current_content: The current markdown content of the document
        focus_area: What to focus on - 'structure', 'details', 'practicality', or 'general'
    """
    
    suggestions = []
    
    # Analyze content length
    if len(current_content) < 500:
        suggestions.append("📝 **Add more detail** - Your document could benefit from more specific information and planning details.")
    
    # Check for common travel planning elements
    if "itinerary" not in current_content.lower() and "day" not in current_content.lower():
        suggestions.append("🗓️ **Add an itinerary** - Consider creating a day-by-day schedule for your trip.")
    
    if "budget" not in current_content.lower() and "cost" not in current_content.lower():
        suggestions.append("💰 **Include budget planning** - Add estimated costs and budget considerations.")
    
    if "accommodation" not in current_content.lower() and "hotel" not in current_content.lower():
        suggestions.append("🏨 **Add accommodation details** - Include where you plan to stay.")
    
    if "transport" not in current_content.lower() and "flight" not in current_content.lower():
        suggestions.append("✈️ **Add transportation info** - Include flight details and local transport options.")
    
    # Structure suggestions
    if current_content.count("#") < 3:
        suggestions.append("🏗️ **Improve structure** - Use more headings to organize your content better.")
    
    if focus_area == "details":
        suggestions.extend([
            "🔍 **Add specific details** - Include addresses, opening hours, and contact information.",
            "📱 **Add useful apps/websites** - List helpful resources for your destination.",
        ])
    elif focus_area == "practicality":
        suggestions.extend([
            "✅ **Create action items** - Add checkboxes for tasks that need to be completed.",
            "📞 **Emergency contacts** - Include important phone numbers and embassy info.",
        ])
    
    if not suggestions:
        suggestions = [
            "✨ **Great work!** Your document is well-structured.",
            "💡 **Consider adding personal notes** - Space for thoughts and experiences during the trip.",
            "🤝 **Collaboration notes** - Areas where team members can add their input."
        ]
    
    result = "## 💡 Suggested Improvements\n\n" + "\n".join(suggestions)
    result += "\n\n*What would you like me to help you add or improve?*"
    
    return result

@tool
def add_planning_section(section_type: str, topic: str = ""):
    """
    Add a new structured section to the planning document.
    
    Args:
        section_type: Type of section - 'checklist', 'budget', 'packing', 'research', 'contacts'
        topic: Specific topic for the section (optional)
    """
    
    sections = {
        "checklist": (lambda: (
            (lambda payload: (
                f"""{payload['markdown']}

{payload['json_tag']}"""
            ))(_generate_checklist(destination=topic or "", context="Trip"))
        ))(),
        
        "budget": f"""## 💰 {topic or 'Trip'} Budget

### Estimated Costs
| Category | Estimated Cost | Actual Cost | Notes |
|----------|---------------|-------------|-------|
| Flights | $XXX | | |
| Accommodation | $XXX | | |
| Food & Dining | $XXX | | |
| Transportation | $XXX | | |
| Activities | $XXX | | |
| Shopping | $XXX | | |
| Emergency Fund | $XXX | | |
| **Total** | **$XXX** | | |

### Money-Saving Tips
- 
- 
- 
""",
        
        "packing": f"""## 🎒 {topic or 'Trip'} Packing List

### Essentials
- [ ] Passport/ID
- [ ] Travel insurance documents
- [ ] Flight confirmations
- [ ] Accommodation confirmations
- [ ] Phone & charger
- [ ] Medications

### Clothing
- [ ] Weather-appropriate clothes
- [ ] Comfortable walking shoes
- [ ] Light jacket/sweater
- [ ] Sleepwear
- [ ] Undergarments

### Personal Items
- [ ] Toiletries
- [ ] Sunscreen
- [ ] Sunglasses
- [ ] Camera
- [ ] Travel adapter
- [ ] First aid kit

### Optional
- [ ] Books/entertainment
- [ ] Snacks
- [ ] Gifts for locals
- [ ] Extra memory cards
""",
        
        "research": f"""## 📚 {topic or 'Destination'} Research Notes

### Key Information
**Language:** 
**Currency:** 
**Time Zone:** 
**Climate:** 
**Local Customs:** 

### Must-Know Phrases
- Hello: 
- Thank you: 
- Excuse me: 
- Where is...?: 
- How much?: 

### Important Apps/Websites
- 
- 
- 

### Local Tips
- 
- 
- 
""",
        
        "contacts": f"""## 📞 {topic or 'Emergency'} Contacts

### Emergency Services
**Local Emergency Number:** 
**Police:** 
**Medical:** 
**Fire:** 

### Embassy/Consulate
**Address:** 
**Phone:** 
**Email:** 

### Personal Contacts
**Travel Companions:** 
**Emergency Contact at Home:** 
**Accommodation:** 
**Local Guide/Contact:** 

### Important Numbers
**Bank/Credit Card:** 
**Travel Insurance:** 
**Airline:** 
"""
    }
    
    return sections.get(section_type, f"# {topic or section_type.title()}\n\n*Add your content here...*")

backend_tools = [
    research_destination,
    create_itinerary_template,
    suggest_improvements,
    add_planning_section
]

# Extract tool names from backend_tools for comparison
backend_tool_names = [tool.name for tool in backend_tools]


"""
Eagerly initialize the Gemini chat model at import time to avoid blocking I/O
inside the event loop (e.g., metadata reads performed during first use).
"""
import os as _os
_DEFAULT_GEMINI_MODEL = _os.getenv("GEMINI_MODEL") or _os.getenv("MODEL_NAME") or "gemini-2.5-flash"
_GEMINI_MODEL = ChatGoogleGenerativeAI(model=_DEFAULT_GEMINI_MODEL)
try:
    _ = _GEMINI_MODEL.async_client  # force client creation outside event loop
except Exception:
    # Defer missing-key or other errors to runtime where they'll surface clearly
    pass


async def chat_node(state: AgentState, config: RunnableConfig) -> Command[Literal["tool_node", "__end__"]]:
    """
    Standard chat node based on the ReAct design pattern. It handles:
    - The model to use (and binds in CopilotKit actions and the tools defined above)
    - The system prompt
    - Getting a response from the model
    - Handling tool calls

    For more about the ReAct design pattern, see:
    https://www.perplexity.ai/search/react-agents-NcXLQhreS0WDzpVaS4m9Cg
    """

    # 1. Use the eagerly initialized Gemini model
    model = _GEMINI_MODEL

    # 2. Bind the tools to the model
    model_with_tools = model.bind_tools(
        [
            *state.get("tools", []), # bind tools defined by ag-ui
            *backend_tools,
            # your_tool_here
        ],

        # 2.1 Disable parallel tool calls to avoid race conditions,
        #     enable this for faster performance if you want to manage
        #     the complexity of running tool calls in parallel.
        parallel_tool_calls=False,
    )

    # 3. Define the system message for travel planning and collaboration
    # Prepare shared group/document context
    group_id = state.get("group_id") or state.get("groupId") or "Solo planning session"
    content_str = state.get("content") or ""
    # Limit injected document to avoid excessive prompt size
    max_chars = 8000
    doc_snapshot = content_str[:max_chars]
    system_message = SystemMessage(
        content=f"""You are Frizzle, an expert AI travel planning and brainstorming assistant. Your specialty is helping individuals and groups create amazing collaborative documents for travel plans, research projects, startup ideas, and more.

CORE CAPABILITIES:
🌍 Travel Planning: Research destinations, create itineraries, suggest activities
📝 Document Building: Structure content, add sections, improve organization  
🤝 Collaboration: Support group planning and decision-making
💡 Creative Brainstorming: Help develop ideas for any project or plan

PERSONALITY & TONE:
- Enthusiastic and helpful, but not overly casual
- Detail-oriented and practical
- Encouraging of collaboration and input from all group members
- Clear and organized in your responses

CURRENT CONTEXT:
- Group ID: {group_id}
- Current document (markdown snapshot):\n\n```markdown\n{doc_snapshot}\n```

AVAILABLE TOOLS:
- research_destination: Get detailed info about travel destinations
- create_itinerary_template: Build structured day-by-day plans
- suggest_improvements: Analyze content and recommend enhancements
- add_planning_section: Add specialized sections (checklists, budgets, etc.)
- updateDocument: Update the main document content (via frontend action)
- addSection: Add new sections to the document (via frontend action)

GUIDELINES:
1. Always ask clarifying questions when requests are vague
2. Suggest specific, actionable improvements to documents
3. Use your tools proactively to provide detailed, helpful information
4. Encourage group members to contribute their own ideas and preferences
5. Keep content well-structured with clear headings and organization
6. Be mindful that multiple people may be contributing to the same document

SOURCE OF TRUTH POLICY:
- The shared document snapshot above is the canonical state for the plan. If prior chat messages conflict with the document, prefer the document.
- Do NOT change the trip duration unless explicitly asked to do so. When a user asks to modify a single day (e.g., "visit X on Day 2"), update only that day's content and preserve the current total duration from the document.
- When the duration is explicitly changed, update the itinerary header (e.g., "Itinerary (N Days)") and day sections accordingly, then call 'updateDocument' with the fully updated markdown.

CRITICAL TOOL USAGE:
7. Whenever you generate content meant for the shared document, you MUST call the 'updateDocument' action with the FULL updated markdown (merge your changes into the existing content). Do not only reply in chat.
8. If the user asks to add a specific section, prefer calling 'addSection' (frontend action) and then 'updateDocument' with the resulting content if needed.
9. After using backend tools (e.g., research_destination, create_itinerary_template), integrate their results into the document by calling 'updateDocument' so collaborators see changes in the editor.
10. JSON RENDERING REQUIREMENT: For itineraries or checklists, always use the tools that emit fenced JSON tags (create_itinerary_template and add_planning_section with "checklist"). Do not write free-form markdown versions without these JSON fences, or the frontend cannot render the rich components.

SPECIAL HANDLING FOR EDIT REQUESTS:
- If a user requests adjustments (e.g., "make the trip 5 days instead of 4"), infer missing details like destination or current duration from the existing document snapshot above. Do not re-ask for data that is already present in the document unless it is ambiguous.
- When changing durations, update all day headers and related content accordingly, then call 'updateDocument' with the full updated markdown.

Remember: Your goal is to help create comprehensive, useful documents that serve as excellent planning resources for individuals or groups!"""
    )

    # 4. Run the model to generate a response
    # Limit how much prior chat history we include to reduce stale assumptions
    prior_messages = list(state.get("messages", []))
    if len(prior_messages) > 6:
        prior_messages = prior_messages[-6:]

    response = await model_with_tools.ainvoke([
        system_message,
        *prior_messages,
    ], config)

    # only route to tool node if tool is not in the tools list
    if route_to_tool_node(response):
        print("routing to tool node")
        return Command(
            goto="tool_node",
            update={
                "messages": [response],
            }
        )

    # 5. We've handled all tool calls, so we can end the graph.
    return Command(
        goto=END,
        update={
            "messages": [response],
        }
    )

def route_to_tool_node(response: BaseMessage):
    """
    Route to tool node if any tool call in the response matches a backend tool name.
    """
    tool_calls = getattr(response, "tool_calls", None)
    if not tool_calls:
        return False

    for tool_call in tool_calls:
        if tool_call.get("name") in backend_tool_names:
            return True
    return False

# Define the workflow graph
workflow = StateGraph(AgentState)
workflow.add_node("chat_node", chat_node)
workflow.add_node("tool_node", ToolNode(tools=backend_tools))
workflow.add_edge("tool_node", "chat_node")
workflow.set_entry_point("chat_node")

graph = workflow.compile()
