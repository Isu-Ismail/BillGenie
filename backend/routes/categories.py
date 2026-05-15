from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from db import pb, escape_pb_filter
from rapidfuzz import process, fuzz

router = APIRouter()

class Category(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    is_active: bool = True
    trust_ids: List[str] = []

@router.get("/")
async def get_categories(
    search: Optional[str] = Query(None),
    page: int = 1,
    per_page: int = 20
):
    try:
        if not search:
            result = pb.collection('categories').get_list(page, per_page)
            return {
                "items": [
                    {
                        "id": record.id,
                        "name": getattr(record, 'name', 'Unnamed'),
                        "description": getattr(record, 'description', ''),
                        "is_active": getattr(record, 'is_active', True),
                        "trust_ids": getattr(record, 'trust_ids', [])
                    } for record in result.items
                ],
                "total": result.total_items,
                "page": result.page,
                "per_page": result.per_page
            }

        # FUZZY SEARCH
        all_cats = pb.collection('categories').get_full_list()
        cat_map = {r.id: r for r in all_cats}
        choices = {r.id: f"{r.name} {getattr(r, 'description', '')}" for r in all_cats}
        
        matches = process.extract(search, choices, scorer=fuzz.WRatio, limit=100)
        
        items = []
        for match_text, score, cid in matches:
            if score > 45:
                r = cat_map[cid]
                items.append({
                    "id": r.id,
                    "name": getattr(r, 'name', 'Unnamed'),
                    "description": getattr(r, 'description', ''),
                    "is_active": getattr(r, 'is_active', True),
                    "trust_ids": getattr(r, 'trust_ids', []),
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
        print(f"ERROR listing categories: {e}")
        return {"items": [], "total": 0}

    except Exception as e:
        print(f"ERROR listing categories: {e}")
        return {"items": [], "total": 0}

@router.post("/create/", response_model=Category)
async def create_category(category: Category):
    try:
        data = {
            "name": category.name,
            "description": category.description,
            "is_active": category.is_active,
            "trust_ids": category.trust_ids
        }
        record = pb.collection('categories').create(data)
        return Category(
            id=record.id,
            name=record.name,
            description=record.description,
            is_active=record.is_active,
            trust_ids=getattr(record, 'trust_ids', [])
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{category_id}", response_model=Category)
async def update_category(category_id: str, category: Category):
    try:
        data = {
            "name": category.name,
            "description": category.description,
            "is_active": category.is_active,
            "trust_ids": category.trust_ids
        }
        record = pb.collection('categories').update(category_id, data)
        return Category(
            id=record.id,
            name=record.name,
            description=record.description,
            is_active=record.is_active,
            trust_ids=getattr(record, 'trust_ids', [])
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/by-trust/{trust_id}")
async def get_categories_by_trust(trust_id: str):
    try:
        # 1. Fetch the trust to get its category_ids
        try:
            trust = pb.collection('trusts').get_one(trust_id)
            assigned_ids = getattr(trust, 'category_ids', [])
        except:
            assigned_ids = []

        # 2. Fetch all categories
        all_cats = pb.collection('categories').get_full_list()
        cat_map = {c.id: {
            "id": c.id,
            "name": getattr(c, 'name', 'Unnamed'),
            "trust_ids": getattr(c, 'trust_ids', [])
        } for c in all_cats}
        
        # Build assigned list in the SPECIFIC order of assigned_ids
        assigned = []
        for cid in assigned_ids:
            if cid in cat_map:
                assigned.append(cat_map[cid])
        
        # Build others list (any category NOT in assigned_ids)
        others = [cat_map[cid] for cid in cat_map if cid not in assigned_ids]
                
        return {
            "assigned": assigned,
            "others": others
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{category_id}")
async def delete_category(category_id: str):
    try:
        # Check if any transactions are using this category
        # Since items is a JSON field, we search for the ID in the JSON string
        usage_check = pb.collection('transactions').get_list(1, 1, {
            "filter": f'items ~ "{escape_pb_filter(category_id)}"'
        })

        if usage_check.total_items > 0:
            raise HTTPException(
                status_code=400, 
                detail="This category is in use by existing donations and cannot be deleted. Try deactivating it instead."
            )

        pb.collection('categories').delete(category_id)
        return {"status": "success", "message": "Category deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

