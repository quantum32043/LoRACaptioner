import os

from fastapi import HTTPException


def safe_join(directory: str, filename: str) -> str:
    resolved = os.path.normpath(os.path.join(directory, filename))
    if not resolved.startswith(os.path.normpath(directory) + os.sep) and resolved != os.path.normpath(directory):
        raise HTTPException(status_code=400, detail="Path traversal detected")
    return resolved