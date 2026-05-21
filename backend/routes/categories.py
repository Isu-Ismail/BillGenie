from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, model_validator
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

    @model_validator(mode='before')
    def strip_strings(cls, values):
        if isinstance(values, dict):
            for k, v in values.items():
                if isinstance(v, str):
                    values[k] = v.strip()
        return values

@router.get("/")
async def get_categories(
    search: Optional[str] = Query(None),
    page: int = 1,
    per_page: int = 20,
    x_user_id: Optional[str] = Header(None)
):
    try:
        if not search:
            query_params = {}
            if x_user_id:
                query_params["filter"] = f'created_by = "{x_user_id}"'
            result = pb.collection('categories').get_list(page, per_page, query_params)
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
        query_params = {}
        if x_user_id:
            query_params["filter"] = f'created_by = "{x_user_id}"'
        all_cats = pb.collection('categories').get_full_list(query_params=query_params)
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
async def create_category(category: Category, x_user_id: Optional[str] = Header(None)):
    try:
        data = {
            "name": category.name,
            "description": category.description,
            "is_active": category.is_active,
            "trust_ids": category.trust_ids
        }
        if x_user_id:
            data["created_by"] = x_user_id
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
async def update_category(category_id: str, category: Category, x_user_id: Optional[str] = Header(None)):
    try:
        data = {
            "name": category.name,
            "description": category.description,
            "is_active": category.is_active,
            "trust_ids": category.trust_ids
        }
        if x_user_id:
            data["created_by"] = x_user_id
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
async def get_categories_by_trust(trust_id: str, x_user_id: Optional[str] = Header(None)):
    try:
        # 1. Fetch the trust with expanded category relation
        try:
            trust = pb.collection('trusts').get_one(trust_id, {"expand": "category_ids"})
            trust_name = getattr(trust, 'name', '')
            assigned_records = getattr(trust, 'expand', {}).get('category_ids', [])
            if not isinstance(assigned_records, list):
                assigned_records = [assigned_records] if assigned_records else []
            assigned = [
                {
                    "id": c.id,
                    "name": getattr(c, 'name', 'Unnamed'),
                    "trust_ids": getattr(c, 'trust_ids', [])
                } for c in assigned_records
            ]
        except Exception as e:
            print(f"Error fetching trust or categories: {e}")
            assigned = []
            trust_name = ''

        # 2. Fetch all categories without user/username check
        all_cats = pb.collection('categories').get_full_list()
        assigned_ids = {c["id"] for c in assigned}
        
        others = [
            {
                "id": c.id,
                "name": getattr(c, 'name', 'Unnamed'),
                "trust_ids": getattr(c, 'trust_ids', [])
            } for c in all_cats if c.id not in assigned_ids
        ]
                
        return {
            "trust_name": trust_name,
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

class BulkDeleteRequest(BaseModel):
    ids: List[str]

@router.post("/bulk-delete/")
async def bulk_delete_categories(request: BulkDeleteRequest):
    try:
        in_use_ids = []
        for cid in request.ids:
            usage_check = pb.collection('transactions').get_list(1, 1, {
                "filter": f'items ~ "{escape_pb_filter(cid)}"'
            })
            if usage_check.total_items > 0:
                in_use_ids.append(cid)
        
        if in_use_ids:
            in_use_names = []
            for cid in in_use_ids:
                try:
                    cat = pb.collection('categories').get_one(cid)
                    in_use_names.append(getattr(cat, 'name', cid))
                except:
                    in_use_names.append(cid)
            raise HTTPException(
                status_code=400,
                detail=f"The following categories are in use by existing donations and cannot be deleted: {', '.join(in_use_names)}. Try deactivating them instead."
            )
            
        for cid in request.ids:
            pb.collection('categories').delete(cid)
        return {"status": "success", "message": f"{len(request.ids)} categories deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

