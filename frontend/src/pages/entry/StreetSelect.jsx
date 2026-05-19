import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Plus, Check, ChevronDown, Loader2, X } from 'lucide-react';
import styles from './StreetSelect.module.css';
import { API_ENDPOINTS, getAuthHeaders } from '../../api';

import { useQueryClient } from '@tanstack/react-query';

const StreetSelect = ({ value, onChange, placeholder = "Select street..." }) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const userJson = localStorage.getItem('user');
  const userId = userJson ? JSON.parse(userJson)?.id : 'default';
  const CACHE_KEY = `global_cached_streets_${userId}`;

  const [streets, setStreets] = useState(() => {
    const saved = sessionStorage.getItem(CACHE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return parsed.map(s => typeof s === 'object' ? s.name : s);
  });
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const containerRef = useRef(null);
  const lastFetchedTerm = useRef('');

  useEffect(() => {
    if (streets.length === 0) {
      fetchInitialStreets();
    }
  }, []);

  const fetchInitialStreets = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.STREETS.BASE + "?per_page=20", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const streetNames = (data.items || []).map(s => s.name);
        setStreets(streetNames);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(streetNames));
      }
    } catch (err) {
      console.error("Error fetching streets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setSearchResults([]);
      return;
    }

    // 1. Local filter happens immediately
    const query = searchTerm.toUpperCase();
    const localMatches = streets.filter(s => s.toUpperCase().includes(query));
    setSearchResults(localMatches);

    // 2. Remote search happens after 2s debounce if few matches AND term changed
    if (searchTerm === lastFetchedTerm.current) return;

    const timer = setTimeout(async () => {
      if (localMatches.length < 5) {
        setLoading(true);
        try {
          const res = await fetch(`${API_ENDPOINTS.STREETS.BASE}?search=${encodeURIComponent(query)}&per_page=10`, { headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            const remoteNames = (data.items || []).map(s => s.name);
            lastFetchedTerm.current = searchTerm; // Mark as fetched
            
            setStreets(prev => {
              const combined = [...prev];
              remoteNames.forEach(name => {
                if (!combined.includes(name)) combined.push(name);
              });
              sessionStorage.setItem(CACHE_KEY, JSON.stringify(combined));
              return combined;
            });
            setSearchResults(prev => {
               const combined = [...prev];
               remoteNames.forEach(name => {
                 if (!combined.includes(name)) combined.push(name);
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
  }, [searchTerm, streets]);

  const handleSearch = (val) => {
    setSearchTerm(val.toUpperCase());
  };

  const handleSelect = (street) => {
    onChange(street);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleCreateStreet = async (e) => {
    e.stopPropagation();
    if (!searchTerm.trim()) return;
    
    setIsCreating(true);
    const newName = searchTerm.trim().toUpperCase();
    
    try {
      const response = await fetch(API_ENDPOINTS.STREETS.CREATE, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: newName })
      });
      
      if (response.ok) {
        // Update local state and global cache
        setStreets(prev => {
          const updated = [...prev, newName];
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated));
          return updated;
        });

        // Invalidate React Query cache so Settings page reflects the change
        queryClient.invalidateQueries({ queryKey: ['streets'] });
        
        handleSelect(newName);
      } else {
        const err = await response.json();
        let errorMsg = err.detail || "Error creating street";
        if (errorMsg.includes('validation_not_unique')) {
           errorMsg = "This street name already exists in the database.";
        }
        alert(errorMsg);
      }
    } catch (err) {
      console.error("Create street error:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const displayStreets = searchTerm ? searchResults : streets;
  const exactMatch = searchTerm.trim() !== '' && streets.some(s => s.toUpperCase() === searchTerm.trim().toUpperCase());
  const isNewStreet = searchTerm.trim() !== '' && !exactMatch;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={styles.container} ref={containerRef}>
      <div 
        className={`${styles.trigger} ${isOpen ? styles.triggerActive : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <MapPin size={16} className={styles.icon} />
        <span className={value ? styles.selectedValue : styles.placeholder}>
          {value || placeholder}
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
              placeholder="Search or add street..." 
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
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
                <span style={{ color: 'var(--primary)', fontWeight: '600' }}>ALL STREETS</span>
              </div>
            )}
            {displayStreets.map((street, idx) => (
              <div 
                key={idx} 
                className={`${styles.item} ${value === street ? styles.itemSelected : ''}`}
                onClick={() => handleSelect(street)}
              >
                <span>{street}</span>
                {value === street && <Check size={14} />}
              </div>
            ))}
            
            {loading && <div className={styles.dropdownLoading}>Searching DB...</div>}

            {isNewStreet && !loading && (
              <div 
                className={styles.addNew}
                onClick={handleCreateStreet}
              >
                {isCreating ? (
                  <Loader2 size={14} className={styles.spin} />
                ) : (
                  <Plus size={14} />
                )}
                <span>Add "<strong>{searchTerm}</strong>" to database</span>
              </div>
            )}
            
            {!loading && displayStreets.length === 0 && !isNewStreet && (
              <div className={styles.noResults}>No streets found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StreetSelect;
