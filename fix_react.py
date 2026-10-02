import os
import glob

base_dir = "c:/Users/Sport-Science-R3909/Documents/Sp strick/src"
for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            content = content.replace("import React, {", "import {")
            content = content.replace("import React from 'react';\n", "")
            
            # also fix ButtonState in GamepadPoller
            if "GamepadPoller.ts" in path:
                content = content.replace("SemanticControl, ButtonState, AxisState", "SemanticControl, AxisState")

            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
