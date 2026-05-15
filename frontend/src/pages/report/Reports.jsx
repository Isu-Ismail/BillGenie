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
  Shield,
  TrendingUp,
  MapPin
} from 'lucide-react';

import ExcelJS from 'exceljs';
import styles from './Reports.module.css';
import { API_ENDPOINTS } from '../../api';

const Reports = () => {
  const [reportData, setReportData] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_data');
    return saved ? JSON.parse(saved) : [];
  });
  const [categories, setCategories] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_categories');
    return saved ? JSON.parse(saved) : [];
  });
  const [trusts, setTrusts] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_trusts_list');
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
  
  // Dynamic states
  const [allStreets, setAllStreets] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_streets_list');
    return saved ? JSON.parse(saved) : [];
  });
  const [streetSearch, setStreetSearch] = useState('');
  const [streetPage, setStreetPage] = useState(1);
  const [hasMoreStreets, setHasMoreStreets] = useState(false);
  const [loadingStreets, setLoadingStreets] = useState(false);
  
  const [trustSearch, setTrustSearch] = useState('');
  const [showTrustDropdown, setShowTrustDropdown] = useState(false);
  
  const [allCategoriesList, setAllCategoriesList] = useState(() => {
    const saved = sessionStorage.getItem('reports_cached_all_categories');
    return saved ? JSON.parse(saved) : [];
  });
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  
  const [showStreetDropdown, setShowStreetDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Scroll control
  const filterRowRef = React.useRef(null);
  const summaryRowRef = React.useRef(null);
  const [isHoveringFilter, setIsHoveringFilter] = useState(false);

  useEffect(() => {
    const filterRow = filterRowRef.current;
    const summaryRow = summaryRowRef.current;

    const createWheelHandler = (row) => (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        row.scrollLeft += e.deltaY;
      }
    };

    if (filterRow) {
      const onFilterWheel = createWheelHandler(filterRow);
      filterRow.addEventListener('wheel', onFilterWheel, { passive: false });
      filterRow._onWheel = onFilterWheel;
    }

    if (summaryRow) {
      const onSummaryWheel = createWheelHandler(summaryRow);
      summaryRow.addEventListener('wheel', onSummaryWheel, { passive: false });
      summaryRow._onWheel = onSummaryWheel;
    }

    return () => {
      if (filterRow && filterRow._onWheel) filterRow.removeEventListener('wheel', filterRow._onWheel);
      if (summaryRow && summaryRow._onWheel) summaryRow.removeEventListener('wheel', summaryRow._onWheel);
    };
  }, [summary]); // Re-attach when summary (and its ref) appears

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
  }, [selectedTrust, selectedTrustName, selectedYear, selectedGender, selectedStreets, selectedCategories]);

  const [lastGenerated, setLastGenerated] = useState(sessionStorage.getItem('reports_cached_last_generated') || null);
  const [reportGenerated, setReportGenerated] = useState(sessionStorage.getItem('reports_cached_generated_flag') === 'true');

  useEffect(() => {
    // Only fetch initial data if cache is empty
    if (trusts.length === 0 || allCategoriesList.length === 0 || allStreets.length === 0) {
      fetchInitialData();
    }
  }, []);

  // Fetch streets
  useEffect(() => {
    if (showStreetDropdown) {
      loadStreets();
    }
  }, [streetSearch, streetPage, showStreetDropdown]);

  // Fetch trusts
  useEffect(() => {
    if (showTrustDropdown) {
      loadTrusts();
    }
  }, [trustSearch, showTrustDropdown]);

  // Fetch categories
  useEffect(() => {
    if (showCategoryDropdown) {
      loadCategories();
    }
  }, [categorySearch, showCategoryDropdown]);

  const loadStreets = async () => {
    setLoadingStreets(true);
    try {
      let url = `${API_ENDPOINTS.STREETS.BASE}?page=${streetPage}&per_page=20`;
      if (streetSearch) url += `&search=${encodeURIComponent(streetSearch)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const newStreets = data.items || [];
        setAllStreets(prev => {
          const base = streetPage === 1 ? [] : prev;
          const existingIds = new Set(base.map(s => s.id));
          const updated = [...base, ...newStreets.filter(s => !existingIds.has(s.id))];
          if (streetPage === 1 && !streetSearch) {
             sessionStorage.setItem('reports_cached_streets_list', JSON.stringify(updated.slice(0, 20)));
          }
          return updated;
        });
        setHasMoreStreets(data.page < Math.ceil(data.total / data.per_page));
      }
    } catch (error) { console.error(error); } finally { setLoadingStreets(false); }
  };

  const loadTrusts = async () => {
    try {
      let url = `${API_ENDPOINTS.TRUSTS.BASE}?per_page=20`;
      if (trustSearch) url += `&search=${encodeURIComponent(trustSearch)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        setTrusts(items);
        if (!trustSearch) {
          sessionStorage.setItem('reports_cached_trusts_list', JSON.stringify(items));
        }
      }
    } catch (err) { console.error(err); }
  };

  const loadCategories = async () => {
    try {
      let url = `${API_ENDPOINTS.CATEGORIES.BASE}?per_page=100`; // Standard list
      if (categorySearch) url += `&search=${encodeURIComponent(categorySearch)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        setAllCategoriesList(items);
        if (!categorySearch) {
          sessionStorage.setItem('reports_cached_all_categories', JSON.stringify(items));
        }
      }
    } catch (err) { console.error(err); }
  };

  const fetchInitialData = async () => {
    try {
      const tRes = await fetch(`${API_ENDPOINTS.TRUSTS.BASE}?per_page=20`);
      if (tRes.ok) {
        const data = await tRes.json();
        const trustList = data.items || [];
        setTrusts(trustList);
        sessionStorage.setItem('reports_cached_trusts_list', JSON.stringify(trustList));
        
        if (!selectedTrust && trustList.length > 0) {
          setSelectedTrust(trustList[0].id);
          setSelectedTrustName(trustList[0].name);
        } else if (selectedTrust) {
           const t = trustList.find(x => x.id === selectedTrust);
           if (t) setSelectedTrustName(t.name);
           else {
             const tr = await fetch(`${API_ENDPOINTS.TRUSTS.BASE}/${selectedTrust}`);
             if (tr.ok) {
               const td = await tr.json();
               setSelectedTrustName(td.name);
             }
           }
        }
      }
      
      // Also fetch first 20 categories and streets for cache
      const cRes = await fetch(`${API_ENDPOINTS.CATEGORIES.BASE}?per_page=100`);
      if (cRes.ok) {
        const data = await cRes.json();
        setAllCategoriesList(data.items || []);
        sessionStorage.setItem('reports_cached_all_categories', JSON.stringify(data.items || []));
      }
      
      const sRes = await fetch(`${API_ENDPOINTS.STREETS.BASE}?per_page=20`);
      if (sRes.ok) {
        const data = await sRes.json();
        setAllStreets(data.items || []);
        sessionStorage.setItem('reports_cached_streets_list', JSON.stringify(data.items || []));
      }

    } catch (error) { console.error(error); }
  };

  // Reset searches when dropdowns close
  useEffect(() => { if (!showStreetDropdown) { setStreetSearch(''); setStreetPage(1); } }, [showStreetDropdown]);
  useEffect(() => { if (!showTrustDropdown) setTrustSearch(''); }, [showTrustDropdown]);
  useEffect(() => { if (!showCategoryDropdown) setCategorySearch(''); }, [showCategoryDropdown]);

  const handleGenerateReport = async () => {
    if (!selectedTrust) return;
    setLoading(true);
    try {
      const streetParam = selectedStreets.length > 0 ? `&streets=${encodeURIComponent(selectedStreets.join(','))}` : '';
      const genderParam = selectedGender !== 'All' ? `&gender=${selectedGender}` : '';
      
      const res = await fetch(`${API_ENDPOINTS.REPORTS.GENERATE}?trust_id=${selectedTrust}&hijri_year=${selectedYear}${genderParam}${streetParam}`, {
        method: 'POST'
      });

      if (res.ok) {
        const result = await res.json();
        setReportData(result.data);
        setCategories(result.categories);
        setSummary(result.summary);
        setReportGenerated(true);
        setLastGenerated(result.last_generated);

        // Save to cache
        sessionStorage.setItem('reports_cached_data', JSON.stringify(result.data));
        sessionStorage.setItem('reports_cached_categories', JSON.stringify(result.categories));
        sessionStorage.setItem('reports_cached_summary', JSON.stringify(result.summary));
        sessionStorage.setItem('reports_cached_last_generated', result.last_generated);
        sessionStorage.setItem('reports_cached_generated_flag', 'true');
      }
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = reportData.filter(row => 
    row.donor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.door_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.street.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportClick = () => {
    const trust = trusts.find(t => t.id === selectedTrust);
    const trustPart = trust ? trust.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
    const yearPart = selectedYear ? selectedYear : '';
    
    let base = 'donation_report';
    if (trustPart) base += `_${trustPart}`;
    if (yearPart) base += `_${yearPart}`;
    
    // Add Gender
    if (selectedGender !== 'All') {
      base += `_${selectedGender.toLowerCase()}`;
    }

    // Add Street count if specific streets are selected
    if (selectedStreets.length > 0) {
      base += `_${selectedStreets.length}streets`;
    }

    // Add Category count if specific categories are selected
    if (selectedCategories.length > 0) {
      base += `_${selectedCategories.length}cats`;
    }
    
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

    // 2. Add TOTALS Row (Row 2)
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
    // Style Header Row
    const headerRow = worksheet.getRow(1);
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

    // Style Totals Row (Row 2)
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
      if (rowNumber <= 2) return; // Skip header and totals
      
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
        
        <div 
          className={styles.filterRow}
          ref={filterRowRef}
          onMouseEnter={() => setIsHoveringFilter(true)}
          onMouseLeave={() => setIsHoveringFilter(false)}
        >
          <div className={styles.filterGroup}>
            {/* Searchable Trust Dropdown */}
            <div className={styles.multiSelectContainer}>
              <div 
                className={styles.multiSelectTrigger}
                onClick={() => setShowTrustDropdown(!showTrustDropdown)}
              >
                <span>{selectedTrustName || 'Select Trust'}</span>
                <ChevronDown size={14} />
              </div>

              {showTrustDropdown && (
                <div className={styles.multiSelectDropdown} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.dropdownHeader}>
                    <span>Select Trust</span>
                  </div>
                  <div className={styles.dropdownSearch}>
                    <input 
                      type="text" 
                      placeholder="Search trusts..." 
                      value={trustSearch}
                      onChange={(e) => setTrustSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className={styles.dropdownList}>
                    {trusts.map(t => (
                      <div 
                        key={t.id} 
                        className={`${styles.checkItem} ${selectedTrust === t.id ? styles.itemActive : ''}`}
                        onClick={() => {
                          setSelectedTrust(t.id);
                          setSelectedTrustName(t.name);
                          setShowTrustDropdown(false);
                        }}
                      >
                        <span>{t.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className={styles.inputWrapper}>
              <input 
                type="text" 
                placeholder="Year" 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              />
            </div>
            
            <div className={styles.selectWrapper}>
              <select value={selectedGender} onChange={(e) => setSelectedGender(e.target.value)}>
                <option value="All">All Genders</option>
                <option value="M">Male Only</option>
                <option value="F">Female Only</option>
              </select>
              <ChevronDown size={14} className={styles.chevron} />
            </div>

            {/* Categories Filter */}
            <div className={styles.multiSelectContainer}>
              <div 
                className={styles.multiSelectTrigger}
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              >
                <span>
                  {selectedCategories.length === 0 
                    ? "All Categories" 
                    : `${selectedCategories.length} Categories Selected`}
                </span>
                <ChevronDown size={14} />
              </div>
              
              {showCategoryDropdown && (
                <div className={styles.multiSelectDropdown} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.dropdownHeader}>
                    <span>Filter by Categories</span>
                    <button onClick={() => setSelectedCategories([])}>Clear</button>
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
                                 onChange={() => setSelectedCategories(prev => prev.filter(x => x !== cid))}
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
                              if (e.target.checked) {
                                setSelectedCategories([...selectedCategories, cat.id]);
                              } else {
                                setSelectedCategories(selectedCategories.filter(x => x !== cat.id));
                              }
                            }}
                          />
                          <span>{cat.name}</span>
                        </label>
                    ))}
                  </div>
                  <div className={styles.dropdownFooter}>
                    <button onClick={() => setShowCategoryDropdown(false)}>Done</button>
                  </div>
                </div>
              )}
            </div>

            {/* Multi-Street Filter */}
            <div className={styles.multiSelectContainer}>
              <div 
                className={styles.multiSelectTrigger}
                onClick={() => setShowStreetDropdown(!showStreetDropdown)}
              >
                <span>
                  {selectedStreets.length === 0 
                    ? "All Streets" 
                    : `${selectedStreets.length} Streets Selected`}
                </span>
                <ChevronDown size={14} />
              </div>
              
              {showStreetDropdown && (
                <div className={styles.multiSelectDropdown} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.dropdownHeader}>
                    <span>Filter by Streets</span>
                    <button onClick={() => setSelectedStreets([])}>Clear</button>
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
                               onChange={() => setSelectedStreets(prev => prev.filter(x => x !== sn))}
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
                              if (e.target.checked) {
                                setSelectedStreets([...selectedStreets, s.name]);
                              } else {
                                setSelectedStreets(selectedStreets.filter(x => x !== s.name));
                              }
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
                          if (e.target.checked) {
                            setSelectedStreets([...selectedStreets, 'OTHER_STREETS']);
                          } else {
                            setSelectedStreets(selectedStreets.filter(x => x !== 'OTHER_STREETS'));
                          }
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

          <div className={styles.actions}>
            <button 
              className={styles.generateBtn} 
              onClick={handleGenerateReport} 
              disabled={loading || !selectedTrust}
            >
              {loading ? <Loader2 size={18} className={styles.spin} /> : <Filter size={18} />}
              {reportGenerated ? 'Update Report' : 'Generate Report'}
            </button>
            
            <button className={styles.exportBtn} onClick={handleExportClick} disabled={loading || reportData.length === 0}>
              <FileSpreadsheet size={18} /> Export
            </button>
          </div>
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
            <div className={styles.categoryRow} ref={summaryRowRef}>
              {categories.map(cat => (
                <div key={cat.id} className={styles.catCard}>
                  <span className={styles.catCardName}>{cat.name}</span>
                  <span className={styles.catCardValue}>₹{(summary.categories[cat.id] || 0).toLocaleString()}</span>
                </div>
              ))}
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