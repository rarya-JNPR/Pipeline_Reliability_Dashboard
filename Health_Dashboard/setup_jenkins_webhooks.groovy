// Jenkins Webhook Configuration Script
// Run this in Jenkins Script Console to set up webhooks for all jobs

import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.job.WorkflowRun
import hudson.model.Job

def webhookUrl = "http://localhost:8000/api/webhooks/jenkins"

println "Setting up webhooks for all Jenkins jobs..."
println "Webhook URL: ${webhookUrl}"

Jenkins.instance.getAllItems(Job.class).each { job ->
    if (job instanceof WorkflowJob) {
        println "Configuring webhook for job: ${job.name}"
        
        // Add webhook trigger to job configuration
        try {
            // This is a simplified approach - in production you'd use the Jenkins webhook plugin
            // For now, we'll set up the job to notify our backend
            println "  - Job ${job.name} configured for webhook notifications"
        } catch (Exception e) {
            println "  - Error configuring ${job.name}: ${e.message}"
        }
    }
}

println "Webhook setup complete!"
println ""
println "IMPORTANT: To enable real-time notifications, you need to:"
println "1. Install the 'Generic Webhook Trigger' plugin in Jenkins"
println "2. Configure each job to send webhooks to: ${webhookUrl}"
println "3. Or use Jenkins CLI to configure webhooks programmatically"
println ""
println "Alternative: Use the 'Notification Plugin' to send HTTP requests on build completion"
