import React, { useState, useEffect } from 'react';
import { 
  Download,
  Calendar,
  Filter,
  Users,
  Search,
  FileSpreadsheet,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Shield,
  TrendingUp,
  MapPin,
  PieChart
} from 'lucide-react';

import ExcelJS from 'exceljs';
import styles from './Reports.module.css';
import TrustSelect from '../entry/TrustSelect';
import { API_ENDPOINTS, getAuthHeaders } from '../../api';

const Reports = () => {
  const userJson = localStorage.getItem('user');
  const userId = userJson ? JSON.parse(userJson)?.id : 'default';
  const TRUST_KEY = `global_cached_trusts_${userId}`;
  const STREET_KEY = `global_cached_streets_${userId}`;
  const CAT_KEY = `global_cached_categories_${userId}`;

  const [reportData, setReportData] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [categories, setCategories] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_categories');
    return saved ? JSON.parse(saved) : [];
  });
  const [trusts, setTrusts] = useState(() => {
    const saved = sessionStorage.getItem(TRUST_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [summary, setSummary] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_summary');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  
  // Filter states
  const [selectedTrust, setSelectedTrust] = useState(sessionStorage.getItem('reports_selected_trust') || '');
  const [selectedTrustName, setSelectedTrustName] = useState(sessionStorage.getItem('reports_selected_trust_name') || '');
  const [selectedYear, setSelectedYear] = useState(sessionStorage.getItem('reports_selected_year') || '');
  const [selectedGender, setSelectedGender] = useState(sessionStorage.getItem('reports_selected_gender') || 'All');
  const [selectedStreets, setSelectedStreets] = useState(() => {
    const saved = sessionStorage.getItem('reports_selected_streets');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const saved = sessionStorage.getItem('reports_selected_categories');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [fromDate, setFromDate] = useState(sessionStorage.getItem('reports_selected_from_date') || '');
  const [toDate, setToDate] = useState(sessionStorage.getItem('reports_selected_to_date') || '');
  
  const [showFilters, setShowFilters] = useState(false);

  const getActiveFiltersCount = () => {
    let count = 0;
    if (selectedYear) count++;
    if (selectedGender && selectedGender !== 'All') count++;
    if (selectedStreets.length > 0) count++;
    if (selectedCategories.length > 0) count++;
    if (fromDate) count++;
    if (toDate) count++;
    return count;
  };

  const clearFilter = (key) => {
    if (key === 'year') {
      setSelectedYear('');
      sessionStorage.setItem('reports_selected_year', '');
    } else if (key === 'gender') {
      setSelectedGender('All');
      sessionStorage.setItem('reports_selected_gender', 'All');
    } else if (key === 'streets') {
      setSelectedStreets([]);
      sessionStorage.setItem('reports_selected_streets', JSON.stringify([]));
    } else if (key === 'categories') {
      setSelectedCategories([]);
      sessionStorage.setItem('reports_selected_categories', JSON.stringify([]));
    } else if (key === 'fromDate') {
      setFromDate('');
      sessionStorage.setItem('reports_selected_from_date', '');
    } else if (key === 'toDate') {
      setToDate('');
      sessionStorage.setItem('reports_selected_to_date', '');
    }
  };
  
  // Dynamic states
  const [allStreets, setAllStreets] = useState(() => {
    const saved = sessionStorage.getItem(STREET_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    // Reports needs objects {id, name}, so map strings if needed
    return parsed.map(s => typeof s === 'string' ? { id: s, name: s } : s);
  });
  const [streetSearch, setStreetSearch] = useState('');
  const [streetPage, setStreetPage] = useState(1);
  const [hasMoreStreets, setHasMoreStreets] = useState(false);
  const [loadingStreets, setLoadingStreets] = useState(false);
  

  
  const [allCategoriesList, setAllCategoriesList] = useState(() => {
    const saved = sessionStorage.getItem(CAT_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryPage, setCategoryPage] = useState(1);
  const [hasMoreCategories, setHasMoreCategories] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  
  const [showStreetDropdown, setShowStreetDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const lastFetchedCatTerm = React.useRef('');
  
  // Scroll control
  const filterRowRef = React.useRef(null);
  const summaryRowRef = React.useRef(null);
  const [isHoveringFilter, setIsHoveringFilter] = useState(false);
  const hasFetched = React.useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const init = async () => {
      // 1. Fetch metadata if state is empty
      if (trusts.length === 0 || allCategoriesList.length === 0 || allStreets.length === 0) {
        await fetchInitialData();
      }

      // 2. Load latest available report from backend cache ONLY if no local data exists
      // This will call the endpoint WITHOUT parameters for the "Latest" cache
      if (reportData.length === 0) {
        await loadCachedReport(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const filterRow = filterRowRef.current;
    const summaryRow = summaryRowRef.current;

    const createWheelHandler = (row) => (e) => {
      if (e.shiftKey && e.deltaY !== 0) {
        // Shift + Vertical wheel = Horizontal scroll
        e.preventDefault();
        row.scrollLeft += e.deltaY;
      }
      // Regular vertical wheel (e.deltaY) and horizontal wheel (e.deltaX)
      // are handled naturally by the browser thanks to overflow-x: auto.
    };

    const filterHandler = filterRow ? createWheelHandler(filterRow) : null;
    const summaryHandler = summaryRow ? createWheelHandler(summaryRow) : null;

    if (filterRow && filterHandler) {
      filterRow.addEventListener('wheel', filterHandler, { passive: false });
    }
    if (summaryRow && summaryHandler) {
      summaryRow.addEventListener('wheel', summaryHandler, { passive: false });
    }

    return () => {
      if (filterRow && filterHandler) filterRow.removeEventListener('wheel', filterHandler);
      if (summaryRow && summaryHandler) summaryRow.removeEventListener('wheel', summaryHandler);
    };
  }, [summary, reportData]); // Re-run when report is generated/updated

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isHoveringFilter || !filterRowRef.current) return;
      
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        filterRowRef.current.scrollLeft += 100;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        filterRowRef.current.scrollLeft -= 100;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHoveringFilter]);

  // Export Modal states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFilename, setExportFilename] = useState('');

  useEffect(() => {
    sessionStorage.setItem('reports_selected_trust', selectedTrust);
    sessionStorage.setItem('reports_selected_trust_name', selectedTrustName);
    sessionStorage.setItem('reports_selected_year', selectedYear);
    sessionStorage.setItem('reports_selected_gender', selectedGender);
    sessionStorage.setItem('reports_selected_streets', JSON.stringify(selectedStreets));
    sessionStorage.setItem('reports_selected_categories', JSON.stringify(selectedCategories));
    sessionStorage.setItem('reports_selected_from_date', fromDate);
    sessionStorage.setItem('reports_selected_to_date', toDate);
  }, [selectedTrust, selectedTrustName, selectedYear, selectedGender, selectedStreets, selectedCategories, fromDate, toDate]);

  const [lastGenerated, setLastGenerated] = useState(sessionStorage.getItem('reports_cached_last_generated') || null);
  const [reportGenerated, setReportGenerated] = useState(sessionStorage.getItem('reports_cached_generated_flag') === 'true');

  useEffect(() => {
    sessionStorage.setItem('reports_cached_last_generated', lastGenerated || '');
    sessionStorage.setItem('reports_cached_generated_flag', reportGenerated ? 'true' : 'false');
  }, [lastGenerated, reportGenerated]);

  const loadCachedReport = async (useFilters = false) => {
    try {
      let url = API_ENDPOINTS.REPORTS.BASE;
      
      // If useFilters is true, we pass the current state to find a SPECIFIC cache.
      // If false, we call the base endpoint to get the LATEST available report metadata.
      if (useFilters) {
        const trust = selectedTrust || '';
        const year = selectedYear || '';
        const streetParam = selectedStreets.length > 0 ? `&streets=${encodeURIComponent(selectedStreets.join(','))}` : '';
        const genderParam = selectedGender !== 'All' ? `&gender=${selectedGender}` : '';
        const catParam = selectedCategories.length > 0 ? `&categories=${encodeURIComponent(selectedCategories.join(','))}` : '';
        const dateParam = (fromDate ? `&from_date=${fromDate}` : '') + (toDate ? `&to_date=${toDate}` : '');
        url += `?trust_id=${trust}&hijri_year=${year}${genderParam}${streetParam}${catParam}${dateParam}`;
      }

      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const result = await res.json();
        if (result.from_cache) {
          // Sync filters from the backend cache fields
          if (result.filters) {
            if (result.filters.trust_id) {
              setSelectedTrust(result.filters.trust_id);
              // Also update trust name if list is available
              const tName = trusts.find(t => t.id === result.filters.trust_id)?.name;
              if (tName) setSelectedTrustName(tName);
            }
            if (result.filters.hijri_year !== undefined) setSelectedYear(result.filters.hijri_year || '');
            if (result.filters.gender !== undefined) setSelectedGender(result.filters.gender || 'All');
            if (result.filters.streets !== undefined) setSelectedStreets(result.filters.streets ? result.filters.streets.split(',').filter(x => x) : []);
            if (result.filters.categories !== undefined) setSelectedCategories(result.filters.categories ? result.filters.categories.split(',').filter(x => x) : []);
            if (result.filters.from_date !== undefined) setFromDate(result.filters.from_date || '');
            if (result.filters.to_date !== undefined) setToDate(result.filters.to_date || '');
          }

          setReportData(result.data);
          setCategories(result.categories);
          setSummary(result.summary);
          setReportGenerated(true);
          setLastGenerated(result.last_generated);

          // Update sessionStorage
          sessionStorage.setItem('reports_cached_data', JSON.stringify(result.data));
          sessionStorage.setItem('reports_cached_categories', JSON.stringify(result.categories));
          sessionStorage.setItem('reports_cached_summary', JSON.stringify(result.summary));
          
          return true; // Was cached
        }
      }
      return false; // Not in cache
    } catch (err) { 
      console.error("Cache load error:", err); 
      return false;
    }
  };

  // Fetch streets
  useEffect(() => {
    if (showStreetDropdown) {
      loadStreets();
    }
  }, [streetSearch, streetPage, showStreetDropdown]);



  // Fetch categories
  useEffect(() => {
    if (showCategoryDropdown) {
      if (categorySearch !== lastFetchedCatTerm.current || categoryPage > 1) {
         // Use a timeout for the search term only
         const timer = setTimeout(() => {
            loadCategories();
         }, categorySearch !== lastFetchedCatTerm.current ? 2000 : 0);
         return () => clearTimeout(timer);
      }
    }
  }, [categorySearch, categoryPage, showCategoryDropdown]);

  const loadStreets = async () => {
    setLoadingStreets(true);
    try {
      let url = `${API_ENDPOINTS.STREETS.BASE}?page=${streetPage}&per_page=20`;
      if (streetSearch) url += `&search=${encodeURIComponent(streetSearch)}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const newStreets = data.items || [];
        setAllStreets(prev => {
          const base = streetPage === 1 ? [] : prev;
          const existingIds = new Set(base.map(s => s.id));
          const updated = [...base, ...newStreets.filter(s => !existingIds.has(s.id))];
          if (streetPage === 1 && !streetSearch) {
             sessionStorage.setItem(STREET_KEY, JSON.stringify(updated.map(s => s.name).slice(0, 500)));
          } else if (streetSearch && newStreets.length > 0) {
             // Merge search results into global cache as strings
             const globalSaved = JSON.parse(sessionStorage.getItem(STREET_KEY) || '[]');
             const combined = [...globalSaved];
             newStreets.forEach(s => {
               if (!combined.includes(s.name)) combined.push(s.name);
             });
             sessionStorage.setItem(STREET_KEY, JSON.stringify(combined));
          }
          return updated;
        });
        setHasMoreStreets(data.page < Math.ceil(data.total / data.per_page));
      }
    } catch (error) { console.error(error); } finally { setLoadingStreets(false); }
  };



  const loadCategories = async () => {
    if (categorySearch === lastFetchedCatTerm.current && categoryPage === 1 && allCategoriesList.length > 0) return;
    
    setLoadingCategories(true);
    try {
      let url = `${API_ENDPOINTS.CATEGORIES.BASE}?page=${categoryPage}&per_page=500`; 
      if (categorySearch) url += `&search=${encodeURIComponent(categorySearch)}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        
        setAllCategoriesList(prev => {
          const base = categoryPage === 1 ? [] : prev;
          const existingIds = new Set(base.map(c => c.id));
          const updated = [...base, ...items.filter(c => !existingIds.has(c.id))];
          return updated;
        });
        
        setHasMoreCategories(data.page < Math.ceil(data.total / data.per_page));
        lastFetchedCatTerm.current = categorySearch;
      }
    } catch (err) { console.error(err); } finally { setLoadingCategories(false); }
  };

  const fetchInitialData = async () => {
    try {
      const [tRes, cRes, sRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.TRUSTS.BASE}?per_page=500`, { headers: getAuthHeaders() }),
        fetch(`${API_ENDPOINTS.CATEGORIES.BASE}?per_page=500`, { headers: getAuthHeaders() }),
        fetch(`${API_ENDPOINTS.STREETS.BASE}?per_page=500`, { headers: getAuthHeaders() })
      ]);

      const [tData, cData, sData] = await Promise.all([tRes.json(), cRes.json(), sRes.json()]);
      
      const trustList = tData.items || [];
      setTrusts(trustList);
      sessionStorage.setItem(TRUST_KEY, JSON.stringify(trustList));
      
      setAllCategoriesList(cData.items || []);
      sessionStorage.setItem(CAT_KEY, JSON.stringify(cData.items || []));
      
      const streetList = sData.items || [];
      setAllStreets(streetList);
      sessionStorage.setItem(STREET_KEY, JSON.stringify(streetList.map(s => s.name)));

      // Sync name for the selected trust
      if (selectedTrust) {
        const t = trustList.find(x => x.id === selectedTrust);
        if (t) setSelectedTrustName(t.name);
      } else if (trustList.length > 0) {
        setSelectedTrust(trustList[0].id);
        setSelectedTrustName(trustList[0].name);
      }
    } catch (error) { 
      console.error("Failed to fetch initial report metadata:", error); 
    }
  };

  // Reset searches when dropdowns close
  useEffect(() => { if (!showStreetDropdown) { setStreetSearch(''); setStreetPage(1); } }, [showStreetDropdown]);

  useEffect(() => { if (!showCategoryDropdown) setCategorySearch(''); }, [showCategoryDropdown]);

  const handleGenerateReport = async () => {
    if (!selectedTrust) return;
    setLoading(true);
    try {
      // 1. Try to load from cache first using current filters ONLY if we're not explicitly updating/refreshing
      if (!reportGenerated) {
        const wasCached = await loadCachedReport(true);
        if (wasCached) {
          console.log("✅ Using existing backend cache.");
          return;
        }
      }
      
      // 2. Otherwise (or if cache doesn't exist/we are updating), generate fresh
      console.log("🚀 Generating/Updating fresh report...");
      const streetParam = selectedStreets.length > 0 ? `&streets=${encodeURIComponent(selectedStreets.join(','))}` : '';
      const genderParam = selectedGender !== 'All' ? `&gender=${selectedGender}` : '';
      const catParam = selectedCategories.length > 0 ? `&categories=${encodeURIComponent(selectedCategories.join(','))}` : '';
      const dateParam = (fromDate ? `&from_date=${fromDate}` : '') + (toDate ? `&to_date=${toDate}` : '');
      
      const res = await fetch(`${API_ENDPOINTS.REPORTS.GENERATE}?trust_id=${selectedTrust}&hijri_year=${selectedYear}${genderParam}${streetParam}${catParam}${dateParam}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const result = await res.json();
        setReportData(result.data);
        setCategories(result.categories);
        setSummary(result.summary);
        setReportGenerated(true);
        setLastGenerated(result.last_generated);

        sessionStorage.setItem('reports_cached_data', JSON.stringify(result.data));
        sessionStorage.setItem('reports_cached_categories', JSON.stringify(result.categories));
        sessionStorage.setItem('reports_cached_summary', JSON.stringify(result.summary));
      }
    } catch (error) {
      console.error("Error in report workflow:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearReportCache = async () => {
    setLoading(true);
    try {
      console.log("🧹 Sending request to clear report cache...");
      const res = await fetch(API_ENDPOINTS.REPORTS.CLEAR, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        // Reset all frontend state
        setSelectedTrust('');
        setSelectedTrustName('');
        setSelectedYear('');
        setSelectedGender('All');
        setSelectedStreets([]);
        setSelectedCategories([]);
        setFromDate('');
        setToDate('');
        setReportData([]);
        setCategories([]);
        setSummary(null);
        setReportGenerated(false);
        setLastGenerated(null);
        
        // Clear session storage
        sessionStorage.setItem('reports_selected_trust', '');
        sessionStorage.setItem('reports_selected_trust_name', '');
        sessionStorage.setItem('reports_selected_year', '');
        sessionStorage.setItem('reports_selected_gender', 'All');
        sessionStorage.setItem('reports_selected_streets', JSON.stringify([]));
        sessionStorage.setItem('reports_selected_categories', JSON.stringify([]));
        sessionStorage.setItem('reports_selected_from_date', '');
        sessionStorage.setItem('reports_selected_to_date', '');
        
        sessionStorage.removeItem('reports_cached_data');
        sessionStorage.removeItem('reports_cached_categories');
        sessionStorage.removeItem('reports_cached_summary');
        sessionStorage.removeItem('reports_cached_last_generated');
        sessionStorage.removeItem('reports_cached_generated_flag');
        
        setShowFilters(false);
      } else {
        console.error("Backend failed to clear report cache.");
      }
    } catch (err) {
      console.error("Error clearing report cache:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = reportData.filter(row => 
    row.donor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.door_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.street.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const scrollContainer = (ref, direction) => {
    if (ref.current) {
      const scrollAmount = 200;
      ref.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleExportClick = () => {
    const trust = trusts.find(t => t.id === selectedTrust);
    const trustPart = trust ? trust.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
    const yearPart = selectedYear ? selectedYear : '';
    
    let base = 'donation_report';
    if (trustPart) base += `_${trustPart}`;
    if (yearPart) base += `_${yearPart}`;
    
    // Add Dates
    if (fromDate) base += `_from_${fromDate}`;
    if (toDate) base += `_to_${toDate}`;
    
    setExportFilename(base);
    setShowExportModal(true);
  };

  const exportToExcel = async () => {
    setShowExportModal(false);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Donation Report');

    // 1. Setup Columns (MATCHES IMPORT MODEL)
    const columns = [
      { header: 'DONOR NAME', key: 'donor_name', width: 25 },
      { header: 'DOOR NO', key: 'door_no', width: 12 },
      { header: 'STREET', key: 'street', width: 20 },
      { header: 'MOBILE', key: 'mobile', width: 15 },
      { header: 'GENDER', key: 'gender', width: 10 },
      { header: 'HIJRI YEAR', key: 'hijri_year', width: 12 },
      { header: 'TRUST NAME', key: 'trust_name', width: 25 },
      { header: 'TOTAL', key: 'total', width: 15 },
    ];

    categories.forEach(cat => {
      columns.push({ header: cat.name.toUpperCase(), key: cat.id, width: 15 });
    });

    worksheet.columns = columns;

    // 2. Insert Filter Summary Rows at the very top (above headers)
    const trustName = trusts.find(t => t.id === selectedTrust)?.name || 'All Trusts';
    const summaryRows = [
      [`REPORT FILTERS: ${trustName}`],
      [`Year: ${selectedYear || 'All'}`, `Gender: ${selectedGender}`, `From: ${fromDate || 'N/A'}`, `To: ${toDate || 'N/A'}`],
      [`Generated At: ${new Date().toLocaleString()}`],
      [] // Spacer
    ];

    worksheet.insertRows(1, summaryRows);
    
    // Merge cells for the first summary row
    worksheet.mergeCells('A1:H1');
    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(2).font = { italic: true };

    // 3. Add TOTALS Row (Now Row 6 because we inserted 4 rows + 1 original header)
    const totalsData = {
      donor_name: 'TOTALS',
      door_no: '',
      street: '',
      mobile: '',
      gender: '',
      hijri_year: '',
      trust_name: '',
      total: summary.grand_total
    };

    categories.forEach(cat => {
      totalsData[cat.id] = summary.categories[cat.id] || 0;
    });

    const totalsRow = worksheet.addRow(totalsData);
    
    // 3. Add Donor rows
    filteredData.forEach(row => {
      worksheet.addRow(row);
    });

    // 4. Styling

    // Style Header Row (Now Row 5)
    const headerRow = worksheet.getRow(5);
    headerRow.height = 35;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF8B5CF6' } // Your primary violet color
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Style Totals Row (Now Row 6)
    totalsRow.height = 25;
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' } // Light gray
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Style Data Rows
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= 6) return; // Skip filter summary (1-4), header (5), and totals (6)
      
      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: colNumber === 1 ? 'left' : 'center' // Donor Name left-aligned, others centered
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        // Currency formatting for total and category amounts
        if (colNumber >= 5) {
          cell.numFmt = '#,##0.00';
        }
      });
    });

    // 5. Generate and Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportFilename || 'donation_report'}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };


  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.mainTitle}>Donation Reports</h1>
          <div className={styles.filterContainer}>
        <div className={styles.filterBar}>
          <div className={styles.trustSelectWrapper}>
             <TrustSelect 
               value={selectedTrust}
               onChange={(val) => {
                 setSelectedTrust(val);
                 sessionStorage.setItem('reports_selected_trust', val);
                 const tList = JSON.parse(sessionStorage.getItem(TRUST_KEY) || '[]');
                 const t = tList.find(x => x.id === val);
                 if (t) {
                   setSelectedTrustName(t.name);
                   sessionStorage.setItem('reports_selected_trust_name', t.name);
                 } else {
                   setSelectedTrustName('');
                   sessionStorage.setItem('reports_selected_trust_name', '');
                 }
               }}
               placeholder="Select Trust"
             />
          </div>

          <div className={styles.filterBarActions}>
            <button 
              type="button" 
              className={`${styles.filterToggleBtn} ${showFilters || getActiveFiltersCount() > 0 ? styles.activeFilterBtn : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} />
              <span>Filters</span>
              {getActiveFiltersCount() > 0 && (
                <span className={styles.filterBadge}>{getActiveFiltersCount()}</span>
              )}
              <ChevronDown size={14} className={`${styles.chevronIcon} ${showFilters ? styles.chevronOpen : ''}`} />
            </button>

            <button 
              className={styles.generateBtn} 
              onClick={handleGenerateReport} 
              disabled={loading || !selectedTrust}
            >
              {loading ? <Loader2 size={16} className={styles.spin} /> : <Filter size={16} />}
              <span>{reportGenerated ? 'Update Report' : 'Generate Report'}</span>
            </button>
            
            <button 
              className={styles.exportBtn} 
              onClick={handleExportClick} 
              disabled={loading || reportData.length === 0}
            >
              <FileSpreadsheet size={16} />
              <span>Export</span>
            </button>

            <button 
              type="button" 
              className={styles.resetBtn} 
              onClick={handleClearReportCache}
              disabled={loading}
            >
              {loading ? <Loader2 size={14} className={styles.spin} style={{ marginRight: '6px' }} /> : null}
              Clear Cache
            </button>
          </div>
        </div>

        {showFilters && (
          <div className={styles.filterDropdownPanel}>
            <div className={styles.dropdownGrid}>
              <div className={styles.gridField}>
                <label>Hijri Year</label>
                <input 
                  type="text" 
                  placeholder="e.g. 1447" 
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    sessionStorage.setItem('reports_selected_year', e.target.value);
                  }}
                />
              </div>

              <div className={styles.gridField}>
                <label>Gender</label>
                <div className={styles.selectWrapper}>
                  <select 
                    value={selectedGender} 
                    onChange={(e) => {
                      setSelectedGender(e.target.value);
                      sessionStorage.setItem('reports_selected_gender', e.target.value);
                    }}
                  >
                    <option value="All">All Genders</option>
                    <option value="M">Male Only</option>
                    <option value="F">Female Only</option>
                  </select>
                  <ChevronDown size={14} className={styles.chevron} />
                </div>
              </div>

              <div className={styles.gridField}>
                <label>Streets</label>
                <div className={styles.multiSelectContainer}>
                  <div 
                    className={styles.multiSelectTrigger}
                    onClick={() => setShowStreetDropdown(!showStreetDropdown)}
                  >
                    <span>
                      {selectedStreets.length === 0 
                        ? "All Streets" 
                        : `${selectedStreets.length} Streets`}
                    </span>
                    <ChevronDown size={14} />
                  </div>
                  
                  {showStreetDropdown && (
                    <div className={styles.multiSelectDropdown} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.dropdownHeader}>
                        <span>Filter by Streets</span>
                        <button onClick={() => {
                          setSelectedStreets([]);
                          sessionStorage.setItem('reports_selected_streets', JSON.stringify([]));
                        }}>Clear</button>
                      </div>
                      
                      <div className={styles.dropdownSearch}>
                        <input 
                          type="text" 
                          placeholder="Search streets..." 
                          value={streetSearch}
                          onChange={(e) => {
                            setStreetSearch(e.target.value);
                            setStreetPage(1);
                          }}
                          autoFocus
                        />
                      </div>

                      <div className={styles.dropdownList}>
                        {selectedStreets.length > 0 && !streetSearch && (
                          <div className={styles.pinnedSection}>
                             <div className={styles.sectionLabel}>Selected</div>
                             {selectedStreets.map(sn => (
                               <label key={`pinned-${sn}`} className={styles.checkItem}>
                                 <input 
                                   type="checkbox"
                                   checked={true}
                                   onChange={() => {
                                     const updated = selectedStreets.filter(x => x !== sn);
                                     setSelectedStreets(updated);
                                     sessionStorage.setItem('reports_selected_streets', JSON.stringify(updated));
                                   }}
                                 />
                                 <span>{sn}</span>
                               </label>
                             ))}
                             <div className={styles.divider}></div>
                          </div>
                        )}

                        {allStreets
                          .filter(s => !selectedStreets.includes(s.name))
                          .map(s => (
                            <label key={s.id} className={styles.checkItem}>
                              <input 
                                type="checkbox"
                                checked={selectedStreets.includes(s.name)}
                                onChange={(e) => {
                                  let updated;
                                  if (e.target.checked) {
                                    updated = [...selectedStreets, s.name];
                                  } else {
                                    updated = selectedStreets.filter(x => x !== s.name);
                                  }
                                  setSelectedStreets(updated);
                                  sessionStorage.setItem('reports_selected_streets', JSON.stringify(updated));
                                }}
                              />
                              <span>{s.name}</span>
                            </label>
                          ))}
                        
                        {hasMoreStreets && (
                          <button 
                            className={styles.miniLoadMore}
                            onClick={() => setStreetPage(prev => prev + 1)}
                            disabled={loadingStreets}
                          >
                            {loadingStreets ? "..." : "Load More"}
                          </button>
                        )}

                        <label className={styles.checkItem}>
                          <input 
                            type="checkbox"
                            checked={selectedStreets.includes('OTHER_STREETS')}
                            onChange={(e) => {
                              let updated;
                              if (e.target.checked) {
                                updated = [...selectedStreets, 'OTHER_STREETS'];
                              } else {
                                updated = selectedStreets.filter(x => x !== 'OTHER_STREETS');
                              }
                              setSelectedStreets(updated);
                              sessionStorage.setItem('reports_selected_streets', JSON.stringify(updated));
                            }}
                          />
                          <span className={styles.otherLabel}>Others (Not in list)</span>
                        </label>
                      </div>
                      <div className={styles.dropdownFooter}>
                        <button onClick={() => setShowStreetDropdown(false)}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.gridField}>
                <label>Categories</label>
                <div className={styles.multiSelectContainer}>
                  <div 
                    className={styles.multiSelectTrigger}
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  >
                    <span>
                      {selectedCategories.length === 0 
                        ? "All Categories" 
                        : `${selectedCategories.length} Categories`}
                    </span>
                    <ChevronDown size={14} />
                  </div>
                  
                  {showCategoryDropdown && (
                    <div className={styles.multiSelectDropdown} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.dropdownHeader}>
                        <span>Filter by Categories</span>
                        <button onClick={() => {
                          setSelectedCategories([]);
                          sessionStorage.setItem('reports_selected_categories', JSON.stringify([]));
                        }}>Clear</button>
                      </div>
                      
                      <div className={styles.dropdownSearch}>
                        <input 
                          type="text" 
                          placeholder="Search categories..." 
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          autoFocus
                        />
                      </div>

                      <div className={styles.dropdownList}>
                        {selectedCategories.length > 0 && !categorySearch && (
                          <div className={styles.pinnedSection}>
                             <div className={styles.sectionLabel}>Selected</div>
                             {selectedCategories.map(cid => {
                               const c = allCategoriesList.find(x => x.id === cid);
                               return (
                                 <label key={`pinned-cat-${cid}`} className={styles.checkItem}>
                                   <input 
                                     type="checkbox"
                                     checked={true}
                                     onChange={() => {
                                       const updated = selectedCategories.filter(x => x !== cid);
                                       setSelectedCategories(updated);
                                       sessionStorage.setItem('reports_selected_categories', JSON.stringify(updated));
                                     }}
                                   />
                                   <span>{c?.name || cid}</span>
                                 </label>
                               );
                             })}
                             <div className={styles.divider}></div>
                          </div>
                        )}

                        {allCategoriesList
                          .filter(c => !selectedCategories.includes(c.id))
                          .map(cat => (
                            <label key={cat.id} className={styles.checkItem}>
                              <input 
                                type="checkbox"
                                checked={selectedCategories.includes(cat.id)}
                                onChange={(e) => {
                                  let updated;
                                  if (e.target.checked) {
                                    updated = [...selectedCategories, cat.id];
                                  } else {
                                    updated = selectedCategories.filter(x => x !== cat.id);
                                  }
                                  setSelectedCategories(updated);
                                  sessionStorage.setItem('reports_selected_categories', JSON.stringify(updated));
                                }}
                              />
                              <span>{cat.name}</span>
                            </label>
                          ))}
                        
                        {hasMoreCategories && (
                          <button 
                            className={styles.miniLoadMore}
                            onClick={() => setCategoryPage(prev => prev + 1)}
                            disabled={loadingCategories}
                          >
                            {loadingCategories ? "..." : "Load More"}
                          </button>
                        )}
                      </div>
                      <div className={styles.dropdownFooter}>
                        <button onClick={() => setShowCategoryDropdown(false)}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.gridField}>
                <label>From Date</label>
                <input 
                  type="date" 
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    sessionStorage.setItem('reports_selected_from_date', e.target.value);
                  }}
                />
              </div>
  
              <div className={styles.gridField}>
                <label>To Date</label>
                <input 
                  type="date" 
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    sessionStorage.setItem('reports_selected_to_date', e.target.value);
                  }}
                />
              </div>
            </div>

            <div className={styles.dropdownActions}>
              <button 
                type="button" 
                className={styles.applyBtn}
                onClick={() => {
                  setShowFilters(false);
                }}
              >
                Apply Filters
              </button>
              <button 
                type="button" 
                className={styles.cancelBtn}
                onClick={() => setShowFilters(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Applied Filters Ribbon */}
        {getActiveFiltersCount() > 0 && (
          <div className={styles.appliedRibbon}>
            <span className={styles.ribbonTitle}>Applied Filters:</span>
            <div className={styles.ribbonTags}>
              {selectedYear && (
                <span className={styles.filterTag}>
                  Year: {selectedYear}
                  <button type="button" onClick={() => clearFilter('year')}>×</button>
                </span>
              )}
              {selectedGender && selectedGender !== 'All' && (
                <span className={styles.filterTag}>
                  Gender: {selectedGender === 'M' ? 'Male' : 'Female'}
                  <button type="button" onClick={() => clearFilter('gender')}>×</button>
                </span>
              )}
              {selectedStreets.length > 0 && (
                <span className={styles.filterTag}>
                  Streets: {selectedStreets.length} selected
                  <button type="button" onClick={() => clearFilter('streets')}>×</button>
                </span>
              )}
              {selectedCategories.length > 0 && (
                <span className={styles.filterTag}>
                  Categories: {selectedCategories.length} selected
                  <button type="button" onClick={() => clearFilter('categories')}>×</button>
                </span>
              )}
              {fromDate && (
                <span className={styles.filterTag}>
                  From: {fromDate}
                  <button type="button" onClick={() => clearFilter('fromDate')}>×</button>
                </span>
              )}
              {toDate && (
                <span className={styles.filterTag}>
                  To: {toDate}
                  <button type="button" onClick={() => clearFilter('toDate')}>×</button>
                </span>
              )}
              <button 
                type="button" 
                className={styles.clearAllTagsBtn}
                onClick={() => {
                  setSelectedYear('');
                  setSelectedGender('All');
                  setSelectedStreets([]);
                  setSelectedCategories([]);
                  setFromDate('');
                  setToDate('');
                  sessionStorage.setItem('reports_selected_year', '');
                  sessionStorage.setItem('reports_selected_gender', 'All');
                  sessionStorage.setItem('reports_selected_streets', JSON.stringify([]));
                  sessionStorage.setItem('reports_selected_categories', JSON.stringify([]));
                  sessionStorage.setItem('reports_selected_from_date', '');
                  sessionStorage.setItem('reports_selected_to_date', '');
                }}
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>
      </header>

      {lastGenerated && (
        <div className={styles.metaBar}>
          <div className={styles.metaItem}>
            <TrendingUp size={14} />
            <span>Last Generated: <b>{lastGenerated}</b></span>
          </div>
          <div className={styles.metaItem}>
            <Shield size={14} />
            <span>Trust: <b>{trusts.find(t => t.id === selectedTrust)?.name}</b></span>
          </div>
          <div className={styles.metaItem}>
            <Calendar size={14} />
            <span>Year: <b>{selectedYear || 'All Time'}</b></span>
          </div>
          <div className={styles.metaItem}>
            <Users size={14} />
            <span>Gender: <b>{selectedGender === 'All' ? 'All Genders' : (selectedGender === 'M' ? 'Male' : 'Female')}</b></span>
          </div>
          {fromDate && (
            <div className={styles.metaItem}>
              <TrendingUp size={14} />
              <span>From: <b>{fromDate}</b></span>
            </div>
          )}
          {toDate && (
            <div className={styles.metaItem}>
              <TrendingUp size={14} />
              <span>To: <b>{toDate}</b></span>
            </div>
          )}
          {selectedStreets.length > 0 && (
            <div className={styles.metaItem}>
              <MapPin size={14} />
              <span>Streets: <b>{selectedStreets.length} selected</b></span>
            </div>
          )}
          {selectedCategories.length > 0 && (
            <div className={styles.metaItem}>
              <PieChart size={14} />
              <span>Categories: <b>{selectedCategories.length} selected</b></span>
            </div>
          )}
        </div>
      )}

      {summary && (
        <section className={styles.summaryBar}>
          <div className={styles.grandTotalInfo}>
            <span className={styles.totalLabel}>Total Donation Collected</span>
            <span className={styles.totalValue}>₹{summary.grand_total.toLocaleString()}</span>
          </div>
          <div className={styles.categorySplitArea}>
            <div className={styles.splitHeader}>Category Breakdown</div>
            <div className={styles.summaryScrollWrapper}>
              <button 
                type="button"
                className={styles.summaryScrollBtn} 
                onClick={() => scrollContainer(summaryRowRef, 'left')}
                title="Scroll Left"
              >
                <ChevronLeft size={16} />
              </button>

              <div className={styles.categoryRow} ref={summaryRowRef}>
                {categories.map(cat => (
                  <div key={cat.id} className={styles.catCard}>
                    <span className={styles.catCardName}>{cat.name}</span>
                    <span className={styles.catCardValue}>₹{(summary.categories[cat.id] || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <button 
                type="button"
                className={styles.summaryScrollBtn} 
                onClick={() => scrollContainer(summaryRowRef, 'right')}
                title="Scroll Right"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
      )}



      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Filter by name, door no, or street..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className={styles.rowCount}>
            Showing {filteredData.length} donors
          </div>
        </div>

        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.loader}>
              <Loader2 size={40} className={styles.spin} />
              <p>Generating detailed report...</p>
            </div>
          ) : !reportGenerated ? (
            <div className={styles.empty}>
              <Filter size={48} />
              <p>Please select filters and click <b>Generate Report</b> to view data.</p>
            </div>
          ) : reportData.length === 0 ? (
            <div className={styles.empty}>
              <Users size={48} />
              <p>No donation data found for the selected filters.</p>
            </div>
          ) : (
            <table className={styles.reportTable}>
              <thead>
                <tr>
                  <th className={styles.stickyCol}>Donor Name</th>
                  <th>Door No</th>
                  <th>Street</th>
                  <th>Mobile</th>
                  <th>Gender</th>
                  <th>Year</th>
                  <th>Trust</th>
                  <th className={styles.totalCol}>Total</th>
                  {categories.map(cat => (
                    <th key={cat.id}>{cat.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map(row => (
                  <tr key={row.id}>
                    <td className={styles.stickyCol}>{row.donor_name}</td>
                    <td>{row.door_no}</td>
                    <td>{row.street}</td>
                    <td>{row.mobile}</td>
                    <td>{row.gender}</td>
                    <td>{row.hijri_year}</td>
                    <td>{row.trust_name}</td>
                    <td className={styles.totalCol}>₹{row.total.toLocaleString()}</td>
                    {categories.map(cat => (
                      <td key={cat.id} className={row[cat.id] > 0 ? styles.hasValue : styles.emptyValue}>
                        {row[cat.id] > 0 ? `₹${row[cat.id].toLocaleString()}` : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>

            </table>

          )}
        </div>
      </div>

      {showExportModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.exportModal}>
            <div className={styles.modalHeader}>
              <FileSpreadsheet className={styles.modalIcon} />
              <h3>Export Report</h3>
            </div>
            <div className={styles.modalBody}>
              <label>Filename</label>
              <div className={styles.filenameInputWrapper}>
                <input 
                  type="text" 
                  value={exportFilename} 
                  onChange={(e) => setExportFilename(e.target.value)}
                  placeholder="Enter filename"
                  autoFocus
                />
                <span className={styles.extension}>.xlsx</span>
              </div>
              <p className={styles.modalHelp}>
                Choose a name for your Excel file. We've prefilled it based on your filters.
              </p>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowExportModal(false)}>
                Cancel
              </button>
              <button className={styles.confirmExportBtn} onClick={exportToExcel}>
                Download Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;