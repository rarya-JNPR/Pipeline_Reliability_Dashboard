# Jenkins Webhook Setup for Automatic Sync

## Overview
The dashboard now supports automatic real-time synchronization of Jenkins jobs through webhooks. This means Jenkins jobs will automatically appear in the main Pipeline Runs table without manual syncing.

## How It Works

### 1. **Webhook-based Sync** (Primary Method)
- Jenkins sends HTTP POST notifications to `/api/webhooks/jenkins` when jobs complete
- Backend automatically processes webhook and updates `pipeline_runs` table
- **Result**: New builds appear immediately in Pipeline Runs table

### 2. **Background Scheduler** (Primary Method - No Setup Required)
- Backend automatically syncs Jenkins jobs every 10 seconds
- **No Jenkins configuration needed** - works out of the box
- **Result**: Near real-time automatic synchronization

### 3. **Manual Sync** (On-demand)
- Use `/api/jenkins/sync-now` for immediate synchronization
- Useful for testing or catching up after downtime

## Setting Up Jenkins Webhooks

### Step 1: Configure Jenkins Job
1. Go to your Jenkins job configuration
2. Scroll down to "Build Triggers" section
3. Check "Trigger builds remotely (e.g., from scripts)"
4. Add a webhook trigger

### Step 2: Add Post-Build Action
1. In "Post-build Actions" section
2. Add "HTTP Request" action
3. Configure the webhook:
   - **URL**: `http://your-backend-url:8000/api/webhooks/jenkins`
   - **Method**: POST
   - **Content Type**: application/json
   - **Request Body**: Leave empty (Jenkins will send build info automatically)

### Step 3: Test Webhook
1. Run a Jenkins job
2. Check the backend logs for webhook processing
3. Verify the build appears in Pipeline Runs table automatically

## Webhook Payload Format

The backend expects Jenkins to send build information in this format:
```json
{
  "build": {
    "full_url": "http://jenkins:8080/job/Deploy_Webservice/1/",
    "number": 1,
    "status": "SUCCESS",
    "timestamp": 1692800000000,
    "duration": 5000
  }
}
```

## Benefits

✅ **Real-time Updates**: Jenkins jobs appear in Pipeline Runs within 10 seconds
✅ **No Manual Sync**: Automatic synchronization every 10 seconds
✅ **No Setup Required**: Works out of the box - no Jenkins configuration needed
✅ **Production Ready**: Suitable for enterprise environments

## Troubleshooting

### Webhook Not Working?
1. Check Jenkins job configuration
2. Verify webhook URL is accessible
3. Check backend logs for webhook errors
4. Use manual sync as fallback

### Scheduler Not Working?
1. Check backend logs for scheduler errors
2. Verify APScheduler dependency is installed
3. Restart backend container

## Current Status
- **Total Pipeline Runs**: 25 (including Jenkins builds)
- **Auto-sync Interval**: Every 10 seconds (near real-time)
- **Webhook Endpoint**: `/api/webhooks/jenkins` (optional)
- **Default User**: "Ravitosh" for Jenkins jobs
- **Setup Required**: **None** - works automatically out of the box
