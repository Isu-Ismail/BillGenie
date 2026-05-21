from fastapi import APIRouter, HTTPException, Query, Header
from typing import Optional, List
from pydantic import BaseModel, model_validator
from rapidfuzz import process, fuzz
from db import pb

router = APIRouter()

class DonorCreate(BaseModel):
    name: str
    gender: Optional[str] = "M"
    mobile: Optional[str] = ""
    door_no: Optional[str] = ""
    street: Optional[str] = ""
    is_member: Optional[bool] = False
    member_id: Optional[float] = None

    @model_validator(mode='before')
    def strip_strings(cls, values):
        if isinstance(values, dict):
            for k, v in values.items():
                if isinstance(v, str):
                    values[k] = v.strip()
            if "member_id" in values and (values["member_id"] == "" or values["member_id"] is None):
                values["member_id"] = None
        return values

@router.get("/")
async def list_donors(
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
            result = pb.collection('donors').get_list(page, per_page, query_params)
            return {
                "items": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "door_no": getattr(r, 'door_no', ''),
                        "street": getattr(r, 'street', ''),
                        "mobile": getattr(r, 'mobile', ''),
                        "gender": getattr(r, 'gender', ''),
                        "is_member": getattr(r, 'is_member', False),
                        "member_id": getattr(r, 'member_id', None)
                    }
                    for r in result.items
                ],
                "total": result.total_items,
                "page": result.page,
                "per_page": result.per_page
            }

        # FUZZY SEARCH
        # 1. Try Fuzzy Search first
        try:
            query_params = {}
            if x_user_id:
                query_params["filter"] = f'created_by = "{x_user_id}"'
            all_donors = pb.collection('donors').get_full_list(query_params=query_params)
            
            search_lower = search.lower()
            donor_map = {r.id: r for r in all_donors}
            choices = {
                r.id: f"{getattr(r, 'name', '').lower()} {getattr(r, 'mobile', '').lower()} {getattr(r, 'street', '').lower()}" 
                for r in all_donors
            }
            
            matches = process.extract(search_lower, choices, scorer=fuzz.WRatio, limit=100)
            
            items = []
            for match_text, score, donor_id in matches:
                if score > 45:
                    r = donor_map[donor_id]
                    items.append({
                        "id": r.id,
                        "name": r.name,
                        "door_no": getattr(r, 'door_no', ''),
                        "street": getattr(r, 'street', ''),
                        "mobile": getattr(r, 'mobile', ''),
                        "gender": getattr(r, 'gender', ''),
                        "is_member": getattr(r, 'is_member', False),
                        "member_id": getattr(r, 'member_id', None),
                        "score": score
                    })
            
            start = (page - 1) * per_page
            end = start + per_page
            print(f"DEBUG: Returning {len(items)} fuzzy matches: {[i['name'] for i in items[:5]]}...")
            return {
                "items": items[start:end],
                "total": len(items),
                "page": page,
                "per_page": per_page
            }
        except Exception as fuzzy_err:
            print(f"Fuzzy search failed, falling back to standard: {fuzzy_err}")
            # Fallback to standard PocketBase search
            from db import escape_pb_filter
            search_esc = escape_pb_filter(search)
            filter_str = f'name ~ "{search_esc}" || mobile ~ "{search_esc}" || street ~ "{search_esc}"'
            if x_user_id:
                filter_str = f'({filter_str}) && created_by = "{x_user_id}"'
            
            result = pb.collection('donors').get_list(page, per_page, {"filter": filter_str})
            print(f"DEBUG: Returning {len(result.items)} standard fallback matches.")
            return {
                "items": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "door_no": getattr(r, 'door_no', ''),
                        "street": getattr(r, 'street', ''),
                        "mobile": getattr(r, 'mobile', ''),
                        "gender": getattr(r, 'gender', ''),
                        "is_member": getattr(r, 'is_member', False),
                        "member_id": getattr(r, 'member_id', None)
                    }
                    for r in result.items
                ],
                "total": result.total_items,
                "page": result.page,
                "per_page": result.per_page
            }
    except Exception as e:
        print(f"ERROR listing donors: {e}")
        return {"items": [], "total": 0}

