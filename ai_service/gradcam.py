import numpy as np
import tensorflow as tf
import cv2


def find_last_conv_layer(model):
    """
    Find the best Conv2D layer for GradCAM visualization.
    Prioritizes the 'top_conv' layer inside the EfficientNetV2 backbone,
    which contains rich spatial features ideal for lesion heatmaps.
    Falls back to the last Conv2D layer found by recursive search.
    """
    # Priority 1: Look for 'top_conv' in EfficientNetV2 backbone sub-model
    for layer in model.layers:
        if isinstance(layer, tf.keras.Model) and 'efficientnet' in layer.name.lower():
            try:
                layer.get_layer('top_conv')
                print("GradCAM: Found 'top_conv' in EfficientNetV2 backbone")
                return 'top_conv'
            except ValueError:
                pass

    # Priority 2: Look for 'top_conv' at any level
    for layer in model.layers:
        if isinstance(layer, tf.keras.Model):
            try:
                layer.get_layer('top_conv')
                return 'top_conv'
            except ValueError:
                pass

    # Priority 3: Fallback — find any Conv2D layer by reverse search
    def _find_conv_recursive(m):
        for l in reversed(m.layers):
            if isinstance(l, tf.keras.Model):
                result = _find_conv_recursive(l)
                if result:
                    return result
            elif isinstance(l, tf.keras.layers.Conv2D):
                return l.name
        return None

    return _find_conv_recursive(model)


def _find_sub_model_containing(model, layer_name):
    """
    Find which sub-model (if any) contains the target layer.
    Returns (sub_model, layer) or (None, None).
    """
    # Try direct lookup first
    try:
        layer = model.get_layer(layer_name)
        return None, layer
    except ValueError:
        pass

    # Search nested sub-models
    for top_layer in model.layers:
        if isinstance(top_layer, tf.keras.Model):
            try:
                layer = top_layer.get_layer(layer_name)
                return top_layer, layer
            except ValueError:
                pass

    return None, None


def _apply_heatmap_overlay(heatmap_normalized, original_image_bgr):
    """
    Apply a JET colormap heatmap overlay on the original image.
    heatmap_normalized: 2D numpy array with values in [0, 1].
    Returns the blended BGR image.
    """
    # Convert to uint8 grayscale heatmap
    heatmap_gray = np.uint8(255 * heatmap_normalized)

    # Resize heatmap to match original image dimensions
    heatmap_resized = cv2.resize(
        heatmap_gray,
        (original_image_bgr.shape[1], original_image_bgr.shape[0]),
        interpolation=cv2.INTER_CUBIC
    )

    # Smooth the heatmap with Gaussian blur for clean, smooth gradients
    heatmap_resized = cv2.GaussianBlur(heatmap_resized, (21, 21), 0)

    # Apply JET colormap: blue(low) -> green -> yellow -> red(high activation)
    jet_heatmap = cv2.applyColorMap(heatmap_resized, cv2.COLORMAP_JET)

    # Create alpha mask based on activation intensity
    # Low activation regions are more transparent, high regions are more opaque
    alpha = heatmap_resized.astype(np.float32) / 255.0
    # Boost contrast: make low activations more transparent
    alpha = np.power(alpha, 0.8)
    alpha = np.clip(alpha, 0, 1)
    alpha_3ch = np.stack([alpha] * 3, axis=-1)

    # Blend: overlay JET heatmap on original image
    # High-activation areas show strong heatmap color, low areas show original image
    overlay_strength = 0.55
    result = (
        original_image_bgr.astype(np.float32) * (1 - alpha_3ch * overlay_strength) +
        jet_heatmap.astype(np.float32) * (alpha_3ch * overlay_strength)
    )

    result = np.clip(result, 0, 255).astype(np.uint8)
    return result


def _try_standard_gradcam(model, img_array, original_image_bgr, target_layer, pred_index):
    """
    Strategy 1: Standard GradCAM — build a single gradient model that outputs
    both the conv layer activations and the predictions.
    Works for flat models; fails in Keras 3 with nested sub-models.
    """
    try:
        print("GradCAM [Standard]: Building gradient model...")
        grad_model = tf.keras.models.Model(
            model.inputs,
            [target_layer.output, model.output]
        )
        print("GradCAM [Standard]: Gradient model built successfully")

        with tf.GradientTape() as tape:
            conv_output, preds = grad_model(img_array)
            if pred_index is None:
                pred_index = tf.argmax(preds[0])
            class_channel = preds[:, pred_index]

        grads = tape.gradient(class_channel, conv_output)

        if grads is None:
            print("GradCAM [Standard]: Gradients are None")
            return None

        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
        conv_output_squeezed = conv_output[0]
        heatmap = conv_output_squeezed @ pooled_grads[..., tf.newaxis]
        heatmap = tf.squeeze(heatmap)
        heatmap = tf.maximum(heatmap, 0)
        max_val = tf.math.reduce_max(heatmap)

        if max_val == 0:
            print("GradCAM [Standard]: Heatmap all zeros")
            return None

        heatmap = (heatmap / max_val).numpy()

        if np.isnan(heatmap).any():
            print("GradCAM [Standard]: NaN in heatmap")
            return None

        print("GradCAM [Standard]: SUCCESS")
        return _apply_heatmap_overlay(heatmap, original_image_bgr)

    except Exception as e:
        print(f"GradCAM [Standard]: Failed — {e}")
        return None


