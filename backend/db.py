# db.py
import os
from pocketbase import PocketBase

# Avoid 127.0.0.1 for the host binding to prevent container communication drops
PB_URL = os.getenv("POCKETBASE_URL", "http://127.0.0.1:8090")

pb = PocketBase(PB_URL)

def escape_pb_filter(value: str) -> str:
    """Escapes double quotes in values for PocketBase filter strings."""
    if not value: return ""
    return str(value).replace('"', '\\"')

# Optional: You can authenticate as an admin here if your FastAPI needs 
# superuser rights to bypass standard PocketBase API rules.
import threading
import time

def authenticate_admin():
    while True:
        try:
            pb.admins.auth_with_password(
                os.getenv("PB_ADMIN_EMAIL", "admin@example.com"),
                os.getenv("PB_ADMIN_PASSWORD", "Admin@1234")
            )
            print("✅ Backend successfully authenticated with PocketBase.")
            break
        except Exception as e:
            print(f"❌ Failed to connect to PocketBase: {e}. Retrying in 10s...")
            time.sleep(10)

# Start authentication in background thread to not block server startup
thread = threading.Thread(target=authenticate_admin, daemon=True)
thread.start()

def get_cached_data(data_type, filters_dict=None):
    """
    Fetches cached data based on data_type and filters.
    If filters_dict is None, returns the LATEST created metadata for that type.
    """
    try:
        query_params = {
            "filter": f'data_type = "{data_type}"',
            "sort": "-created",
        }
        
        # We fetch a few to find the exact match in Python since deep JSON filtering 
        # is complex in standard PocketBase filter strings.
        result = pb.collection('metadata').get_list(1, 20, query_params)
        
        if not filters_dict:
            # Just return the latest one found (Dashboard use case)
            if result.items:
                return result.items[0].value, result.items[0].field
            return None, None
            
        # If specific filters are provided, look for an exact match
        for item in result.items:
            # Simple dictionary comparison
            if item.field == filters_dict:
                return item.value, item.field
                
        return None, None
    except Exception as e:
        print(f"Cache check failed: {e}")
        return None, None

def update_cached_data(data_type, data, filters_dict):
    """
    Updates or creates a cache entry for a specific data_type and filter set.
    """
    try:
        import datetime
        # Prepare value with timestamp
        data["last_generated"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        data["is_cached"] = True
        
        # Check for existing record with EXACT same filters to update it
        existing = pb.collection('metadata').get_list(1, 20, {
            "filter": f'data_type = "{data_type}"'
        })
        
        target_id = None
        for item in existing.items:
            if item.field == filters_dict:
                target_id = item.id
                break
        
        payload = {
            "value": data,
            "data_type": data_type,
            "field": filters_dict
        }
        
        if target_id:
            pb.collection('metadata').update(target_id, payload)
        else:
            pb.collection('metadata').create(payload)
            
        return data
    except Exception as e:
        print(f"Cache update failed: {e}")
        return data
