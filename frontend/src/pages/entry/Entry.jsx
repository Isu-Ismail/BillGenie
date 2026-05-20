import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  UserPlus, 
  Save, 
  PlusCircle, 
  AlertCircle,
  Users,
  User,
  ChevronDown,
  X,
  Upload,
  FileJson,
  MapPin,
  Phone,
  CheckCircle,
  Search,
  Loader2
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import styles from './Entry.module.css';
import DonorSearch from './DonorSearch';
import { API_ENDPOINTS, getAuthHeaders } from '../../api';
import SingleEntry from './tabs/SingleEntry/SingleEntry';
import ConfirmModal from '../../components/ConfirmModal';
import StreetSelect from './StreetSelect';

const Entry = () => {
  const userJson = localStorage.getItem('user');
  const userId = userJson ? JSON.parse(userJson)?.id : 'default';
  const TRUST_KEY = `global_cached_trusts_${userId}`;
  const CAT_KEY = `global_cached_categories_${userId}`;
  const STREET_KEY = `global_cached_streets_${userId}`;
  const DONOR_KEY = `global_cached_donors_${userId}`;

  // Cache validation / namespacing
  useEffect(() => {
    const CACHE_VERSION = `v2.2_${window.location.origin}`;
    const savedVersion = localStorage.getItem('billgenie_cache_version');
    if (savedVersion !== CACHE_VERSION) {
      console.log("♻️ Data source or version change detected. Resetting local caches...");
      sessionStorage.removeItem(TRUST_KEY);
      sessionStorage.removeItem(CAT_KEY);
      sessionStorage.removeItem('entry_trust_category_cache');
      sessionStorage.removeItem(STREET_KEY);
      sessionStorage.removeItem(DONOR_KEY);
      localStorage.setItem('billgenie_cache_version', CACHE_VERSION);
    }
  }, [userId]);


  const [trusts, setTrusts] = useState(() => {
    const saved = sessionStorage.getItem(TRUST_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [categories, setCategories] = useState(() => {
    const saved = sessionStorage.getItem(CAT_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Always fetch fresh master data in background, but don't block if we have cache
      const fetchPromise = fetchData();
      
      if (trusts.length === 0 || categories.length === 0) {
        await fetchPromise;
      }
      
      // 2. Fetch categories for the pre-filled trust
      if (entries[0]?.trust_id) {
        fetchGroupedCategories(entries[0].trust_id, 0);
      }
    };
    init();
  }, []);

  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Modal states
  const [showImportModal, setShowImportModal] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [importLogs, setImportLogs] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger',
    confirmText: 'Confirm'
  });
  const fileInputRef = useRef(null);

  const handleProcessDirectJson = async () => {
    try {
      const json = JSON.parse(directJson);
      const donorsToImport = Array.isArray(json) ? json : [json];
      
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.DONORS.BATCH_CREATE, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(donorsToImport)
      });

      if (response.ok) {
        await fetchData(); // Refresh donors list
        setShowImportModal(false);
        setDirectJson('');
        setMessage({ type: 'success', text: `Successfully imported ${donorsToImport.length} donors!` });
      } else {
        throw new Error('Failed to import donors');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Invalid JSON format: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  // Load prefilled values from localStorage
  const getPrefilledValue = (key, defaultVal = '') => {
    return localStorage.getItem(`entry_prefill_${key}`) || defaultVal;
  };

  // Initial state for a single entry
  const emptyItem = { category_id: '', category_name: '', amount: '' };
  const emptyDonorEntry = {
    donor_id: '',
    trust_id: getPrefilledValue('trust_id'),
    hijri_year: getPrefilledValue('hijri_year'),
    payment_date: getPrefilledValue('payment_date', new Date().toISOString().split('T')[0]),
    notes: '',
    items: [{ ...emptyItem }],
    isCollapsed: false
  };

  const [entries, setEntries] = useState([{ ...emptyDonorEntry }]);

  const handleToggleCollapse = (index) => {
    setEntries(prev => prev.map((entry, i) => 
      i === index ? { ...entry, isCollapsed: !entry.isCollapsed } : entry
    ));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl + Shift + N for New Donor
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addDonorRow();
      }
      
      // Ctrl + Shift + S for Save
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSubmit(new Event('submit'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entries, categories]); // Need entries for addDonorRow logic

  // Save prefilled values whenever they change
  useEffect(() => {
    if (entries[0]) {
      if (entries[0].trust_id) localStorage.setItem('entry_prefill_trust_id', entries[0].trust_id);
      if (entries[0].hijri_year) localStorage.setItem('entry_prefill_hijri_year', entries[0].hijri_year);
      if (entries[0].payment_date) localStorage.setItem('entry_prefill_payment_date', entries[0].payment_date);
    }
  }, [entries[0]?.trust_id, entries[0]?.hijri_year, entries[0]?.payment_date]);



  const getTrustCategoryCache = () => {
    const saved = sessionStorage.getItem('entry_trust_category_cache');
    return saved ? JSON.parse(saved) : {};
  };

  const saveTrustCategoryCache = (cache) => {
    sessionStorage.setItem('entry_trust_category_cache', JSON.stringify(cache));
  };

  const fetchGroupedCategories = async (trustId, donorIndex = -1) => {
    if (!trustId) return { assigned: [], others: categories };
    
    // Check Cache
    const currentCache = getTrustCategoryCache();
    if (currentCache[trustId]) {
      const cachedData = currentCache[trustId];
      if (donorIndex !== -1) {
        setEntries(prev => {
          const newEntries = [...prev];
          if (newEntries[donorIndex]) {
            newEntries[donorIndex].items = cachedData.assigned.map(cat => ({
              category_id: cat.id,
              category_name: cat.name,
              amount: '',
              isAssigned: true
            }));
          }
          return newEntries;
        });
      }
      return cachedData;
    }

    try {
      const res = await fetch(`${API_ENDPOINTS.CATEGORIES.BY_TRUST(trustId)}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        
        // Update Session Cache
        const updatedCache = { ...currentCache, [trustId]: data };
        saveTrustCategoryCache(updatedCache);
        
        if (donorIndex !== -1) {
          setEntries(prev => {
            const newEntries = [...prev];
            if (newEntries[donorIndex]) {
              newEntries[donorIndex].items = data.assigned.map(cat => ({
                category_id: cat.id,
                category_name: cat.name,
                amount: '',
                isAssigned: true
              }));
            }
            return newEntries;
          });
        }
        return data;
      }
    } catch (error) {
      console.error("Error fetching grouped categories:", error);
    }
    return { assigned: [], others: categories };
  };

  const fetchData = async () => {
    try {
      const [catRes, trustRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.CATEGORIES.BASE}?per_page=500`, { headers: getAuthHeaders() }),
        fetch(`${API_ENDPOINTS.TRUSTS.BASE}?per_page=500`, { headers: getAuthHeaders() })
      ]);
      
      if (catRes.ok) {
        const catData = await catRes.json();
        const cats = catData.items || [];
        setCategories(cats);
        sessionStorage.setItem(CAT_KEY, JSON.stringify(cats));
      }
      
      if (trustRes.ok) {
        const trustData = await trustRes.json();
        const trustList = trustData.items || [];
        setTrusts(trustList);
        sessionStorage.setItem(TRUST_KEY, JSON.stringify(trustList));
        
        // Auto-select first trust if none selected
        if (trustList.length > 0 && !entries[0].trust_id) {
          const firstTrustId = trustList[0].id;
          const newEntries = [...entries];
          newEntries[0].trust_id = firstTrustId;
          setEntries(newEntries);
          fetchGroupedCategories(firstTrustId, 0);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };


  const downloadExcelTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Import Template');

    // Setup Columns matching Report Export + new features
    const columns = [
      { header: 'DONOR NAME', key: 'donor_name', width: 25 },
      { header: 'DOOR NO', key: 'door_no', width: 12 },
      { header: 'STREET', key: 'street', width: 20 },
      { header: 'MOBILE', key: 'mobile', width: 15 },
      { header: 'GENDER', key: 'gender', width: 10 },
      { header: 'HIJRI YEAR', key: 'hijri_year', width: 12 },
      { header: 'TRUST NAME', key: 'trust_name', width: 25 },
    ];

    categories.forEach(cat => {
      columns.push({ header: cat.name.toUpperCase(), key: cat.id, width: 15 });
    });

    worksheet.columns = columns;

    // Add TOTALS Row (as requested, same as report export)
    const totalsData = {
      donor_name: 'TOTALS',
      door_no: '',
      street: '',
      mobile: '',
      gender: '',
      hijri_year: '',
      trust_name: ''
    };

    categories.forEach(cat => {
      totalsData[cat.id] = 0;
    });
    worksheet.addRow(totalsData);

    // Style Header
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Generate and Save
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `BillGenie_Import_Template_${new Date().getFullYear()}.xlsx`);
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    setLoading(true);
    setImportProgress(0);
    setImportStatus('Preparing upload...');
    setImportLogs([]);
    setMessage({ type: '', text: '' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('trust_id', entries[0]?.trust_id || '');
    formData.append('hijri_year', entries[0]?.hijri_year || '1446');

    try {
      const headers = getAuthHeaders();
      delete headers['Content-Type'];

      const response = await fetch(API_ENDPOINTS.TRANSACTIONS.IMPORT_EXCEL, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed with status code ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep the last partial line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.event === 'progress') {
              setImportProgress(data.percentage || 0);
              setImportStatus(data.message);
              setImportLogs(prev => [...prev, data.message]);
            } else if (data.event === 'row') {
              setImportProgress(data.percentage || 0);
              setImportStatus(`Processing: row ${data.current} of ${data.total}`);
              setImportLogs(prev => [...prev, data.message]);
            } else if (data.event === 'complete') {
              setImportProgress(100);
              setImportStatus(data.message);
              setImportLogs(prev => [...prev, `🎉 ${data.message}`]);
              
              // Refresh master data (trusts, categories)
              await fetchData();
              
              // Clear specific caches to force re-fetch
              const userJson = localStorage.getItem('user');
              const userId = userJson ? JSON.parse(userJson)?.id : 'default';
              sessionStorage.removeItem('entry_trust_category_cache');
              sessionStorage.removeItem(`global_cached_streets_${userId}`);
            } else if (data.event === 'error') {
              throw new Error(data.message);
            }
          } catch (jsonErr) {
            console.error("NDJSON Parse error:", jsonErr, "on line:", line);
          }
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      setImportStatus(`Error: ${error.message}`);
      setImportLogs(prev => [...prev, `❌ Error: ${error.message}`]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportJSON = async (e) => {

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const donorsToImport = Array.isArray(json) ? json : [json];
        
        setLoading(true);
        const response = await fetch(API_ENDPOINTS.DONORS.BATCH_CREATE, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(donorsToImport)
        });

        if (response.ok) {
          await fetchData(); // Refresh donors list
          setShowImportModal(false);
          sessionStorage.removeItem(STREET_KEY);
          setMessage({ type: 'success', text: `Successfully imported ${donorsToImport.length} donors!` });
        } else {
          throw new Error('Failed to import donors');
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Invalid JSON file or import failed: ' + error.message });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const [shouldCopyDetails, setShouldCopyDetails] = useState(true);

  const addDonorRow = async () => {
    const lastEntry = entries[entries.length - 1];
    let newItems = [{ ...emptyItem }];

    if (shouldCopyDetails && lastEntry && lastEntry.trust_id) {
      // Use Session Cache to populate items if trust is copied
      const currentCache = getTrustCategoryCache();
      const cached = currentCache[lastEntry.trust_id];
      if (cached && cached.assigned.length > 0) {
        newItems = cached.assigned.map(cat => ({
          category_id: cat.id,
          category_name: cat.name,
          amount: '',
          isAssigned: true
        }));
      }
    }

    const newEntry = { 
      ...emptyDonorEntry, 
      items: newItems,
      isCollapsed: false
    };

    if (shouldCopyDetails && lastEntry) {
      newEntry.trust_id = lastEntry.trust_id;
      newEntry.hijri_year = lastEntry.hijri_year;
      newEntry.payment_date = lastEntry.payment_date;
    }

    setEntries(prev => prev.map(e => ({ ...e, isCollapsed: true })).concat(newEntry));
  };

  const removeDonorRow = (index) => {
    if (entries.length > 1) {
      setConfirmModal({
        isOpen: true,
        title: "Remove Donor?",
        message: "Are you sure you want to remove this donor entry? All entered amounts for this donor will be lost.",
        confirmText: "Remove",
        type: "danger",
        onConfirm: () => {
          setEntries(prev => prev.filter((_, i) => i !== index));
        }
      });
    }
  };

  const addItemRow = (donorIndex) => {
    const newEntries = [...entries];
    newEntries[donorIndex].items.push({ ...emptyItem });
    setEntries(newEntries);
  };

  const removeItemRow = (donorIndex, itemIndex) => {
    const newEntries = [...entries];
    if (newEntries[donorIndex].items.length > 1) {
      newEntries[donorIndex].items = newEntries[donorIndex].items.filter((_, i) => i !== itemIndex);
      setEntries(newEntries);
    }
  };

  const handleEntryChange = (donorIndex, field, value) => {
    const newEntries = [...entries];
    newEntries[donorIndex][field] = value;
    
    // If trust selection changes, refresh categories for this specific entry
    if (field === 'trust_id') {
      fetchGroupedCategories(value, donorIndex);
    }
    
    setEntries(newEntries);
  };

  const handleItemChange = (donorIndex, itemIndex, field, value) => {
    const newEntries = [...entries];
    newEntries[donorIndex].items[itemIndex][field] = value;
    if (field === 'category_id') {
      const cat = categories.find(c => c.id === value);
      newEntries[donorIndex].items[itemIndex]['category_name'] = cat ? cat.name : '';
    }
    setEntries(newEntries);
  };

  const handleBulkItemChange = (donorIndex, startItemIndex, values) => {
    setEntries(prev => {
      const newEntries = [...prev];
      const items = [...newEntries[donorIndex].items];
      values.forEach((val, i) => {
        const targetIdx = startItemIndex + i;
        if (items[targetIdx]) {
          // Only update if it's a valid number
          const num = parseFloat(val);
          if (!isNaN(num)) {
            items[targetIdx].amount = num.toString();
          }
        }
      });
      newEntries[donorIndex].items = items;
      return newEntries;
    });
  };

  const clearDonorItems = (donorIndex) => {
    setConfirmModal({
      isOpen: true,
      title: "Clear All Fields?",
      message: "This will reset all donation amounts for this donor to zero. This action cannot be undone.",
      confirmText: "Clear All",
      type: "danger",
      onConfirm: () => {
        setEntries(prev => {
          const newEntries = [...prev];
          newEntries[donorIndex].items = newEntries[donorIndex].items.map(item => ({
            ...item,
            amount: ''
          }));
          return newEntries;
        });
      }
    });
  };

  const calculateDonorTotal = (donorIndex) => {
    return entries[donorIndex].items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    
    // Validation
    const errors = [];
    entries.forEach((entry, idx) => {
      if (!entry.donor_id) errors.push(`Donor #${idx + 1} is missing.`);
      if (!entry.trust_id) errors.push(`Trust for Donor #${idx + 1} is missing.`);
      
      const year = parseInt(entry.hijri_year);
      if (isNaN(year) || year < 1400 || year > 1500) {
        errors.push(`Donor #${idx + 1}: Hijri year must be between 1400 and 1500.`);
      }
      
      const total = entry.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
      if (total <= 0) errors.push(`Donor #${idx + 1}: Total amount must be greater than 0.`);
    });

    if (errors.length > 0) {
      setMessage({ type: 'error', text: errors[0] });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const payloads = entries.map(entry => ({
        ...entry,
        total_amount: entry.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
        items: entry.items
          .filter(item => item.category_id && item.amount)
          .map(item => {
            const cat = categories.find(c => c.id === item.category_id);
            return {
              ...item,
              category_name: cat ? cat.name : (item.category_name || '')
            };
          })
      }));

      const response = await fetch(API_ENDPOINTS.TRANSACTIONS.CREATE, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payloads)
      });

      if (!response.ok) {
        const errData = await response.json();
        let errorMsg = errData.detail || 'Failed to save entries';
        if (errorMsg.includes('validation_not_unique')) {
           errorMsg = "An organization name you entered already exists.";
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (data.status === 'conflict') {
        // Initialize resolution action to 'merge' for each conflict
        const conflictsWithResolution = data.conflicts.map(c => ({
          ...c,
          resolution: 'merge' // default action
        }));
        setConflicts(conflictsWithResolution);
        setShowConflictModal(true);
        setLoading(false);
        return;
      }

      setMessage({ type: 'success', text: 'All entries saved successfully!' });
      
      // Reset to a fresh entry but keep pre-filled values
      const freshEntry = { ...emptyDonorEntry };
      setEntries([freshEntry]);
      
      // CRITICAL: Re-fetch categories for the pre-filled trust so the form isn't empty
      if (freshEntry.trust_id) {
        fetchGroupedCategories(freshEntry.trust_id, 0);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResolveConflict = (index, action) => {
    setConflicts(prev => prev.map((c, i) => 
      i === index ? { ...c, resolution: action } : c
    ));
  };

  const submitWithResolutions = async (resolvedConflicts) => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    setShowConflictModal(false);

    try {
      const payloads = entries.map((entry, idx) => {
        const entryResolutions = resolvedConflicts
          .filter(c => c.entry_index === idx)
          .map(c => ({
            category_id: c.category_id,
            date: c.date,
            action: c.resolution
          }));

        return {
          ...entry,
          total_amount: entry.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
          items: entry.items
            .filter(item => item.category_id && item.amount)
            .map(item => {
              const cat = categories.find(c => c.id === item.category_id);
              return {
                ...item,
                category_name: cat ? cat.name : (item.category_name || '')
              };
            }),
          resolutions: entryResolutions
        };
      });

      const response = await fetch(API_ENDPOINTS.TRANSACTIONS.CREATE, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payloads)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to save entries');
      }

      const data = await response.json();
      if (data.status === 'conflict') {
        const conflictsWithResolution = data.conflicts.map(c => ({
          ...c,
          resolution: 'merge'
        }));
        setConflicts(conflictsWithResolution);
        setShowConflictModal(true);
        return;
      }

      setMessage({ type: 'success', text: 'All entries saved successfully!' });
      
      const freshEntry = { ...emptyDonorEntry };
      setEntries([freshEntry]);
      
      if (freshEntry.trust_id) {
        fetchGroupedCategories(freshEntry.trust_id, 0);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Create New Entry</h1>
          <p className={styles.subtitle}>Add donation records for one or multiple donors</p>
        </div>
        <div className={styles.headerActions}>
          <button onClick={() => setShowImportModal(true)} className={styles.importBtn}>
            <Upload size={18} /> Bulk Import
          </button>
        </div>
      </header>

      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage({ type: '', text: '' })} className={styles.closeMsg}>
            <X size={16} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.entriesList}>
          {entries.map((entry, dIndex) => (
            <SingleEntry 
              key={dIndex}
              entry={entry}
              dIndex={dIndex}
              entriesCount={entries.length}
              categories={categories}
              trusts={trusts}
              handleEntryChange={handleEntryChange}
              handleItemChange={handleItemChange}
              handleBulkItemChange={handleBulkItemChange}
              clearDonorItems={clearDonorItems}
              addItemRow={addItemRow}
              removeItemRow={removeItemRow}
              removeDonorRow={removeDonorRow}
              calculateDonorTotal={calculateDonorTotal}
              handleToggleCollapse={handleToggleCollapse}
            />
          ))}
        </div>

        <div className={styles.formActions}>
          <div className={styles.batchControls}>
            <label className={styles.continuityToggle}>
              <input 
                type="checkbox" 
                checked={shouldCopyDetails}
                onChange={(e) => setShouldCopyDetails(e.target.checked)}
              />
              <span>Auto-copy Trust/Year to new row</span>
            </label>
            <button 
              type="button" 
              onClick={addDonorRow} 
              className={styles.addBatchBtn}
              title="Add New Donor (Ctrl + Shift + N)"
            >
              <UserPlus size={18} /> Add Another Donor
            </button>
          </div>
          <button 
            type="submit" 
            className={styles.submitBtn} 
            disabled={loading}
            title="Save Records (Ctrl + Shift + S)"
          >
            {loading ? (
              <Loader2 className={styles.spin} size={20} />
            ) : (
              <Save size={20} />
            )}
            <span>{loading ? 'Saving Records...' : 'Save All Records'}</span>
          </button>
        </div>
      </form>

      {/* Import Modal */}
      {showImportModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <Upload size={24} className={styles.modalIcon} />
                <h2>Bulk Import Transactions</h2>
              </div>
              <button 
                onClick={() => {
                  setShowImportModal(false);
                  setIsImporting(false);
                  setImportLogs([]);
                }} 
                className={styles.closeBtn}
                disabled={loading}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className={styles.importContent}>
              {isImporting || importLogs.length > 0 ? (
                <div className={styles.progressContainer}>
                  <div className={styles.progressBarWrapper}>
                    <div className={styles.progressLabel}>
                      <span>{importStatus}</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div className={styles.progressBar}>
                      <div 
                        className={styles.progressFill} 
                        style={{ width: `${importProgress}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className={styles.logsConsole}>
                    <div className={styles.logsHeader}>Import Logs</div>
                    <div className={styles.logsBody}>
                      {importLogs.map((log, idx) => (
                        <div key={idx} className={styles.logLine}>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={styles.progressActions}>
                    <button 
                      onClick={() => {
                        setShowImportModal(false);
                        setIsImporting(false);
                        setImportLogs([]);
                      }} 
                      className={styles.doneBtn}
                      disabled={loading}
                    >
                      {loading ? 'Processing...' : 'Close & Refresh'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.stepCard}>
                    <div className={styles.stepNumber}>1</div>
                    <div className={styles.stepText}>
                      <h4>Download Template</h4>
                      <p>Get the correctly formatted Excel file with all your donation categories.</p>
                    </div>
                    <button onClick={downloadExcelTemplate} className={styles.templateBtn}>
                      Download Excel Template
                    </button>
                  </div>

                  <div className={styles.stepCard}>
                    <div className={styles.stepNumber}>2</div>
                    <div className={styles.stepText}>
                      <h4>Upload Spreadsheet</h4>
                      <p>Fill in the donor details and amounts, then upload it here.</p>
                    </div>
                    <div 
                      className={styles.excelDropZone}
                      onClick={() => fileInputRef.current.click()}
                    >
                      <Upload size={28} />
                      <span>Click to select Excel file</span>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImportExcel} 
                        style={{ display: 'none' }} 
                        accept=".xlsx, .xls"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className={styles.importAlert}>
                    <AlertCircle size={18} />
                    <p>Ensure the <b>Trust Organization</b> and <b>Hijri Year</b> selected on the main form are correct before importing.</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {showConflictModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <AlertCircle size={24} className={styles.modalIcon} style={{ color: '#f59e0b' }} />
                <h2>Resolve Duplicate Entries</h2>
              </div>
              <button onClick={() => setShowConflictModal(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            
            <div className={styles.conflictContent}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                One or more entries already exist for this donor, trust, and year. Please choose whether to overwrite the existing amount or merge (add) them together.
              </p>
              
              {conflicts.map((conflict, index) => (
                <div key={index} className={styles.conflictItem}>
                  <div className={styles.conflictMeta}>
                    <div className={styles.conflictDetails}>
                      <span className={styles.conflictDonor}>{conflict.donor_name}</span>
                      <span className={styles.conflictCategory}>
                        {conflict.category_name} • {conflict.date}
                      </span>
                    </div>
                    
                    <div className={styles.conflictSelector}>
                      <button
                        type="button"
                        className={`${styles.conflictOptionBtn} ${conflict.resolution === 'overwrite' ? styles.activeOverwrite : ''}`}
                        onClick={() => handleResolveConflict(index, 'overwrite')}
                        title={`Replace old amount of ₹${conflict.old_amount} with new amount of ₹${conflict.new_amount}`}
                      >
                        Overwrite (₹{conflict.new_amount})
                      </button>
                      <button
                        type="button"
                        className={`${styles.conflictOptionBtn} ${conflict.resolution === 'merge' ? styles.activeMerge : ''}`}
                        onClick={() => handleResolveConflict(index, 'merge')}
                        title={`Add new amount of ₹${conflict.new_amount} to old amount of ₹${conflict.old_amount}`}
                      >
                        Merge (₹{conflict.old_amount + conflict.new_amount})
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className={styles.modalFooter} style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setShowConflictModal(false)} className={styles.cancelBtn}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => submitWithResolutions(conflicts)}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
      />
    </div>
  );
};

export default Entry;