@router.get("/streets")
async def list_unique_streets(
    page: int = 1,
    per_page: int = 50,
    x_user_id: Optional[str] = Header(None)
):
    try:
        # Fetch only the street field from all donors
        query_params = {"fields": "street"}
        if x_user_id:
            query_params["filter"] = f'created_by = "{x_user_id}"'
        all_donors = pb.collection('donors').get_full_list(query_params=query_params)
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

@router.post("/create/")
@router.post("/create")
async def create_donor(donor: DonorCreate, x_user_id: Optional[str] = Header(None)):
    try:
        payload = {
            "name": donor.name,
            "gender": donor.gender,
            "mobile": donor.mobile,
            "door_no": donor.door_no,
            "street": donor.street,
            "is_member": donor.is_member,
            "member_id": donor.member_id,
            "is_active": True
        }
        if x_user_id:
            payload["created_by"] = x_user_id
        new_record = pb.collection('donors').create(payload)
        return {
            "id": new_record.id,
            "name": new_record.name,
            "gender": getattr(new_record, 'gender', 'M'),
            "mobile": getattr(new_record, 'mobile', ''),
            "door_no": getattr(new_record, 'door_no', ''),
            "street": getattr(new_record, 'street', ''),
            "is_member": getattr(new_record, 'is_member', False),
            "member_id": getattr(new_record, 'member_id', None)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create donor: {str(e)}")

@router.post("/batch-create/")
@router.post("/batch-create")
async def batch_create_donors(donors: List[DonorCreate], x_user_id: Optional[str] = Header(None)):
    results = {"success": 0, "failed": 0, "errors": []}
    for donor in donors:
        try:
            payload = {
                "name": donor.name,
                "gender": donor.gender,
                "mobile": donor.mobile,
                "door_no": donor.door_no,
                "street": donor.street,
                "is_member": donor.is_member,
                "member_id": donor.member_id,
                "is_active": True
            }
            if x_user_id:
                payload["created_by"] = x_user_id
            pb.collection('donors').create(payload)
            results["success"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append(f"Error in {donor.name}: {str(e)}")
    
    return results

class BulkDeleteRequest(BaseModel):
    ids: List[str]

@router.post("/bulk-delete")
@router.post("/bulk-delete/")
async def bulk_delete_donors(request: BulkDeleteRequest):
    try:
        deleted_count = 0
        for donor_id in request.ids:
            # 1. Cascade delete transactions
            transactions = pb.collection('transactions').get_full_list(query_params={"filter": f'donor_id = "{donor_id}"'})
            for t in transactions:
                pb.collection('transactions').delete(t.id)
            
            # 2. Delete the donor
            pb.collection('donors').delete(donor_id)
            deleted_count += 1
            
        return {"status": True, "msg": f"{deleted_count} donors and associated data deleted successfully"}
    except Exception as e:
        print(f"ERROR bulk deleting donors: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/detail/{donor_id}")
@router.get("/{donor_id}")
async def get_donor_detail_explicit(donor_id: str, x_user_id: Optional[str] = Header(None)):
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
                "gender": getattr(record, 'gender', ''),
                "is_member": getattr(record, 'is_member', False),
                "member_id": getattr(record, 'member_id', None)
            }
        }
    except Exception as e:
        return {"status": False, "msg": str(e), "data": None}

@router.put("/{donor_id}")
async def update_donor(donor_id: str, donor: DonorCreate, x_user_id: Optional[str] = Header(None)):
    try:
        payload = {
            "name": donor.name,
            "gender": donor.gender,
            "mobile": donor.mobile,
            "door_no": donor.door_no,
            "street": donor.street,
            "is_member": donor.is_member,
            "member_id": donor.member_id
        }
        if x_user_id:
            payload["created_by"] = x_user_id
        updated_record = pb.collection('donors').update(donor_id, payload)
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

