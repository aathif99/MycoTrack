# Deployment & Setup Instructions

## 1. MySQL Database Setup
1. Open XAMPP and start the **MySQL** module.
2. Open phpMyAdmin (`http://localhost/phpmyadmin`).
3. Import the `database/init.sql` file to create the `skin_disease_db` database and its tables.

## 2. AI Service Setup
1. Navigate to the `ai_service` directory:
   ```bash
   cd ai_service
   ```
2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Generate the dummy model for testing (replace this with your real `.h5` model later):
   ```bash
   python create_dummy_model.py
   ```
5. Run the FastAPI server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

## 3. Node.js Backend Setup
1. Open a new terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Verify the `.env` file credentials match your MySQL setup.
4. Run the Node.js server:
   ```bash
   npm run dev
   ```

## 4. Flutter Integration
- Ensure your Flutter app makes HTTP requests to `http://<YOUR_IP_ADDRESS>:3000/api/...` instead of `localhost` if running on a physical device or emulator.
- Pass the JWT token as `Bearer <token>` in the `Authorization` header for protected endpoints.
