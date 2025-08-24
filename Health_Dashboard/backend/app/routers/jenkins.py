from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
import logging
from ..services.jenkins import JenkinsService
from .. import schemas, models
from ..database import get_db
from ..services.alerts import send_failure_alert

logger = logging.getLogger(__name__)

router = APIRouter()

def get_jenkins_service() -> JenkinsService:
    return JenkinsService()

@router.get("/jenkins/jobs", response_model=List[schemas.PipelineRunOut])
def get_jenkins_jobs(service: JenkinsService = Depends(get_jenkins_service)):
    """Get all Jenkins jobs"""
    try:
        jobs = service.get_formatted_jobs()
        return jobs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Jenkins jobs: {str(e)}")

@router.post("/jenkins/sync")
def sync_jenkins_jobs(
    service: JenkinsService = Depends(get_jenkins_service),
    db: Session = Depends(get_db)
):
    """Sync Jenkins jobs into pipeline_runs table"""
    jobs = service.get_formatted_jobs()
    synced_count = 0
    
    for job in jobs:
        # Get all builds for this job (limit to recent builds to avoid duplicates)
        builds = service.get_job_builds(job['pipeline_name'], limit=20)  # Get up to 20 builds
        
        for build in builds:
            # Extract build number from Jenkins build
            build_number = build.get('number')
            # Fallback: Try to extract build number from URL if missing (should rarely be needed)
            if build_number is None and build.get('url'):
                try:
                    url_parts = build['url'].rstrip('/').split('/')
                    if url_parts[-1].isdigit():
                        build_number = int(url_parts[-1])
                except Exception as e:
                    logger.warning(f"Failed to extract build number from URL: {build.get('url')}, error: {e}")
            # Ensure build_number is not None
            if build_number is None:
                logger.warning(f"Build number is None for build: {build}")
                continue
            
            # Try to find existing run by provider+pipeline_name+build_number
            existing = db.query(models.PipelineRun).filter_by(
                provider='jenkins',
                pipeline_name=job['pipeline_name'],
                build_number=build_number  # Use build_number as unique identifier
            ).first()
            
            # Get the user who triggered the build (default to Ravitosh for Jenkins)
            triggered_by = service._get_build_user(build) or "Ravitosh"
            # Get the build status
            build_status = service._parse_build_status(build.get('result', ''))
            
            # Ensure we have proper timestamp
            started_at = None
            if build.get('timestamp'):
                started_at = service._convert_timestamp(build['timestamp'])
            
            # Calculate duration
            duration_seconds = None
            if build.get('duration'):
                duration_seconds = build['duration'] / 1000
            
            if existing:
                # Update existing build
                existing.status = build_status
                existing.started_at = started_at or existing.started_at
                existing.duration_seconds = duration_seconds or existing.duration_seconds
                existing.branch = job.get('branch') or 'main'
                existing.commit = triggered_by  # Show who triggered the build
                # Ensure URL includes build number
                if build.get('url') and build_number:
                    # Clean up the URL and add build number
                    base_url = build['url'].rstrip('/')
                    if base_url.endswith('/job/' + job['pipeline_name']):
                        existing.url = f"{base_url}/{build_number}/"
                    else:
                        existing.url = f"{base_url}/job/{job['pipeline_name']}/{build_number}/"
                existing.build_number = build_number  # Store build number
                
                # Send alert if status changed to failure and hasn't been notified yet
                if build_status == "failure" and existing.status != "failure" and not existing.notified:
                    send_failure_alert(existing, db)
            else:
                # Add new build
                # Ensure URL includes build number
                complete_url = ""
                if build.get('url') and build_number:
                    base_url = build['url'].rstrip('/')
                    if base_url.endswith('/job/' + job['pipeline_name']):
                        complete_url = f"{base_url}/{build_number}/"
                    else:
                        complete_url = f"{base_url}/job/{job['pipeline_name']}/{build_number}/"
                
                new_run = models.PipelineRun(
                    provider='jenkins',
                    pipeline_name=job['pipeline_name'],
                    status=build_status,
                    started_at=started_at,
                    finished_at=None,  # Will calculate below
                    duration_seconds=duration_seconds,
                    branch=job.get('branch') or 'main',
                    commit=triggered_by,  # Show who triggered the build
                    url=complete_url,
                    logs=None,
                    build_number=build_number,  # Store build number
                    notified=False  # Mark as not notified yet
                )
                db.add(new_run)
                synced_count += 1
                
                # Send alert for new failed jobs
                if build_status == "failure":
                    send_failure_alert(new_run, db)
        
        # Also sync the latest job info (for job-level metrics)
        latest_job = db.query(models.PipelineRun).filter_by(
            provider='jenkins',
            pipeline_name=job['pipeline_name']
        ).order_by(models.PipelineRun.started_at.desc()).first()
        
        if latest_job:
            latest_job.status = job['status']
            latest_job.url = job.get('url', '')
    
    db.commit()
    return {"message": f"Synced {synced_count} Jenkins builds to pipeline_runs."}

