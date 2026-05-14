# routes/new_entry.py
from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from pydantic import BaseModel
from typing import List, Optional
from db import pb
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

@router.post("/create")
async def create_new_entry(entry: NewEntryRequest):
    try:
        # 0. Handle Trust (Find by ID, Find by Name, or Create by Name)
        trust_id = entry.trust_id
        
        # If ID is missing but Name is provided, try to find or create
        if not trust_id and entry.trust_name:
            trust_name_clean = entry.trust_name.strip()
            # Search for existing trust by name
            existing_trusts = pb.collection('trusts').get_list(1, 1, {
                "filter": f'name = "{trust_name_clean}"'
            })
            
            if existing_trusts.items:
                trust_id = existing_trusts.items[0].id
            else:
                # Create new trust
                try:
                    new_trust = pb.collection('trusts').create({"name": trust_name_clean})
                    trust_id = new_trust.id
                    print(f"Auto-created trust: {trust_name_clean}")
                except Exception as e:
                    print(f"Error auto-creating trust: {e}")

        # Fallback to first trust if still not specified
        if not trust_id:
            trusts = pb.collection('trusts').get_list(1, 1)
            if trusts.items:
                trust_id = trusts.items[0].id

        # 1. Search for an existing transaction for this donor in the same Hijri year AND Trust
        filter_str = f'donor_id = "{entry.donor_id}" && hijri_year = "{entry.hijri_year}" && trust_id = "{trust_id}"'

        existing = pb.collection('transactions').get_list(1, 1, query_params={"filter": filter_str})
        
        new_items = [
            {
                "category_id": item.category_id, 
                "amount": item.amount,
                "date": entry.payment_date # Individual date for this batch of items
            } for item in entry.items
        ]

        if existing.items:
            # UPDATE EXISTING TRANSACTION
            transaction = existing.items[0]
            current_items = transaction.items or []
            updated_items = current_items + new_items
            updated_total = transaction.total_amount + entry.total_amount
            
            pb.collection('transactions').update(transaction.id, {
                "items": updated_items,
                "total_amount": updated_total,
                "payment_date": entry.payment_date, # Keep track of the 'latest' payment date
                "notes": (transaction.notes + " | " + entry.notes).strip(" | ") if entry.notes else transaction.notes
            })
            
            return {
                "status": "success", 
                "message": "Appended to existing transaction", 
                "transaction_id": transaction.id
            }
        else:
            # CREATE NEW TRANSACTION
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

            return {
                "status": "success", 
                "message": "New transaction created", 
                "transaction_id": transaction.id
            }

    except Exception as e:
        print(f"Error creating/updating entry: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/import-excel")
async def import_excel(
    file: UploadFile = File(...),
    trust_id: str = Form(...),
    hijri_year: str = Form(...)
):
    try:
        # Read the Excel file
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
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

        # 3. Identify and CREATE missing categories & trusts from Excel columns/rows
        special_cols = ["DONOR NAME", "DOOR NO", "STREET", "MOBILE", "TOTAL", "TRUST NAME", "GENDER", "HIJRI YEAR"]
        
        # Auto-create categories from headers
        for col in df.columns:
            col_name = str(col).strip()
            col_upper = col_name.upper()
            if col_upper not in special_cols and col_upper not in cat_map:
                try:
                    new_cat = pb.collection('categories').create({"name": col_name, "is_active": True})
                    cat_map[col_upper] = new_cat.id
                    print(f"Auto-created category: {col_name}")
                except Exception as e: print(f"Error creating category {col_name}: {e}")

        # 4. Process Rows
        import_results = {"created": 0, "updated": 0, "errors": []}
        category_cols = [col for col in df.columns if str(col).upper().strip() not in special_cols]

        for _, row in df.iterrows():
            try:
                name = str(row.get("DONOR NAME", "")).strip()
                if not name or name.lower() == "nan": continue
                
                door_no = str(row.get("DOOR NO", "")).replace(".0", "") if pd.notna(row.get("DOOR NO")) else ""
                street = str(row.get("STREET", "")) if pd.notna(row.get("STREET")) else ""
                mobile = str(row.get("MOBILE", "")).replace(".0", "") if pd.notna(row.get("MOBILE")) else ""
                gender = str(row.get("GENDER", "M")).strip().upper()[:1] or "M"
                excel_trust_name = str(row.get("TRUST NAME", "")).strip()
                
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

                # b. Find or Create/Update Donor
                donor_filter = f'name = "{name}" && door_no = "{door_no}"'
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
                trans_filter = f'donor_id = "{donor_id}" && hijri_year = "{row_hijri_year}" && trust_id = "{row_trust_id}"'
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

