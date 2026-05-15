import React, { useState, useEffect, useRef } from 'react';
import { Search, Building, Check, ChevronDown, X } from 'lucide-react';
import styles from './StreetSelect.module.css'; // Reusing StreetSelect styles for consistency
import { API_ENDPOINTS } from '../../api';

const TrustSelect = ({ value, onChange, placeholder = "Select organization..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [trusts, setTrusts] = useState(() => {
    const saved = sessionStorage.getItem('global_cached_trusts');
    return saved ? JSON.parse(saved) : [];
  });
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const lastFetchedTerm = useRef('');

  useEffect(() => {
    const saved = sessionStorage.getItem('global_cached_trusts');
    const timestamp = sessionStorage.getItem('global_cached_trusts_ts');
    const now = Date.now();
    
    // If no cache OR cache is older than 5 minutes, fetch fresh
    if (!saved || !timestamp || (now - parseInt(timestamp) > 1000 * 60 * 5)) {
      fetchInitialTrusts();
    }
  }, []);

  const fetchInitialTrusts = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.TRUSTS.BASE + "?per_page=100");
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        setTrusts(items);
        sessionStorage.setItem('global_cached_trusts', JSON.stringify(items));
        sessionStorage.setItem('global_cached_trusts_ts', Date.now().toString());
      }
    } catch (err) {
      console.error("Error fetching trusts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setSearchResults([]);
      lastFetchedTerm.current = '';
      return;
    }

    // 1. Local filter happens immediately
    const query = searchTerm.toLowerCase();
    const localMatches = trusts.filter(t => {
      if (!t?.name) return false;
      const name = t.name.toLowerCase();
      return name.includes(query);
    });
    
    setSearchResults(localMatches);
    console.log(`🔍 Trust Search: "${searchTerm}" | Local Matches: ${localMatches.length} | Total Trusts: ${trusts.length}`);

    // 2. Remote search happens after 2s debounce if few matches AND term changed
    if (searchTerm === lastFetchedTerm.current) return;

    const timer = setTimeout(async () => {
      if (localMatches.length < 5) {
        setLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.TRUSTS.BASE}?search=${encodeURIComponent(searchTerm)}&per_page=10`);
          if (res.ok) {
            const data = await res.json();
            const remoteItems = data.items || [];
            lastFetchedTerm.current = searchTerm; // Mark as fetched
            
            // MERGE INTO CENTRAL CACHE
            setTrusts(prev => {
              const combined = [...prev];
              let changed = false;
              remoteItems.forEach(item => {
                const idx = combined.findIndex(c => c.id === item.id);
                if (idx === -1) {
                  combined.push(item);
                  changed = true;
                } else if (JSON.stringify(combined[idx]) !== JSON.stringify(item)) {
                  combined[idx] = item; // Update if changed
                  changed = true;
                }
              });
              if (changed) {
                sessionStorage.setItem('global_cached_trusts', JSON.stringify(combined));
              }
              return combined;
            });

            setSearchResults(prev => {
              const combined = [...prev];
              remoteItems.forEach(item => {
                if (!combined.some(c => c.id === item.id)) combined.push(item);
              });
              return combined;
            });
          }
        } catch (err) {
          console.error("Search error:", err);
        } finally {
          setLoading(false);
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [searchTerm, trusts]);

  const handleSearch = (val) => {
    setSearchTerm(val);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const saved = sessionStorage.getItem('global_cached_trusts');
      if (saved) {
        setTrusts(JSON.parse(saved));
      }
    }
  }, [isOpen]);

  const handleSelect = (id) => {
    onChange(id);
    setIsOpen(false);
    setSearchTerm('');
  };

  const displayTrusts = searchTerm ? searchResults : trusts;
  const selectedTrust = trusts.find(t => t.id === value);

  return (
    <div className={styles.container} ref={containerRef}>
      <div 
        className={`${styles.trigger} ${isOpen ? styles.triggerActive : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <Building size={16} className={styles.icon} />
        <span className={value ? styles.selectedValue : styles.placeholder}>
          {selectedTrust ? selectedTrust.name : placeholder}
        </span>
        {value && (
          <X 
            size={14} 
            className={styles.clearIcon} 
            onClick={(e) => {
              e.stopPropagation();
              handleSelect('');
            }}
          />
        )}
        <ChevronDown size={16} className={styles.chevron} />
      </div>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input 
              type="text" 
              placeholder="Search trust..." 
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value.toUpperCase())}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <div className={styles.list}>
            {!searchTerm && (
              <div 
                className={`${styles.item} ${!value ? styles.itemSelected : ''}`}
                onClick={() => handleSelect('')}
              >
                <span style={{ color: 'var(--primary)', fontWeight: '600' }}>ALL ORGANIZATIONS</span>
              </div>
            )}
            {displayTrusts.map((trust) => (
              <div 
                key={trust.id} 
                className={`${styles.item} ${value === trust.id ? styles.itemSelected : ''}`}
                onClick={() => handleSelect(trust.id)}
              >
                <span>{trust.name}</span>
                {value === trust.id && <Check size={14} />}
              </div>
            ))}
            
            {loading && <div className={styles.dropdownLoading}>Searching DB...</div>}
            
            {!loading && displayTrusts.length === 0 && (
              <div className={styles.noResults}>No organizations found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrustSelect;
