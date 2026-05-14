import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Check, ChevronsUpDown, X } from 'lucide-react';

import styles from './DonorSearch.module.css';
import { API_ENDPOINTS } from '../../api';

const DonorSearch = ({ value, onChange, placeholder = "Search donor..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredDonors, setFilteredDonors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState(null);
  const containerRef = useRef(null);

  // Fetch initial selected donor if value exists
  useEffect(() => {
    if (value && !selectedDonor) {
       // Ideally we should have an endpoint to get a single donor
       // For now, we search for the specific ID or rely on the parent
       fetchDonorById(value);
    }
  }, [value]);

  const fetchDonorById = async (id) => {
    try {
      const res = await fetch(`http://localhost:8000/api/donors/`);
      if (res.ok) {
        const data = await res.json();
        const found = data.find(d => d.id === id);
        if (found) setSelectedDonor(found);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (isOpen) {
        searchDonors(searchTerm);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, isOpen]);

  const searchDonors = async (query) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/donors/?search=${query}`);
      if (res.ok) {
        const data = await res.json();
        setFilteredDonors(data);
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
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className={styles.list}>
            <div 
              className={`${styles.item} ${!value ? styles.itemSelected : ''}`}
              onClick={() => handleSelect(null)}
            >
              <div className={styles.itemInfo}>
                <span className={styles.name}>All Donors</span>
                <span className={styles.details}>Show results for everyone</span>
              </div>
              {!value && <Check size={16} className={styles.checkIcon} />}
            </div>

            {filteredDonors.length > 0 ? (
              filteredDonors.map((donor) => (
                <div 
                  key={donor.id} 
                  className={`${styles.item} ${value === donor.id ? styles.itemSelected : ''}`}
                  onClick={() => handleSelect(donor)}
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

