import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Check, ChevronsUpDown, X } from 'lucide-react';

import styles from './DonorSearch.module.css';
import { API_ENDPOINTS } from '../../api';

const DonorSearch = ({ value, onChange, placeholder = "Search donor..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredDonors, setFilteredDonors] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [cachedDonors, setCachedDonors] = useState(() => {
    const saved = sessionStorage.getItem('global_cached_donors');
    return saved ? JSON.parse(saved) : {};
  });
  const containerRef = useRef(null);
  const lastFetchedTerm = useRef('');

  // Sync local selected donor with the value prop
  useEffect(() => {
    if (value) {
      // Only fetch if we don't have it or if the ID changed
      if (!selectedDonor || selectedDonor.id !== value) {
        fetchDonorById(value);
      }
    } else {
      // If value is cleared from parent (e.g. on form reset), clear local state
      setSelectedDonor(null);
      setSearchTerm('');
    }
  }, [value]);

  const fetchDonorById = async (id) => {
    try {
      const res = await fetch(API_ENDPOINTS.DONORS.INFO(id));
      if (res.ok) {
        const result = await res.json();
        if (result.status) setSelectedDonor(result.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (isOpen && searchTerm.trim()) {
        // LOCAL FILTER FIRST
        const query = searchTerm.toLowerCase();
        const localMatches = Object.values(cachedDonors).filter(d => 
          d.name.toLowerCase().includes(query) || 
          (d.mobile && d.mobile.includes(query)) ||
          (d.street && d.street.toLowerCase().includes(query))
        );

        if (localMatches.length > 0) {
          setFilteredDonors(localMatches.slice(0, 20));
        }

        // Only search remote if local matches are few or it's a new term
        if (localMatches.length < 5 && searchTerm !== lastFetchedTerm.current) {
          searchDonors(searchTerm);
        }
      }
    }, 1500); // Faster debounce for better feel

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, isOpen, cachedDonors]);

  const searchDonors = async (query) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.DONORS.BASE}?search=${encodeURIComponent(query)}&per_page=20`);
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        lastFetchedTerm.current = query;

        // MERGE INTO CACHE
        setCachedDonors(prev => {
          const updated = { ...prev };
          items.forEach(item => { updated[item.id] = item; });
          sessionStorage.setItem('global_cached_donors', JSON.stringify(updated));
          return updated;
        });

        setFilteredDonors(items);
        setHighlightedIndex(0);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
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

  const handleSelect = (donor) => {
    if (donor === null) {
      setSelectedDonor(null);
      onChange('');
    } else {
      setSelectedDonor(donor);
      onChange(donor.id);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (filteredDonors.length > 0) {
        handleSelect(filteredDonors[highlightedIndex]);
      } else if (searchTerm === '') {
        setIsOpen(false);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, filteredDonors.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedDonor(null);
    onChange('');
    setSearchTerm('');
  };


  return (
    <div className={styles.container} ref={containerRef}>
      <div 
        className={`${styles.trigger} ${isOpen ? styles.triggerActive : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={styles.currentValue}>
          <User size={16} className={styles.icon} />
          <span className={selectedDonor ? styles.selectedText : ''}>
            {selectedDonor ? selectedDonor.name : placeholder}
          </span>
        </div>
        <div className={styles.triggerActions}>
          {selectedDonor && (
            <X 
              size={14} 
              className={styles.clearIcon} 
              onClick={handleClear}
              title="Clear selection"
            />
          )}
          <ChevronsUpDown size={16} className={styles.chevron} />
        </div>
      </div>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input 
              type="text" 
              placeholder="Type to filter..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className={styles.list}>
            {searchTerm === '' && (
              <div 
                className={`${styles.item} ${!value ? styles.itemSelected : ''}`}
                onClick={() => handleSelect(null)}
              >
                <div className={styles.itemInfo}>
                  <span className={styles.name}>All Donors</span>
                  <span className={styles.details}>Show results for everyone</span>
                </div>
                {!value ? <Check size={16} className={styles.checkIcon} /> : null}
              </div>
            )}

            {filteredDonors.length > 0 ? (
              filteredDonors.map((donor, idx) => (
                <div 
                  key={donor.id} 
                  className={`
                    ${styles.item} 
                    ${value === donor.id ? styles.itemSelected : ''} 
                    ${highlightedIndex === idx ? styles.itemHighlighted : ''}
                  `}
                  onClick={() => handleSelect(donor)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >

                  <div className={styles.itemInfo}>
                    <span className={styles.name}>{donor.name}</span>
                    <span className={styles.details}>{donor.mobile || 'No mobile'} • {donor.street || 'No street'}</span>
                  </div>
                  {value === donor.id && <Check size={16} className={styles.checkIcon} />}
                </div>
              ))
            ) : (
              !loading && <div className={styles.noResults}>No other donors found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DonorSearch;

