# routes/new_entry.py
from fastapi import APIRouter, HTTPException, File, UploadFile, Form, Header
from fastapi.responses import StreamingResponse
import json
from pydantic import BaseModel, model_validator
from typing import List, Optional
from db import pb, escape_pb_filter
import pandas as pd
import io
from datetime import datetime

router = APIRouter()


# Pydantic models for request validation
class TransactionItem(BaseModel):
    category_id: str
    amount: float

class ConflictResolution(BaseModel):
    category_id: str
    date: str
    action: str  # "overwrite" or "merge"

class NewEntryRequest(BaseModel):
    donor_id: str
    hijri_year: str
    payment_date: str
    total_amount: float
    notes: Optional[str] = ""
    items: List[TransactionItem]
    trust_id: Optional[str] = None
    trust_name: Optional[str] = None
    resolutions: Optional[List[ConflictResolution]] = None

    @model_validator(mode='before')
    def strip_strings(cls, values):
        if isinstance(values, dict):
            for k, v in values.items():
                if isinstance(v, str):
                    values[k] = v.strip()
        return values

from typing import List, Optional, Union

def process_transaction_items_with_resolutions(
    existing_items: list, 
    new_items: list, 
    resolutions: list = None
):
    res_map = {}
    if resolutions:
        for r in resolutions:
            r_cat = r.category_id if not isinstance(r, dict) else r.get("category_id")
            r_date = r.date if not isinstance(r, dict) else r.get("date")
            r_action = r.action if not isinstance(r, dict) else r.get("action")
            if r_cat and r_date and r_action:
                res_map[(str(r_cat).strip(), str(r_date).strip())] = str(r_action).strip().lower()

    updated_items = []
    detected_conflicts = []
    
    items_by_key = {}
    if existing_items:
        for item in existing_items:
            cat = str(item.get("category_id", "")).strip()
            date = str(item.get("date", "")).strip()
            amt = float(item.get("amount", 0))
            if cat and date:
                if (cat, date) in items_by_key:
                    items_by_key[(cat, date)]["amount"] += amt
                else:
                    items_by_key[(cat, date)] = {
                        "category_id": cat,
                        "amount": amt,
                        "date": date
                    }

    for new_item in new_items:
        new_cat = str(new_item.get("category_id", "")).strip()
        new_amt = float(new_item.get("amount", 0))
        new_date = str(new_item.get("date", "")).strip()
        key = (new_cat, new_date)

        if key in items_by_key:
            old_amt = items_by_key[key]["amount"]
            action = res_map.get(key)
            if action == "overwrite":
                items_by_key[key]["amount"] = new_amt
            elif action == "merge":
                items_by_key[key]["amount"] = old_amt + new_amt
            else:
                detected_conflicts.append({
                    "category_id": new_cat,
                    "date": new_date,
                    "old_amount": old_amt,
                    "new_amount": new_amt
                })
        else:
            items_by_key[key] = {
                "category_id": new_cat,
                "amount": new_amt,
                "date": new_date
            }

    updated_items = list(items_by_key.values())
    total_amount = sum(item["amount"] for item in updated_items)
    return updated_items, total_amount, detected_conflicts


