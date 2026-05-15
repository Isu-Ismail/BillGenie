from fastapi import APIRouter, HTTPException
from typing import Optional, List
from db import pb, get_cached_data, update_cached_data
from collections import defaultdict

router = APIRouter()

@router.get("/")
async def get_dashboard_stats(trust_id: Optional[str] = None, hijri_year: Optional[str] = None):
    try:
        cached = get_cached_data(trust_id, "STATS", hijri_year)
        if cached:
            return {
                "status": True,
                "from_cache": True,
                **cached
            }

        # If no cache exists, return empty structure with needs_refresh=True
        return {
            "status": True,
            "from_cache": False,
            "stats": {"total_revenue": 0, "total_donors": 0, "avg_donation": 0, "transaction_count": 0},
            "distributions": {"trusts": [], "categories": []},
            "recent": [],
            "needs_refresh": True
        }
    except Exception as e:
        return {"status": False, "msg": str(e)}

@router.post("/refresh/")
async def refresh_stats(trust_id: Optional[str] = None, hijri_year: Optional[str] = None):
    try:
        print(f"🔄 Manually refreshing stats for trust:{trust_id} year:{hijri_year}...")
        
        # Calculate fresh
        stats_data = await calculate_fresh_stats(trust_id, hijri_year)
        
        # Save to metadata cache
        cached_data = update_cached_data(trust_id, "STATS", stats_data, hijri_year)
        
        return {
            "status": True,
            "msg": "Dashboard stats updated successfully",
            **cached_data
        }
    except Exception as e:
        print(f"Refresh Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def calculate_fresh_stats(trust_id: Optional[str] = None, hijri_year: Optional[str] = None):
    filters = []
    if trust_id:
        filters.append(f'trust_id = "{trust_id}"')
    if hijri_year:
        filters.append(f'hijri_year = "{hijri_year}"')
        
    filter_str = " && ".join(filters) if filters else ""
    
    result = pb.collection('transactions').get_full_list(query_params={
        "filter": filter_str,
        "expand": "donor_id,trust_id"
    })
    
    total_revenue = 0
    donor_ids = set()
    category_stats = defaultdict(float)
    trust_stats = defaultdict(float)
    
    for tx in result:
        amount = getattr(tx, "total_amount", 0)
        total_revenue += amount
        donor_id = getattr(tx, "donor_id", None)
        if donor_id: donor_ids.add(donor_id)
        
        expand = getattr(tx, "expand", {})
        trust_obj = expand.get("trust_id") if expand else None
        trust_name = getattr(trust_obj, "name", "General") if trust_obj else "General"
        trust_stats[trust_name] += amount
        
        items = getattr(tx, "items", [])
        if isinstance(items, list):
            for item in items:
                cat_id = item.get("category_id", "Other")
                item_amt = item.get("amount", 0)
                category_stats[cat_id] += item_amt
    
    tx_count = len(result)
    avg_donation = total_revenue / tx_count if tx_count > 0 else 0

    recent_tx = pb.collection('transactions').get_list(1, 5, query_params={
        "sort": "-payment_date",
        "filter": filter_str,
        "expand": "donor_id,trust_id"
    })

    recent_data = []
    for r in recent_tx.items:
        donor = getattr(r, "expand", {}).get("donor_id")
        trust = getattr(r, "expand", {}).get("trust_id")
        recent_data.append({
            "id": r.id,
            "donor_name": donor.name if donor else "Unknown",
            "trust_name": trust.name if trust else "General",
            "amount": r.total_amount,
            "date": r.payment_date,
            "hijri_year": r.hijri_year
        })
        
    return {
        "stats": {
            "total_revenue": total_revenue,
            "total_donors": len(donor_ids),
            "avg_donation": avg_donation,
            "transaction_count": tx_count
        },
        "distributions": {
            "trusts": [{"name": k, "value": v} for k, v in trust_stats.items()],
            "categories": [{"id": k, "value": v} for k, v in category_stats.items()]
        },
        "recent": recent_data
    }

