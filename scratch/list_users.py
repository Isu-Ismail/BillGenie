# scratch/list_users.py
from pocketbase import PocketBase
import os

PB_URL = os.getenv("POCKETBASE_URL", "http://127.0.0.1:8090")
pb = PocketBase(PB_URL)

try:
    # Authenticate as admin
    pb.admins.auth_with_password(
        os.getenv("PB_ADMIN_EMAIL", "admin@example.com"),
        os.getenv("PB_ADMIN_PASSWORD", "Admin@1234")
    )
    print("✅ Authenticated as admin.")
    
    users = pb.collection('users').get_full_list()
    print(f"Total Users: {len(users)}")
    for u in users:
        print(f"- ID: {u.id}, Email: {u.email}, Name: {getattr(u, 'name', '')}")
except Exception as e:
    print(f"❌ Error: {e}")