@router.post("/create/")
async def create_new_entry(request_data: Union[NewEntryRequest, List[NewEntryRequest]], x_user_id: Optional[str] = Header(None)):
    try:
        entries = request_data if isinstance(request_data, list) else [request_data]
        
        # Phase 1: Conflict detection
        conflicts_response = []
        resolved_trusts = {}
        
        for entry_idx, entry in enumerate(entries):
            # Handle Trust
            trust_id = entry.trust_id
            if not trust_id and entry.trust_name:
                trust_name_clean = entry.trust_name.strip().upper()
                if trust_name_clean in resolved_trusts:
                    trust_id = resolved_trusts[trust_name_clean]
                else:
                    filter_str = f'name = "{escape_pb_filter(trust_name_clean)}"'
                    if x_user_id:
                        filter_str = f'({filter_str}) && created_by = "{x_user_id}"'
                    existing_trusts = pb.collection('trusts').get_list(1, 1, {
                        "filter": filter_str
                    })
                    if existing_trusts.items:
                        trust_id = existing_trusts.items[0].id
                    else:
                        payload = {"name": trust_name_clean}
                        if x_user_id:
                            payload["created_by"] = x_user_id
                        new_trust = pb.collection('trusts').create(payload)
                        trust_id = new_trust.id
                    resolved_trusts[trust_name_clean] = trust_id

            if not trust_id:
                query_params = {}
                if x_user_id:
                    query_params["filter"] = f'created_by = "{x_user_id}"'
                trusts = pb.collection('trusts').get_list(1, 1, query_params)
                if trusts.items: trust_id = trusts.items[0].id

            entry.trust_id = trust_id

            # Search for existing transaction
            d_id = escape_pb_filter(entry.donor_id)
            h_year = escape_pb_filter(entry.hijri_year)
            t_id = escape_pb_filter(trust_id)
            filter_str = f'donor_id = "{d_id}" && hijri_year = "{h_year}" && trust_id = "{t_id}"'
            if x_user_id:
                filter_str = f'({filter_str}) && created_by = "{x_user_id}"'
            existing = pb.collection('transactions').get_list(1, 1, query_params={"filter": filter_str})
            
            if existing.items:
                transaction = existing.items[0]
                new_items = [
                    {
                        "category_id": item.category_id, 
                        "amount": item.amount,
                        "date": entry.payment_date 
                    } for item in entry.items
                ]
                
                _, _, detected = process_transaction_items_with_resolutions(
                    transaction.items or [],
                    new_items,
                    entry.resolutions
                )
                
                if detected:
                    donor_name = "Unknown Donor"
                    try:
                        donor = pb.collection('donors').get_one(entry.donor_id)
                        donor_name = donor.name
                    except:
                        pass
                        
                    for conflict in detected:
                        cat_name = "Unknown Category"
                        try:
                            cat = pb.collection('categories').get_one(conflict["category_id"])
                            cat_name = cat.name
                        except:
                            pass
                        
                        conflicts_response.append({
                            "entry_index": entry_idx,
                            "donor_id": entry.donor_id,
                            "donor_name": donor_name,
                            "category_id": conflict["category_id"],
                            "category_name": cat_name,
                            "date": conflict["date"],
                            "old_amount": conflict["old_amount"],
                            "new_amount": conflict["new_amount"]
                        })

        if conflicts_response:
            return {"status": "conflict", "conflicts": conflicts_response}

        # Phase 2: Save to DB (since no conflicts or all are resolved)
        results = []
        for entry in entries:
            trust_id = entry.trust_id
            
            d_id = escape_pb_filter(entry.donor_id)
            h_year = escape_pb_filter(entry.hijri_year)
            t_id = escape_pb_filter(trust_id)
            filter_str = f'donor_id = "{d_id}" && hijri_year = "{h_year}" && trust_id = "{t_id}"'
            if x_user_id:
                filter_str = f'({filter_str}) && created_by = "{x_user_id}"'
            existing = pb.collection('transactions').get_list(1, 1, query_params={"filter": filter_str})

            new_items = [
                {
                    "category_id": item.category_id, 
                    "amount": item.amount,
                    "date": entry.payment_date 
                } for item in entry.items
            ]

            if existing.items:
                # UPDATE
                transaction = existing.items[0]
                updated_items, updated_total, _ = process_transaction_items_with_resolutions(
                    transaction.items or [], 
                    new_items, 
                    entry.resolutions
                )
                
                payload = {
                    "items": updated_items,
                    "total_amount": updated_total,
                    "payment_date": entry.payment_date,
                    "notes": (transaction.notes + " | " + entry.notes).strip(" | ") if entry.notes else transaction.notes
                }
                if x_user_id:
                    payload["created_by"] = x_user_id
                pb.collection('transactions').update(transaction.id, payload)
                results.append({"status": "updated", "id": transaction.id})
            else:
                # CREATE
                transaction_data = {
                    "donor_id": entry.donor_id,
                    "hijri_year": entry.hijri_year,
                    "payment_date": entry.payment_date,
                    "total_amount": entry.total_amount,
                    "notes": entry.notes,
                    "items": new_items,
                    "trust_id": trust_id
                }
                if x_user_id:
                    transaction_data["created_by"] = x_user_id
                transaction = pb.collection('transactions').create(transaction_data)
                results.append({"status": "created", "id": transaction.id})
        
        return {"status": "success", "processed": len(results), "results": results}

    except Exception as e:
        print(f"Error processing entries: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import-excel/")
