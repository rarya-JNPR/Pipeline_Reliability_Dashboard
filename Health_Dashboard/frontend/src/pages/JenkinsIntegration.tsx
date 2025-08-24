import React, { useState, useEffect } from 'react'
import axios from 'axios'

type JenkinsJob = {
  id: string
  provider: string
  pipeline_name: string
  status: string
  started_at?: string
  finished_at?: string
  duration_seconds?: number
  branch?: string
  commit?: string
  url?: string
  logs?: string
}

type JenkinsBuild = {
  number: number
  timestamp: number
  result?: string
  duration: number
  fullDisplayName: string
  url: string
  provider?: string
  pipeline_name?: string
  branch?: string
  commit?: string
  started_at?: string
}

type JenkinsInfo = {
  version: string
  nodeName: string
  executors: any[]
  overallLoad: any
}

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'

function fixJenkinsUrl(url?: string) {
  if (url && url.includes('jenkins:8080')) {
    return url.replace('jenkins:8080', 'localhost:8080')
  }
  return url
}

export default function JenkinsIntegration() {
  const [jobs, setJobs] = useState<JenkinsJob[]>([])
  const [selectedJob, setSelectedJob] = useState<JenkinsJob | null>(null)
  const [jobBuilds, setJobBuilds] = useState<JenkinsBuild[]>([])
  const [jenkinsInfo, setJenkinsInfo] = useState<JenkinsInfo | null>(null)
  const [jenkinsHealth, setJenkinsHealth] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ field: string, direction: 'asc' | 'desc' }>({ field: 'timestamp', direction: 'desc' })

  useEffect(() => {
    fetchJenkinsData()
  }, [])

  const fetchJenkinsData = async () => {
    setLoading(true)
    setError(null)
    try {
      const healthResponse = await axios.get(`${apiBase}/jenkins/health`)
      setJenkinsHealth(healthResponse.data)
      const infoResponse = await axios.get(`${apiBase}/jenkins/info`)
      setJenkinsInfo(infoResponse.data)
      const jobsResponse = await axios.get(`${apiBase}/jenkins/jobs`)
      setJobs(jobsResponse.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch Jenkins data')
    } finally {
      setLoading(false)
    }
  }

  const fetchJobBuilds = async (job: JenkinsJob) => {
    try {
      const response = await axios.get(`${apiBase}/jenkins/jobs/${job.pipeline_name}/builds`)
      // Attach job info to each build for table columns
      const builds = (response.data.builds || []).map((build: JenkinsBuild) => ({
        ...build,
        provider: job.provider,
        pipeline_name: job.pipeline_name,
        branch: job.branch,
        commit: job.commit,
        started_at: job.started_at
      }))
      setJobBuilds(builds)
      setSelectedJob(job)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch job builds')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success': return '#10b981'
      case 'failure':
      case 'failed': return '#ef4444'
      case 'unstable': return '#f59e0b'
      case 'running': return '#3b82f6'
      case 'aborted': return '#6b7280'
      default: return '#6b7280'
    }
  }
  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success': return '✅'
      case 'failure':
      case 'failed': return '❌'
      case 'unstable': return '⚠️'
      case 'running': return '🔄'
      case 'aborted': return '⏹️'
      default: return '❓'
    }
  }
  const formatDuration = (seconds: number) => {
    if (!seconds) return '—'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    })} ${date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })}`;
  }
  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }
  const sortedBuilds = React.useMemo(() => {
    const sorted = [...jobBuilds].sort((a, b) => {
      const aValue = a[sortConfig.field as keyof JenkinsBuild]
      const bValue = b[sortConfig.field as keyof JenkinsBuild]
      if (aValue === undefined && bValue === undefined) return 0
      if (aValue === undefined) return 1
      if (bValue === undefined) return -1
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
      }
      return 0
    })
    return sorted
  }, [jobBuilds, sortConfig])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', fontSize: '18px', color: '#64748b' }}>
        🔄 Loading Jenkins data...
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: '20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', marginBottom: '20px' }}>
        <h3>❌ Error</h3>
        <p>{error}</p>
        <button onClick={fetchJenkinsData} style={{ padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Retry</button>
      </div>
    )
  }
  return (
    <div style={{ padding: '20px' }}>
      {/* Jenkins Health Status */}
      <div style={{ marginBottom: '20px', padding: '16px', background: jenkinsHealth?.status === 'healthy' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${jenkinsHealth?.status === 'healthy' ? '#bbf7d0' : '#fecaca'}`, borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>
          🔧 Jenkins Server Status
        </h3>
        <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
          <span>
            <strong>Status:</strong> <span style={{ color: jenkinsHealth?.status === 'healthy' ? '#059669' : '#dc2626', marginLeft: '8px' }}>{jenkinsHealth?.status === 'healthy' ? '🟢 Healthy' : '🔴 Unhealthy'}</span>
          </span>
          {jenkinsInfo && (<><span><strong>Version:</strong> {jenkinsInfo.version}</span><span><strong>Node:</strong> {jenkinsInfo.nodeName}</span></>)}
        </div>
      </div>

      {/* Automatic Sync Status */}
      <div style={{ marginBottom: '20px', padding: '16px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>
          🔄 Automatic Sync Status
        </h3>
        <div style={{ fontSize: '14px', color: '#0369a1' }}>
          <div><strong>✅ Automatic Sync:</strong> Jenkins jobs sync every 10 seconds automatically</div>
          <div><strong>🚀 No Setup Required:</strong> Works out of the box - no Jenkins configuration needed</div>
          <div><strong>🎯 Result:</strong> Jenkins jobs appear in main dashboard within 10 seconds - no manual sync needed!</div>
        </div>
      </div>
      {/* Jenkins Jobs */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>
          📋 Jenkins Jobs ({jobs.length})
        </h3>
        {jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '8px', color: '#64748b' }}>
            No Jenkins jobs found
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {jobs.map((job) => (
              <div key={job.id} style={{ padding: '16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)', transition: 'all 0.2s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, color: '#1e293b', fontSize: '16px' }}>{job.pipeline_name}</h4>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', color: getStatusColor(job.status) }}>{getStatusIcon(job.status)} {job.status}</span>
                </div>
                <div style={{ marginBottom: '12px', fontSize: '14px', color: '#64748b' }}>
                  <div>Duration: {formatDuration(job.duration_seconds || 0)}</div>
                  {job.started_at && (<div>Started: {(() => {
                    const date = new Date(job.started_at);
                    return `${date.toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit'
                    })} ${date.toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}`;
                  })()}</div>)}
                  <div>Provider: {job.provider}</div>
                  <div>Branch: {job.branch ?? '—'}</div>
                  <div>Commit: {job.commit ?? '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {job.url && (
                    <a href={fixJenkinsUrl(job.url)} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', textDecoration: 'none', borderRadius: '4px', fontSize: '12px' }}>View Job</a>
                  )}
                  <button onClick={() => fetchJobBuilds(job)} style={{ padding: '6px 12px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>View Builds</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Job Builds */}
      {selectedJob && jobBuilds.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>
            🔨 Builds for {selectedJob.pipeline_name}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('provider')}>
                    Provider {sortConfig.field === 'provider' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕️'}
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('pipeline_name')}>
                    Pipeline {sortConfig.field === 'pipeline_name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕️'}
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('result')}>
                    Status {sortConfig.field === 'result' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕️'}
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('duration')}>
                    Duration {sortConfig.field === 'duration' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕️'}
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('timestamp')}>
                    Job Run Time {sortConfig.field === 'timestamp' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↓'}
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('branch')}>
                    Branch {sortConfig.field === 'branch' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕️'}
                  </th>
                                  <th style={{ padding: '12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('commit')}>
                  Triggered By {sortConfig.field === 'commit' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕️'}
                </th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedBuilds.map((build) => (
                  <tr key={build.number} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
                    <td style={{ padding: '12px' }}>{build.provider ?? 'jenkins'}</td>
                    <td style={{ padding: '12px' }}>{build.pipeline_name ?? selectedJob.pipeline_name}</td>
                    <td style={{ padding: '12px' }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: getStatusColor(build.result || 'unknown') }}>{getStatusIcon(build.result || 'unknown')} {build.result || 'Unknown'}</span></td>
                    <td style={{ padding: '12px' }}>{formatDuration(build.duration / 1000)}</td>
                    <td style={{ padding: '12px' }}>{formatTimestamp(build.timestamp)}</td>
                    <td style={{ padding: '12px' }}>{build.branch ?? selectedJob.branch ?? '—'}</td>
                    <td style={{ padding: '12px' }}>{build.commit ?? selectedJob.commit ?? '—'}</td>
                    <td style={{ padding: '12px' }}>
                      <a href={fixJenkinsUrl(build.url)} target="_blank" rel="noopener noreferrer" style={{ padding: '4px 8px', background: '#3b82f6', color: 'white', textDecoration: 'none', borderRadius: '4px', fontSize: '12px' }}>View Build</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Refresh Button */}
      <div style={{ textAlign: 'center' }}>
        <button onClick={fetchJenkinsData} style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)' }}>
          🔄 Refresh Jenkins Data
        </button>
      </div>
    </div>
  )
}
