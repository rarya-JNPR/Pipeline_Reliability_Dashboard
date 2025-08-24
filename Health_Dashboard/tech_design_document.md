# 🏗️ **Technical Design Document - Health Dashboard**

## 📋 **Table of Contents**

- [Document Information](#document-information)
- [Executive Summary](#executive-summary)
- [System Architecture](#system-architecture)
- [Data Models](#data-models)
- [API Design](#api-design)
- [Database Design](#database-design)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture]
- [Integration Patterns](#integration-patterns)
- [Security Design](#security-design)
- [Performance Considerations](#performance-considerations)
- [Deployment Architecture](#deployment-architecture)
- [Testing Strategy](#testing-strategy)
- [Monitoring and Observability](#monitoring-and-observability)

## 📄 **Document Information**

| **Field** | **Value** |
|-----------|-----------|
| **Document Title** | Health Dashboard - Technical Design Document |
| **Version** | 1.0 |
| **Date Created** | January 2025 |
| **Last Updated** | January 2025 |
| **Architect** | Development Team |
| **Reviewers** | DevOps Engineers, Senior Developers |

## 🎯 **Executive Summary**

This technical design document outlines the architecture and implementation details for the Health Dashboard Jenkins integration platform. The system is designed as a modern, containerized microservice architecture that provides real-time monitoring, automated notifications, and comprehensive analytics for CI/CD pipeline management.

### **Key Design Principles**
- **Microservices Architecture**: Modular, scalable design
- **Real-time Communication**: Server-Sent Events for live updates
- **Containerization**: Docker-based deployment and scaling
- **API-First Design**: RESTful APIs with comprehensive documentation
- **Security by Design**: Authentication, authorization, and audit logging

### **Technology Stack**
- **Backend**: FastAPI (Python), SQLAlchemy, SQLite
- **Frontend**: React 18, TypeScript, Vite, Recharts
- **Containerization**: Docker, Docker Compose
- **Real-time**: Server-Sent Events (SSE)
- **Notifications**: Slack webhooks, SMTP email

## 🏗️ **System Architecture**

### **High-Level Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                        Health Dashboard                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   Frontend  │    │   Backend   │    │   Jenkins   │        │
│  │  (React)    │◄──►│  (FastAPI)  │◄──►│  (External) │        │
│  │  Port 5173  │    │  Port 8000  │    │  Port 8080  │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│           │                │                │                 │
│           │                │                │                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   Browser   │    │   Database  │    │   External  │        │
│  │   (SSE)     │    │  (SQLite)   │    │  Services   │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### **Component Architecture**

#### **Frontend Layer**
- **React Application**: Single-page application with component-based architecture
- **State Management**: React hooks for local state, context for global state
- **Real-time Updates**: Server-Sent Events for live data synchronization
- **UI Components**: Reusable components with TypeScript interfaces

#### **Backend Layer**
- **FastAPI Application**: High-performance Python web framework
- **Service Layer**: Business logic and external service integration
- **Data Access Layer**: SQLAlchemy ORM with SQLite database
- **Background Tasks**: APScheduler for periodic Jenkins synchronization

#### **Integration Layer**
- **Jenkins API Client**: RESTful API integration with authentication
- **Webhook Handlers**: Real-time event processing from external services
- **Notification Services**: Slack and email integration
- **Data Synchronization**: Polling and webhook-based data updates

## 🗄️ **Data Models**

### **Core Data Entities**

#### **PipelineRun Model**
```python
class PipelineRun(Base):
    __tablename__ = "pipeline_runs"
    
    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, index=True)           # 'jenkins', 'github'
    pipeline_name = Column(String, index=True)     # Job/pipeline name
    status = Column(String, index=True)            # 'success', 'failure', 'running'
    started_at = Column(DateTime, index=True)      # Job start timestamp
    finished_at = Column(DateTime, nullable=True)  # Job completion timestamp
    duration_seconds = Column(Float, nullable=True) # Execution duration
    branch = Column(String, nullable=True)         # Git branch
    commit = Column(String, nullable=True)         # Commit hash or trigger info
    url = Column(String, nullable=True)            # Build URL
    logs = Column(Text, nullable=True)             # Build logs
    build_number = Column(Integer, nullable=True)  # Jenkins build number
    notified = Column(Boolean, default=False, index=True) # Notification status
```

## 🔌 **API Design**

### **RESTful API Endpoints**

#### **Core Pipeline Endpoints**
```http
# Pipeline Runs Management
GET    /api/runs                    # List pipeline runs with pagination
GET    /api/runs/{id}              # Get specific run details
DELETE /api/runs/{id}              # Delete a run

# Metrics and Analytics
GET    /api/metrics                # Overall dashboard metrics
GET    /api/notifications/failed   # Failed job notifications
```

#### **Jenkins Integration Endpoints**
```http
# Jenkins Synchronization
POST   /api/jenkins/sync           # Sync all Jenkins jobs
POST   /api/jenkins/sync-now      # Manual sync trigger
POST   /api/jenkins/fresh-sync    # Clear and re-sync all jobs
POST   /api/jenkins/force-update  # Force update existing records
```

## 🎨 **Frontend Architecture**

### **Component Architecture**

#### **Core Components**
```typescript
// Main Application Component
App.tsx
├── Header (Navigation, Notifications, Settings)
├── Dashboard (Metrics, Charts, Overview)
├── PipelineRuns (Table, Pagination, Filtering)
├── JenkinsIntegration (Jenkins-specific features)
└── Charts (Analytics and Insights)
```

### **Real-time Communication**

#### **Server-Sent Events (SSE)**
```typescript
// SSE Connection Management
class SSEConnection {
  private eventSource: EventSource | null = null;
  
  connect() {
    this.eventSource = new EventSource('/api/stream');
    this.eventSource.onmessage = this.handleMessage;
    this.eventSource.onerror = this.handleError;
  }
}
```

## ⚙️ **Backend Architecture**

### **Application Structure**

#### **Directory Organization**
```
backend/
├── app/
│   ├── __init__.py              # Application factory
│   ├── main.py                  # FastAPI application entry point
│   ├── database.py              # Database connection and session
│   ├── models.py                # SQLAlchemy data models
│   ├── schemas.py               # Pydantic validation schemas
│   ├── routers/                 # API route handlers
│   └── services/                # Business logic services
├── requirements.txt              # Python dependencies
└── Dockerfile                   # Container configuration
```

## 🔗 **Integration Patterns**

### **Jenkins Integration Pattern**

#### **Data Synchronization Strategy**
```python
class JenkinsSyncService:
    def __init__(self, jenkins_service: JenkinsService, db_session: Session):
        self.jenkins_service = jenkins_service
        self.db_session = db_session
    
    async def sync_all_jobs(self) -> int:
        """Synchronize all Jenkins jobs and builds"""
        try:
            jobs = await self.jenkins_service.get_jobs()
            synced_count = 0
            
            for job in jobs:
                builds = await self.jenkins_service.get_builds(job['name'])
                for build in builds:
                    if await self._sync_build(job, build):
                        synced_count += 1
            
            return synced_count
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            raise
```

## 🔒 **Security Design**

### **Authentication and Authorization**

#### **API Security**
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token for protected endpoints"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
```

## ⚡ **Performance Considerations**

### **Database Performance**

#### **Query Optimization**
```python
def get_failed_jobs_recent(db: Session, hours: int = 24):
    """Get failed jobs from last N hours with optimized query"""
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    
    return db.query(PipelineRun).filter(
        PipelineRun.status == "failure",
        PipelineRun.started_at >= cutoff_time
    ).all()
```

## 🚀 **Deployment Architecture**

### **Container Architecture**

#### **Docker Compose Configuration**
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=sqlite:///./data/db.sqlite3
      - JENKINS_URL=http://jenkins:8080
    volumes:
      - ./data:/app/data
  
  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_API_BASE=http://localhost:8000/api
  
  jenkins:
    image: jenkins/jenkins:lts
    ports:
      - "8080:8080"
    volumes:
      - jenkins_home:/var/jenkins_home

volumes:
  jenkins_home:
```

## 🧪 **Testing Strategy**

### **Testing Pyramid**

#### **Unit Tests**
```python
class TestJenkinsService:
    @pytest.fixture
    def jenkins_service(self):
        return JenkinsService("http://jenkins:8080", "admin", "admin")
    
    @pytest.mark.asyncio
    async def test_get_jobs_success(self, jenkins_service):
        with patch('requests.Session.get') as mock_get:
            mock_get.return_value.json.return_value = {
                "jobs": [{"name": "test-job", "url": "http://jenkins:8080/job/test-job"}]
            }
            
            jobs = await jenkins_service.get_jobs()
            assert len(jobs) == 1
            assert jobs[0]["name"] == "test-job"
```

## 📊 **Monitoring and Observability**

### **Application Monitoring**

#### **Health Checks**
```python
@router.get("/health")
async def health_check():
    """Basic health check"""
    return {"status": "healthy", "timestamp": datetime.utcnow()}

@router.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check with dependencies"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow(),
        "dependencies": {}
    }
    
    # Check database connection
    try:
        db = next(get_db())
        db.execute("SELECT 1")
        health_status["dependencies"]["database"] = "healthy"
    except Exception as e:
        health_status["dependencies"]["database"] = f"unhealthy: {e}"
        health_status["status"] = "degraded"
    
    return health_status
```

## 📝 **Conclusion**

This technical design document provides a comprehensive blueprint for implementing the Health Dashboard Jenkins integration platform. The architecture is designed to be scalable, maintainable, and production-ready while meeting all functional and non-functional requirements.

### **Key Design Decisions**

1. **Microservices Architecture**: Modular design for scalability and maintainability
2. **Real-time Communication**: Server-Sent Events for live updates
3. **Containerization**: Docker-based deployment for consistency and portability
4. **Security by Design**: Comprehensive security measures throughout the system
5. **Performance Optimization**: Caching, async processing, and database optimization

### **Implementation Roadmap**

1. **Phase 1**: Core backend and database implementation
2. **Phase 2**: Jenkins integration and synchronization
3. **Phase 3**: Frontend dashboard and real-time updates
4. **Phase 4**: Notification system and advanced features
5. **Phase 5**: Testing, optimization, and production deployment

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**Next Review**: February 2025  
**Project Status**: Design Complete
