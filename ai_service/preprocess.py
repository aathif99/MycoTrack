import cv2
import numpy as np
import tensorflow as tf

IMG_SIZE = 300

try:
    from tensorflow.keras.applications.efficientnet_v2 import preprocess_input
except ImportError:
    try:
        from tensorflow.keras.applications.efficientnet import preprocess_input
    except ImportError:
        def preprocess_input(x):
            return x

def center_crop_square(image):
    """
    Center-crop an image to a square aspect ratio.
    This prevents distortion when camera images (16:9 or 4:3)
    are resized to the model's expected 1:1 input (300x300).
    """
    h, w = image.shape[:2]
    if h == w:
        return image
    min_dim = min(h, w)
    start_x = (w - min_dim) // 2
    start_y = (h - min_dim) // 2
    return image[start_y:start_y + min_dim, start_x:start_x + min_dim]


def preprocess_image(image_bgr):
    """
    Preprocess the image before passing to the model:
    1. Convert BGR to RGB
    2. Center-crop to square (prevents aspect ratio distortion)
    3. Resize to 300x300 (IMG_SIZE)
    4. Convert to float32
    5. Apply EfficientNetV2 preprocess_input
    6. Expand dims (1, 300, 300, 3)
    """
    img_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    img_square = center_crop_square(img_rgb)
    img_resized = cv2.resize(img_square, (IMG_SIZE, IMG_SIZE))
    img_float = img_resized.astype(np.float32)
    img_preprocessed = preprocess_input(img_float)
    img_batch = np.expand_dims(img_preprocessed, axis=0)
    return img_batch

