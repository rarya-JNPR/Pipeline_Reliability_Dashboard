import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import JenkinsIntegration from './JenkinsIntegration'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#6366f1', '#a21caf'];

type Metrics = {
  total_runs: number
  success_count: number
  failure_count: number
  running_count: number
  success_rate: number
  average_build_time_seconds?: number | null
  last_build_status?: string | null
}

type Run = {
  id: number
  provider: string
  pipeline_name: string
  status: string
  started_at?: string
  finished_at?: string
  duration_seconds?: number
  commit?: string
  branch?: string
  url?: string
  logs?: string
}

type SortConfig = {
  field: string
  direction: 'asc' | 'desc'
}

type ColumnConfig = {
  id: string
  label: string
  visible: boolean
  sortable: boolean
}

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'

export default function App() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [searchField, setSearchField] = useState<string>('pipeline_name')
  const [searchValue, setSearchValue] = useState<string>('')
  const [preset, setPreset] = useState<string>('all')
  const [customFrom, setCustomFrom] = useState<string>('')
  const [customTo, setCustomTo] = useState<string>('')
  const [showColumnSelector, setShowColumnSelector] = useState<boolean>(false)
  const [showCharts, setShowCharts] = useState<boolean>(false)
  const [savedSearches, setSavedSearches] = useState<Array<{name: string, query: string, filters: any}>>([])
  const [showSavedSearches, setShowSavedSearches] = useState(false)
  const [filteredRuns, setFilteredRuns] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'dashboard' | 'jenkins'>('dashboard')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'started_at', direction: 'desc' })
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([
    { id: 'provider', label: 'Provider', visible: true, sortable: true },
    { id: 'pipeline_name', label: 'Pipeline', visible: true, sortable: true },
    { id: 'status', label: 'Status', visible: true, sortable: true },
    { id: 'duration_seconds', label: 'Duration', visible: true, sortable: true },
    { id: 'started_at', label: 'Job Run Time', visible: true, sortable: true },
    { id: 'branch', label: 'Branch', visible: true, sortable: true },
            { id: 'commit', label: 'Triggered By', visible: true, sortable: true },
    { id: 'actions', label: 'Actions', visible: true, sortable: false }
  ])
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const recordsPerPage = 10

  const { time_from, time_to } = React.useMemo(() => {
    if (preset === 'custom') {
      return { time_from: customFrom || undefined, time_to: customTo || undefined }
    }
    const now = new Date()
    let from: Date | null = null
    if (preset === '1h') from = new Date(now.getTime() - 60 * 60 * 1000)
    if (preset === '24h') from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    if (preset === '7d') from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    if (preset === 'all') from = null
    return {
      time_from: from ? from.toISOString() : undefined,
      time_to: undefined
    }
  }, [preset, customFrom, customTo])

  const fetchData = async () => {
    const runsParams: any = { 
    limit: recordsPerPage, 
    offset: (currentPage - 1) * recordsPerPage 
  }
    if (time_from) { runsParams.time_from = time_from }
    if (time_to)   { runsParams.time_to = time_to }
    if (searchValue && searchField) { runsParams.q = searchValue }

    // Only fetch runs, metrics will be calculated from filtered runs
    const r = await axios.get(`${apiBase}/runs`, { params: runsParams }).then(res => res.data)
    setRuns(r.items)
    setTotalRecords(r.total)
    setTotalPages(Math.ceil(r.total / recordsPerPage))
    
    // Calculate metrics from total runs (not just current page)
    if (r.total > 0) {
      // We need to fetch all runs to calculate accurate metrics
      const allRunsResponse = await axios.get(`${apiBase}/runs`, { 
        params: { 
          limit: 1000, // Get all runs for metrics calculation
          time_from: time_from,
          time_to: time_to,
          q: searchValue && searchField ? searchValue : undefined
        } 
      })
      
      const allRuns = allRunsResponse.data.items
      const total = allRuns.length
      const success = allRuns.filter((run: any) => run.status === 'success').length
      const failure = allRuns.filter((run: any) => run.status === 'failure' || run.status === 'failed').length
      const running = allRuns.filter((run: any) => run.status === 'running').length
      const successRate = total > 0 ? (success / total) * 100 : 0
      const avgDuration = allRuns.reduce((sum: number, run: any) => sum + (run.duration_seconds || 0), 0) / total
      const lastStatus = allRuns[0]?.status
      
      setMetrics({
        total_runs: total,
        success_count: success,
        failure_count: failure,
        running_count: running,
        success_rate: Math.round(successRate * 100) / 100,
        average_build_time_seconds: avgDuration,
        last_build_status: lastStatus
      })
    } else {
      setMetrics({
        total_runs: 0,
        success_count: 0,
        failure_count: 0,
        running_count: 0,
        success_rate: 0,
        average_build_time_seconds: 0,
        last_build_status: null
      })
    }
  }

  useEffect(() => {
    fetchData()
    const evt = new EventSource(`${apiBase.replace('/api','')}/api/stream`)
    evt.onmessage = () => {
      fetchData()
    }
    return () => evt.close()
  }, [currentPage]) // Refetch when page changes

  // Fix Jenkins URLs to use localhost instead of jenkins:8080
  const fixJenkinsUrl = (url: string) => {
    if (url && url.includes('jenkins:8080')) {
      return url.replace('jenkins:8080', 'localhost:8080')
    }
    return url
  }

  // Get runs to display (filtered or all)
  const displayRuns = filteredRuns.length > 0 ? filteredRuns : runs

  // Clear filters and show all runs
  const clearFilters = () => {
    setFilteredRuns([])
    setSearchField('')
    setSearchValue('')
    // Remove active filters from localStorage
    localStorage.removeItem('activeFilters')
  }

  // Sorting functionality
  const sortedRuns = React.useMemo(() => {
    const sorted = [...displayRuns].sort((a, b) => {
      const aValue = a[sortConfig.field as keyof Run]
      const bValue = b[sortConfig.field as keyof Run]
      
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
  }, [displayRuns, sortConfig])

  const handleSort = (field: string) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const toggleColumnVisibility = (columnId: string) => {
    setColumnConfig(prev => 
      prev.map(col => 
        col.id === columnId ? { ...col, visible: !col.visible } : col
      )
    )
  }

  // Notification state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  // Load read notifications from localStorage on component mount
  useEffect(() => {
    const readNotifications = localStorage.getItem('readNotifications');
    if (readNotifications) {
      const readIds = JSON.parse(readNotifications);
      // Initialize unreadIds with all notification IDs, then remove read ones
      setUnreadIds(prev => {
        const newUnread = new Set(prev);
        readIds.forEach((id: number) => {
          newUnread.delete(id);
        });
        return newUnread;
      });
    }
  }, []);

  // Save read notifications to localStorage whenever unreadIds changes
  useEffect(() => {
    const allNotificationIds = notifications.map(n => n.id);
    const readIds = allNotificationIds.filter(id => !unreadIds.has(id));
    localStorage.setItem('readNotifications', JSON.stringify(readIds));
  }, [unreadIds, notifications]);

  // Get notifications to display (limited to 10 for dropdown, all for full view)
  const displayNotifications = showAllNotifications ? notifications : notifications.slice(0, 10);
  const hasMoreNotifications = notifications.length > 10;

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      
      const response = await axios.get(`${apiBase}/notifications/failed?limit=1000&time_from=${twentyFourHoursAgo.toISOString()}`);
      
      // Get read notifications from localStorage
      const readNotifications = localStorage.getItem('readNotifications');
      const readIds = readNotifications ? JSON.parse(readNotifications) : [];
      
      // Initialize unreadIds with all new notification IDs, excluding already read ones
      setUnreadIds(prev => {
        const newUnread = new Set(prev);
        
        response.data.forEach((n: any) => {
          // Only add as unread if it's not already read
          if (!readIds.includes(n.id)) {
            newUnread.add(n.id);
          }
        });
        
        return newUnread;
      });
      
      setNotifications(response.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  // Handle notification click (left click - same tab, decreases count)
  const handleNotificationClick = (notification: any) => {
    // Mark as read (decrease count)
    setUnreadIds(prev => {
      const newUnread = new Set(prev);
      newUnread.delete(notification.id);
      return newUnread;
    });
    
    // Don't redirect to new tab by default
    // User can manually navigate if needed
  };

  // Handle notification right click (new tab)
  const handleNotificationRightClick = (e: React.MouseEvent, notification: any) => {
    e.preventDefault();
    
    // Mark as read
    setUnreadIds(prev => {
      const newUnread = new Set(prev);
      newUnread.delete(notification.id);
      return newUnread;
    });
    
    // Open in new tab
    const url = `http://localhost:8080/job/${encodeURIComponent(notification.pipeline_name)}/${notification.build_number}/`;
    window.open(url, '_blank');
  };

  // Calculate notification count
  const notificationCount = unreadIds.size;

  // Fetch notifications - only last 24h failed builds
  useEffect(() => {
    fetchNotifications();
    // Refresh notifications every 10 seconds for near real-time updates
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Close notification dropdown
      if (!target.closest('.notification-dropdown') && !target.closest('button[onclick*="setShowNotifications"]')) {
        setShowNotifications(false);
      }
      
      // Close settings dropdown
      if (!target.closest('.settings-dropdown') && !target.closest('button[onclick*="setShowSettings"]')) {
        setShowSettings(false);
      }
      
      // Close profile dropdown
      if (!target.closest('.profile-dropdown') && !target.closest('button[onclick*="setShowProfile"]')) {
        setShowProfile(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [showSettings, setShowSettings] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  // Fix notification URL function to redirect to specific build
  const fixNotificationUrl = (url: string, buildId?: number) => {
    if (!url) return '#';
    
    let fixedUrl = url;
    if (url.includes('jenkins:8080')) {
      fixedUrl = url.replace('jenkins:8080', 'localhost:8080');
    }
    
    // If it's a Jenkins job and we have a build ID, append the build number
    if (buildId && fixedUrl.includes('/job/') && !fixedUrl.includes('/build/')) {
      // Extract job name from URL and construct build-specific URL
      const jobMatch = fixedUrl.match(/\/job\/([^\/]+)/);
      if (jobMatch) {
        const jobName = jobMatch[1];
        fixedUrl = `http://localhost:8080/job/${jobName}/${buildId}/`;
      }
    }
    
    return fixedUrl;
  };

  // Mark notification as read
  const markNotificationAsRead = (notificationId: number) => {
    setUnreadIds(prev => {
      const newUnread = new Set(prev);
      newUnread.delete(notificationId);
      return newUnread;
    });
  };

  const [chartRuns, setChartRuns] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [durationData, setDurationData] = useState<any[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [chartsError, setChartsError] = useState<string | null>(null);

  // Add state for new charts
  const [longestJobs, setLongestJobs] = useState<{ name: string, duration: number }[]>([]);
  const [topContributors, setTopContributors] = useState<{ name: string, builds: number, failures: number, successes: number }[]>([]);
  const [buildDurationHistogram, setBuildDurationHistogram] = useState<{ range: string, count: number }[]>([]);

  useEffect(() => {
    if (!showCharts) return;
    setChartsLoading(true);
    setChartsError(null);
    axios.get(`${apiBase}/runs?limit=1000`).then(res => {
      setChartRuns(res.data.items || []);
      setChartsLoading(false);
    }).catch(err => {
      setChartsError('Failed to load chart data.');
      setChartsLoading(false);
    });
  }, [showCharts]);

  useEffect(() => {
    if (!chartRuns.length) return;
    // 1. Success/Failure Trend (last 7 days)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    const trend = days.map(date => {
      const dayStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const runsForDay = chartRuns.filter(run => {
        const runDate = new Date(run.started_at);
        return runDate.getFullYear() === date.getFullYear() &&
          runDate.getMonth() === date.getMonth() &&
          runDate.getDate() === date.getDate();
      });
      const Success = runsForDay.filter(r => r.status === 'success').length;
      const Failure = runsForDay.filter(r => r.status === 'failure').length;
      return { date: dayStr, Success, Failure };
    });
    setTrendData(trend);
    // 2. Success vs Failure Distribution
    const totalSuccess = chartRuns.filter(r => r.status === 'success').length;
    const totalFailure = chartRuns.filter(r => r.status === 'failure').length;
    setPieData([
      { name: 'Success', value: totalSuccess },
      { name: 'Failure', value: totalFailure },
    ]);
    // 3. Average Build Duration by Provider
    const byProvider: Record<string, number[]> = {};
    chartRuns.forEach(run => {
      if (!run.provider || !run.duration_seconds) return;
      if (!byProvider[run.provider]) byProvider[run.provider] = [];
      byProvider[run.provider].push(run.duration_seconds / 60); // convert to minutes
    });
    setDurationData(Object.entries(byProvider).map(([provider, durations]) => ({
      provider,
      duration: durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length) : 0
    })));

    // Longest Running Jobs (Top 5 by duration)
    const sortedJobs = [...chartRuns]
      .filter(r => r.duration_seconds && r.pipeline_name)
      .sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))
      .slice(0, 5)
      .map(r => ({
        name: r.pipeline_name,
        duration: Math.round((r.duration_seconds ?? 0) / 60 * 100) / 100 // minutes
      }));
    setLongestJobs(sortedJobs);

    // Top Contributors (by commit/triggered_by field)
    const byUser: Record<string, { builds: number, failures: number, successes: number }> = {};
    chartRuns.forEach(run => {
      const user = run.commit || run.triggered_by || 'Unknown';
      if (!byUser[user]) byUser[user] = { builds: 0, failures: 0, successes: 0 };
      byUser[user].builds += 1;
      if (run.status === 'failure' || run.status === 'failed') byUser[user].failures += 1;
      if (run.status === 'success') byUser[user].successes += 1;
    });
    setTopContributors(
      Object.entries(byUser)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.builds - a.builds)
        .slice(0, 5)
    );

    // Build Duration Distribution (Histogram)
    // Buckets: <5 min, 5-10 min, 10+ min
    const buckets = [0, 5, 10];
    const bucketLabels = ['<5 min', '5–10 min', '10+ min'];
    const bucketCounts = [0, 0, 0];
    chartRuns.forEach(run => {
      if (typeof run.duration_seconds === 'number') {
        const min = run.duration_seconds / 60;
        if (min < 5) bucketCounts[0]++;
        else if (min < 10) bucketCounts[1]++;
        else bucketCounts[2]++;
      }
    });
    setBuildDurationHistogram(
      bucketLabels.map((label, i) => ({ range: label, count: bucketCounts[i] }))
    );
  }, [chartRuns]);

  // Custom YAxis tick for long pipeline names
  const YAxisTickWithTooltip = (props: any) => {
    const { x, y, payload } = props;
    return (
      <g transform={`translate(${x},${y})`}>
        <title>{payload.value}</title>
        <text x={0} y={0} dy={4} textAnchor="end" fill="#374151" fontSize={13} style={{ cursor: 'pointer' }}>
          {payload.value.length > 18 ? payload.value.slice(0, 16) + '…' : payload.value}
        </text>
      </g>
    );
  };

  // Real-time updates using Server-Sent Events
  useEffect(() => {
    if (!showCharts) return;
    
    const eventSource = new EventSource('http://localhost:8000/api/stream');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'jenkins_build_completed') {
          // Refresh notifications and data when Jenkins build completes
          console.log('Jenkins build completed:', data);
          
          // Refresh notifications
          const twentyFourHoursAgo = new Date();
          twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
          
          axios.get(`${apiBase}/notifications/failed?limit=10&time_from=${twentyFourHoursAgo.toISOString()}`).then(res => {
            setNotifications(res.data);
            // Update unread count
            setUnreadIds(prev => {
              const newUnread = new Set(prev);
              res.data.forEach((n: any) => {
                if (!prev.has(n.id)) {
                  newUnread.add(n.id);
                }
              });
              return newUnread;
            });
          });
          
          // Refresh pipeline runs data
          fetchData();
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
    };
    
    return () => {
      eventSource.close();
    };
  }, [showCharts]);

  // Load saved searches from localStorage on component mount
  useEffect(() => {
    const savedSearchesData = localStorage.getItem('savedSearches');
    if (savedSearchesData) {
      try {
        const parsedSearches = JSON.parse(savedSearchesData);
        setSavedSearches(parsedSearches);
      } catch (error) {
        console.error('Error parsing saved searches:', error);
        // If parsing fails, start with empty array
        setSavedSearches([]);
      }
    }
  }, []);

  // Save searches to localStorage whenever savedSearches changes
  useEffect(() => {
    localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
  }, [savedSearches]);

  // Load and restore active search filters from localStorage
  useEffect(() => {
    const activeFilters = localStorage.getItem('activeFilters');
    if (activeFilters) {
      try {
        const filters = JSON.parse(activeFilters);
        setSearchField(filters.field || '');
        setSearchValue(filters.value || '');
        
        // If there were active filters, apply them to restore filtered results
        if (filters.field && filters.value && runs.length > 0) {
          const filteredRuns = runs.filter((run: any) => {
            const fieldValue = run[filters.field as keyof typeof run];
            if (typeof fieldValue === 'string') {
              return fieldValue.toLowerCase().includes(filters.value.toLowerCase());
            }
            return false;
          });
          setFilteredRuns(filteredRuns);
        }
      } catch (error) {
        console.error('Error parsing active filters:', error);
      }
    }
  }, [runs]); // Re-run when runs data is available

  // Save active filters to localStorage whenever they change
  useEffect(() => {
    if (searchField || searchValue) {
      localStorage.setItem('activeFilters', JSON.stringify({
        field: searchField,
        value: searchValue
      }));
    } else {
      localStorage.removeItem('activeFilters');
    }
  }, [searchField, searchValue]);

  return (
    <div style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      padding: '24px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      color: '#1a202c'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <header style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '32px',
          paddingBottom: '24px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img src="/Zumigo.jpg" alt="Zumigo" style={{ height: '40px', width: 'auto' }} />
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: '32px', 
                fontWeight: '800',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                Pipeline Reliability Dashboard
              </h1>
              <p style={{ 
                margin: '4px 0 0 0', 
                color: '#64748b', 
                fontSize: '16px',
                fontWeight: '500'
              }}>
                Enterprise DevOps Observability Platform
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Notifications Button */}
            <button
              title="Notifications"
              className="notification-dropdown"
              style={{
                position: 'relative',
                padding: '12px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
              }}
              onClick={() => setShowNotifications(v => !v)}
            >
              🔔
              {unreadIds.size > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: '#dc2626',
                  color: 'white',
                  borderRadius: '50%',
                  fontSize: '10px',
                  fontWeight: '700',
                  padding: '2px 0px',
                  width: '16px',
                  height: '16px',
                  textAlign: 'center',
                  border: '2px solid white',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>{unreadIds.size}</span>
              )}
            </button>
            {showNotifications && (
              <div className="notification-dropdown" style={{
                position: 'absolute',
                top: 60,
                right: 120,
                width: 380,
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                zIndex: 1000,
                maxHeight: 480,
                overflowY: 'auto',
                padding: 0
              }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                  Failed Jobs
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>No failed jobs 🎉</div>
                ) : (
                  <>
                    {displayNotifications.map((n, idx) => (
                      <div
                        key={n.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          padding: '16px 20px',
                          borderBottom: idx === displayNotifications.length - 1 ? 'none' : '1px solid #f1f5f9',
                          background: unreadIds.has(n.id) ? '#fef9c3' : 'white',
                          fontWeight: unreadIds.has(n.id) ? 700 : 500,
                          color: '#1e293b',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          position: 'relative'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                        onMouseLeave={e => e.currentTarget.style.background = unreadIds.has(n.id) ? '#fef9c3' : 'white'}
                        onClick={() => handleNotificationClick(n)}
                        onContextMenu={(e) => handleNotificationRightClick(e, n)}
                        title="Left click: Mark as read, Right click: Open in new tab"
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#dc2626', fontWeight: 900, fontSize: 18 }}>❌</span>
                          <span>{n.pipeline_name} #{n.build_number || n.id}</span>
                          <span style={{ color: '#64748b', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>{dayjs(n.started_at).fromNow()}</span>
                        </span>
                        {n.logs && (
                          <span style={{ color: '#64748b', fontSize: 13, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{n.logs.slice(0, 60)}</span>
                        )}
                      </div>
                    ))}
                    {hasMoreNotifications && (
                      <div style={{ textAlign: 'center', padding: '12px 0', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                        <button
                          onClick={() => setShowAllNotifications(!showAllNotifications)}
                          style={{
                            color: '#3b82f6',
                            fontWeight: 600,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            background: 'none',
                            border: 'none',
                            fontSize: '14px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0f2fe'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {showAllNotifications ? 'Show Less' : `View More (${notifications.length - 10} more)`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {/* Settings Button */}
            <button
              title="Settings"
              className="settings-dropdown"
              style={{
                padding: '12px',
                background: 'linear-gradient(135deg, #64748b, #475569)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(100, 116, 139, 0.3)'
              }}
              onClick={() => setShowSettings(v => !v)}
            >
              ⚙️
            </button>
            {showSettings && (
              <div className="settings-dropdown" style={{ position: 'absolute', top: 60, right: 70, width: 320, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 1000, padding: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Settings</div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <label><input type="checkbox" checked /> Enable Notifications</label>
                  <label><input type="checkbox" checked /> Slack Alerts</label>
                  <label><input type="checkbox" /> Email Alerts</label>
                  <label><input type="checkbox" /> Dark Mode</label>
                  <label><input type="checkbox" /> Show Only My Jobs</label>
                  <button style={{ marginTop: 12, padding: '10px 0', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Save Settings</button>
                </div>
              </div>
            )}
            {/* User Profile Button */}
            <button
              title="User Profile"
              className="profile-dropdown"
              style={{
                padding: '12px',
                background: 'linear-gradient(135deg, #ec4899, #db2777)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)'
              }}
              onClick={() => setShowProfile(v => !v)}
            >
              👤
            </button>
            {showProfile && (
              <div className="profile-dropdown" style={{ position: 'absolute', top: 60, right: 20, width: 260, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 1000, padding: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 16, color: '#1e293b' }}>User Profile</div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div><strong>Name:</strong> Ravitosh</div>
                  <div><strong>Email:</strong> ravitosh@example.com</div>
                  <a href="/profile" style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'underline' }}>Profile & Account</a>
                  <a href="/preferences" style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'underline' }}>Preferences</a>
                  <a href="/help" style={{ color: '#3b82f6', fontWeight: 600, textDecoration: 'underline' }}>Help/Documentation</a>
                  <button style={{ marginTop: 12, padding: '10px 0', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Logout</button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          marginBottom: '24px',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '16px'
        }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'dashboard' ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#f8fafc',
              color: activeTab === 'dashboard' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'dashboard' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
            }}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setActiveTab('jenkins')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'jenkins' ? 'linear-gradient(135deg, #10b981, #059669)' : '#f8fafc',
              color: activeTab === 'jenkins' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              boxShadow: activeTab === 'jenkins' ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
            }}
          >
            🔧 Jenkins Integration
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'jenkins' ? (
          <JenkinsIntegration />
        ) : (
          <div>
            {/* Search and Filter Section */}
            <section style={{ 
              background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', 
              padding: '28px', 
              borderRadius: '16px', 
              marginBottom: '32px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 400 }}>
                  <select
                    value={searchField}
                    onChange={e => setSearchField(e.target.value)}
                    style={{
                      padding: '12px 16px',
                      border: '1px solid #dee2e6',
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'white',
                      minWidth: '140px'
                    }}
                  >
                    <option value="pipeline_name">Pipeline Name</option>
                    <option value="provider">Provider</option>
                    <option value="branch">Branch</option>
                                          <option value="commit">Triggered By</option>
                    <option value="status">Status</option>
                  </select>
                  
                  <input
                    type="search"
                    placeholder="Enter search value..."
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    style={{ 
                      flex: 1,
                      padding: '12px 16px', 
                      border: '1px solid #dee2e6', 
                      borderRadius: '8px', 
                      fontSize: '14px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ color: '#495057', fontWeight: '500', fontSize: '14px' }}>Time Range:</label>
                  <select 
                    value={preset} 
                    onChange={e => setPreset(e.target.value)} 
                    style={{ 
                      padding: '12px 16px', 
                      border: '1px solid #dee2e6', 
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'white'
                    }}
                  >
                    <option value="1h">Last 1h</option>
                    <option value="24h">Last 24h</option>
                    <option value="7d">Last 7d</option>
                    <option value="all">All time</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                {preset === 'custom' && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ color: '#495057', fontSize: '14px' }}>From:</label>
                      <input 
                        type="datetime-local" 
                        value={customFrom} 
                        onChange={e => setCustomFrom(e.target.value)} 
                        style={{ 
                          padding: '8px 12px', 
                          border: '1px solid #dee2e6', 
                          borderRadius: '6px',
                          fontSize: '14px'
                        }} 
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ color: '#495057', fontSize: '14px' }}>To:</label>
                      <input 
                        type="datetime-local" 
                        value={customTo} 
                        onChange={e => setCustomTo(e.target.value)} 
                        style={{ 
                          padding: '8px 12px', 
                          border: '1px solid #dee2e6', 
                          borderRadius: '6px',
                          fontSize: '14px'
                        }} 
                      />
                    </div>
                  </div>
                )}
                
                <button 
                  onClick={fetchData}
                  style={{
                    padding: '12px 24px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    boxShadow: '0 2px 4px rgba(0,123,255,0.3)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#0056b3'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#007bff'}
                >
                  🔍 Search
                </button>

                {/* Advanced Features Buttons */}
                <div style={{ display: 'flex', gap: '12px', marginLeft: '16px' }}>
                  <button
                    onClick={() => setShowCharts(!showCharts)}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '13px',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                    }}
                  >
                    {showCharts ? '📊 Hide Charts' : '📊 Show Charts'}
                  </button>

                  <button
                    onClick={() => {
                      const searchName = prompt('Save search as:')
                      if (searchName && searchValue) {
                        setSavedSearches(prev => [...prev, {
                          name: searchName,
                          query: `${searchField}=${searchValue}`,
                          filters: { field: searchField, value: searchValue }
                        }])
                      }
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '13px',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.4)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                    }}
                  >
                    💾 Save Search
                  </button>

                  {filteredRuns.length > 0 && (
                    <button
                      onClick={clearFilters}
                      style={{
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '13px',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                      }}
                    >
                      🗑️ Clear Filters
                    </button>
                  )}

                  <button
                    onClick={() => setShowSavedSearches(!showSavedSearches)}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '13px',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(6, 182, 212, 0.4)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.3)';
                    }}
                  >
                    📁 Saved ({savedSearches.length})
                  </button>
                </div>


              </div>
            </section>

            {/* Metrics Section */}
            <section style={{ 
              display: 'flex', 
              gap: '20px',
              marginBottom: '32px',
              justifyContent: 'space-between',
              width: '100%'
            }}>
              <MetricCard 
                title="Success Rate" 
                value={`${metrics?.success_rate ?? 0}%`} 
                color="#28a745"
              />
              <MetricCard 
                title="Total Runs" 
                value={metrics?.total_runs ?? 0}
                color="#007bff"
              />
              <MetricCard 
                title="Success Count" 
                value={metrics?.success_count ?? 0}
                color="#28a745"
              />
              <MetricCard 
                title="Failure Count" 
                value={metrics?.failure_count ?? 0}
                color="#dc3545"
              />
              <MetricCard 
                title="Avg Build Time" 
                value={`${metrics?.average_build_time_seconds?.toFixed(1) ?? '—'}s`}
                color="#6f42c1"
              />
              <MetricCard 
                title="Last Status" 
                value={metrics?.last_build_status ?? '—'}
                color={metrics?.last_build_status === 'success' ? '#28a745' : metrics?.last_build_status === 'failure' ? '#dc3545' : '#6c757d'}
              />
            </section>

            {/* Interactive Charts Section */}
            {showCharts && (
              <section style={{
                background: 'white',
                borderRadius: '16px',
                padding: '28px',
                marginBottom: '32px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
                border: '1px solid #f1f5f9',
                width: '100%',
                maxWidth: '100%',
                margin: '0 auto 32px auto'
              }}>
                <h3 style={{ margin: '0 0 24px 0', color: '#1e293b', fontSize: '24px', fontWeight: '700' }}>
                  📊 Analytics & Insights
                </h3>
                {chartsLoading ? (
                  <div style={{ textAlign: 'center', color: '#64748b', fontSize: 18, padding: 40 }}>Loading charts...</div>
                ) : chartsError ? (
                  <div style={{ textAlign: 'center', color: '#dc2626', fontSize: 18, padding: 40 }}>{chartsError}</div>
                ) : (!chartRuns || chartRuns.length === 0) ? (
                  <div style={{ textAlign: 'center', color: '#64748b', fontSize: 18, padding: 40 }}>No data available for charts.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '32px' }}>
                    {/* 1. Success/Failure Trend */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '18px', fontWeight: '600' }}>
                        Success/Failure Trend (Last 7 Days)
                      </h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Success" stackId="a" fill="#10b981" />
                          <Bar dataKey="Failure" stackId="a" fill="#ef4444" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* 2. Success vs Failure Distribution */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '18px', fontWeight: '600' }}>
                        Success vs Failure Distribution
                      </h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* 3. Average Build Duration by Provider */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '18px', fontWeight: '600' }}>
                        Average Build Duration by Provider (min)
                      </h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={durationData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="provider" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="duration" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Longest Running Jobs Chart */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '18px', fontWeight: '600' }}>
                        Longest Running Jobs (Top 5)
                      </h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={longestJobs} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" label={{ value: 'Minutes', position: 'insideBottomRight', offset: 0 }} />
                          <YAxis dataKey="name" type="category" width={200} tick={<YAxisTickWithTooltip />} />
                          <Tooltip />
                          <Bar dataKey="duration" fill="#f59e0b" name="Duration (min)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Top Contributors Chart */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '18px', fontWeight: '600' }}>
                        Top Contributors (Top 5)
                      </h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={topContributors} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="builds" fill="#3b82f6" name="Builds" />
                          <Bar dataKey="successes" fill="#10b981" name="Successes" />
                          <Bar dataKey="failures" fill="#ef4444" name="Failures" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Build Duration Distribution Histogram */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '18px', fontWeight: '600' }}>
                        Build Duration Distribution
                      </h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={buildDurationHistogram} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="range" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#6366f1" name="Builds" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Pipeline Runs Table */}
            <div style={{ 
              background: 'white', 
              borderRadius: '16px', 
              padding: '28px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
              border: '1px solid #f1f5f9'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, color: '#1e293b', fontSize: '24px', fontWeight: '700' }}>Pipeline Runs</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={() => setShowColumnSelector(!showColumnSelector)}
                    title="Column Settings"
                    style={{
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    📊 Columns
                  </button>
                  <div style={{ 
                    color: '#64748b', 
                    fontSize: '14px',
                    background: '#f8fafc',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: '1px solid #e2e8f0'
                  }}>
                    Showing {sortedRuns.length} of {metrics?.total_runs ?? 0} runs
                  </div>
                </div>
              </div>
              
              {sortedRuns.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '60px', 
                  color: '#64748b',
                  fontSize: '18px',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '2px dashed #cbd5e1'
                }}>
                  🚀 No pipeline runs found for the selected criteria
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse',
                    fontSize: '14px'
                  }}>
                    <thead>
                      <tr style={{ 
                        background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', 
                        borderBottom: '2px solid #e2e8f0'
                      }}>
                        {columnConfig.filter(col => col.visible).map(column => (
                          <Th key={column.id}>
                            <Boxed>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: column.sortable ? 'pointer' : 'default' }}
                                   onClick={() => column.sortable && handleSort(column.id)}>
                                {column.label}
                                {column.sortable && (
                                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                                    {sortConfig.field === column.id 
                                      ? (sortConfig.direction === 'asc' ? '↑' : '↓')
                                      : '↕️'
                                    }
                                  </span>
                                )}
                              </div>
                            </Boxed>
                          </Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRuns.map((run, index) => (
                        <tr key={run.id} style={{ 
                          borderBottom: '1px solid #f1f5f9',
                          background: index % 2 === 0 ? 'white' : '#fafafa',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#f0f9ff'}
                        onMouseOut={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#fafafa'}
                        >
                          {columnConfig.filter(col => col.visible).map(column => {
                            switch (column.id) {
                              case 'provider':
                                return (
                                  <Td key={column.id}>
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '8px',
                                      fontWeight: '500'
                                    }}>
                                      {run.provider === 'github' ? '🐙' : run.provider === 'jenkins' ? '🔄' : '⚙️'}
                                      {run.provider}
                                    </div>
                                  </Td>
                                );
                              case 'pipeline_name':
                                return (
                                  <Td key={column.id} style={{ fontWeight: '500', color: '#1e293b' }}>
                                    {run.pipeline_name}
                                  </Td>
                                );
                              case 'status':
                                return (
                                  <Td key={column.id}>
                                    <StatusBadge status={run.status} />
                                  </Td>
                                );
                              case 'duration_seconds':
                                return (
                                  <Td key={column.id}>
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '4px',
                                      color: run.duration_seconds && run.duration_seconds > 300 ? '#dc2626' : '#16a34a'
                                    }}>
                                      {run.duration_seconds?.toFixed(1) ?? '—'}s
                                      {run.duration_seconds && run.duration_seconds > 300 && ' ⚠️'}
                                    </div>
                                  </Td>
                                );
                              case 'started_at':
                                return (
                                  <Td key={column.id}>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                      {run.started_at ? (() => {
                                        const date = new Date(run.started_at);
                                        return `${date.toLocaleDateString('en-GB', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: '2-digit'
                                        })} ${date.toLocaleTimeString('en-GB', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          hour12: false
                                        })}`;
                                      })() : '—'}
                                    </div>
                                  </Td>
                                );
                              case 'branch':
                                return (
                                  <Td key={column.id}>
                                    <span style={{ 
                                      background: '#f0f9ff', 
                                      padding: '6px 12px', 
                                      borderRadius: '16px',
                                      fontSize: '12px',
                                      color: '#0369a1',
                                      border: '1px solid #bae6fd'
                                    }}>
                                      {run.branch ?? '—'}
                                    </span>
                                  </Td>
                                );
                              case 'commit':
                                return (
                                  <Td key={column.id}>
                                    <code style={{ 
                                      background: '#f8fafc', 
                                      padding: '4px 8px', 
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      fontFamily: 'monospace',
                                      color: '#475569',
                                      border: '1px solid #e2e8f0'
                                    }}>
                                      {run.commit ?? '—'}
                                    </code>
                                  </Td>
                                );
                              case 'actions':
                                return (
                                  <Td key={column.id}>
                                    {run.url ? (
                                      <a 
                                        href={fixJenkinsUrl(run.url)} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        style={{
                                          padding: '8px 16px',
                                          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                          color: 'white',
                                          textDecoration: 'none',
                                          borderRadius: '8px',
                                          fontSize: '12px',
                                          fontWeight: '500',
                                          transition: 'all 0.2s ease',
                                          boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                                        }}
                                        onMouseOver={(e) => {
                                          e.currentTarget.style.transform = 'translateY(-1px)';
                                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                                        }}
                                        onMouseOut={(e) => {
                                          e.currentTarget.style.transform = 'translateY(0)';
                                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
                                        }}
                                      >
                                        View
                                      </a>
                                    ) : (
                                      <span style={{ color: '#94a3b8' }}>—</span>
                                    )}
                                  </Td>
                                );
                              default:
                                return null;
                            }
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '24px',
                      padding: '16px 0',
                      borderTop: '1px solid #e2e8f0'
                    }}>
                      <div style={{ color: '#64748b', fontSize: '14px' }}>
                        Showing {((currentPage - 1) * recordsPerPage) + 1} to {Math.min(currentPage * recordsPerPage, totalRecords)} of {totalRecords} results
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          style={{
                            padding: '8px 16px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            background: currentPage === 1 ? '#f3f4f6' : 'white',
                            color: currentPage === 1 ? '#9ca3af' : '#374151',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          Previous
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              style={{
                                padding: '8px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                background: currentPage === pageNum ? '#3b82f6' : 'white',
                                color: currentPage === pageNum ? 'white' : '#374151',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                minWidth: '40px'
                              }}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          style={{
                            padding: '8px 16px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            background: currentPage === totalPages ? '#f3f4f6' : 'white',
                            color: currentPage === totalPages ? '#9ca3af' : '#374151',
                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Column Selector Panel */}
            {showColumnSelector && (
              <>
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 999
                }} onClick={() => setShowColumnSelector(false)} />
                <div style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '300px',
                  background: 'rgba(255, 255, 255, 0.98)',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(20px)',
                  zIndex: 1000
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px', fontWeight: '700' }}>Column Settings</h3>
                    <button
                      onClick={() => setShowColumnSelector(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '20px',
                        cursor: 'pointer',
                        color: '#64748b',
                        padding: '4px'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {columnConfig.map((column) => (
                      <div key={column.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          type="checkbox"
                          checked={column.visible}
                          onChange={() => toggleColumnVisibility(column.id)}
                          style={{ margin: 0 }}
                        />
                        <span style={{ 
                          fontSize: '14px', 
                          color: '#374151',
                          fontWeight: '500'
                        }}>
                          {column.label}
                        </span>
                        {column.sortable && (
                          <span style={{ 
                            fontSize: '12px', 
                            color: '#64748b',
                            background: '#f1f5f9',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Sortable
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Saved Searches Panel */}
            {showSavedSearches && (
              <div style={{
                position: 'absolute',
                top: '120px',
                left: '32px',
                width: '350px',
                background: 'rgba(255, 255, 255, 0.98)',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(20px)',
                zIndex: 1000
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, color: '#1e293b', fontSize: '20px', fontWeight: '700' }}>Saved Searches</h3>
                  <button
                    onClick={() => setShowSavedSearches(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: '#64748b',
                      padding: '4px'
                    }}
                  >
                    ✕
                  </button>
                </div>
                
                {savedSearches.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    📁 No saved searches yet
                  </div>
                ) : (
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {savedSearches.map((search, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '12px',
                          marginBottom: '8px',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        onClick={() => {
                          // Apply the saved search filters
                          setSearchField(search.filters.field)
                          setSearchValue(search.filters.value)
                          setShowSavedSearches(false)
                          
                          // Trigger the search
                          if (search.filters.field && search.filters.value) {
                            // Apply the search filter
                            const filteredRuns = runs.filter((run: any) => {
                              const fieldValue = run[search.filters.field as keyof typeof run]
                              if (typeof fieldValue === 'string') {
                                return fieldValue.toLowerCase().includes(search.filters.value.toLowerCase())
                              }
                              return false
                            })
                            // Update the displayed runs with filtered results
                            setFilteredRuns(filteredRuns)
                          }
                        }}
                      >
                        <span style={{ fontSize: '14px', color: '#374151' }}>{search.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSavedSearches(prev => prev.filter((_, i) => i !== index))
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '16px',
                            padding: '4px'
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ title, value, color = '#007bff' }: { title: string, value: string, color?: string }) {
  return (
    <div style={{ 
      flex: 1,
      padding: '24px', 
      border: '1px solid #f1f5f9', 
      borderRadius: '16px',
      background: 'linear-gradient(135deg, #ffffff, #fafafa)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      transition: 'all 0.3s ease',
      borderLeft: `4px solid ${color}`,
      textAlign: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
      e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.15)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.transform = 'translateY(0) scale(1)';
      e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)';
    }}
    >
      <div style={{ 
        color: '#64748b', 
        fontSize: '14px', 
        marginBottom: '12px', 
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {title}
      </div>
      <div style={{ 
        fontSize: '32px', 
        fontWeight: '800', 
        color: color,
        textShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        {value}
      </div>
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '60px',
        height: '60px',
        background: `linear-gradient(135deg, ${color}20, ${color}10)`,
        borderRadius: '0 16px 0 60px',
        opacity: 0.6
      }} />
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: 8 }}>{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: 8 }}>{children}</td>
}

function Boxed({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '8px 16px',
      border: '2px solid #e2e8f0',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #ffffff, #f8fafc)',
      fontSize: '12px',
      fontWeight: '700',
      color: '#475569',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      transition: 'all 0.2s ease'
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.transform = 'scale(1.02)';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.transform = 'scale(1)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
    }}
    >
      {children}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const getStatusConfig = (s: string) => {
    switch (s.toLowerCase()) {
      case 'success':
        return { 
          color: '#16a34a', 
          bg: '#f0fdf4', 
          border: '#bbf7d0', 
          icon: '✅',
          shadow: '0 2px 8px rgba(22, 163, 74, 0.2)'
        }
      case 'failure':
      case 'failed':
        return { 
          color: '#dc2626', 
          bg: '#fef2f2', 
          border: '#fecaca', 
          icon: '❌',
          shadow: '0 2px 8px rgba(220, 38, 38, 0.2)'
        }
      case 'running':
        return { 
          color: '#d97706', 
          bg: '#fffbeb', 
          border: '#fed7aa', 
          icon: '🔄',
          shadow: '0 2px 8px rgba(217, 119, 6, 0.2)'
        }
      default:
        return { 
          color: '#64748b', 
          bg: '#f8fafc', 
          border: '#cbd5e1', 
          icon: '❓',
          shadow: '0 2px 8px rgba(100, 116, 139, 0.2)'
        }
    }
  }
  
  const config = getStatusConfig(status)
  
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      borderRadius: '24px',
      fontSize: '12px',
      fontWeight: '700',
      color: config.color,
      background: config.bg,
      border: `2px solid ${config.border}`,
      textTransform: 'capitalize',
      boxShadow: config.shadow,
      transition: 'all 0.2s ease',
      cursor: 'default'
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.transform = 'scale(1.05)';
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.transform = 'scale(1)';
      e.currentTarget.style.boxShadow = config.shadow;
    }}
    >
      <span style={{ fontSize: '14px' }}>{config.icon}</span>
      {status}
    </span>
  )
}


