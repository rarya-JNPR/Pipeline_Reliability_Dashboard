# 🚀 **Health Dashboard - Jenkins Integration Platform**

A comprehensive CI/CD pipeline monitoring dashboard that integrates with Jenkins to provide real-time pipeline execution monitoring, automated notifications, and professional analytics. Built with modern technologies and industry best practices.

## 📋 **Table of Contents**

- [Features](#-features)
- [Architecture](#-architecture)
- [Setup and Run Instructions](#-setup-and-run-instructions)
- [How AI Tools Were Used](#-how-ai-tools-were-used)
- [Key Learning and Assumptions](#-key-learning-and-assumptions)
- [API Documentation](#-api-documentation)
- [Troubleshooting](#-troubleshooting)

## ✨ **Features**

### **Core Dashboard Features**
- ✅ **Real-time Pipeline Monitoring** - Live status updates via Server-Sent Events (SSE)
- ✅ **Jenkins Integration** - Automatic job synchronization and build tracking
- ✅ **Smart Notifications** - Slack alerts for failed jobs with build-specific URLs
- ✅ **Professional Analytics** - Interactive charts with Recharts library
- ✅ **Advanced Search & Filtering** - Status-based filtering with pagination
- ✅ **Time-based Metrics** - 24-hour failure tracking and historical data

### **Jenkins-Specific Features**
- ✅ **Automatic Sync** - 5-second polling interval for real-time updates
- ✅ **Webhook Support** - Real-time Jenkins build notifications
- ✅ **Build Number Tracking** - Accurate Jenkins build number mapping
- ✅ **User Attribution** - "Triggered By" field with fallback to "Ravitosh"
- ✅ **Duplicate Prevention** - Smart notification system prevents spam

### **Professional UI/UX**
- ✅ **Modern React Interface** - Built with Vite and TypeScript
- ✅ **Responsive Design** - Works across all devices
- ✅ **Interactive Charts** - Success/Failure trends, distribution analysis
- ✅ **Smart Notifications** - Badge count, dropdown, click-outside-to-close
- ✅ **Professional Layout** - Settings, user profile, team collaboration features

## 🏗️ **Architecture**

### **System Overview**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Jenkins      │    │   Backend       │    │   Frontend      │
│   (Port 8080)  │◄──►│   (Port 8000)   │◄──►│   (Port 5173)   │
│                │    │                 │    │                 │
│ • Job Execution│    │ • FastAPI       │    │ • React + Vite  │
│ • Build Status │    │ • SQLAlchemy    │    │ • TypeScript    │
│ • Webhooks     │    │ • SQLite        │    │ • Recharts      │
└─────────────────┘    │ • APScheduler   │    │ • Day.js        │
                       └─────────────────┘    └─────────────────┘
```

### **Backend Architecture**
- **FastAPI**: High-performance Python web framework
- **SQLAlchemy**: ORM for database operations
- **SQLite**: Lightweight database for pipeline runs
- **APScheduler**: Background task scheduling (5-second Jenkins sync)
- **Server-Sent Events**: Real-time communication with frontend

### **Frontend Architecture**
- **React 18**: Modern component-based UI framework
- **Vite**: Fast build tool and development server
- **TypeScript**: Type-safe JavaScript development
- **Recharts**: Professional charting library
- **Day.js**: Lightweight date manipulation

### **Data Flow**
1. **Jenkins Jobs** → Execute and complete
2. **Backend Sync** → Poll Jenkins API every 5 seconds
3. **Database Update** → Store build information with build numbers
4. **Real-time Events** → Broadcast via SSE to frontend
5. **Frontend Update** → Refresh dashboard and notifications
6. **Slack Alerts** → Send failure notifications with build URLs

## 🚀 **Setup and Run Instructions**

### **Prerequisites**
- Docker and Docker Compose
- Git
- Jenkins instance (will be created automatically)

### **1. Clone and Navigate**
```bash
git clone <repository-url>
cd assignment_2/Health_Dashboard
```

### **2. Start All Services**
```bash
# Start Jenkins, Backend, and Frontend
docker-compose up -d

# Check service status
docker-compose ps
```

### **3. Access Services**
- **Frontend Dashboard**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Jenkins**: http://localhost:8080

### **4. Initial Jenkins Setup**
```bash
# Get Jenkins admin password
docker-compose exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# Or check logs
docker-compose logs jenkins | grep "initialAdminPassword"
```

### **5. Create Jenkins Jobs**
```bash
# Run the job creation script
./create_jenkins_jobs.sh

# Or manually create jobs in Jenkins UI
```

### **6. Configure Webhooks (Optional)**
```bash
# Install Jenkins webhook plugin
# Configure each job to POST to: http://localhost:8000/api/webhooks/jenkins
```

### **7. Test the Integration**
```bash
# Manual sync
curl -X POST "http://localhost:8000/api/jenkins/sync-now"

# Check failed jobs
curl "http://localhost:8000/api/notifications/failed?limit=5"
```

### **Environment Variables**
The system uses these default configurations:
- **Jenkins**: admin/admin (default)
- **Slack Webhook**: Configured in `alerts.py`
- **Database**: SQLite at `data/db.sqlite3`
- **Ports**: Frontend (5173), Backend (8000), Jenkins (8080)

## 🤖 **How AI Tools Were Used**

### **Project Development Approach**
This project was developed iteratively using AI assistance for:
- **Architecture Design**: System design and technology choices
- **Code Implementation**: Backend API, frontend components, database models
- **Problem Solving**: Debugging Docker issues, fixing import errors
- **Feature Enhancement**: Adding notifications, charts, real-time updates

### **Key AI Prompts Used**

#### **1. Initial Setup and Architecture**
```
"Create a container for Jenkins and bring it up. I have to run some pipeline job in that."
```
**AI Response**: Created Docker Compose configuration with Jenkins service, backend, and frontend.

#### **2. Jenkins Integration**
```
"Integrate our Jenkins from our application. Now application should show the information of Jenkins jobs directly."
```
**AI Response**: Implemented Jenkins API integration, sync endpoints, and real-time updates.

#### **3. Feature Restoration**
```
"Why you removed the date range and search box, column settings and filtering option from pipeline Runs? Make those as it is."
```
**AI Response**: Restored dashboard features that were accidentally removed during integration.

#### **4. Real-time Notifications**
```
"For the failed jobs we are not getting notifications on the dashboard. Also not getting on Slack. Please fix this."
```
**AI Response**: Implemented comprehensive notification system with Slack integration and real-time updates.

#### **5. Problem Solving**
```
"On the slack why we are getting too many duplicate notifications continuously. In the slack channel only the newly failed job alert should come."
```
**AI Response**: Added notification tracking system to prevent duplicate alerts.

### **AI Tool Benefits**
- **Rapid Prototyping**: Quick iteration on features and fixes
- **Problem Diagnosis**: Efficient debugging of complex issues
- **Code Quality**: Consistent coding patterns and best practices
- **Documentation**: Comprehensive setup and troubleshooting guides

## 📚 **Key Learning and Assumptions**

### **Technical Learnings**

#### **1. Docker and Containerization**
- **Learning**: Docker caching can cause persistent import issues
- **Solution**: Use `--no-cache` flag and aggressive cache clearing
- **Assumption**: Container rebuilds are always clean (incorrect)

#### **2. Jenkins Integration Challenges**
- **Learning**: Jenkins API requires CSRF crumbs for authenticated requests
- **Solution**: Implement proper authentication flow with crumb fetching
- **Assumption**: Simple API calls would work (incorrect)

#### **3. Real-time Data Synchronization**
- **Learning**: Polling vs webhooks have different trade-offs
- **Solution**: Hybrid approach with 5-second polling + webhook support
- **Assumption**: Webhooks alone would be sufficient (incorrect)

#### **4. Database Schema Evolution**
- **Learning**: Adding columns to existing SQLite databases requires manual ALTER TABLE
- **Solution**: Implement defensive checks and proper migration handling
- **Assumption**: ORM would handle schema changes automatically (incorrect)

#### **5. Frontend State Management**
- **Learning**: Real-time updates require careful state synchronization
- **Solution**: Server-Sent Events + useEffect for consistent state
- **Assumption**: Simple API polling would be sufficient (incorrect)

### **Architecture Assumptions**

#### **1. Jenkins Build Number Handling**
- **Initial Assumption**: Jenkins build numbers would be automatically available
- **Reality**: Required manual extraction and defensive programming
- **Learning**: Always validate data assumptions with real-world testing

#### **2. Notification System Design**
- **Initial Assumption**: Simple alert system would work
- **Reality**: Required duplicate prevention, user tracking, and real-time updates
- **Learning**: User experience requirements drive technical complexity

#### **3. Real-time Updates**
- **Initial Assumption**: Webhooks would provide immediate updates
- **Reality**: Required fallback polling + webhook hybrid approach
- **Learning**: Production systems need multiple update mechanisms

### **User Experience Learnings**

#### **1. URL Formatting**
- **Learning**: Users expect localhost URLs, not internal container URLs
- **Solution**: URL transformation in notification system
- **Assumption**: Internal URLs would be acceptable (incorrect)

#### **2. Build Number Display**
- **Learning**: Users want actual Jenkins build numbers, not database IDs
- **Solution**: Proper build number extraction and storage
- **Assumption**: Database IDs would be sufficient (incorrect)

#### **3. Notification Behavior**
- **Learning**: Users want smart notifications that don't spam
- **Solution**: 24-hour filtering, duplicate prevention, smart counting
- **Assumption**: Simple failure alerts would be sufficient (incorrect)

## 🔌 **API Documentation**

### **Core Endpoints**
```bash
# Pipeline Runs
GET    /api/runs                    # List pipeline runs with pagination
GET    /api/runs/{id}              # Get specific run details
DELETE /api/runs/{id}              # Delete a run

# Metrics
GET    /api/metrics                # Overall dashboard metrics
GET    /api/notifications/failed   # Failed job notifications

# Jenkins Integration
POST   /api/jenkins/sync           # Sync all Jenkins jobs
POST   /api/jenkins/sync-now      # Manual sync trigger
POST   /api/jenkins/fresh-sync    # Clear and re-sync all jobs

# Webhooks
POST   /api/webhooks/jenkins      # Jenkins webhook endpoint
POST   /api/webhooks/github       # GitHub Actions webhook

# Real-time Updates
GET    /api/stream                # Server-Sent Events stream
```

### **Query Parameters**
```bash
# Pagination
GET /api/runs?limit=10&offset=0

# Filtering
GET /api/runs?status=failure
GET /api/runs?provider=jenkins

# Time-based
GET /api/notifications/failed?time_from=2025-01-01T00:00:00Z
```

## 🛠️ **Troubleshooting**

### **Common Issues**

#### **1. Frontend Import Errors**
```bash
# Clear Docker cache and rebuild
docker-compose down
docker rmi health_dashboard-frontend
docker system prune -f
docker-compose build --no-cache frontend
docker-compose up -d frontend
```

#### **2. Jenkins Connection Issues**
```bash
# Check Jenkins container status
docker-compose ps jenkins

# View Jenkins logs
docker-compose logs jenkins

# Restart Jenkins service
docker-compose restart jenkins
```

#### **3. Database Issues**
```bash
# Access SQLite database
sqlite3 data/db.sqlite3

# Check table structure
.schema pipeline_runs

# Manual data fixes
UPDATE pipeline_runs SET build_number = 18 WHERE id = 123;
```

#### **4. Slack Notifications Not Working**
```bash
# Check backend logs
docker-compose logs backend

# Test Slack webhook manually
curl -X POST "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message"}'
```

### **Performance Optimization**
- **Sync Interval**: Adjust from 5 seconds in `main.py` if needed
- **Database Indexing**: Ensure `notified` and `build_number` columns are indexed
- **Memory Usage**: Monitor container resource usage with `docker stats`

## 📁 **Project Structure**
```
Health_Dashboard/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── routers/        # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── models.py       # Database models
│   │   └── main.py         # Application entry point
│   ├── Dockerfile          # Backend container
│   └── requirements.txt    # Python dependencies
├── frontend/               # React frontend
│   ├── src/
│   │   └── pages/         # React components
│   ├── Dockerfile         # Frontend container
│   └── package.json       # Node dependencies
├── data/                   # SQLite database
├── docker-compose.yml      # Service orchestration
└── README.md              # This file
```

## 🎯 **Future Enhancements**

### **Planned Features**
- **Multi-Jenkins Support**: Connect to multiple Jenkins instances
- **Advanced Analytics**: Machine learning for failure prediction
- **Team Collaboration**: Real-time team status sharing
- **Mobile App**: Native mobile application
- **Enterprise Features**: LDAP integration, advanced RBAC

### **Performance Improvements**
- **Database Optimization**: Connection pooling, query optimization
- **Caching Layer**: Redis for frequently accessed data
- **Load Balancing**: Multiple backend instances
- **Monitoring**: Prometheus metrics, Grafana dashboards

## 📄 **License**

MIT License - See LICENSE file for details.

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 **Support**

For issues and questions:
1. Check the troubleshooting section
2. Review the logs: `docker-compose logs <service>`
3. Create an issue with detailed error information

---

**Built with ❤️ using modern DevOps practices and AI-assisted development**


