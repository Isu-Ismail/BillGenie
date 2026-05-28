import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Users, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight,
  Plus,
  Calendar,
  Building2,
  PieChart,
  Loader2,
  RefreshCcw,
  Shield
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';
import TrustSelect from '../entry/TrustSelect';
import { API_ENDPOINTS, getAuthHeaders } from '../../api';


const Dashboard = () => {
  const navigate = useNavigate();
  const [statsData, setStatsData] = useState(() => {
    const saved = sessionStorage.getItem('dashboard_cached_stats');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(!statsData);
  const userJson = localStorage.getItem('user');
  const userId = userJson ? JSON.parse(userJson)?.id : 'default';
  const TRUST_KEY = `global_cached_trusts_${userId}`;
  const CAT_KEY = `global_cached_categories_${userId}`;

  const [trusts, setTrusts] = useState(() => {
    const saved = sessionStorage.getItem(TRUST_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [categories, setCategories] = useState(() => {
    const saved = sessionStorage.getItem(CAT_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [filters, setFilters] = useState({ 
    trust_id: sessionStorage.getItem('dashboard_selected_trust') || '', 
    hijri_year: sessionStorage.getItem('dashboard_selected_year') || '' 
  });

  const hasFetched = React.useRef(false);
  const isFirstRender = React.useRef(true);

  useEffect(() => {
    sessionStorage.setItem('dashboard_selected_trust', filters.trust_id);
    sessionStorage.setItem('dashboard_selected_year', filters.hijri_year);
  }, [filters.trust_id, filters.hijri_year]);

  const fetchInitialData = async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.TRUSTS.BASE}?per_page=500`, { headers: getAuthHeaders() }),
        fetch(`${API_ENDPOINTS.CATEGORIES.BASE}?per_page=500`, { headers: getAuthHeaders() })
      ]);
      const tData = await tRes.json();
      const cData = await cRes.json();
      const trustList = tData.items || [];
      const categoryList = cData.items || [];
      setTrusts(trustList);
      setCategories(categoryList);
      
      sessionStorage.setItem(TRUST_KEY, JSON.stringify(trustList));
      sessionStorage.setItem(CAT_KEY, JSON.stringify(categoryList));

      if (!filters.trust_id && trustList.length > 0) {
        setFilters(prev => ({ ...prev, trust_id: trustList[0].id }));
      }
    } catch (err) {
      console.error("Failed to fetch initial dashboard data:", err);
    }
  };

  const lastFetchedRef = React.useRef("");

  const fetchStats = async () => {
    // Always call the base endpoint without params to get the LATEST metadata cache
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.STATS.BASE, { headers: getAuthHeaders() });
      const data = await res.json();
      
      if (data.status) {
        // Sync filters from the backend cache fields if they exist
        if (data.filters) {
          setFilters({
            trust_id: data.filters.trust_id || '',
            hijri_year: data.filters.hijri_year || ''
          });
        }
        setStatsData(data);
        sessionStorage.setItem('dashboard_cached_stats', JSON.stringify(data));
      }
    } catch (err) {
      console.error("Failed to fetch dashboard stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    try {
      let url = `${API_ENDPOINTS.STATS.REFRESH}?`;
      if (filters.trust_id) url += `trust_id=${filters.trust_id}&`;
      if (filters.hijri_year) url += `hijri_year=${filters.hijri_year}`;
      
      const res = await fetch(url, { 
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.status) {
        // Sync filters from response just in case
        if (data.filters) {
          setFilters({
            trust_id: data.filters.trust_id || '',
            hijri_year: data.filters.hijri_year || ''
          });
        }
        setStatsData(data);
        sessionStorage.setItem('dashboard_cached_stats', JSON.stringify(data));
      }
    } catch (err) {
      console.error("Manual refresh failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearStatsCache = async () => {
    setLoading(true);
    try {
      console.log("🧹 Sending request to clear dashboard stats cache...");
      const res = await fetch(API_ENDPOINTS.STATS.CLEAR, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        // Reset filters, states, and sessionStorage cache
        setFilters({ trust_id: '', hijri_year: '' });
        sessionStorage.setItem('dashboard_selected_trust', '');
        sessionStorage.setItem('dashboard_selected_year', '');
        sessionStorage.removeItem('dashboard_cached_stats');
        setStatsData(null);
        
        // Fetch default empty dashboard stats
        await fetchStats();
      } else {
        console.error("Backend failed to clear stats cache.");
      }
    } catch (err) {
      console.error("Error clearing stats cache:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const init = async () => {
      // 1. Fetch master data if missing from state
      if (trusts.length === 0 || categories.length === 0) {
        await fetchInitialData();
      }
      
      // 2. Fetch stats ONLY if we don't have them in cache (sessionStorage)
      if (!statsData) {
        await fetchStats();
      }
    };
    init();
  }, []); // Run ONCE on mount

  // Note: Automatic fetching on filter change is disabled per user request.
  // User will click "Update Stats" to refresh the data.


  const getCategoryName = (id) => {
    return categories.find(c => c.id === id)?.name || "Other";
  };

  if (loading && !statsData) {
    return (
      <div className={styles.loadingState}>
        <Loader2 className={styles.spin} size={48} />
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  const kpis = [
    { label: 'Total Revenue', value: `₹${statsData?.stats?.total_revenue?.toLocaleString() || 0}`, icon: CreditCard, color: '#8b5cf6' },
    { label: 'Total Donors', value: statsData?.stats?.total_donors || 0, icon: Users, color: '#06b6d4' },
    { label: 'Avg Donation', value: `₹${Math.round(statsData?.stats?.avg_donation || 0).toLocaleString()}`, icon: TrendingUp, color: '#10b981' },
    { label: 'Total Transactions', value: statsData?.stats?.transaction_count || 0, icon: PieChart, color: '#f59e0b' },
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Dashboard Overview</h1>
          <p className={styles.subtitle}>Financial performance across all trusts</p>
        </div>
        <div className={styles.actions}>
          <TrustSelect 
            value={filters.trust_id}
            onChange={(val) => setFilters({...filters, trust_id: val})}
            placeholder="Select Trust"
          />
          <input 
            type="text" 
            placeholder="Year (e.g. 1446)" 
            className={styles.yearInput}
            value={filters.hijri_year}
            onChange={(e) => setFilters({...filters, hijri_year: e.target.value})}
          />
          <button className={styles.primaryBtn} onClick={handleManualRefresh} disabled={loading}>
            <RefreshCcw size={18} className={loading ? styles.spin : ''} /> 
            {loading ? 'Updating...' : 'Update Stats'}
          </button>
          <button 
            type="button" 
            className={styles.resetBtn} 
            onClick={handleClearStatsCache}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className={styles.spin} style={{ marginRight: '6px' }} /> : null}
            Clear Cache
          </button>
        </div>
      </header>

      {statsData?.last_generated && (
        <div className={styles.metaBar}>
          <div className={styles.metaItem}>
            <TrendingUp size={14} />
            <span>Last Generated:</span>
            {(() => {
              const str = statsData.last_generated;
              let d = str, t = '';
              if (str.includes('|')) { [d, t] = str.split('|'); }
              else if (str.includes(' ')) {
                const parts = str.split(' ');
                d = parts[0]; t = parts.slice(1).join(' ');
              }
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '6px', background: 'rgba(139, 92, 246, 0.1)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <span style={{ fontWeight: '600', color: '#6d28d9' }}>{d}</span>
                  {t && <span style={{ fontSize: '0.85em', color: '#8b5cf6', backgroundColor: 'rgba(255,255,255,0.7)', padding: '2px 6px', borderRadius: '6px', fontWeight: '500' }}>{t}</span>}
                </div>
              );
            })()}
          </div>
          <div className={styles.metaItem}>
            <Shield size={14} />
            <span>Trust: <b>{trusts.find(t => t.id === filters.trust_id)?.name || 'All Organizations'}</b></span>
          </div>
          <div className={styles.metaItem}>
            <Calendar size={14} />
            <span>Year: <b>{filters.hijri_year || 'All Time'}</b></span>
          </div>
        </div>
      )}


      <div className={styles.statsGrid}>
        {kpis.map((stat, i) => (
          <div key={i} className={styles.statCard}>
            <div className={styles.statHeader}>
              <div className={styles.statIcon} style={{ background: `${stat.color}15`, color: stat.color }}>
                <stat.icon size={24} />
              </div>
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>{stat.label}</span>
              <h2 className={styles.statValue}>{stat.value}</h2>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Recent Transactions</h3>
            <button className={styles.textBtn} onClick={() => navigate('/history')}>View History</button>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Trust</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              
              <tbody>
                {statsData?.recent?.slice(0, 5).map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <div className={styles.donorInfo}>
                        <div className={styles.avatar}>{tx.donor_name.charAt(0)}</div>
                        <span>{tx.donor_name}</span>
                      </div>
                    </td>
                    <td>{tx.trust_name}</td>
                    <td>{tx.date}</td>
                    <td className={styles.amountCol}>₹{tx.amount.toLocaleString()}</td>
                  </tr>
                ))}
                {(!statsData?.recent || statsData.recent.length === 0) && (
                  <tr>
                    <td colSpan="4" className={styles.emptyRow}>No recent transactions found</td>
                  </tr>
                )}
              </tbody>
            
          </table>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Collection Split</h3>
          </div>
          <div className={styles.distributionList}>
            {statsData?.distributions?.categories?.map((cat, i) => (
              <div key={i} className={styles.distItem}>
                <div className={styles.distInfo}>
                  <span>{getCategoryName(cat.id)}</span>

                  <span>₹{cat.value.toLocaleString()}</span>
                </div>
                <div className={styles.progressBar}>
                  <div 
                    className={styles.progressFill} 
                    style={{ width: `${(cat.value / (statsData.stats.total_revenue || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
            {(!statsData?.distributions?.categories || statsData.distributions.categories.length === 0) && (
              <p className={styles.emptyText}>No data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
