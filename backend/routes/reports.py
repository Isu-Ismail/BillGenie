from fastapi import APIRouter, HTTPException
from typing import Optional, List
from db import pb
from collections import defaultdict

router = APIRouter()

@router.get("/")
async def get_report_data(trust_id: Optional[str] = None, hijri_year: Optional[str] = None):
    try:
        # 1. Fetch categories and trust details
        categories = pb.collection('categories').get_full_list()
        
        trust_bound_cats = []
        if trust_id:
            try:
                trust_record = pb.collection('trusts').get_one(trust_id)
                trust_bound_cats = getattr(trust_record, "category_ids", [])
            except:
                pass

        # 2. Build filters
        filters = []
        if trust_id:
            filters.append(f'trust_id = "{trust_id}"')
        if hijri_year:
            filters.append(f'hijri_year = "{hijri_year}"')
            
        filter_str = " && ".join(filters) if filters else ""
        
        # 3. Get all transactions for this year/trust
        transactions = pb.collection('transactions').get_full_list(query_params={
            "filter": filter_str,
            "expand": "donor_id,trust_id"
        })
        
        # 4. Group data and build summary
        report_dict = defaultdict(lambda: {
            "donor_name": "",
            "door_no": "",
            "street": "",
            "mobile": "",
            "gender": "M",
            "trust_name": "",
            "hijri_year": "",
            "total": 0,
            "category_amounts": defaultdict(float)
        })
        
        summary = defaultdict(float)
        grand_total = 0
        
        for tx in transactions:
            donor = getattr(tx, "expand", {}).get("donor_id")
            trust = getattr(tx, "expand", {}).get("trust_id")
            if not donor: continue
            
            d_id = donor.id
            row = report_dict[d_id]
            
            if not row["donor_name"]:
                row["donor_name"] = donor.name
                row["door_no"] = getattr(donor, "door_no", "")
                row["street"] = getattr(donor, "street", "")
                row["mobile"] = getattr(donor, "mobile", "")
                row["gender"] = getattr(donor, "gender", "M")
                row["hijri_year"] = getattr(tx, "hijri_year", "")
                row["trust_name"] = getattr(trust, "name", "")
            
            amount = getattr(tx, "total_amount", 0)
            row["total"] += amount
            grand_total += amount
            
            for item in getattr(tx, "items", []):
                cat_id = item.get("category_id")
                item_amt = item.get("amount", 0)
                if cat_id:
                    row["category_amounts"][cat_id] += item_amt
                    summary[cat_id] += item_amt
        
        # 5. Filter categories for visibility
        visible_categories = []
        for cat in categories:
            # Show if: 1. Tied via Category.trust_ids OR 2. Tied via Trust.category_ids OR 3. Has data
            is_tied_in_cat = trust_id and trust_id in getattr(cat, "trust_ids", [])
            is_tied_in_trust = cat.id in trust_bound_cats
            has_data = summary.get(cat.id, 0) > 0
            
            if is_tied_in_cat or is_tied_in_trust or has_data:
                visible_categories.append({"id": cat.id, "name": cat.name})

        # 6. Format for frontend
        final_data = []
        for d_id, data in report_dict.items():
            flat_row = {
                "id": d_id,
                "donor_name": data["donor_name"],
                "door_no": data["door_no"],
                "street": data["street"],
                "mobile": data["mobile"],
                "gender": data["gender"],
                "hijri_year": data["hijri_year"],
                "trust_name": data["trust_name"],
                "total": data["total"]
            }
            # Add ONLY visible categories as keys
            for cat_info in visible_categories:
                flat_row[cat_info["id"]] = data["category_amounts"].get(cat_info["id"], 0)
            
            final_data.append(flat_row)

        # Sort by donor_name
        final_data.sort(key=lambda x: x["donor_name"])

        total_donors = len(report_dict)
        avg_donation = grand_total / total_donors if total_donors > 0 else 0

        return {
            "status": True,
            "categories": visible_categories,
            "data": final_data,
            "summary": {
                "grand_total": grand_total,
                "total_donors": total_donors,
                "avg_donation": avg_donation,
                "categories": {c["id"]: summary.get(c["id"], 0) for c in visible_categories}
            }
        }

        
    except Exception as e:
        print(f"Report Error: {e}")
        return {"status": False, "msg": str(e)}
