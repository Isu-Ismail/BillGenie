from fastapi import APIRouter, HTTPException
from typing import Optional, List
from db import pb, get_cached_data, update_cached_data
from collections import defaultdict

router = APIRouter()

@router.get("/")
async def get_report_data(
    trust_id: Optional[str] = None, 
    hijri_year: Optional[str] = None,
    gender: Optional[str] = None,
    streets: Optional[str] = None,
    categories: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    try:
        # Build filter dict
        filters_dict = {
            "trust_id": trust_id,
            "hijri_year": hijri_year,
            "gender": gender,
            "streets": streets,
            "categories": categories,
            "from_date": from_date,
            "to_date": to_date
        }
        
        # If no trust_id/hijri_year given, try to get the LATEST report
        is_latest_search = not trust_id or not hijri_year
        
        cached_value, cached_fields = get_cached_data("REPORT", None if is_latest_search else filters_dict)
        
        if cached_value:
            return {
                "status": True,
                "from_cache": True,
                "filters": cached_fields,
                **cached_value
            }

        return {
            "status": True,
            "from_cache": False,
            "categories": [],
            "data": [],
            "summary": None,
            "needs_refresh": True
        }
    except Exception as e:
        print(f"Report Cache Error: {e}")
        return {"status": False, "msg": str(e)}

@router.post("/generate/")
async def generate_report(
    trust_id: Optional[str] = None, 
    hijri_year: Optional[str] = None,
    gender: Optional[str] = None,
    streets: Optional[str] = None,
    categories: Optional[str] = None, # Comma separated IDs
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    try:
        print(f"📊 Generating report: trust={trust_id}, year={hijri_year}, gender={gender}, streets={streets}, cats={categories}")
        
        street_list = streets.split(",") if streets else []
        cat_id_list = categories.split(",") if categories else []
        
        # Calculate fresh
        report_data = await calculate_fresh_report(trust_id, hijri_year, gender, street_list, cat_id_list, from_date, to_date)
        
        # Save to metadata cache
        filters_dict = {
            "trust_id": trust_id,
            "hijri_year": hijri_year,
            "gender": gender,
            "streets": streets,
            "categories": categories,
            "from_date": from_date,
            "to_date": to_date
        }
        cached_data = update_cached_data("REPORT", report_data, filters_dict)
        
        return {
            "status": True,
            "msg": "Report generated successfully",
            "filters": filters_dict,
            **cached_data
        }
    except Exception as e:
        print(f"Generation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def calculate_fresh_report(
    trust_id: Optional[str] = None, 
    hijri_year: Optional[str] = None,
    gender: Optional[str] = None,
    street_list: List[str] = [],
    cat_id_list: List[str] = [],
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    # 1. Fetch categories
    all_categories = pb.collection('categories').get_full_list()
    
    # 2. Build filters for transactions
    filters = []
    if trust_id:
        filters.append(f'trust_id = "{trust_id}"')
    if hijri_year:
        filters.append(f'hijri_year = "{hijri_year}"')
    
    if from_date:
        filters.append(f'payment_date >= "{from_date} 00:00:00"')
    if to_date:
        filters.append(f'payment_date <= "{to_date} 23:59:59"')
    
    # Apply Donor-level filters
    if gender and gender != 'All':
        filters.append(f'donor_id.gender = "{gender}"')
    
    if street_list:
        actual_streets = [s for s in street_list if s != 'OTHER_STREETS']
        has_other = 'OTHER_STREETS' in street_list
        street_filters = []
        if actual_streets:
            joined_streets = " || ".join([f'donor_id.street = "{s}"' for s in actual_streets])
            street_filters.append(f"({joined_streets})")
        if has_other:
            all_formal_streets_res = pb.collection('streets').get_full_list()
            formal_names = [s.name for s in all_formal_streets_res]
            if formal_names:
                joined_formal = " && ".join([f'donor_id.street != "{s}"' for s in formal_names])
                street_filters.append(f"({joined_formal})")
        if street_filters:
            filters.append(f"({' || '.join(street_filters)})")

    filter_str = " && ".join(filters) if filters else ""
    
    # 3. Get all transactions
    transactions = pb.collection('transactions').get_full_list(query_params={
        "filter": filter_str,
        "expand": "donor_id,trust_id"
    })
    
    # 4. Group data
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
    
    # If category filter applied, only show those columns
    target_cat_ids = set(cat_id_list) if cat_id_list else set()
    
    for tx in transactions:
        donor = getattr(tx, "expand", {}).get("donor_id")
        trust = getattr(tx, "expand", {}).get("trust_id")
        if not donor: continue
        
        tx_items = getattr(tx, "items", [])
        # If filtering by category, check if this TX has any items in target categories
        if target_cat_ids:
            tx_cat_ids = set(item.get("category_id") for item in tx_items)
            if not (tx_cat_ids & target_cat_ids):
                continue
        
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
        
        for item in tx_items:
            cat_id = item.get("category_id")
            item_amt = item.get("amount", 0)
            
            # Skip items not in selected categories if filtering
            if target_cat_ids and cat_id not in target_cat_ids:
                continue
                
            if cat_id:
                row["category_amounts"][cat_id] += item_amt
                row["total"] += item_amt
                summary[cat_id] += item_amt
                grand_total += item_amt
    
    # 5. Determine which categories should be visible
    # We show a category if:
    # A. It's assigned to this trust (even if empty)
    # B. It has data in this report (even if not assigned)
    # UNLESS a specific category filter (target_cat_ids) was applied by the user
    
    assigned_cat_ids = set()
    if trust_id:
        try:
            trust_record = pb.collection('trusts').get_one(trust_id)
            assigned_cat_ids = set(getattr(trust_record, "category_ids", []))
        except:
            pass

    visible_categories = []
    for cat in all_categories:
        # If filtering by categories, only show those explicitly selected
        if target_cat_ids and cat.id not in target_cat_ids:
            continue
            
        has_data = summary.get(cat.id, 0) > 0
        is_assigned = cat.id in assigned_cat_ids
        
        if has_data or is_assigned:
            visible_categories.append({"id": cat.id, "name": cat.name})

    # 6. Format
    final_data = []
    for d_id, data in report_dict.items():
        if data["total"] == 0: continue # Skip donors with no items in selected categories
        
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
        for cat_info in visible_categories:
            flat_row[cat_info["id"]] = data["category_amounts"].get(cat_info["id"], 0)
        final_data.append(flat_row)

    final_data.sort(key=lambda x: x["donor_name"])
    total_donors = len(final_data)
    avg_donation = grand_total / total_donors if total_donors > 0 else 0

    return {
        "categories": visible_categories,
        "data": final_data,
        "summary": {
            "grand_total": grand_total,
            "total_donors": total_donors,
            "avg_donation": avg_donation,
            "categories": {c["id"]: summary.get(c["id"], 0) for c in visible_categories}
        }
    }
