import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Plus, Check, ChevronDown } from 'lucide-react';
import styles from './StreetSelect.module.css';
import { API_ENDPOINTS } from '../../api';

const StreetSelect = ({ value, onChange, placeholder = "Select street..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [streets, setStreets] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    fetchStreets();
  }, []);

  const fetchStreets = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.STREETS.BASE + "?per_page=500");
      if (res.ok) {
        const data = await res.json();
        // Extract names from objects for the simple selection list
        const streetNames = (data.items || []).map(s => s.name);
        setStreets(streetNames);
      }
    } catch (err) {
      console.error("Error fetching streets:", err);
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

  const filteredStreets = streets.filter(s => 
    s.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (street) => {
    onChange(street);
    setIsOpen(false);
    setSearchTerm('');
  };

  const isNewStreet = searchTerm.trim() !== '' && !streets.some(s => s.toLowerCase() === searchTerm.toLowerCase());

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
              onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <div className={styles.list}>
            {filteredStreets.map((street, idx) => (
              <div 
                key={idx} 
                className={`${styles.item} ${value === street ? styles.itemSelected : ''}`}
                onClick={() => handleSelect(street)}
              >
                <span>{street}</span>
                {value === street && <Check size={14} />}
              </div>
            ))}
            
            {isNewStreet && (
              <div 
                className={styles.addNew}
                onClick={() => handleSelect(searchTerm.trim())}
              >
                <Plus size={14} />
                <span>Add "<strong>{searchTerm}</strong>" as new street</span>
              </div>
            )}
            
            {!loading && filteredStreets.length === 0 && !isNewStreet && (
              <div className={styles.noResults}>No streets found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StreetSelect;
