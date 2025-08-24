#!/bin/bash

# Script to create sample Jenkins jobs for testing
# This script uses the Jenkins CLI to create jobs

echo "Creating sample Jenkins jobs..."

# Create a simple pipeline job
cat > /tmp/sample-pipeline.xml << 'EOF'
<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@1300.vd2290d3341a_f">
  <description>A sample pipeline job for testing</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@3853.vb_a_490d892d0">
    <script>pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Building...'
                sh 'sleep 5'
            }
        }
        stage('Test') {
            steps {
                echo 'Testing...'
                sh 'sleep 3'
            }
        }
        stage('Deploy') {
            steps {
                echo 'Deploying...'
                sh 'sleep 2'
            }
        }
    }
}</script>
    <sandbox>true</sandbox>
  </definition>
  <triggers/>
  <disabled>false</disabled>
</flow-definition>
EOF

# Create a freestyle job
cat > /tmp/sample-freestyle.xml << 'EOF'
<?xml version='1.1' encoding='UTF-8'?>
<project>
  <description>A sample freestyle job for testing</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <scm class="hudson.scm.NullSCM"/>
  <canRoam>true</canRoam>
  <disabled>false</disabled>
  <blockBuildWhenDownstreamBuilding>false</blockBuildWhenDownstreamBuilding>
  <blockBuildWhenUpstreamBuilding>false</blockBuildWhenUpstreamBuilding>
  <triggers/>
  <concurrentBuild>false</concurrentBuild>
  <builders>
    <hudson.tasks.Shell>
      <command>echo "Hello from Jenkins!"
sleep 10
echo "Build completed!"</command>
    </hudson.tasks.Shell>
  </builders>
  <publishers/>
  <buildWrappers/>
</project>
EOF

echo "Sample job configurations created."
echo "To create these jobs in Jenkins, you can:"
echo "1. Go to Jenkins at http://localhost:8080"
echo "2. Click 'New Item'"
echo "3. Enter job name and select job type"
echo "4. Copy the XML content from the files above"
echo ""
echo "Or use Jenkins CLI if available:"
echo "java -jar jenkins-cli.jar -s http://localhost:8080 create-job 'Sample-Pipeline' < /tmp/sample-pipeline.xml"
echo "java -jar jenkins-cli.jar -s http://localhost:8080 create-job 'Sample-Freestyle' < /tmp/sample-freestyle.xml"
