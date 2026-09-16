import os
import sys
from pathlib import Path

# Add root directory to sys.path so 'backend' package is resolvable
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import uvicorn

if __name__ == "__main__":
    print(f"Starting CircuitForge EDA & Knowledge Graph Server on http://127.0.0.1:8000 ...")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=False, log_level="info")
