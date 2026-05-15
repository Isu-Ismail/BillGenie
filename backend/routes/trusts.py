from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from db import pb, escape_pb_filter
from rapidfuzz import process, fuzz

router = APIRouter()

class TrustRequest(BaseModel):
    name: str
    address: Optional[str] = ""
    mobile: Optional[str] = ""
    email: Optional[str] = ""
    category_ids: List[str] = []


@router.get("/")
async def list_trusts(
    search: Optional[str] = Query(None),
    page: int = 1,
    per_page: int = 20
):
    try:
        if not search:
            result = pb.collection('trusts').get_list(page, per_page)
            return {
                "items": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "address": getattr(r, 'address', ''),
                        "mobile": getattr(r, 'mobile', ''),
                        "email": getattr(r, 'email', ''),
                        "category_ids": getattr(r, 'category_ids', [])
                    }
                    for r in result.items
                ],
                "total": result.total_items,
                "page": result.page,
                "per_page": result.per_page
            }

        # FUZZY SEARCH
        all_trusts = pb.collection('trusts').get_full_list()
        trust_map = {r.id: r for r in all_trusts}
        choices = {r.id: f"{r.name} {getattr(r, 'address', '')} {getattr(r, 'email', '')}" for r in all_trusts}
        
        matches = process.extract(search, choices, scorer=fuzz.WRatio, limit=100)
        
        items = []
        for match_text, score, tid in matches:
            if score > 45:
                r = trust_map[tid]
                items.append({
                    "id": r.id,
                    "name": r.name,
                    "address": getattr(r, 'address', ''),
                    "mobile": getattr(r, 'mobile', ''),
                    "email": getattr(r, 'email', ''),
                    "category_ids": getattr(r, 'category_ids', []),
                    "score": score
                })
        
        start = (page - 1) * per_page
        end = start + per_page
        return {
            "items": items[start:end],
            "total": len(items),
            "page": page,
            "per_page": per_page
        }
    except Exception as e:
        print(f"ERROR listing trusts: {e}")
        return {"items": [], "total": 0}
    except Exception as e:
        print(f"ERROR listing trusts: {e}")
        return {"items": [], "total": 0}

@router.post("/create/")
async def create_trust(trust: TrustRequest):
    try:
        data = trust.dict()
        data["name"] = data["name"].upper() # FORCE UPPERCASE
        record = pb.collection('trusts').create(data)
        print(f"DEBUG: Trust created with ID: {record.id}")
        return {"status": True, "msg": "Trust created successfully", "id": record.id}
    except Exception as e:
        print(f"ERROR creating trust: {e}")
        return {"status": False, "msg": str(e)}

@router.delete("/{trust_id}")
async def delete_trust(trust_id: str):
    try:
        # Check if any transactions are using this trust
        usage_check = pb.collection('transactions').get_list(1, 1, {
            "filter": f'trust_id = "{escape_pb_filter(trust_id)}"'
        })

        if usage_check.total_items > 0:
            raise HTTPException(
                status_code=400,
                detail="This trust organization has active donation records and cannot be deleted. All transactions must be removed first."
            )

        pb.collection('trusts').delete(trust_id)
        return {"status": True, "msg": "Trust deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR deleting trust: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{trust_id}")
async def update_trust(trust_id: str, trust: TrustRequest):
    try:
        data = trust.dict()
        data["name"] = data["name"].upper() # FORCE UPPERCASE
        record = pb.collection('trusts').update(trust_id, data)
        return {"status": True, "msg": "Trust updated successfully", "id": record.id}
    except Exception as e:
        print(f"ERROR updating trust: {e}")
        return {"status": False, "msg": str(e)}


@router.get("/detail/{trust_id}")
async def get_trust(trust_id: str):

    try:
        record = pb.collection('trusts').get_one(trust_id)
        return {
            "status": True,
            "data": {
                "id": record.id,
                "name": record.name,
                "address": getattr(record, 'address', ''),
                "mobile": getattr(record, 'mobile', ''),
                "email": getattr(record, 'email', ''),
                "category_ids": getattr(record, 'category_ids', [])
            }
        }
    except Exception as e:
        return {"status": False, "msg": str(e), "data": None}
