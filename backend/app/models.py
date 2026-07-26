from pydantic import BaseModel, Field
from typing import Optional


class Item(BaseModel):
    filename: str
    caption: str
    tagged: bool
    thumb_url: str
    full_url: str


class BatchRequest(BaseModel):
    op: str = Field(pattern=r"^(prepend|append|remove_tag|regex_replace)$")
    value: str
    value2: Optional[str] = None
    filenames: Optional[list[str]] = None
    only_untagged: bool = False


class Stats(BaseModel):
    total: int
    tagged: int
    untagged: int


class ItemsResponse(BaseModel):
    items: list[Item]
    total: int


class StatusResponse(BaseModel):
    status: str


class BatchResponse(BaseModel):
    changed: int
    total: int


class RescanResponse(BaseModel):
    status: str
    total: int