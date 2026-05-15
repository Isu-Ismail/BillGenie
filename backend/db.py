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

def get_cached_data(trust_id, data_type, field=""):
    try:
        # Handle "all" case
        t_id = trust_id or "all"
        cache_key = f"{t_id}_{data_type}_{field or 'all'}"
        
        result = pb.collection('metadata').get_list(1, 1, {
            "filter": f'trust = "{cache_key}"'
        })
        
        if result.items:
            return result.items[0].value
        return None
    except Exception as e:
        print(f"Cache check failed: {e}")
        return None

def update_cached_data(trust_id, data_type, data, field=""):
    try:
        t_id = trust_id or "all"
        cache_key = f"{t_id}_{data_type}_{field or 'all'}"
        
        # Prepare value with timestamp
        import datetime
        data["last_generated"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        data["is_cached"] = True
        
        existing = pb.collection('metadata').get_list(1, 1, {
            "filter": f'trust = "{cache_key}"'
        })
        
        payload = {
            "trust": cache_key,
            "value": data,
            "data_type": data_type,
            "field": field or "all"
        }
        
        if existing.items:
            pb.collection('metadata').update(existing.items[0].id, payload)
        else:
            pb.collection('metadata').create(payload)
            
        return data
    except Exception as e:
        print(f"Cache update failed: {e}")
        return data
