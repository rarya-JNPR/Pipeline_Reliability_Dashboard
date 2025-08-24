import os
import json
import smtplib
from email.message import EmailMessage
import urllib.request

def send_failure_alert(run, db_session=None):
    """Send failure alert and mark job as notified to prevent duplicates"""
    # Hardcoded Slack webhook URL as requested
    slack_url = "https://hooks.slack.com/services/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"
    if slack_url:
        try:
            # Fix URL to use localhost:8080 and include build number
            display_url = run.url
            if display_url and 'jenkins:8080' in display_url:
                # Replace jenkins:8080 with localhost:8080
                display_url = display_url.replace('jenkins:8080', 'localhost:8080')
                
                # If we have a build number, ensure it's in the URL
                if hasattr(run, 'build_number') and run.build_number:
                    # Check if URL already has build number, if not add it
                    if f'/job/{run.pipeline_name}/' in display_url and not display_url.endswith(f'/{run.build_number}/'):
                        display_url = f"http://localhost:8080/job/{run.pipeline_name}/{run.build_number}/"
            
            # Create a more informative Slack message
            message = f"❌ Pipeline failure: {run.pipeline_name} #{run.build_number or 'N/A'} ({run.provider}) on {run.branch} — commit {run.commit}. URL: {display_url}"
            
            data = {
                "text": message
            }
            req = urllib.request.Request(slack_url, data=json.dumps(data).encode("utf-8"), headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=5)
            print(f"Slack notification sent for failed job: {run.pipeline_name}")
            
            # Mark job as notified to prevent duplicate alerts
            if db_session and hasattr(run, 'notified'):
                run.notified = True
                db_session.commit()
                print(f"Marked job {run.pipeline_name} as notified")
                
        except Exception as e:
            print(f"Failed to send Slack notification: {e}")

    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USERNAME")
    smtp_pass = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM")
    to_addr = os.getenv("ALERT_EMAIL_TO")
    
    # Fix SMTP port parsing
    smtp_port_str = os.getenv("SMTP_PORT", "587")
    smtp_port = 587  # Default fallback
    try:
        if smtp_port_str and smtp_port_str.strip():
            smtp_port = int(smtp_port_str)
    except ValueError:
        smtp_port = 587  # Default fallback

    if smtp_host and smtp_user and smtp_pass and smtp_from and to_addr:
        try:
            msg = EmailMessage()
            msg["Subject"] = f"Pipeline FAILURE: {run.pipeline_name} ({run.provider})"
            msg["From"] = smtp_from
            msg["To"] = to_addr
            body = (
                f"Pipeline: {run.pipeline_name}\n"
                f"Provider: {run.provider}\n"
                f"Branch: {run.branch}\n"
                f"Commit: {run.commit}\n"
                f"URL: {run.url}\n"
                f"Status: {run.status}\n"
                f"Logs:\n{(run.logs or '')[:2000]}\n"
            )
            msg.set_content(body)

            with smtplib.SMTP(smtp_host, smtp_port, timeout=5) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
        except Exception:
            pass


