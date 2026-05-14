from fastapi import APIRouter, HTTPException
from typing import Optional, List
from db import pb
from collections import defaultdict

router = APIRouter()

@router.get("/")
async def get_dashboard_stats(trust_id: Optional[str] = None, hijri_year: Optional[str] = None):
    try:
        filters = []
        if trust_id:
            filters.append(f'trust_id = "{trust_id}"')
        if hijri_year:
            filters.append(f'hijri_year = "{hijri_year}"')
            
        filter_str = " && ".join(filters) if filters else ""
        
        # 1. Get all relevant transactions with explicit query_params
        result = pb.collection('transactions').get_full_list(query_params={
            "filter": filter_str,
            "expand": "donor_id,trust_id"
        })
        
        total_revenue = 0
        donor_ids = set()
        category_stats = defaultdict(float)
        trust_stats = defaultdict(float)
        
        for tx in result:
            # Safely get total_amount, defaulting to 0 if missing
            amount = getattr(tx, "total_amount", 0)
            total_revenue += amount
            
            donor_id = getattr(tx, "donor_id", None)
            if donor_id:
                donor_ids.add(donor_id)
            
            # Trust distribution
            expand = getattr(tx, "expand", {})
            trust_obj = expand.get("trust_id") if expand else None
            trust_name = getattr(trust_obj, "name", "General") if trust_obj else "General"
            trust_stats[trust_name] += amount
            
            # Category distribution
            items = getattr(tx, "items", [])
            if isinstance(items, list):
                for item in items:
                    cat_id = item.get("category_id", "Other")
                    item_amt = item.get("amount", 0)
                    category_stats[cat_id] += item_amt
        
        tx_count = len(result)
        avg_donation = total_revenue / tx_count if tx_count > 0 else 0

        
        # Get recent transactions using payment_date for sorting (created was failing)
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
            "status": True,
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
    except Exception as e:
        print(f"Stats Error: {e}")
        return {"status": False, "msg": str(e)}
