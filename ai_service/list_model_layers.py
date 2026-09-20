import h5py

try:
    with h5py.File('model/skin_classifier.h5', 'r') as f:
        print("Root keys:")
        for k in f.keys():
            print(f" - {k}")
            
        print("\nModel weights layers:")
        if 'model_weights' in f:
            for k in f['model_weights'].keys():
                print(f" - {k}")
        else:
            print("No 'model_weights' group found. Direct keys in file:")
            for k in f.keys():
                print(f" - {k}")
except Exception as e:
    print("Error:", e)
