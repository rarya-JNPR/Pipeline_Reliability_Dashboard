from sqlalchemy import Column, Integer, String, DateTime, Float, Text, Boolean
from .database import Base

class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, index=True)
    pipeline_name = Column(String, index=True)
    status = Column(String, index=True)
    started_at = Column(DateTime, index=True)
    finished_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    branch = Column(String, nullable=True)
    commit = Column(String, nullable=True)
    url = Column(String, nullable=True)
    logs = Column(Text, nullable=True)
    build_number = Column(Integer, nullable=True)
    notified = Column(Boolean, default=False, index=True)  # Track if failure notification was sent


