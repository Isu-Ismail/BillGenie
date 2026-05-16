# routes/new_entry.py
from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from pydantic import BaseModel
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

class NewEntryRequest(BaseModel):
    donor_id: str
    hijri_year: str
    payment_date: str
    total_amount: float
    notes: Optional[str] = ""
    items: List[TransactionItem]
    trust_id: Optional[str] = None
    trust_name: Optional[str] = None

from typing import List, Optional, Union

# ... (models stay the same)

@router.post("/create/")
async def create_new_entry(request_data: Union[NewEntryRequest, List[NewEntryRequest]]):
    try:
        # Normalize to a list even if a single object was sent
        entries = request_data if isinstance(request_data, list) else [request_data]
        results = []

        for entry in entries:
            # 0. Handle Trust
            trust_id = entry.trust_id
            if not trust_id and entry.trust_name:
                trust_name_clean = entry.trust_name.strip().upper()
                existing_trusts = pb.collection('trusts').get_list(1, 1, {
                    "filter": f'name = "{escape_pb_filter(trust_name_clean)}"'
                })
                if existing_trusts.items:
                    trust_id = existing_trusts.items[0].id
                else:
                    new_trust = pb.collection('trusts').create({"name": trust_name_clean})
                    trust_id = new_trust.id

            if not trust_id:
                trusts = pb.collection('trusts').get_list(1, 1)
                if trusts.items: trust_id = trusts.items[0].id

            # 1. Search for existing transaction
            d_id = escape_pb_filter(entry.donor_id)
            h_year = escape_pb_filter(entry.hijri_year)
            t_id = escape_pb_filter(trust_id)
            filter_str = f'donor_id = "{d_id}" && hijri_year = "{h_year}" && trust_id = "{t_id}"'
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
                updated_items = (transaction.items or []) + new_items
                updated_total = transaction.total_amount + entry.total_amount
                
                pb.collection('transactions').update(transaction.id, {
                    "items": updated_items,
                    "total_amount": updated_total,
                    "payment_date": entry.payment_date,
                    "notes": (transaction.notes + " | " + entry.notes).strip(" | ") if entry.notes else transaction.notes
                })
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
    hijri_year: str = Form(...)
):
    try:
        print(f"📥 Received Excel upload: {file.filename}")
        # Read the Excel file
        contents = await file.read()
        print(f"📊 File size: {len(contents)} bytes")
        
        df = pd.read_excel(io.BytesIO(contents))
        print(f"✅ Excel read successfully. Columns: {df.columns.tolist()}")
        
        if df.empty:
            raise HTTPException(status_code=400, detail="The uploaded Excel file is empty.")

        # If columns are missing or incorrectly read, handle it
        if "DONOR NAME" not in df.columns:
            # Maybe the headers are not on row 1? 
            # We assume Row 1 is header.
            pass

        # Filter out the 'TOTALS' row if it exists
        if "DONOR NAME" in df.columns:
            df = df[df["DONOR NAME"].astype(str).str.upper() != "TOTALS"]

        # 1. Map existing categories
        all_categories = pb.collection('categories').get_full_list()
        cat_map = {cat.name.upper().strip(): cat.id for cat in all_categories}

        # 2. Map existing trusts
        all_trusts = pb.collection('trusts').get_full_list()
        trust_map = {t.name.upper().strip(): t.id for t in all_trusts}

        # 2.5 Map existing streets
        all_streets = pb.collection('streets').get_full_list()
        street_set = {s.name.upper().strip() for s in all_streets}

        # 3. Identify and CREATE missing categories & trusts from Excel columns/rows
        special_cols = ["DONOR NAME", "DOOR NO", "STREET", "MOBILE", "TOTAL", "TRUST NAME", "GENDER", "HIJRI YEAR"]
        
        # Auto-create categories from headers
        for col in df.columns:
            col_name = str(col).strip()
            col_upper = col_name.upper()
            if col_upper not in special_cols and col_upper not in cat_map:
                try:
                    new_cat = pb.collection('categories').create({"name": col_upper, "is_active": True})
                    cat_map[col_upper] = new_cat.id
                    print(f"Auto-created category: {col_upper}")
                except Exception as e: print(f"Error creating category {col_name}: {e}")

        # 4. Process Rows
        import_results = {"created": 0, "updated": 0, "errors": []}
        category_cols = [col for col in df.columns if str(col).upper().strip() not in special_cols]

        for _, row in df.iterrows():
            try:
                name = str(row.get("DONOR NAME", "")).strip().upper()
                if not name or name.lower() == "nan": continue
                
                door_no = str(row.get("DOOR NO", "")).replace(".0", "").strip().upper() if pd.notna(row.get("DOOR NO")) else ""
                street_raw = str(row.get("STREET", "")).strip() if pd.notna(row.get("STREET")) else ""
                street = street_raw.upper()
                
                # Auto-create street if missing
                if street and street not in street_set:
                    try:
                        pb.collection('streets').create({"name": street})
                        street_set.add(street)
                        print(f"Auto-created street: {street}")
                    except Exception as e:
                        print(f"Error creating street {street}: {e}")

                mobile = str(row.get("MOBILE", "")).replace(".0", "").strip() if pd.notna(row.get("MOBILE")) else ""
                gender = str(row.get("GENDER", "M")).strip().upper()[:1] or "M"
                excel_trust_name = str(row.get("TRUST NAME", "")).strip().upper()
                
                # Use HIJRI YEAR from row if present, otherwise fallback to form value
                row_hijri_year = str(row.get("HIJRI YEAR", hijri_year)).replace(".0", "").strip()
                if not row_hijri_year or row_hijri_year.lower() == "nan":
                    row_hijri_year = hijri_year

                # a. Determine Trust ID
                row_trust_id = trust_id
                if excel_trust_name and excel_trust_name.lower() != "nan":
                    trust_key = excel_trust_name.upper()
                    if trust_key in trust_map:
                        row_trust_id = trust_map[trust_key]
                    else:
                        # Auto-create Trust
                        try:
                            new_trust = pb.collection('trusts').create({"name": excel_trust_name})
                            trust_map[trust_key] = new_trust.id
                            row_trust_id = new_trust.id
                            print(f"Auto-created trust: {excel_trust_name}")
                        except Exception as e: print(f"Error creating trust {excel_trust_name}: {e}")

                # Final fallback for Trust
                if not row_trust_id:
                    if "GENERAL" in trust_map:
                        row_trust_id = trust_map["GENERAL"]
                    else:
                        try:
                            new_gen_trust = pb.collection('trusts').create({"name": "General"})
                            row_trust_id = new_gen_trust.id
                            trust_map["GENERAL"] = row_trust_id
                        except: pass

                # b. Find or Create/Update Donor
                n = escape_pb_filter(name)
                dn = escape_pb_filter(door_no)
                donor_filter = f'name = "{n}" && door_no = "{dn}"'
                existing_donors = pb.collection('donors').get_list(1, 1, {"filter": donor_filter})
                
                donor_data = {
                    "name": name,
                    "door_no": door_no,
                    "street": street,
                    "mobile": mobile,
                    "gender": gender,
                    "is_active": True
                }

                if existing_donors.items:
                    donor_id = existing_donors.items[0].id
                    # Update donor details with latest info from Excel
                    pb.collection('donors').update(donor_id, donor_data)
                else:
                    new_donor = pb.collection('donors').create(donor_data)
                    donor_id = new_donor.id

                # c. Extract Donation Items
                items = []
                row_total = 0
                for col in category_cols:
                    val = row.get(col, 0)
                    if pd.notna(val) and val > 0:
                        col_key = str(col).upper().strip()
                        if col_key in cat_map:
                            items.append({
                                "category_id": cat_map[col_key],
                                "amount": float(val),
                                "date": datetime.now().strftime("%Y-%m-%d")
                            })
                            row_total += float(val)

                if not items: continue

                # d. Create or Append Transaction
                d_id = escape_pb_filter(donor_id)
                rh_year = escape_pb_filter(row_hijri_year)
                rt_id = escape_pb_filter(row_trust_id)
                trans_filter = f'donor_id = "{d_id}" && hijri_year = "{rh_year}" && trust_id = "{rt_id}"'
                existing_trans = pb.collection('transactions').get_list(1, 1, {"filter": trans_filter})

                if existing_trans.items:
                    transaction = existing_trans.items[0]
                    updated_items = (transaction.items or []) + items
                    updated_total = transaction.total_amount + row_total
                    pb.collection('transactions').update(transaction.id, {
                        "items": updated_items,
                        "total_amount": updated_total,
                        "payment_date": datetime.now().strftime("%Y-%m-%d")
                    })
                    import_results["updated"] += 1
                else:
                    pb.collection('transactions').create({
                        "donor_id": donor_id,
                        "hijri_year": row_hijri_year,
                        "trust_id": row_trust_id,
                        "payment_date": datetime.now().strftime("%Y-%m-%d"),
                        "total_amount": row_total,
                        "items": items
                    })
                    import_results["created"] += 1


            except Exception as row_err:
                print(f"Row Error in {name}: {row_err}")
                import_results["errors"].append(f"Error in row {name}: {str(row_err)}")



        return {
            "status": "success",
            "message": f"Import completed. Created {import_results['created']}, Updated {import_results['updated']}.",
            "results": import_results
        }

    except Exception as e:
        print(f"Excel Import Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


