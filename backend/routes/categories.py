from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from db import pb

router = APIRouter()

class Category(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    is_active: bool = True
    trust_ids: List[str] = []

@router.get("/", response_model=List[Category])
async def get_categories():
    try:
        # Fetch all categories from PocketBase
        records = pb.collection('categories').get_full_list()
        return [
            Category(
                id=record.id,
                name=getattr(record, 'name', 'Unnamed'),
                description=getattr(record, 'description', ''),
                is_active=getattr(record, 'is_active', True),
                trust_ids=getattr(record, 'trust_ids', [])
            ) for record in records
        ]

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/create", response_model=Category)
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

        # 2. Fetch all active categories
        all_cats = pb.collection('categories').get_full_list()
        
        assigned = []
        others = []
        
        for c in all_cats:
            cat_data = {
                "id": c.id,
                "name": c.name,
                "trust_ids": getattr(c, 'trust_ids', [])
            }
            if c.id in assigned_ids:
                assigned.append(cat_data)
            else:
                others.append(cat_data)
                
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
            "filter": f'items ~ "{category_id}"'
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

