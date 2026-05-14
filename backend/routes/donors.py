from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from db import pb

router = APIRouter()

@router.get("/")
async def list_donors(search: Optional[str] = Query(None)):
    try:
        filter_str = ""
        if search:
            filter_str = f'name ~ "{search}"'
        
        result = pb.collection('donors').get_list(1, 20, {
            "filter": filter_str
        })
        
        return [
            {
                "id": r.id,
                "name": r.name,
                "door_no": getattr(r, 'door_no', ''),
                "street": getattr(r, 'street', ''),
                "mobile": getattr(r, 'mobile', ''),
                "gender": getattr(r, 'gender', '')
            }
            for r in result.items
        ]
    except Exception as e:
        return []

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


