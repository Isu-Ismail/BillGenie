from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from rapidfuzz import process, fuzz
from db import pb

router = APIRouter()

class DonorCreate(BaseModel):
    name: str
    gender: Optional[str] = "M"
    mobile: Optional[str] = ""
    door_no: Optional[str] = ""
    street: Optional[str] = ""

@router.get("/")
async def list_donors(
    search: Optional[str] = Query(None),
    page: int = 1,
    per_page: int = 20
):
    try:
        if not search:
            result = pb.collection('donors').get_list(page, per_page)
            return {
                "items": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "door_no": getattr(r, 'door_no', ''),
                        "street": getattr(r, 'street', ''),
                        "mobile": getattr(r, 'mobile', ''),
                        "gender": getattr(r, 'gender', '')
                    }
                    for r in result.items
                ],
                "total": result.total_items,
                "page": result.page,
                "per_page": result.per_page
            }

        # FUZZY SEARCH
        # 1. Fetch all donors (for smaller/medium datasets this is very fast)
        all_donors = pb.collection('donors').get_full_list()
        
        # 2. Extract matches using rapidfuzz
        donor_map = {r.id: r for r in all_donors}
        choices = {r.id: f"{r.name} {getattr(r, 'mobile', '')} {getattr(r, 'street', '')}" for r in all_donors}
        
        # Use WRatio for better natural language matching (handles typos, word order, etc.)
        matches = process.extract(
            search, 
            choices, 
            scorer=fuzz.WRatio, 
            limit=100 # Get top 100 matches
        )
        
        # 3. Filter by threshold and format
        items = []
        for match_text, score, donor_id in matches:
            if score > 45: # Forgiving threshold for typos
                r = donor_map[donor_id]
                items.append({
                    "id": r.id,
                    "name": r.name,
                    "door_no": getattr(r, 'door_no', ''),
                    "street": getattr(r, 'street', ''),
                    "mobile": getattr(r, 'mobile', ''),
                    "gender": getattr(r, 'gender', ''),
                    "score": score
                })
        
        # 4. Handle pagination for fuzzy results
        start = (page - 1) * per_page
        end = start + per_page
        paginated_items = items[start:end]
        
        return {
            "items": paginated_items,
            "total": len(items),
            "page": page,
            "per_page": per_page
        }
    except Exception as e:
        print(f"ERROR listing donors: {e}")
        return {"items": [], "total": 0}

@router.get("/detail/{donor_id}")
async def get_donor_detail_explicit(donor_id: str):
    try:
        record = pb.collection('donors').get_one(donor_id)
        return {
            "status": True,
            "data": {
                "id": record.id,
                "name": record.name,
                "door_no": getattr(record, 'door_no', ''),
                "street": getattr(record, 'street', ''),
                "mobile": getattr(record, 'mobile', ''),
                "gender": getattr(record, 'gender', '')
            }
        }
    except Exception as e:
        return {"status": False, "msg": str(e), "data": None}

@router.post("/create/")
async def create_donor(donor: DonorCreate):
    try:
        new_record = pb.collection('donors').create({
            "name": donor.name,
            "gender": donor.gender,
            "mobile": donor.mobile,
            "door_no": donor.door_no,
            "street": donor.street,
            "is_active": True
        })
        return {
            "id": new_record.id,
            "name": new_record.name,
            "gender": getattr(new_record, 'gender', 'M'),
            "mobile": getattr(new_record, 'mobile', ''),
            "door_no": getattr(new_record, 'door_no', ''),
            "street": getattr(new_record, 'street', '')
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create donor: {str(e)}")

@router.post("/batch-create/")
async def batch_create_donors(donors: List[DonorCreate]):
    results = {"success": 0, "failed": 0, "errors": []}
    for donor in donors:
        try:
            pb.collection('donors').create({
                "name": donor.name,
                "gender": donor.gender,
                "mobile": donor.mobile,
                "door_no": donor.door_no,
                "street": donor.street,
                "is_active": True
            })
            results["success"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append(f"Error in {donor.name}: {str(e)}")
    
    return results

@router.put("/{donor_id}")
async def update_donor(donor_id: str, donor: DonorCreate):
    try:
        updated_record = pb.collection('donors').update(donor_id, {
            "name": donor.name,
            "gender": donor.gender,
            "mobile": donor.mobile,
            "door_no": donor.door_no,
            "street": donor.street
        })
        return {"status": True, "data": updated_record.id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{donor_id}")
async def delete_donor(donor_id: str):
    try:
        # 1. Cascade delete transactions
        transactions = pb.collection('transactions').get_full_list(query_params={"filter": f'donor_id = "{donor_id}"'})
        for t in transactions:
            pb.collection('transactions').delete(t.id)
        
        # 2. Delete the donor
        pb.collection('donors').delete(donor_id)
        return {"status": True, "msg": "Donor and all associated data deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/streets")
async def list_unique_streets(
    page: int = 1,
    per_page: int = 50
):
    try:
        # Fetch only the street field from all donors
        all_donors = pb.collection('donors').get_full_list(query_params={"fields": "street"})
        # Filter out empty strings and get unique sorted list
        unique_streets = sorted(list(set(getattr(r, 'street', '') for r in all_donors if getattr(r, 'street', ''))))
        
        # Format as objects for frontend components that expect name/id
        items = [{"id": s, "name": s, "description": ""} for s in unique_streets]
        
        # Handle manual pagination for this derived list
        start = (page - 1) * per_page
        end = start + per_page
        
        return {
            "items": items[start:end],
            "total": len(items),
            "page": page,
            "per_page": per_page
        }
    except Exception as e:
        print(f"Error fetching unique streets: {e}")
        return {"items": [], "total": 0, "page": 1, "per_page": per_page}