async def import_excel(
    file: UploadFile = File(...),
    trust_id: Optional[str] = Form(None),
    hijri_year: str = Form(...),
    x_user_id: Optional[str] = Header(None)
):
    try:
        print(f"📥 Received Excel upload: {file.filename}")
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    def generate_progress():
        try:
            yield json.dumps({"event": "progress", "message": "Reading Excel file...", "percentage": 5}) + "\n"
            df = pd.read_excel(io.BytesIO(contents))
            
            if df.empty:
                yield json.dumps({"event": "error", "message": "The uploaded Excel file is empty."}) + "\n"
                return

            if "DONOR NAME" not in df.columns:
                yield json.dumps({"event": "error", "message": "Invalid Excel template. Missing 'DONOR NAME' column."}) + "\n"
                return

            # Remove empty rows and rows containing "TOTAL" in the donor name (e.g., category-wise totals row)
            donor_name_series = df["DONOR NAME"].astype(str).str.strip().str.upper()
            df = df[
                (donor_name_series != "") & 
                (donor_name_series != "NAN") & 
                (~donor_name_series.str.contains("TOTAL", na=False))
            ]
            total_rows = len(df)
            yield json.dumps({"event": "progress", "message": f"Excel parsed. Found {total_rows} rows to process.", "percentage": 10}) + "\n"

            # 1. Map existing categories
            yield json.dumps({"event": "progress", "message": "Mapping existing categories...", "percentage": 12}) + "\n"
            query_params = {}
            if x_user_id:
                query_params["filter"] = f'created_by = "{x_user_id}"'
            all_categories = pb.collection('categories').get_full_list(query_params=query_params)
            cat_map = {cat.name.upper().strip(): cat.id for cat in all_categories}
            cat_name_map = {cat.name.upper().strip(): cat.name for cat in all_categories}

            # 2. Map existing trusts
            yield json.dumps({"event": "progress", "message": "Mapping existing organizations...", "percentage": 14}) + "\n"
            all_trusts = pb.collection('trusts').get_full_list(query_params=query_params)
            trust_map = {t.name.upper().strip(): t.id for t in all_trusts}

            # 2.5 Map existing streets
            yield json.dumps({"event": "progress", "message": "Mapping existing streets...", "percentage": 16}) + "\n"
            all_streets = pb.collection('streets').get_full_list(query_params=query_params)
            street_set = {s.name.upper().strip() for s in all_streets}

            # 3. Auto-create missing categories
            yield json.dumps({"event": "progress", "message": "Creating missing categories...", "percentage": 18}) + "\n"
            special_cols = ["DONOR NAME", "DOOR NO", "STREET", "MOBILE", "TOTAL", "TRUST NAME", "GENDER", "HIJRI YEAR"]
            for col in df.columns:
                col_name = str(col).strip()
                col_upper = col_name.upper()
                if col_upper not in special_cols and col_upper not in cat_map:
                    try:
                        payload = {"name": col_upper, "is_active": True}
                        if x_user_id:
                            payload["created_by"] = x_user_id
                        new_cat = pb.collection('categories').create(payload)
                        cat_map[col_upper] = new_cat.id
                        cat_name_map[col_upper] = col_upper
                    except Exception as e:
                        pass

            import_results = {"created": 0, "updated": 0, "skipped": 0, "errors": []}
            category_cols = [col for col in df.columns if str(col).upper().strip() not in special_cols]

            # 4. Process Rows
            for idx, (_, row) in enumerate(df.iterrows()):
                name = str(row.get("DONOR NAME", "")).strip().upper()
                if not name or name.lower() == "nan":
                    continue

                try:
                    door_no = str(row.get("DOOR NO", "")).replace(".0", "").strip().upper() if pd.notna(row.get("DOOR NO")) else ""
                    street_raw = str(row.get("STREET", "")).strip() if pd.notna(row.get("STREET")) else ""
                    street = street_raw.upper()

                    # Auto-create street if missing
                    if street and street not in street_set:
                        try:
                            payload = {"name": street}
                            if x_user_id:
                                payload["created_by"] = x_user_id
                            pb.collection('streets').create(payload)
                            street_set.add(street)
                        except Exception as e:
                            pass

                    mobile = str(row.get("MOBILE", "")).replace(".0", "").strip() if pd.notna(row.get("MOBILE")) else ""
                    gender = str(row.get("GENDER", "M")).strip().upper()[:1] or "M"
                    excel_trust_name = str(row.get("TRUST NAME", "")).strip().upper()

                    row_hijri_year = str(row.get("HIJRI YEAR", hijri_year)).replace(".0", "").strip()
                    if not row_hijri_year or row_hijri_year.lower() == "nan":
                        row_hijri_year = hijri_year

                    # Determine Trust ID
                    row_trust_id = trust_id
                    if excel_trust_name and excel_trust_name.lower() != "nan":
                        trust_key = excel_trust_name.upper()
                        if trust_key in trust_map:
                            row_trust_id = trust_map[trust_key]
                        else:
                            try:
                                payload = {"name": excel_trust_name}
                                if x_user_id:
                                    payload["created_by"] = x_user_id
                                new_trust = pb.collection('trusts').create(payload)
                                trust_map[trust_key] = new_trust.id
                                row_trust_id = new_trust.id
                            except Exception as e:
                                pass

                    if not row_trust_id:
                        if "GENERAL" in trust_map:
                            row_trust_id = trust_map["GENERAL"]
                        else:
                            try:
                                payload = {"name": "General"}
                                if x_user_id:
                                    payload["created_by"] = x_user_id
                                new_gen_trust = pb.collection('trusts').create(payload)
                                row_trust_id = new_gen_trust.id
                                trust_map["GENERAL"] = row_trust_id
                            except:
                                pass

                    # Find or Create/Update Donor
                    n = escape_pb_filter(name)
                    dn = escape_pb_filter(door_no)
                    donor_filter = f'name = "{n}" && door_no = "{dn}"'
                    if x_user_id:
                        donor_filter = f'({donor_filter}) && created_by = "{x_user_id}"'
                    existing_donors = pb.collection('donors').get_list(1, 1, {"filter": donor_filter})

                    donor_data = {
                        "name": name,
                        "door_no": door_no,
                        "street": street,
                        "mobile": mobile,
                        "gender": gender,
                        "is_active": True
                    }
                    if x_user_id:
                        donor_data["created_by"] = x_user_id

                    if existing_donors.items:
                        donor_id = existing_donors.items[0].id
                        pb.collection('donors').update(donor_id, donor_data)
                    else:
                        new_donor = pb.collection('donors').create(donor_data)
                        donor_id = new_donor.id

                    # Extract Donation Items
                    items = []
                    row_total = 0
                    for col in category_cols:
                        val = row.get(col, 0)
                        if pd.notna(val) and val > 0:
                            col_key = str(col).upper().strip()
                            if col_key in cat_map:
                                items.append({
                                    "category_id": cat_map[col_key],
                                    "category_name": cat_name_map.get(col_key, col_key),
                                    "amount": float(val),
                                    "date": datetime.now().strftime("%Y-%m-%d")
                                })
                                row_total += float(val)

                    if not items:
                        continue

                    # Create or Skip Transaction
                    d_id = escape_pb_filter(donor_id)
                    rh_year = escape_pb_filter(row_hijri_year)
                    rt_id = escape_pb_filter(row_trust_id)
                    trans_filter = f'donor_id = "{d_id}" && hijri_year = "{rh_year}" && trust_id = "{rt_id}"'
                    if x_user_id:
                        trans_filter = f'({trans_filter}) && created_by = "{x_user_id}"'
                    existing_trans = pb.collection('transactions').get_list(1, 1, {"filter": trans_filter})

                    if existing_trans.items:
                        # Skip duplicate as requested by user
                        import_results["skipped"] += 1
                        msg = f"Skipped duplicate: {name} ({row_hijri_year})"
                    else:
                        payload = {
                            "donor_id": donor_id,
                            "hijri_year": row_hijri_year,
                            "trust_id": row_trust_id,
                            "payment_date": datetime.now().strftime("%Y-%m-%d"),
                            "total_amount": row_total,
                            "items": items
                        }
                        if x_user_id:
                            payload["created_by"] = x_user_id
                        pb.collection('transactions').create(payload)
                        import_results["created"] += 1
                        msg = f"Imported: {name} ({row_total} INR)"

                    # Send row status update
                    percent = int(20 + (idx + 1) / total_rows * 80)
                    yield json.dumps({
                        "event": "row",
                        "message": msg,
                        "current": idx + 1,
                        "total": total_rows,
                        "percentage": percent
                    }) + "\n"

                except Exception as row_err:
                    import_results["errors"].append(f"Error in row {name}: {str(row_err)}")
                    yield json.dumps({
                        "event": "row",
                        "message": f"Error in row {name}: {str(row_err)}",
                        "current": idx + 1,
                        "total": total_rows,
                        "percentage": int(20 + (idx + 1) / total_rows * 80)
                    }) + "\n"

            # Final complete event
            yield json.dumps({
                "event": "complete",
                "message": f"Import completed. Created {import_results['created']}, Skipped {import_results['skipped']}, Errors {len(import_results['errors'])}.",
                "results": import_results
            }) + "\n"

        except Exception as e:
            yield json.dumps({"event": "error", "message": f"Error during processing: {str(e)}"}) + "\n"

    return StreamingResponse(generate_progress(), media_type="application/x-ndjson")


