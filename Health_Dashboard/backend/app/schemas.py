from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, HttpUrl

class PipelineRunCreate(BaseModel):
    provider: str
    pipeline_name: str
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    commit: Optional[str] = None
    branch: Optional[str] = None
    url: Optional[HttpUrl] = None
    logs: Optional[str] = None

class PipelineRunOut(BaseModel):
    id: int
    provider: str
    pipeline_name: str
    status: str
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    duration_seconds: Optional[float]
    commit: Optional[str]
    branch: Optional[str]
    url: Optional[str]
    logs: Optional[str]

    class Config:
        from_attributes = True

class MetricsOut(BaseModel):
    total_runs: int
    success_count: int
    failure_count: int
    running_count: int
    success_rate: float
    average_build_time_seconds: Optional[float]
    last_build_status: Optional[str]

class RunsList(BaseModel):
    items: List[PipelineRunOut]
    total: int