def _hybrid_gradcam(model, img_array, original_image_bgr, target_layer, sub_model, pred_index):
    """
    Strategy 2: Hybrid activation-saliency approach for Keras 3 nested models.

    Since Keras 3 treats nested sub-models as opaque (can't build a gradient
    model across the parent/sub-model graph boundary), this approach:

    1. Extracts conv activations from within the sub-model's OWN graph
       (this always works because sub_model.input → top_conv.output is connected)
    2. Computes input-gradient saliency from the FULL model
       (this always works because model.input → model.output is connected)
    3. Combines them: activation maps provide spatial localization,
       input saliency provides class-specificity → GradCAM-like result.
    """
    try:
        # --- Step 1: Get conv activations from the sub-model's graph ---
        print("GradCAM [Hybrid]: Extracting conv activations from sub-model...")

        if sub_model is not None:
            # Build conv extractor WITHIN the sub-model's graph (always works)
            conv_extractor = tf.keras.models.Model(
                sub_model.input,
                target_layer.output
            )
        else:
            conv_extractor = tf.keras.models.Model(
                model.input,
                target_layer.output
            )

        conv_output = conv_extractor(img_array, training=False).numpy()[0]  # (H, W, C)
        print(f"GradCAM [Hybrid]: Conv activations shape: {conv_output.shape}")

        # Spatial activation map: mean of ReLU'd activations across channels
        activation_map = np.mean(np.maximum(conv_output, 0), axis=-1)  # (H, W)
        H_conv, W_conv = activation_map.shape

        # --- Step 2: Compute input-gradient saliency for class-specificity ---
        print("GradCAM [Hybrid]: Computing input-gradient saliency...")

        img_var = tf.Variable(img_array, dtype=tf.float32)
        with tf.GradientTape() as tape:
            preds = model(img_var, training=False)
            print(f"GradCAM [Hybrid]: Predictions: {preds.numpy()}")
            if pred_index is None:
                pred_index = tf.argmax(preds[0])
            class_score = preds[:, pred_index]

        input_grads = tape.gradient(class_score, img_var)

        if input_grads is not None:
            input_grads_np = input_grads.numpy()[0]  # (300, 300, 3)
            # Saliency: max absolute gradient across RGB channels
            saliency = np.max(np.abs(input_grads_np), axis=-1)  # (300, 300)

            print(f"GradCAM [Hybrid]: Saliency range: [{saliency.min():.6f}, {saliency.max():.6f}]")

            # Resize saliency DOWN to conv output spatial size for combining
            saliency_small = cv2.resize(saliency, (W_conv, H_conv), interpolation=cv2.INTER_AREA)

            # Normalize both
            act_max = np.max(activation_map)
            sal_max = np.max(saliency_small)

            if act_max > 0:
                activation_norm = activation_map / act_max
            else:
                activation_norm = activation_map

            if sal_max > 0:
                saliency_norm = saliency_small / sal_max
            else:
                saliency_norm = saliency_small

            # --- Step 3: Combine activation map × saliency ---
            # Activation gives spatial focus, saliency gives class-specificity
            heatmap = activation_norm * saliency_norm
            print(f"GradCAM [Hybrid]: Combined heatmap range: [{heatmap.min():.6f}, {heatmap.max():.6f}]")
        else:
            print("GradCAM [Hybrid]: Input gradients are None, using activation-only map")
            heatmap = activation_map

        # Normalize
        heatmap = np.maximum(heatmap, 0)
        max_val = np.max(heatmap)

        if max_val == 0:
            # Pure activation fallback
            print("GradCAM [Hybrid]: Combined heatmap is zero, using raw activation map")
            heatmap = np.mean(np.maximum(conv_output, 0), axis=-1)
            max_val = np.max(heatmap)

        if max_val > 0:
            heatmap = heatmap / max_val
        else:
            print("GradCAM [Hybrid]: All approaches produced zero heatmap")
            return None

        print(f"GradCAM [Hybrid]: SUCCESS — heatmap shape: {heatmap.shape}")
        return _apply_heatmap_overlay(heatmap, original_image_bgr)

    except Exception as e:
        print(f"GradCAM [Hybrid]: FAILED — {e}")
        import traceback
        traceback.print_exc()
        return None


def generate_gradcam(model, img_array, original_image_bgr, last_conv_layer_name=None, pred_index=None):
    """
    Generate Grad-CAM heatmap highlighting the lesion regions
    the model used to identify and classify the disease.

    Produces a JET colormap overlay (blue -> green -> yellow -> red)
    where red/warm regions indicate high model attention on the lesion.

    Uses a multi-strategy approach:
    1. Standard GradCAM (works for flat models)
    2. Hybrid activation-saliency (works for Keras 3 nested sub-models)
    """
    if last_conv_layer_name is None:
        last_conv_layer_name = find_last_conv_layer(model)

    if not last_conv_layer_name:
        print("GradCAM: ERROR — No conv layer found in model.")
        return None

    print(f"GradCAM: Target layer = '{last_conv_layer_name}'")

    # Find target layer and its containing sub-model (if nested)
    sub_model, target_layer = _find_sub_model_containing(model, last_conv_layer_name)

    if target_layer is None:
        print(f"GradCAM: ERROR — Layer '{last_conv_layer_name}' not found.")
        return None

    if sub_model is not None:
        print(f"GradCAM: Layer is inside sub-model '{sub_model.name}'")
    else:
        print(f"GradCAM: Layer is directly in top-level model")

    # --- Strategy 1: Standard GradCAM ---
    result = _try_standard_gradcam(model, img_array, original_image_bgr, target_layer, pred_index)
    if result is not None:
        return result

    # --- Strategy 2: Hybrid approach (nested model compatible) ---
    print("GradCAM: Falling back to hybrid activation-saliency approach...")
    result = _hybrid_gradcam(model, img_array, original_image_bgr, target_layer, sub_model, pred_index)
    if result is not None:
        return result

    print("GradCAM: All strategies exhausted — no heatmap generated.")
    return None
