# BillGenie 🧾✨

BillGenie is a containerized, high-performance web application designed for community organizations and trusts to streamline donor management, financial ledger entry, and automated receipt generation.

---

## 🚀 Key Features

- **👥 Donor Registry**:
  - Full search and management for donors.
  - Complete fields including Name, Gender, Address, Mobile, and **Toggleable Membership support** with custom Member IDs.
- **✍️ Financial Entry System**:
  - **Single Entry Mode**: Fast, modern entry interface.
  - **Batch Entry Mode**: High-speed ledger input for bulk transactions.
  - **Excel Import**: Automatically import ledger details from Excel templates without manual total calculations (system computes totals dynamically).
- **📂 Annual Ledgers (History)**:
  - Structured historical view of all recorded ledgers.
  - Advanced filtering system including **Hijri Year**, **Trust Organization**, **Street/Locality**, **Payment Date Range**, and **Gender**.
  - **Print Engine**: Single receipt generation and Bulk Page Printing compiled into clean A4 PDFs.
- **📊 Reporting & Cache Engine**:
  - Performance-optimized local state caching for database records (Trusts, Categories, Donors).
  - High-speed vertical/horizontal grid navigation with customized control scroll buttons.

---

## 🛠️ Technology Stack

- **Frontend**: React (Vite, CSS Modules, Lucide Icons, Glassmorphism design system)
- **Backend**: FastAPI (Python 3, Pydantic data validation)
- **Database / Auth**: PocketBase (Admin Console, JSON schema)
- **Containers**: Docker Compose for PocketBase instance

---

## 📦 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- [Python 3.10+](https://www.python.org/)
- [Node.js 18+](https://nodejs.org/) & `pnpm` (or `npm`/`yarn`)

### 1. Database Setup (PocketBase)

PocketBase runs containerized. Start the database service:

```bash
cd pocketbase
docker compose up -d
```

PocketBase will be running on:
- Admin UI: [http://localhost:8090/_/](http://localhost:8090/_/)
- API Port: `8090`

Default credentials for initial login (if using dev seeds):
- Admin Email: `admin@example.com`
- Password: `Admin@1234`

### 2. Backend Setup (FastAPI)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the FastAPI development server:
   ```bash
   python main.py
   ```
The backend API server will run on [http://localhost:8000](http://localhost:8000).

### 3. Frontend Setup (React/Vite)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   pnpm install
   ```
3. Start the Vite development server:
   ```bash
   pnpm run dev
   ```
Open [http://localhost:5173/billgenie/](http://localhost:5173/billgenie/) in your browser to run the application.

---

## 📂 Project Structure

```
├── backend/                  # FastAPI Application
│   ├── routes/               # API Router endpoints (auth, donors, transactions, etc.)
│   ├── db.py                 # PocketBase connection and cache layers
│   └── main.py               # Application entrypoint
├── frontend/                 # React SPA (Vite)
│   ├── src/
│   │   ├── pages/            # Page views (Dashboard, Entry, History, Settings)
│   │   ├── context/          # Global application state contexts
│   │   └── api.js            # API clients & configuration
├── pocketbase/               # PocketBase configuration
│   ├── docker-compose.yml    # Database service runner
│   └── pb_data/              # Persistent database sqlite volumes
└── README.md                 # Project instructions
```

---

## 📄 License
This project is proprietary and confidential.
