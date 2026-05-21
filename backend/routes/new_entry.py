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
    analyze_only: bool = Form(False),
    x_user_id: Optional[str] = Header(None)
):
    try:
        print(f"📥 Received Excel upload: {file.filename} (analyze_only={analyze_only})")
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    def generate_progress():
        success = False
        created_transactions = []
        created_donors = []
        created_streets = []
        created_categories = []
        created_trusts = []

        try:
            yield json.dumps({"event": "progress", "message": "Reading Excel file...", "percentage": 5}) + "\n"
            df = pd.read_excel(io.BytesIO(contents))
            
            if df.empty:
                yield json.dumps({"event": "error", "message": "The uploaded Excel file is empty."}) + "\n"
                return

            if "DONOR NAME" not in df.columns:
                yield json.dumps({"event": "error", "message": "Invalid Excel template. Missing 'DONOR NAME' column."}) + "\n"
                return

            # Keep all rows for complete analysis (including empty donor rows)
            raw_total_rows = len(df)
            yield json.dumps({"event": "progress", "message": f"Excel parsed. Found {raw_total_rows} rows. Running analysis...", "percentage": 10}) + "\n"

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

            # 3. Auto-detect/create missing categories
            yield json.dumps({"event": "progress", "message": "Analyzing category columns...", "percentage": 18}) + "\n"
            special_cols = ["DONOR NAME", "DOOR NO", "STREET", "MOBILE", "TOTAL", "TRUST NAME", "GENDER", "HIJRI YEAR"]
            
            new_categories_to_create = []
            category_cols = [col for col in df.columns if str(col).upper().strip() not in special_cols]

            for col in df.columns:
                col_name = str(col).strip()
                col_upper = col_name.upper()
                if col_upper not in special_cols and col_upper not in cat_map:
                    new_categories_to_create.append(col_name)
                    if not analyze_only:
                        try:
                            payload = {"name": col_upper, "is_active": True}
                            if x_user_id:
                                payload["created_by"] = x_user_id
                            new_cat = pb.collection('categories').create(payload)
                            created_categories.append(new_cat.id)
                            cat_map[col_upper] = new_cat.id
                            cat_name_map[col_upper] = col_upper
                        except Exception as e:
                            pass
                    else:
                        # Stub category ID for dry-run
                        cat_map[col_upper] = f"new_cat_{col_upper}"
                        cat_name_map[col_upper] = col_upper

            problems = []
            new_donors_to_create = set()
            new_streets_to_create = set()
            new_trusts_to_create = set()

            seen_excel_keys = set()
            local_created_donors = {} # Map (name, door_no, street) -> donor_id

            import_results = {"created": 0, "updated": 0, "skipped": 0, "errors": []}
            valid_rows_count = 0
            ignored_rows_count = 0
            total_amount = 0.0

            # 4. Process Rows
            for idx, (_, row) in enumerate(df.iterrows()):
                row_num = idx + 2 # row 1 is header
                name_raw = row.get("DONOR NAME", "")
                name = str(name_raw).strip().upper() if pd.notna(name_raw) else ""

                # Check for empty donor name
                if not name or name.lower() == "nan":
                    problems.append({
                        "row": row_num,
                        "type": "empty_donor",
                        "message": f"Row {row_num}: Donor name is empty. This row will be ignored."
                    })
                    ignored_rows_count += 1
                    continue

                # Ignore TOTAL summary rows
                if "TOTAL" in name:
                    continue

                try:
                    door_no = str(row.get("DOOR NO", "")).replace(".0", "").strip().upper() if pd.notna(row.get("DOOR NO")) else ""
                    street_raw = str(row.get("STREET", "")).strip() if pd.notna(row.get("STREET")) else ""
                    street = street_raw.upper()

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
                            new_trusts_to_create.add(excel_trust_name)
                            if not analyze_only:
                                try:
                                    payload = {"name": excel_trust_name}
                                    if x_user_id:
                                        payload["created_by"] = x_user_id
                                    new_trust = pb.collection('trusts').create(payload)
                                    created_trusts.append(new_trust.id)
                                    trust_map[trust_key] = new_trust.id
                                    row_trust_id = new_trust.id
                                except Exception as e:
                                    pass
                            else:
                                row_trust_id = f"new_trust_{trust_key}"

                    if not row_trust_id:
                        if "GENERAL" in trust_map:
                            row_trust_id = trust_map["GENERAL"]
                        else:
                            new_trusts_to_create.add("General")
                            if not analyze_only:
                                try:
                                    payload = {"name": "General"}
                                    if x_user_id:
                                        payload["created_by"] = x_user_id
                                    new_gen_trust = pb.collection('trusts').create(payload)
                                    created_trusts.append(new_gen_trust.id)
                                    row_trust_id = new_gen_trust.id
                                    trust_map["GENERAL"] = row_trust_id
                                except:
                                    pass
                            else:
                                row_trust_id = "new_trust_GENERAL"

                    # Check for Excel duplicate within same upload sheet
                    excel_key = (name, door_no, street, row_hijri_year, row_trust_id)
                    if excel_key in seen_excel_keys:
                        problems.append({
                            "row": row_num,
                            "type": "excel_duplicate",
                            "message": f"Row {row_num}: Duplicate record for donor '{name}' (Door: {door_no}, Street: {street}) in this sheet. This row will be erased/ignored."
                        })
                        ignored_rows_count += 1
                        continue

                    seen_excel_keys.add(excel_key)

                    # Manage Street
                    if street and street not in street_set:
                        new_streets_to_create.add(street_raw)
                        if not analyze_only:
                            try:
                                payload = {"name": street}
                                if x_user_id:
                                    payload["created_by"] = x_user_id
                                new_street = pb.collection('streets').create(payload)
                                created_streets.append(new_street.id)
                                street_set.add(street)
                            except:
                                pass
                        else:
                            street_set.add(street)

                    # Find or mock/create Donor
                    n = escape_pb_filter(name)
                    dn = escape_pb_filter(door_no)
                    s_esc = escape_pb_filter(street)
                    donor_filter = f'name = "{n}" && door_no = "{dn}" && street = "{s_esc}"'
                    if x_user_id:
                        donor_filter = f'({donor_filter}) && created_by = "{x_user_id}"'
                    
                    existing_donors = pb.collection('donors').get_list(1, 1, {"filter": donor_filter})

                    donor_key = (name, door_no, street)
                    donor_id = None

                    if existing_donors.items:
                        donor_id = existing_donors.items[0].id
                        if not analyze_only:
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
                            pb.collection('donors').update(donor_id, donor_data)
                    elif donor_key in local_created_donors:
                        donor_id = local_created_donors[donor_key]
                    else:
                        new_donors_to_create.add(f"{name} (Door: {door_no}, Street: {street})")
                        if not analyze_only:
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
                            new_donor = pb.collection('donors').create(donor_data)
                            created_donors.append(new_donor.id)
                            donor_id = new_donor.id
                            local_created_donors[donor_key] = donor_id
                        else:
                            mock_id = f"new_donor_{len(local_created_donors) + 1}"
                            local_created_donors[donor_key] = mock_id
                            donor_id = mock_id

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
                        problems.append({
                            "row": row_num,
                            "type": "no_donation",
                            "message": f"Row {row_num}: Donor '{name}' has no donation amount. This row will be ignored."
                        })
                        ignored_rows_count += 1
                        continue

                    # Check Database duplicate
                    is_db_duplicate = False
                    if donor_id and not donor_id.startswith("new_donor_"):
                        d_id = escape_pb_filter(donor_id)
                        rh_year = escape_pb_filter(row_hijri_year)
                        rt_id = escape_pb_filter(row_trust_id)
                        trans_filter = f'donor_id = "{d_id}" && hijri_year = "{rh_year}" && trust_id = "{rt_id}"'
                        if x_user_id:
                            trans_filter = f'({trans_filter}) && created_by = "{x_user_id}"'
                        existing_trans = pb.collection('transactions').get_list(1, 1, {"filter": trans_filter})
                        if existing_trans.items:
                            is_db_duplicate = True

                    if is_db_duplicate:
                        problems.append({
                            "row": row_num,
                            "type": "db_duplicate",
                            "message": f"Row {row_num}: Record for donor '{name}' already exists in DB for Hijri year {row_hijri_year}. This duplicate will be skipped."
                        })
                        import_results["skipped"] += 1
                        msg = f"Skipped duplicate: {name} ({row_hijri_year})"
                    else:
                        valid_rows_count += 1
                        total_amount += row_total

                        if not analyze_only:
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
                            new_trans = pb.collection('transactions').create(payload)
                            created_transactions.append(new_trans.id)
                            import_results["created"] += 1
                            msg = f"Imported: {name} (₹{row_total})"
                        else:
                            msg = f"Valid row: {name} (₹{row_total})"

                    # Yield progress event
                    percent = int(20 + (idx + 1) / raw_total_rows * 80)
                    if not analyze_only:
                        yield json.dumps({
                            "event": "row",
                            "message": msg,
                            "current": idx + 1,
                            "total": raw_total_rows,
                            "percentage": percent
                        }) + "\n"
                    else:
                        yield json.dumps({
                            "event": "analysis_progress",
                            "message": f"Analyzing: Row {idx + 1} of {raw_total_rows} ({msg})",
                            "current": idx + 1,
                            "total": raw_total_rows,
                            "percentage": percent
                        }) + "\n"

                except Exception as row_err:
                    import_results["errors"].append(f"Error in row {row_num}: {str(row_err)}")
                    problems.append({
                        "row": row_num,
                        "type": "error",
                        "message": f"Row {row_num}: Failed to process. Error: {str(row_err)}"
                    })
                    percent = int(20 + (idx + 1) / raw_total_rows * 80)
                    yield json.dumps({
                        "event": "row_error" if not analyze_only else "analysis_error",
                        "message": f"Error in row {row_num}: {str(row_err)}",
                        "current": idx + 1,
                        "total": raw_total_rows,
                        "percentage": percent
                    }) + "\n"

            # Complete response
            if analyze_only:
                yield json.dumps({
                    "event": "analysis_complete",
                    "message": "Analysis completed successfully.",
                    "results": {
                        "total_rows": raw_total_rows,
                        "valid_rows_count": valid_rows_count,
                        "ignored_rows_count": ignored_rows_count,
                        "skipped_count": import_results["skipped"],
                        "total_amount": total_amount,
                        "problems": problems,
                        "new_donors": list(new_donors_to_create),
                        "new_categories": new_categories_to_create,
                        "new_streets": list(new_streets_to_create),
                        "new_trusts": list(new_trusts_to_create)
                    }
                }) + "\n"
            else:
                success = True
                yield json.dumps({
                    "event": "complete",
                    "message": f"Import completed successfully. Created {import_results['created']}, Skipped {import_results['skipped']}, Errors {len(import_results['errors'])}.",
                    "results": import_results
                }) + "\n"

        except GeneratorExit:
            print("🔌 Client disconnected. Closing import generator stream...")
            raise

        except Exception as err:
            print(f"❌ Fatal import error: {err}")
            yield json.dumps({"event": "error", "message": f"Fatal processing error: {str(err)}"}) + "\n"

        finally:
            if not success and not analyze_only:
                print(f"🧹 Rollback triggered! Deleting {len(created_transactions)} transactions, {len(created_donors)} donors, {len(created_streets)} streets, {len(created_categories)} categories, {len(created_trusts)} trusts...")
                # Delete transactions first (they depend on donors, trusts, categories)
                for t_id in created_transactions:
                    try:
                        pb.collection('transactions').delete(t_id)
                        print(f"Deleted transaction: {t_id}")
                    except Exception as rollback_err:
                        print(f"Rollback error deleting transaction {t_id}: {rollback_err}")
                for d_id in created_donors:
                    try:
                        pb.collection('donors').delete(d_id)
                        print(f"Deleted donor: {d_id}")
                    except Exception as rollback_err:
                        print(f"Rollback error deleting donor {d_id}: {rollback_err}")
                for s_id in created_streets:
                    try:
                        pb.collection('streets').delete(s_id)
                        print(f"Deleted street: {s_id}")
                    except Exception as rollback_err:
                        print(f"Rollback error deleting street {s_id}: {rollback_err}")
                for c_id in created_categories:
                    try:
                        pb.collection('categories').delete(c_id)
                        print(f"Deleted category: {c_id}")
                    except Exception as rollback_err:
                        print(f"Rollback error deleting category {c_id}: {rollback_err}")
                for tr_id in created_trusts:
                    try:
                        pb.collection('trusts').delete(tr_id)
                        print(f"Deleted trust: {tr_id}")
                    except Exception as rollback_err:
                        print(f"Rollback error deleting trust {tr_id}: {rollback_err}")

    return StreamingResponse(generate_progress(), media_type="application/x-ndjson")