@router.post("/jenkins/sync-now")
def sync_jenkins_now(
    service: JenkinsService = Depends(get_jenkins_service),
    db: Session = Depends(get_db)
):
    """Immediately sync Jenkins jobs (for manual trigger)"""
    return sync_jenkins_jobs(service, db)

@router.post("/jenkins/force-update")
def force_update_jenkins_jobs(
    service: JenkinsService = Depends(get_jenkins_service),
    db: Session = Depends(get_db)
):
    """Force update all existing Jenkins jobs with correct information"""
    try:
        # Get all existing Jenkins jobs from database
        existing_jobs = db.query(models.PipelineRun).filter_by(provider='jenkins').all()
        updated_count = 0
        
        for existing_job in existing_jobs:
            # Try to get build details from Jenkins
            if existing_job.url and '/job/' in existing_job.url:
                try:
                    # Extract job name and build number from URL
                    url_parts = existing_job.url.split('/job/')
                    if len(url_parts) > 1:
                        job_path = url_parts[1].rstrip('/')
                        job_parts = job_path.split('/')
                        if len(job_parts) >= 2:
                            job_name = job_parts[0]
                            build_number = int(job_parts[1])
                            
                            # Get fresh build details from Jenkins
                            build_details = service.get_build_details(job_name, build_number)
                            if build_details:
                                # Update with correct information
                                triggered_by = service._get_build_user(build_details) or "Ravitosh"
                                build_status = service._parse_build_status(build_details.get('result', ''))
                                
                                # Check if status changed to failure and send alert
                                if build_status == "failure" and existing_job.status != "failure" and not existing_job.notified:
                                    send_failure_alert(existing_job, db)
                                
                                # Update the record
                                existing_job.commit = triggered_by
                                existing_job.status = build_status
                                updated_count += 1
                                
                except Exception as e:
                    # If we can't get details, set default values
                    existing_job.commit = "Ravitosh"
                    continue
        
        # Also fix any remaining records with null or Unknown values
        remaining_fixes = db.query(models.PipelineRun).filter_by(provider='jenkins').filter(
            (models.PipelineRun.commit == "Unknown") | 
            (models.PipelineRun.commit == None)
        ).all()
        
        for record in remaining_fixes:
            record.commit = "Ravitosh"
            updated_count += 1
        
        db.commit()
        return {"message": f"Force updated {updated_count} Jenkins jobs with correct information"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Force update failed: {str(e)}")

@router.get("/jenkins/jobs/{job_name}")
def get_jenkins_job_details(job_name: str, service: JenkinsService = Depends(get_jenkins_service)):
    """Get detailed information about a specific Jenkins job"""
    try:
        job_details = service.get_job_details(job_name)
        if not job_details:
            raise HTTPException(status_code=404, detail="Job not found")
        return job_details
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch job details: {str(e)}")

@router.get("/jenkins/jobs/{job_name}/builds")
def get_jenkins_job_builds(
    job_name: str, 
    limit: int = 10, 
    service: JenkinsService = Depends(get_jenkins_service)
):
    """Get recent builds for a Jenkins job"""
    try:
        builds = service.get_job_builds(job_name, limit)
        return {"job_name": job_name, "builds": builds}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch job builds: {str(e)}")

@router.get("/jenkins/jobs/{job_name}/builds/{build_number}")
def get_jenkins_build_details(
    job_name: str, 
    build_number: int, 
    service: JenkinsService = Depends(get_jenkins_service)
):
    """Get detailed information about a specific build"""
    try:
        build_details = service.get_build_details(job_name, build_number)
        if not build_details:
            raise HTTPException(status_code=404, detail="Build not found")
        return build_details
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch build details: {str(e)}")

@router.post("/jenkins/jobs/{job_name}/build")
def trigger_jenkins_build(
    job_name: str, 
    parameters: Optional[dict] = None,
    service: JenkinsService = Depends(get_jenkins_service)
):
    """Trigger a build for a Jenkins job"""
    try:
        success = service.trigger_build(job_name, parameters)
        if success:
            return {"message": f"Build triggered successfully for job: {job_name}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to trigger build")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger build: {str(e)}")

@router.get("/jenkins/info")
def get_jenkins_info(service: JenkinsService = Depends(get_jenkins_service)):
    """Get Jenkins server information"""
    try:
        info = service.get_jenkins_info()
        if not info:
            raise HTTPException(status_code=500, detail="Failed to fetch Jenkins info")
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Jenkins info: {str(e)}")

@router.get("/jenkins/metrics", response_model=schemas.MetricsOut)
def get_jenkins_metrics(service: JenkinsService = Depends(get_jenkins_service)):
    """Get Jenkins metrics for the dashboard"""
    try:
        metrics = service.get_jenkins_metrics()
        return schemas.MetricsOut(**metrics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Jenkins metrics: {str(e)}")

@router.get("/jenkins/health")
def get_jenkins_health(service: JenkinsService = Depends(get_jenkins_service)):
    """Check Jenkins connectivity"""
    try:
        info = service.get_jenkins_info()
        if info:
            return {
                "status": "healthy",
                "jenkins_version": info.get("version", "unknown"),
                "node_name": info.get("nodeName", "unknown"),
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "status": "unhealthy",
                "error": "Cannot connect to Jenkins",
                "timestamp": datetime.now().isoformat()
            }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@router.post("/jenkins/update-build-numbers")
def update_build_numbers(
    service: JenkinsService = Depends(get_jenkins_service),
    db: Session = Depends(get_db)
):
    """Update existing Jenkins records with build numbers extracted from URLs"""
    try:
        # Get all Jenkins records without build numbers
        jenkins_records = db.query(models.PipelineRun).filter_by(provider='jenkins').all()
        updated_count = 0
        
        for record in jenkins_records:
            if record.url and '/job/' in record.url and not record.build_number:
                try:
                    # Extract build number from URL like http://jenkins:8080/job/Deploy_AIagent/6/
                    url_parts = record.url.split('/job/')
                    if len(url_parts) > 1:
                        job_path = url_parts[1].rstrip('/')
                        job_parts = job_path.split('/')
                        if len(job_parts) >= 2:
                            build_number = int(job_parts[1])
                            record.build_number = build_number
                            updated_count += 1
                except (ValueError, IndexError):
                    # If we can't parse the URL, skip this record
                    continue
        
        db.commit()
        return {"message": f"Updated {updated_count} Jenkins records with build numbers."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update build numbers: {str(e)}")

@router.post("/jenkins/fresh-sync")
def fresh_sync_jenkins(
    service: JenkinsService = Depends(get_jenkins_service),
    db: Session = Depends(get_db)
):
    """Perform a fresh sync of all Jenkins jobs with actual build numbers"""
    try:
        # First, clear all existing Jenkins records
        db.query(models.PipelineRun).filter_by(provider='jenkins').delete()
        db.commit()
        
        # Now perform a fresh sync
        return sync_jenkins_jobs(service, db)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to perform fresh sync: {str(e)}")
