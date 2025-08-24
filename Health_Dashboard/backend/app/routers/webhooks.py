from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from ..database import get_db
from .. import models, schemas
from ..services.alerts import send_failure_alert
from ..services.events import broadcast_event
from ..services.jenkins import JenkinsService
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

def compute_duration_seconds(started_at, finished_at):
    if started_at and finished_at:
        return (finished_at - started_at).total_seconds()
    return None

def normalize_status(raw: str) -> str:
    if not raw:
        return "running"
    s = raw.strip().lower()
    # map common synonyms
    if s in {"success", "succeeded", "passed", "pass", "ok", "green"}:
        return "success"
    if s in {"failure", "failed", "error", "errored", "red", "cancelled", "canceled"}:
        return "failure"
    if s in {"running", "in_progress", "queued", "pending"}:
        return "running"
    # default fallback
    return s

@router.post("/github", response_model=schemas.PipelineRunOut)
def github_webhook(payload: schemas.PipelineRunCreate, db: Session = Depends(get_db)):
    started = payload.started_at
    finished = payload.finished_at
    duration = compute_duration_seconds(started, finished)
    run = models.PipelineRun(
        provider="github",
        pipeline_name=payload.pipeline_name,
        status=normalize_status(payload.status),
        started_at=started,
        finished_at=finished,
        duration_seconds=duration,
        commit="Pushkar",  # Always set to Pushkar
        branch=payload.branch,
        url=str(payload.url) if payload.url else None,
        logs=payload.logs,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    broadcast_event({"type": "run_created", "id": run.id, "status": run.status})

    if run.status == "failure":
        send_failure_alert(run)
    return run

@router.post("/jenkins", response_model=schemas.PipelineRunOut)
def jenkins_webhook(payload: schemas.PipelineRunCreate, db: Session = Depends(get_db)):
    # Same shape, different provider label
    started = payload.started_at
    finished = payload.finished_at
    duration = compute_duration_seconds(started, finished)
    run = models.PipelineRun(
        provider="jenkins",
        pipeline_name=payload.pipeline_name,
        status=normalize_status(payload.status),
        started_at=started,
        finished_at=finished,
        duration_seconds=duration,
        commit=payload.commit,
        branch=payload.branch,
        url=str(payload.url) if payload.url else None,
        logs=payload.logs,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    broadcast_event({"type": "run_created", "id": run.id, "status": run.status})

    if run.status == "failure":
        send_failure_alert(run)
    return run

@router.post("/webhooks/jenkins")
async def jenkins_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Jenkins webhook notifications for job builds in real-time"""
    try:
        # Get the webhook payload
        payload = await request.json()
        logger.info(f"Received Jenkins webhook: {payload}")
        
        # Extract build information from webhook
        build_info = extract_build_info(payload)
        if not build_info:
            logger.warning("Invalid webhook payload received")
            raise HTTPException(status_code=400, detail="Invalid webhook payload")
        
        logger.info(f"Processing webhook for job: {build_info['job_name']} build #{build_info['build_number']}")
        
        # Sync the build to pipeline_runs table
        jenkins_service = JenkinsService()
        run_record = sync_build_to_pipeline_runs(build_info, jenkins_service, db)
        
        # Send immediate notification if job failed
        if run_record and run_record.status == "failure" and not run_record.notified:
            logger.info(f"Sending immediate failure alert for {build_info['job_name']} #{build_info['build_number']}")
            send_failure_alert(run_record, db)
        
        # Broadcast real-time event to frontend
        if run_record:
            broadcast_event({
                "type": "jenkins_build_completed", 
                "id": run_record.id, 
                "status": run_record.status,
                "pipeline_name": run_record.pipeline_name,
                "build_number": run_record.build_number
            })
        
        return {"message": "Webhook processed successfully", "status": "success"}
        
    except Exception as e:
        logger.error(f"Error processing Jenkins webhook: {e}")
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")

def extract_build_info(payload: dict) -> dict:
    """Extract relevant build information from Jenkins webhook payload"""
    try:
        # Handle different webhook formats
        if 'build' in payload:
            build = payload['build']
            # FIX: robust job name extraction from full_url
            full_url = build.get('full_url', '')
            job_name = None
            if '/job/' in full_url:
                # Extract job name between '/job/' and the next '/'
                parts = full_url.split('/job/')
                if len(parts) > 1:
                    after_job = parts[1]
                    job_name = after_job.split('/')[0]
            return {
                'job_name': job_name,
                'build_number': build.get('number'),
                'status': build.get('status'),
                'timestamp': build.get('timestamp'),
                'duration': build.get('duration'),
                'url': build.get('full_url')
            }
        elif 'name' in payload and 'build' in payload:
            # Alternative webhook format
            return {
                'job_name': payload.get('name'),
                'build_number': payload.get('build', {}).get('number'),
                'status': payload.get('build', {}).get('status'),
                'timestamp': payload.get('build', {}).get('timestamp'),
                'duration': payload.get('build', {}).get('duration'),
                'url': payload.get('build', {}).get('full_url')
            }
        return None
    except Exception as e:
        logger.error(f"Error extracting build info: {e}")
        return None

def sync_build_to_pipeline_runs(build_info: dict, jenkins_service: JenkinsService, db: Session):
    """Sync a single Jenkins build to the pipeline_runs table"""
    try:
        if not build_info.get('job_name') or not build_info.get('build_number'):
            logger.warning("Missing job_name or build_number in build_info")
            return
        
        # Get detailed build information from Jenkins
        build_details = jenkins_service.get_build_details(
            build_info['job_name'], 
            build_info['build_number']
        )
        
        if not build_details:
            logger.warning(f"Could not fetch build details for {build_info['job_name']} #{build_info['build_number']}")
            return
        
        # Extract user who triggered the build
        triggered_by = jenkins_service._get_build_user(build_details)
        
        # Parse build status
        build_status = jenkins_service._parse_build_status(build_details.get('result', ''))
        
        # Convert timestamp to IST
        started_at = None
        if build_details.get('timestamp'):
            started_at = jenkins_service._convert_timestamp(build_details['timestamp'])
        
        # Calculate duration
        duration_seconds = None
        if build_details.get('duration'):
            duration_seconds = build_details['duration'] / 1000
        
        # Check if build already exists
        existing_run = db.query(models.PipelineRun).filter_by(
            provider='jenkins',
            pipeline_name=build_info['job_name'],
            build_number=build_info['build_number']
        ).first()
        
        if existing_run:
            # Update existing build
            existing_run.status = build_status
            existing_run.started_at = started_at
            existing_run.duration_seconds = duration_seconds
            existing_run.commit = triggered_by
            existing_run.build_number = build_info['build_number']
            # Ensure URL includes build number
            if build_details.get('url') and build_info['build_number']:
                existing_run.url = f"{build_details['url'].rstrip('/')}/{build_info['build_number']}/"
            
            # Send alert if status changed to failure and hasn't been notified yet
            if build_status == "failure" and existing_run.status != "failure" and not existing_run.notified:
                send_failure_alert(existing_run, db)
                
            logger.info(f"Updated existing build {build_info['job_name']} #{build_info['build_number']}")
        else:
            # Add new build
            # Ensure URL includes build number
            complete_url = f"{build_details.get('url', '').rstrip('/')}/{build_info['build_number']}/" if build_details.get('url') and build_info['build_number'] else ''
            
            new_run = models.PipelineRun(
                provider='jenkins',
                pipeline_name=build_info['job_name'],
                status=build_status,
                started_at=started_at,
                duration_seconds=duration_seconds,
                branch='main',  # Default branch
                commit=triggered_by,
                url=complete_url,
                logs=None,
                build_number=build_info['build_number']
            )
            db.add(new_run)
            
            # Send alert for new failed builds
            if build_status == "failure":
                send_failure_alert(new_run, db)
                
            logger.info(f"Added new build {build_info['job_name']} #{build_info['build_number']}")
        
        db.commit()
        return new_run # Return the newly created or updated run record
        
    except Exception as e:
        logger.error(f"Error syncing build to pipeline_runs: {e}")
        db.rollback()
        return None # Return None on error


