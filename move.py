import os
import shutil

src_dir = "C:/Users/Sport-Science-R3909/Documents/Sp strick"
dest_dir = "C:/Users/Sport-Science-R3909/Documents/Sp strick/SP-Strick"

os.makedirs(dest_dir, exist_ok=True)

for item in os.listdir(src_dir):
    if item == "SP-Strick":
        continue
    src_path = os.path.join(src_dir, item)
    dest_path = os.path.join(dest_dir, item)
    print(f"Moving {item}")
    shutil.move(src_path, dest_path)
