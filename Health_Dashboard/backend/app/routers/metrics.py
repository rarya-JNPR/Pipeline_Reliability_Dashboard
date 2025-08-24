from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import Optional
from datetime import datetime, timedelta
from ..database import get_db
from .. import models, schemas

router = APIRouter()

@router.get("/metrics", response_model=schemas.MetricsOut)
def get_metrics(time_from: Optional[datetime] = None, time_to: Optional[datetime] = None, db: Session = Depends(get_db)):
    query = db.query(models.PipelineRun)
    if time_from:
        query = query.filter(
            or_(
                and_(models.PipelineRun.started_at != None, models.PipelineRun.started_at >= time_from),  # noqa: E711
                and_(models.PipelineRun.finished_at != None, models.PipelineRun.finished_at >= time_from),  # noqa: E711
            )
        )
    if time_to:
        query = query.filter(
            or_(
                and_(models.PipelineRun.started_at != None, models.PipelineRun.started_at <= time_to),  # noqa: E711
                and_(models.PipelineRun.finished_at != None, models.PipelineRun.finished_at <= time_to),  # noqa: E711
            )
        )

    total = query.count() or 0
    success = query.filter(models.PipelineRun.status == "success").count() or 0
    failure = query.filter(models.PipelineRun.status == "failure").count() or 0
    running = query.filter(models.PipelineRun.status == "running").count() or 0

    avg_duration = query.with_entities(func.avg(models.PipelineRun.duration_seconds)).filter(models.PipelineRun.duration_seconds != None).scalar()  # noqa: E711

    last = query.order_by(models.PipelineRun.id.desc()).first()
    last_status = last.status if last else None

    success_rate = (success / total) * 100 if total > 0 else 0.0

    return schemas.MetricsOut(
        total_runs=total,
        success_count=success,
        failure_count=failure,
        running_count=running,
        success_rate=round(success_rate, 2),
        average_build_time_seconds=float(avg_duration) if avg_duration is not None else None,
        last_build_status=last_status,
    )


@router.get("/notifications/failed", response_model=list)
def get_failed_jobs(limit: int = 10, time_from: Optional[datetime] = None, db: Session = Depends(get_db)):
    """Return recent failed jobs for notifications."""
    query = db.query(models.PipelineRun).filter(models.PipelineRun.status == "failure")
    # Only include Jenkins jobs with a valid build_number
    query = query.filter(
        or_(
            models.PipelineRun.provider != 'jenkins',
            models.PipelineRun.build_number != None
        )
    )
    
    # Filter by time if provided
    if time_from:
        query = query.filter(
            or_(
                and_(models.PipelineRun.started_at != None, models.PipelineRun.started_at >= time_from),  # noqa: E711
                and_(models.PipelineRun.finished_at != None, models.PipelineRun.finished_at >= time_from),  # noqa: E711
            )
        )
    
    failed = query.order_by(models.PipelineRun.started_at.desc()).limit(limit).all()
    return [
        {
            "id": run.id,
            "pipeline_name": run.pipeline_name,
            "provider": run.provider,
            "started_at": run.started_at,
            "commit": run.commit,
            "branch": run.branch,
            "url": run.url,
            "build_number": run.build_number or run.id  # Use build_number if available, otherwise use id
        }
        for run in failed
    ]


