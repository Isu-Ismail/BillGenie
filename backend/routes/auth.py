from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import pb

router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login/")
async def login(credentials: LoginRequest):
    try:
        # Authenticate with PocketBase using the 'users' collection
        auth_data = pb.collection('users').auth_with_password(
            credentials.email,
            credentials.password
        )
        
        # Return the user info and token
        return {
            "status": "success",
            "token": auth_data.token,
            "user": {
                "id": auth_data.record.id,
                "email": auth_data.record.email,
                "name": getattr(auth_data.record, "name", ""),
                "avatar": getattr(auth_data.record, "avatar", "")
            }
        }
    except Exception as e:
        print(f"Login failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
