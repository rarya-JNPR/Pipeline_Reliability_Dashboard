from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from .routers import metrics, runs, webhooks, stream, jenkins
from .database import engine, Base
from . import models
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from .services.jenkins import JenkinsService
from .database import get_db
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pipeline Reliability Dashboard API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(metrics.router, prefix="/api", tags=["metrics"])
app.include_router(runs.router, prefix="/api", tags=["runs"])
app.include_router(webhooks.router, prefix="/api", tags=["webhooks"])
app.include_router(stream.router, prefix="/api", tags=["stream"])
app.include_router(jenkins.router, prefix="/api", tags=["jenkins"])

# Background task to automatically sync Jenkins jobs
def auto_sync_jenkins():
    """Automatically sync Jenkins jobs every 5 seconds"""
    try:
        from .routers.jenkins import sync_jenkins_jobs
        from .services.jenkins import JenkinsService
        from .database import get_db
        from . import models
        from .services.alerts import send_failure_alert
        
        # Get database session
        db = next(get_db())
        
        # Get Jenkins service
        jenkins_service = JenkinsService()
        
        # Perform sync
        result = sync_jenkins_jobs(jenkins_service, db)
        
        # Check for any new failed jobs that weren't notified before
        recent_failures = db.query(models.PipelineRun).filter(
            models.PipelineRun.provider == 'jenkins',
            models.PipelineRun.status == 'failure',
            models.PipelineRun.notified == False,  # Only jobs that haven't been notified
            models.PipelineRun.started_at >= datetime.now() - timedelta(minutes=5)  # Last 5 minutes
        ).all()
        
        # Send notifications for new failures
        for failure in recent_failures:
            send_failure_alert(failure, db)
        
        logging.info(f"Auto-sync completed: {result}")
        
    except Exception as e:
        logging.error(f"Auto-sync error: {e}")
    finally:
        if 'db' in locals():
            db.close()

# Schedule the auto-sync task
scheduler = AsyncIOScheduler()
scheduler.add_job(auto_sync_jenkins, 'interval', seconds=5)  # Run every 5 seconds
scheduler.start()

@app.on_event("shutdown")
async def shutdown_scheduler():
    scheduler.shutdown()

@app.get("/")
async def root():
    return {"message": "Pipeline Reliability Dashboard API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


