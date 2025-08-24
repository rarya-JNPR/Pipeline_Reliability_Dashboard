from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from sqlalchemy import or_, and_
from ..database import get_db
from .. import models, schemas

router = APIRouter()

@router.get("/runs", response_model=schemas.RunsList)
def list_runs(
    limit: int = 100,  # Increased from 20 to 100
    offset: int = 0,
    status: Optional[str] = None,
    q: Optional[str] = None,
    time_from: Optional[datetime] = None,
    time_to: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.PipelineRun).order_by(models.PipelineRun.id.desc())
    if status:
        query = query.filter(models.PipelineRun.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                models.PipelineRun.pipeline_name.ilike(like),
                models.PipelineRun.branch.ilike(like),
                models.PipelineRun.commit.ilike(like),
                models.PipelineRun.provider.ilike(like),
                models.PipelineRun.status.ilike(like),  # Include status in search
            )
        )
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
    total = query.count()
    items = query.limit(limit).offset(offset).all()
    return schemas.RunsList(items=items, total=total)

@router.get("/runs/{run_id}", response_model=schemas.PipelineRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.PipelineRun).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run

@router.delete("/runs/{run_id}")
def delete_run(run_id: int, db: Session = Depends(get_db)):
    """Delete a pipeline run by ID"""
    run = db.query(models.PipelineRun).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    db.delete(run)
    db.commit()
    return {"message": f"Pipeline run {run_id} deleted successfully"}

@router.post("/runs/update-github-commits")
def update_github_commits(db: Session = Depends(get_db)):
    """Update all github jobs to have commit/triggered_by as 'Pushkar'"""
    updated_count = 0
    runs = db.query(models.PipelineRun).filter_by(provider='github').all()
    for run in runs:
        if run.commit != 'Pushkar':
            run.commit = 'Pushkar'
            updated_count += 1
    db.commit()
    return {"message": f"Updated {updated_count} github jobs to commit='Pushkar'"}


