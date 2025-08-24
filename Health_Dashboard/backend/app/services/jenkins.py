import requests
import os
from typing import List, Dict, Optional
from datetime import datetime
import logging
import pytz
from .alerts import send_failure_alert

logger = logging.getLogger(__name__)

class JenkinsService:
    def __init__(self):
        self.base_url = os.getenv("JENKINS_URL", "http://jenkins:8080")
        self.username = os.getenv("JENKINS_USERNAME", "api-user")
        self.api_token = os.getenv("JENKINS_API_TOKEN", "api-token-12345")
        self.timeout = 30
        self.ist_tz = pytz.timezone('Asia/Kolkata')

    def _get_auth(self):
        """Get authentication tuple if credentials are provided"""
        if self.username and self.api_token:
            return (self.username, self.api_token)
        return None

    def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
        """Make a request to Jenkins API"""
        try:
            url = f"{self.base_url}{endpoint}"
            auth = self._get_auth()
            
            response = requests.get(
                url, 
                auth=auth, 
                params=params, 
                timeout=self.timeout,
                headers={'Accept': 'application/json'}
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Jenkins API request failed: {response.status_code} - {response.text}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error connecting to Jenkins: {e}")
            return None

    def get_jobs(self) -> List[Dict]:
        """Get all jobs from Jenkins"""
        data = self._make_request("/api/json?tree=jobs[name,url,color,lastBuild[number,timestamp,result,duration]]")
        if data and 'jobs' in data:
            return data['jobs']
        return []

    def get_job_details(self, job_name: str) -> Optional[Dict]:
        """Get detailed information about a specific job"""
        endpoint = f"/job/{job_name}/api/json?tree=name,url,color,lastBuild[number,timestamp,result,duration,fullDisplayName],lastSuccessfulBuild[number,timestamp,result,duration],lastFailedBuild[number,timestamp,result,duration]"
        return self._make_request(endpoint)

    def get_job_builds(self, job_name: str, limit: int = 10) -> List[Dict]:
        """Get recent builds for a job"""
        endpoint = f"/job/{job_name}/api/json?tree=builds[number,timestamp,result,duration,fullDisplayName,url,actions[*],causes[*]]"
        data = self._make_request(endpoint)
        if data and 'builds' in data:
            return data['builds'][:limit]
        return []

    def get_build_details(self, job_name: str, build_number: int) -> Optional[Dict]:
        """Get detailed information about a specific build"""
        endpoint = f"/job/{job_name}/{build_number}/api/json?tree=number,timestamp,result,duration,fullDisplayName,url,actions[*],changeSet[*],causes[*]"
        return self._make_request(endpoint)

    def get_jenkins_info(self) -> Optional[Dict]:
        """Get Jenkins server information"""
        return self._make_request("/api/json?tree=version,nodeName,executors[*],overallLoad")

    def trigger_build(self, job_name: str, parameters: Optional[Dict] = None) -> bool:
        """Trigger a build for a job"""
        try:
            # Get CSRF crumb first
            crumb_url = f"{self.base_url}/crumbIssuer/api/json"
            auth = self._get_auth()
            
            try:
                crumb_response = requests.get(crumb_url, auth=auth, timeout=self.timeout)
                if crumb_response.status_code == 200:
                    crumb_data = crumb_response.json()
                    headers = {
                        crumb_data['crumbRequestField']: crumb_data['crumb']
                    }
                else:
                    headers = {}
            except:
                headers = {}
            
            url = f"{self.base_url}/job/{job_name}/build"
            
            if parameters:
                url = f"{self.base_url}/job/{job_name}/buildWithParameters"
                response = requests.post(url, auth=auth, headers=headers, params=parameters, timeout=self.timeout)
            else:
                response = requests.post(url, auth=auth, headers=headers, timeout=self.timeout)
            
            return response.status_code in [200, 201]
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error triggering build: {e}")
            return False

    def _parse_job_status(self, color: str) -> str:
        """Parse Jenkins job color to status"""
        if not color:
            return "unknown"
        
        color_lower = color.lower()
        if "blue" in color_lower:
            return "success"
        elif "red" in color_lower:
            return "failure"
        elif "yellow" in color_lower:
            return "unstable"
        elif "grey" in color_lower or "disabled" in color_lower:
            return "disabled"
        elif "aborted" in color_lower:
            return "aborted"
        else:
            return "unknown"

    def _convert_timestamp(self, timestamp: int) -> datetime:
        """Convert Jenkins timestamp to datetime in IST"""
        utc_dt = datetime.fromtimestamp(timestamp / 1000)
        utc_dt = pytz.utc.localize(utc_dt)
        ist_dt = utc_dt.astimezone(self.ist_tz)
        return ist_dt

    def _get_build_user(self, build: Dict) -> str:
        """Extract user who triggered the build from build causes"""
        # First try to get from causes array
        causes = build.get('causes', [])
        for cause in causes:
            if isinstance(cause, dict):
                if 'userId' in cause and cause['userId']:
                    return cause['userId']
                elif 'userName' in cause and cause['userName']:
                    return cause['userName']
                elif 'shortDescription' in cause and cause['shortDescription']:
                    # Parse shortDescription like "Started by user admin"
                    desc = cause['shortDescription']
                    if 'Started by user' in desc:
                        user = desc.replace('Started by user', '').strip()
                        if user:
                            return user
        
        # If no user found in causes, try actions
        actions = build.get('actions', [])
        for action in actions:
            if isinstance(action, dict):
                # Look for user ID in actions
                if 'userId' in action and action['userId']:
                    return action['userId']
                elif 'userName' in action and action['userName']:
                    return action['userName']
                elif 'causes' in action:
                    # Handle nested causes in actions
                    nested_causes = action.get('causes', [])
                    for nested_cause in nested_causes:
                        if isinstance(nested_cause, dict):
                            if 'userId' in nested_cause and nested_cause['userId']:
                                return nested_cause['userId']
                            elif 'userName' in nested_cause and nested_cause['userName']:
                                return nested_cause['userName']
                            elif 'shortDescription' in nested_cause and nested_cause['shortDescription']:
                                desc = nested_cause['shortDescription']
                                if 'Started by user' in desc:
                                    user = desc.replace('Started by user', '').strip()
                                    if user:
                                        return user
        
        return "Ravitosh"  # Return "Ravitosh" if no user found

    def _parse_build_status(self, result: str) -> str:
        """Parse Jenkins build result to status"""
        if not result:
            return "unknown"
        
        result_lower = result.lower()
        if result_lower == "success":
            return "success"
        elif result_lower == "failure":
            return "failure"
        elif result_lower == "unstable":
            return "unstable"
        elif result_lower == "aborted":
            return "aborted"
        else:
            return "unknown"

    def get_formatted_jobs(self) -> List[Dict]:
        """Get jobs in a format compatible with the dashboard"""
        jobs = self.get_jobs()
        formatted_jobs = []
        
        for i, job in enumerate(jobs):
            last_build = job.get('lastBuild', {})
            
            formatted_job = {
                'id': i + 1,  # Use integer ID for compatibility
                'provider': 'jenkins',
                'pipeline_name': job['name'],
                'status': self._parse_job_status(job.get('color', '')),
                'url': job.get('url', ''),
                'started_at': self._convert_timestamp(last_build.get('timestamp', 0)) if last_build.get('timestamp') else None,
                'duration_seconds': last_build.get('duration', 0) / 1000 if last_build.get('duration') else None,
                'branch': 'main',  # Jenkins doesn't always provide branch info
                'commit': None,  # Would need to extract from build details
                'logs': None
            }
            
            # Calculate finished_at based on started_at and duration
            if formatted_job['started_at'] and formatted_job['duration_seconds']:
                formatted_job['finished_at'] = datetime.fromtimestamp(
                    formatted_job['started_at'].timestamp() + formatted_job['duration_seconds']
                )
            
            formatted_jobs.append(formatted_job)
        
        return formatted_jobs

    def get_jenkins_metrics(self) -> Dict:
        """Get Jenkins metrics for the dashboard"""
        jobs = self.get_formatted_jobs()
        
        if not jobs:
            return {
                'total_runs': 0,
                'success_count': 0,
                'failure_count': 0,
                'running_count': 0,
                'success_rate': 0.0,
                'average_build_time_seconds': None,
                'last_build_status': None
            }
        
        total = len(jobs)
        success = len([j for j in jobs if j['status'] == 'success'])
        failure = len([j for j in jobs if j['status'] in ['failure', 'unstable']])
        running = len([j for j in jobs if j['status'] == 'running'])
        
        durations = [j['duration_seconds'] for j in jobs if j['duration_seconds']]
        avg_duration = sum(durations) / len(durations) if durations else None
        
        success_rate = (success / total) * 100 if total > 0 else 0.0
        
        # Get the most recent job
        recent_jobs = sorted(jobs, key=lambda x: x['started_at'] or datetime.min, reverse=True)
        last_status = recent_jobs[0]['status'] if recent_jobs else None
        
        return {
            'total_runs': total,
            'success_count': success,
            'failure_count': failure,
            'running_count': running,
            'success_rate': round(success_rate, 2),
            'average_build_time_seconds': float(avg_duration) if avg_duration else None,
            'last_build_status': last_status
        }
