# db.py
import os
from pocketbase import PocketBase

# Avoid 127.0.0.1 for the host binding to prevent container communication drops
PB_URL = os.getenv("POCKETBASE_URL", "http://127.0.0.1:8090")

pb = PocketBase(PB_URL)

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

