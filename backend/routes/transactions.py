from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from db import pb

router = APIRouter()

class TransactionItem(BaseModel):
    category_id: str
    amount: float
    date: str

class TransactionUpdate(BaseModel):
    items: List[TransactionItem]
    total_amount: float
    hijri_year: str
    payment_date: str
    notes: Optional[str] = ""
    trust_id: Optional[str] = None


@router.get("/")
async def get_transactions(
    donor_id: Optional[str] = None, 
    hijri_year: Optional[str] = None,
    trust_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 10
):
    try:
        filters = []
        if donor_id and donor_id.strip():
            filters.append(f'donor_id = "{donor_id}"')
        if hijri_year and hijri_year.strip():
            filters.append(f'hijri_year = "{hijri_year}"')
        if trust_id and trust_id.strip():
            filters.append(f'trust_id = "{trust_id}"')
            
        filter_str = " && ".join(filters) if filters else ""

        
        # Build query params
        params = {
            "expand": "donor_id,trust_id",
            "sort": "-payment_date"
        }
        if filter_str:
            params["filter"] = filter_str

        # Always use pagination for history to keep it fast
        result = pb.collection('transactions').get_list(page, per_page, query_params=params)

        records = result.items
        total_pages = result.total_pages
        total_items = result.total_items

        data = []
        for r in records:
            donor_data = r.expand.get("donor_id") if r.expand else None
            trust_data = r.expand.get("trust_id") if r.expand else None
            
            data.append({
                "id": r.id,
                "donor_id": r.donor_id,
                "donor_name": donor_data.name if donor_data else "Unknown",
                "trust_id": getattr(r, 'trust_id', ''),
                "trust_name": trust_data.name if trust_data else "General",
                "trust_address": getattr(trust_data, 'address', ''),
                "trust_mobile": getattr(trust_data, 'mobile', ''),
                "hijri_year": r.hijri_year,
                "payment_date": r.payment_date,
                "total_amount": r.total_amount,
                "notes": r.notes,
                "items": r.items
            })


            
        return {
            "status": True,
            "msg": "Transactions fetched successfully",
            "data": data,
            "pagination": {
                "total_pages": total_pages,
                "total_items": total_items,
                "current_page": page
            }
        }
    except Exception as e:
        return {"status": False, "msg": str(e), "data": [], "pagination": None}


@router.post("/create/")
async def create_transaction(transaction: TransactionUpdate):
    try:
        # Calculate new total using object attributes
        total = sum(item.amount for item in transaction.items)
        
        # Convert items list to dicts for PocketBase
        items_data = [item.dict() for item in transaction.items]
        
        data = {
            "items": items_data,
            "total_amount": total,
            "notes": transaction.notes,
            "hijri_year": transaction.hijri_year,
            "payment_date": transaction.payment_date,
            "trust_id": transaction.trust_id
        }

        record = pb.collection('transactions').create(data)
        return {
            "status": True,
            "msg": "Transaction created successfully",
            "data": {"id": record.id}
        }
    except Exception as e:
        print(f"Create Error: {e}")
        return {"status": False, "msg": str(e), "data": None}


@router.post("/batch-create/")
async def batch_create_transactions(transactions: List[TransactionUpdate]):
    try:
        results = []
        for t in transactions:
            total = sum(item.amount for item in t.items)
            items_data = [item.dict() for item in t.items]
            data = {
                "items": items_data,
                "total_amount": total,
                "notes": t.notes,
                "hijri_year": t.hijri_year,
                "payment_date": t.payment_date,
                "trust_id": t.trust_id
            }
            results.append(pb.collection('transactions').create(data).id)
        
        return {
            "status": True,
            "msg": f"Successfully created {len(results)} transactions",
            "data": results
        }
    except Exception as e:
        print(f"Batch Create Error: {e}")
        return {"status": False, "msg": str(e), "data": None}


@router.put("/{transaction_id}")
async def update_transaction(transaction_id: str, request: TransactionUpdate):
    try:
        # Calculate new total using object attributes
        total = sum(item.amount for item in request.items)
        
        # Convert items list to dicts for PocketBase
        items_data = [item.dict() for item in request.items]
        
        data = {
            "items": items_data,
            "total_amount": total,
            "notes": request.notes,
            "hijri_year": request.hijri_year,
            "payment_date": request.payment_date
        }
        
        # Handle trust_id specifically
        if request.trust_id:
            data["trust_id"] = request.trust_id
        elif request.trust_id == "":
            data["trust_id"] = None

        record = pb.collection('transactions').update(transaction_id, data)
        return {
            "status": True,
            "msg": "Transaction updated successfully",
            "data": {"id": record.id}
        }
    except Exception as e:
        print(f"Update Error: {e}")
        return {"status": False, "msg": str(e), "data": None}


@router.delete("/{transaction_id}")
async def delete_transaction(transaction_id: str):
    try:
        pb.collection('transactions').delete(transaction_id)
        return {
            "status": True,
            "msg": "Transaction deleted successfully",
            "data": None
        }
    except Exception as e:
        return {"status": False, "msg": str(e), "data": None}
