import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Import your route files
from routes import new_entry, categories, donors, transactions, trusts, stats, reports, auth, streets

app = FastAPI(title="Billing System API")

# Configure CORS
origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:5173",
    "http://217.216.78.176",
    "https://217.216.78.176",
    "http://billgenie.duckdns.org",
    "https://billgenie.duckdns.org",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Register API Routes first
app.include_router(new_entry.router, prefix="/api/new-entry", tags=["Entries"])
app.include_router(categories.router, prefix="/api/categories", tags=["Categories"])
app.include_router(donors.router, prefix="/api/donors", tags=["Donors"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(trusts.router, prefix="/api/trusts", tags=["Trusts"])
app.include_router(streets.router, prefix="/api/streets", tags=["Streets"])
app.include_router(stats.router, prefix="/api/stats", tags=["Stats"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])

@app.get("/api")
def api_root():
    return {"message": "Billing API is running"}

# 2. Serve Frontend Static Files
# Path to the frontend dist folder
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
base_path = "/billgenie"

if os.path.exists(frontend_path):
    # Mount the assets directory (for JS, CSS, images) - using the base path
    app.mount(f"{base_path}/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")

    # Catch-all route to serve the frontend for any other path starting with base_path
    @app.get(base_path + "/{full_path:path}")
    @app.get(base_path)
    async def serve_frontend(full_path: str = ""):
        # Prevent catch-all from swallowing API calls (though they are /api/...)
        if full_path.startswith("api"):
            return {"error": "API route not found"}
            
        file_path = os.path.join(frontend_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Return index.html for all other routes under /billgenie to support React Router
        return FileResponse(os.path.join(frontend_path, "index.html"))

    # Optional: Redirect root to base_path if desired, or keep as is
    @app.get("/")
    async def redirect_to_app():
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=base_path + "/")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
