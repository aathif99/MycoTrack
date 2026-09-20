"""List all Conv2D layers in the model to find the best one for GradCAM."""
import os
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
import tensorflow as tf

# Custom layers
@tf.keras.utils.register_keras_serializable()
class ChannelMean(tf.keras.layers.Layer):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
    def call(self, inputs):
        return tf.reduce_mean(inputs, axis=-1, keepdims=True)
    def get_config(self):
        return super().get_config()

@tf.keras.utils.register_keras_serializable()
class ChannelMax(tf.keras.layers.Layer):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
    def call(self, inputs):
        return tf.reduce_max(inputs, axis=-1, keepdims=True)
    def get_config(self):
        return super().get_config()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = tf.keras.models.load_model(
    os.path.join(BASE_DIR, "model", "skin_classifier.keras"),
    custom_objects={"ChannelMean": ChannelMean, "ChannelMax": ChannelMax},
    compile=False
)

print("\n=== TOP-LEVEL LAYERS ===")
for i, layer in enumerate(model.layers):
    is_submodel = isinstance(layer, tf.keras.Model)
    print(f"  [{i}] {layer.name} ({layer.__class__.__name__}){' [SUB-MODEL]' if is_submodel else ''}")

print("\n=== ALL Conv2D LAYERS (top-level + nested) ===")
conv_layers = []
for layer in model.layers:
    if isinstance(layer, tf.keras.layers.Conv2D):
        ks = layer.kernel_size if hasattr(layer, 'kernel_size') else '?'
        out = layer.output_shape if hasattr(layer, 'output_shape') else '?'
        conv_layers.append((layer.name, ks, out, 'top'))
    if isinstance(layer, tf.keras.Model):
        for sub_layer in layer.layers:
            if isinstance(sub_layer, tf.keras.layers.Conv2D):
                ks = sub_layer.kernel_size if hasattr(sub_layer, 'kernel_size') else '?'
                out = sub_layer.output_shape if hasattr(sub_layer, 'output_shape') else '?'
                conv_layers.append((sub_layer.name, ks, out, layer.name))

for name, ks, out, parent in conv_layers:
    print(f"  {name} | kernel={ks} | output={out} | parent={parent}")

print(f"\nTotal Conv2D layers found: {len(conv_layers)}")
print(f"Last Conv2D: {conv_layers[-1][0]} (parent: {conv_layers[-1][3]})" if conv_layers else "None found")
