from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import uvicorn
import numpy as np
import io
import cv2
import base64
import socket
from PIL import Image
import os
import tensorflow as tf
from preprocess import preprocess_image
from gradcam import generate_gradcam

# Disable GPU if not needed or to avoid CUDA errors in basic setup
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'

# Custom Attention Layers for CBAM (matching model source code)
@tf.keras.utils.register_keras_serializable()
class ChannelMean(tf.keras.layers.Layer):
    def __init__(self, **kwargs):
        super(ChannelMean, self).__init__(**kwargs)

    def call(self, inputs):
        return tf.reduce_mean(inputs, axis=-1, keepdims=True)

    def compute_output_shape(self, input_shape):
        return input_shape[:-1] + (1,)

    def get_config(self):
        return super(ChannelMean, self).get_config()

@tf.keras.utils.register_keras_serializable()
class ChannelMax(tf.keras.layers.Layer):
    def __init__(self, **kwargs):
        super(ChannelMax, self).__init__(**kwargs)

    def call(self, inputs):
        return tf.reduce_max(inputs, axis=-1, keepdims=True)

    def compute_output_shape(self, input_shape):
        return input_shape[:-1] + (1,)

    def get_config(self):
        return super(ChannelMax, self).get_config()


def load_skin_classifier_model(model_path):
    print(f"Loading model from {model_path} with custom objects (ChannelMean, ChannelMax)...")
    custom_objects = {
        "ChannelMean": ChannelMean,
        "ChannelMax": ChannelMax
    }
    model = tf.keras.models.load_model(model_path, custom_objects=custom_objects, compile=False)
    print("SUCCESS: Keras model loaded successfully!")
    return model


def find_available_port(start_port: int, max_tries: int = 20) -> int:
    requested_port = int(os.getenv("PORT", str(start_port)))
    for candidate in range(requested_port, requested_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("0.0.0.0", candidate))
                return candidate
            except OSError:
                continue
    raise RuntimeError(f"Unable to find an available port between {requested_port} and {requested_port + max_tries - 1}")

app = FastAPI(title="Skin Disease Detection AI Service")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Model path resolution using absolute paths
MODEL_PATHS = [
    os.path.join(BASE_DIR, "model", "skin_classifier.keras"),
    os.path.join(BASE_DIR, "model", "SkinDisease.keras"),
    os.path.join(BASE_DIR, "model", "skin_classifier.h5"),
    os.path.join(BASE_DIR, "model", "SkinDisease.h5")
]

MODEL_PATH = None
for path in MODEL_PATHS:
    if os.path.exists(path):
        MODEL_PATH = path
        break

if MODEL_PATH is None:
    MODEL_PATH = os.path.join(BASE_DIR, "model", "skin_classifier.keras")

try:
    model = load_skin_classifier_model(MODEL_PATH)
    if model is not None:
        print("Warming up model graph...")
        dummy_input = np.zeros((1, 300, 300, 3), dtype=np.float32)
        model.predict(dummy_input, verbose=0)
        print("Model warmup complete!")
except Exception as e:
    print(f"Warning: Failed to load model from {MODEL_PATH}. Ensure the file exists and is valid. Error: {e}")
    model = None



# Class Names & Database ID Mapping Layer
# IMPORTANT: The TensorFlow/Keras model was trained with flow_from_directory() where
# class directories are sorted alphabetically:
#   Index 0: "Cruris"     -> Tinea Cruris (MySQL disease_id = 2)
#   Index 1: "Other"      -> Other        (MySQL disease_id = 0)
#   Index 2: "Ringworm"   -> Ringworm     (MySQL disease_id = 1)
#   Index 3: "Versicolor" -> Tinea Versicolor (MySQL disease_id = 3)
#
# NOTE: Model output index != MySQL disease_id.
# The mapping layer below explicitly links the two systems.
CLASS_NAMES = [
    "Cruris",
    "Other",
    "Ringworm",
    "Versicolor"
]

# Explicit Model Output Index -> Database ID & Canonical Name Mapping
MODEL_TO_DISEASE = {
    0: {"model_class": "Cruris",     "disease_id": 2, "disease_name": "Tinea Cruris"},
    1: {"model_class": "Other",      "disease_id": 0, "disease_name": "Other"},
    2: {"model_class": "Ringworm",   "disease_id": 1, "disease_name": "Ringworm"},
    3: {"model_class": "Versicolor", "disease_id": 3, "disease_name": "Tinea Versicolor"}
}

@app.get("/")
def read_root():
    return {"message": "Skin Disease Detection AI Service is running"}

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(status_code=500, detail="Model is not loaded on the server.")

    if file.content_type and not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File provided is not an image.")

    try:
        # Read image contents
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')

        # Auto-orient the image based on EXIF metadata (fixes camera rotation bugs)
        from PIL import ImageOps
        image = ImageOps.exif_transpose(image)

        # Convert PIL Image to OpenCV format (BGR) for preprocessing and GradCAM
        open_cv_image = np.array(image) 
        open_cv_image = open_cv_image[:, :, ::-1].copy()

        # Preprocess using EfficientNetV2 and 300x300 image size
        preprocessed_img = preprocess_image(open_cv_image)

        # Predict
        prediction = model.predict(preprocessed_img, verbose=0)
        predicted_index = int(np.argmax(prediction[0]))
        confidence = float(prediction[0][predicted_index])

        disease_info = MODEL_TO_DISEASE.get(
            predicted_index,
            {"model_class": "Other", "disease_id": 0, "disease_name": "Other"}
        )
        disease_name = disease_info["disease_name"]
        disease_id = disease_info["disease_id"]
        model_class = disease_info["model_class"]

        confidence_percentage = round(confidence * 100, 2)

        # Generate GradCAM Heatmap using model output index
        heatmap_base64 = ""
        try:
            heatmap_img = generate_gradcam(model, preprocessed_img, open_cv_image, pred_index=predicted_index)
            if heatmap_img is not None:
                _, buffer = cv2.imencode('.jpg', heatmap_img)
                heatmap_base64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
        except Exception as gradcam_err:
            print(f"Warning: GradCAM generation skipped: {gradcam_err}")

        # Collect all probabilities with correct model class labels
        all_probabilities = {
            CLASS_NAMES[i]: float(round(float(prediction[0][i]) * 100, 2))
            for i in range(len(CLASS_NAMES))
        }

        # Prepare response with explicit mapping between model index and database ID
        result = {
            "model_class_index": predicted_index,
            "model_class": model_class,
            "disease_name": disease_name,
            "disease_id": disease_id,
            "confidence_score": confidence_percentage,
            "heatmap_base64": heatmap_base64,
            "all_probabilities": all_probabilities
        }

        return JSONResponse(content=result)

    except Exception as e:
        print(f"Error during prediction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = find_available_port(8000)
    print(f"Starting AI service on {host}:{port}")
    uvicorn.run(app, host=host, port=port)

