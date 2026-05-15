import React, { useState, useEffect, useRef } from 'react';
import { Search, Tag, Check, ChevronDown, Loader2, X } from 'lucide-react';
import styles from './StreetSelect.module.css'; // Reusing StreetSelect styles for consistency
import { API_ENDPOINTS } from '../../api';

const CategorySelect = ({ value, onChange, placeholder = "Select category...", trustId = null, isCompact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_all_categories');
    return saved ? JSON.parse(saved) : [];
  });
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const containerRef = useRef(null);
  const lastFetchedTerm = useRef('');

  useEffect(() => {
    if (categories.length === 0) {
      fetchInitialCategories();
    }
  }, []);

  const fetchInitialCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.CATEGORIES.BASE}?per_page=20`);
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        setCategories(items);
        sessionStorage.setItem('reports_cached_all_categories', JSON.stringify(items));
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreCategories = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      let url = `${API_ENDPOINTS.CATEGORIES.BASE}?page=${nextPage}&per_page=15`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const newItems = data.items || [];
        setSearchResults(prev => [...prev, ...newItems]);
        setPage(nextPage);
        setHasMore(data.page < Math.ceil(data.total / data.per_page));
      }
    } catch (err) {
      console.error(err);
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
    const localMatches = categories.filter(c => c.name.toLowerCase().includes(query));
    setSearchResults(localMatches);

    // 2. Remote search happens after 2s debounce if few matches AND term changed
    if (searchTerm === lastFetchedTerm.current) return;

    const timer = setTimeout(async () => {
      if (localMatches.length < 5) {
        setLoading(true);
        try {
          let url = `${API_ENDPOINTS.CATEGORIES.BASE}?search=${encodeURIComponent(searchTerm)}&per_page=15&page=1`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const remoteItems = data.items || [];
            lastFetchedTerm.current = searchTerm;
            setPage(1);
            setHasMore(data.page < Math.ceil(data.total / data.per_page));
            
            setSearchResults(prev => {
              const combined = [...prev];
              remoteItems.forEach(ri => {
                if (!combined.some(c => c.id === ri.id)) combined.push(ri);
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
  }, [searchTerm, categories]);

  const handleSelect = (id) => {
    onChange(id);
    setIsOpen(false);
    setSearchTerm('');
  };

  const displayList = searchTerm ? searchResults : categories;
  const selectedCat = categories.find(c => c.id === value) || searchResults.find(c => c.id === value);

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
        className={`${styles.trigger} ${isOpen ? styles.triggerActive : ''} ${isCompact ? styles.compact : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <Tag size={16} className={styles.icon} />
        <span className={value ? styles.selectedValue : styles.placeholder}>
          {selectedCat ? selectedCat.name : placeholder}
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
              placeholder="Search category..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className={styles.list}>
            {!searchTerm && (
              <div 
                className={`${styles.item} ${!value ? styles.itemSelected : ''}`}
                onClick={() => handleSelect('')}
              >
                <span style={{ color: 'var(--primary)', fontWeight: '600' }}>ALL CATEGORIES</span>
              </div>
            )}
            {displayList.map((cat) => (
              <div 
                key={cat.id} 
                className={`${styles.item} ${value === cat.id ? styles.itemSelected : ''}`}
                onClick={() => handleSelect(cat.id)}
              >
                <span>{cat.name}</span>
                {value === cat.id && <Check size={14} className={styles.checkIcon} />}
              </div>
            ))}
            
            {loading && <div className={styles.dropdownLoading}>Searching...</div>}
            
            {hasMore && !loading && (
              <div className={styles.loadMore} onClick={(e) => { e.stopPropagation(); loadMoreCategories(); }}>
                Load More...
              </div>
            )}

            {!loading && displayList.length === 0 && (
              <div className={styles.noResults}>No categories found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorySelect;
