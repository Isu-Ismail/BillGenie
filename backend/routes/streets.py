from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from db import pb
from rapidfuzz import process, fuzz

router = APIRouter()

class StreetRequest(BaseModel):
    name: str
    description: Optional[str] = ""

@router.get("/")
async def list_streets(
    search: Optional[str] = Query(None),
    page: int = 1,
    per_page: int = 20
):
    try:
        if not search:
            result = pb.collection('streets').get_list(page, per_page)
            return {
                "items": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "description": getattr(r, "description", "")
                    }
                    for r in result.items
                ],
                "total": result.total_items,
                "page": result.page,
                "per_page": result.per_page
            }

        # 1. Try Fuzzy Search first
        try:
            search_lower = search.lower()
            all_streets = pb.collection('streets').get_full_list()
            choices = {
                r.id: f"{getattr(r, 'name', '').lower()} {getattr(r, 'description', '').lower()}" 
                for r in all_streets
            }
            
            matches = process.extract(search_lower, choices, scorer=fuzz.WRatio, limit=100)
            
            items = []
            for match_text, score, sid in matches:
                if score > 45:
                    r = next(s for s in all_streets if s.id == sid)
                    items.append({
                        "id": r.id,
                        "name": r.name,
                        "description": getattr(r, "description", ""),
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
        except Exception as fuzzy_err:
            print(f"Fuzzy street search failed, falling back to standard: {fuzzy_err}")
            from db import escape_pb_filter
            search_esc = escape_pb_filter(search)
            result = pb.collection('streets').get_list(page, per_page, {
                "filter": f'name ~ "{search_esc}" || description ~ "{search_esc}"'
            })
            return {
                "items": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "description": getattr(r, "description", "")
                    }
                    for r in result.items
                ],
                "total": result.total_items,
                "page": result.page,
                "per_page": result.per_page
            }
    except Exception as e:
        print(f"ERROR listing streets: {e}")
        return {"items": [], "total": 0, "page": 1, "per_page": per_page}

@router.post("/create/")
async def create_street(street: StreetRequest):
    try:
        data = street.dict()
        data["name"] = data["name"].upper() # FORCE UPPERCASE
        record = pb.collection('streets').create(data)
        return {"status": True, "msg": "Street created successfully", "id": record.id}
    except Exception as e:
        print(f"ERROR creating street: {e}")
        return {"status": False, "msg": str(e)}

@router.put("/{street_id}")
async def update_street(street_id: str, street: StreetRequest):
    try:
        data = street.dict()
        data["name"] = data["name"].upper() # FORCE UPPERCASE
        record = pb.collection('streets').update(street_id, data)
        return {"status": True, "msg": "Street updated successfully", "id": record.id}
    except Exception as e:
        print(f"ERROR updating street: {e}")
        return {"status": False, "msg": str(e)}

@router.delete("/{street_id}")
async def delete_street(street_id: str):
    try:
        pb.collection('streets').delete(street_id)
        return {"status": True, "msg": "Street deleted successfully"}
    except Exception as e:
        print(f"ERROR deleting street: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/detail/{street_id}")
async def get_street(street_id: str):
    try:
        record = pb.collection('streets').get_one(street_id)
        return {
            "status": True,
            "data": {
                "id": record.id,
                "name": record.name,
                "description": getattr(record, 'description', '')
            }
        }
    except Exception as e:
        return {"status": False, "msg": str(e), "data": None}
