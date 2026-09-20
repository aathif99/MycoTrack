# API Documentation

## Node.js Backend API (Port 3000)

### 1. Register
**Endpoint**: `POST /api/auth/register`
**Description**: Register a new user.
**Request Body**:
```json
{
  "username": "johndoe",
  "password": "Password123!"
}
```
**Response (201 Created)**:
```json
{
  "message": "User registered successfully",
  "userId": 1
}
```
**Response (400 Bad Request)**:
```json
{
  "error": "Username already exists"
}
```

### 2. Login
**Endpoint**: `POST /api/auth/login`
**Description**: Authenticate user and get JWT token.
**Request Body**:
```json
{
  "username": "johndoe",
  "password": "Password123!"
}
```
**Response (200 OK)**:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "user": {
    "id": 1,
    "username": "johndoe"
  }
}
```

### 3. Predict Disease
**Endpoint**: `POST /api/predict`
**Description**: Upload an image, get ML prediction, GradCAM heatmap, and save history.
**Headers**: `Authorization: Bearer <token>`
**Content-Type**: `multipart/form-data`
**Request Body**:
- `image`: (File, jpg/png)
- `capture_method`: (String, 'Camera' or 'Gallery')

**Response (200 OK)**:
```json
{
  "message": "Prediction successful",
  "result": {
    "detection_id": 5,
    "model_class_index": 3,
    "model_class": "Versicolor",
    "disease_id": 3,
    "disease_name": "Tinea Versicolor",
    "confidence_score": 98.45,
    "image_url": "/uploads/image-1701234567-123456789.jpg",
    "heatmap_url": "/heatmaps/heatmap-5-1701234568.jpg"
  }
}
```

> **Model Output to Database ID Mapping:**
> - Model Index `0` (`Cruris`) &rarr; MySQL `disease_id: 2` (`Tinea Cruris`)
> - Model Index `1` (`Other`) &rarr; MySQL `disease_id: 0` (`Other`)
> - Model Index `2` (`Ringworm`) &rarr; MySQL `disease_id: 1` (`Ringworm`)
> - Model Index `3` (`Versicolor`) &rarr; MySQL `disease_id: 3` (`Tinea Versicolor`)

### 4. Get History
**Endpoint**: `GET /api/history`
**Description**: Retrieve all past predictions for the logged-in user.
**Headers**: `Authorization: Bearer <token>`
**Response (200 OK)**:
```json
{
  "history": [
    {
      "detection_id": 5,
      "disease_class": "Tinea Versicolor",
      "confidence_score": "98.45",
      "detection_date": "2023-10-25",
      "detection_time": "14:30:00",
      "image_path": "/uploads/image-1701234567-123456789.jpg",
      "capture_method": "Camera",
      "heatmap_path": "/heatmaps/heatmap-5-1701234568.jpg",
      "heat_map_status": "Generated"
    }
  ]
}
```

### 5. Get History Details
**Endpoint**: `GET /api/history/:id`
**Description**: Retrieve details of a specific prediction.
**Headers**: `Authorization: Bearer <token>`
**Response (200 OK)**:
```json
{
  "details": {
      "detection_id": 5,
      "disease_class": "Tinea Versicolor",
      "confidence_score": "98.45",
      ...
  }
}
```

### 6. Delete History
**Endpoint**: `DELETE /api/history/:id`
**Description**: Delete a specific prediction record (and associated image/heatmap via DB cascades).
**Headers**: `Authorization: Bearer <token>`
**Response (200 OK)**:
```json
{
  "message": "History record deleted successfully"
}
```

### 7. Logout
**Endpoint**: `POST /api/auth/logout`
**Description**: Endpoint to call upon logout. (Client should also delete the JWT).
**Response (200 OK)**:
```json
{
  "message": "Logged out successfully. Please remove token on client."
}
```

---

## FastAPI AI Service (Port 8000)
*(Usually only called internally by the Node.js backend)*

### 1. Predict (Internal)
**Endpoint**: `POST /predict`
**Content-Type**: `multipart/form-data`
**Request Body**:
- `file`: (File, jpg/png)

**Response (200 OK)**:
```json
{
  "model_class_index": 3,
  "model_class": "Versicolor",
  "disease_name": "Tinea Versicolor",
  "disease_id": 3,
  "confidence_score": 98.45,
  "heatmap_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAA...",
  "all_probabilities": {
    "Cruris": 0.42,
    "Other": 0.15,
    "Ringworm": 0.98,
    "Versicolor": 98.45
  }
}
```
