import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  MoreVertical,
  Printer,
  FileText,
  Trash2,
  Calendar,
  Edit3,
  X,
  AlertCircle,
  Save,
  Plus,
  CheckCircle,
  Clock,
  ChevronDown,
  RefreshCcw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import styles from './History.module.css';
import DonorSearch from '../entry/DonorSearch';
import TrustSelect from '../entry/TrustSelect';
import StreetSelect from '../entry/StreetSelect';
import { useHistory } from '../../context/HistoryContext';
import { API_ENDPOINTS, getAuthHeaders } from '../../api';
import ConfirmModal from '../../components/ConfirmModal';

const History = () => {
  const { 
    transactions, setTransactions, 
    hasLoadedOnce, setHasLoadedOnce,
    categories, setCategories,
    lastFilters, setLastFilters
  } = useHistory();

  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [itemsPerRow, setItemsPerRow] = useState(3);
  const userJson = localStorage.getItem('user');
  const userId = userJson ? JSON.parse(userJson)?.id : 'default';
  const TRUST_KEY = `global_cached_trusts_${userId}`;
  const STREET_KEY = `global_cached_streets_${userId}`;

  const [trusts, setTrusts] = useState(() => {
    const saved = sessionStorage.getItem(TRUST_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [streets, setStreets] = useState(() => {
    const saved = sessionStorage.getItem(STREET_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    // Safeguard: Convert objects to strings if they exist in cache
    return parsed.map(s => typeof s === 'object' ? s.name : s);
  });
  const [filters, setFilters] = useState({ 
    from_date: '',
    to_date: '',
    gender: '',
    ...lastFilters 
  });
  
  // Edit Modal State
  const [editModal, setEditModal] = useState({ show: false, transaction: null });
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    onConfirm: () => {}
  });

  const [showFilters, setShowFilters] = useState(false);

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.hijri_year) count++;
    if (filters.trust_id) count++;
    if (filters.street) count++;
    if (filters.from_date) count++;
    if (filters.to_date) count++;
    if (filters.gender) count++;
    return count;
  };

  const clearFilter = (key) => {
    const updated = { ...filters, [key]: '' };
    setFilters(updated);
    const cols = calculateItemsPerRow();
    setPage(1);
    fetchTransactions(1, true, cols * 3, updated);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(transactions.map(t => t.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(x => x !== id));
    }
  };

  const handleBatchDeleteClick = () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      isOpen: true,
      title: "Delete Selected Ledgers",
      message: `Are you sure you want to delete the ${selectedIds.length} selected annual ledgers? This action cannot be undone.`,
      confirmText: "Delete All",
      onConfirm: () => performBatchDelete()
    });
  };

  const performBatchDelete = async () => {
    setLoading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      const deletePromises = selectedIds.map(async (id) => {
        try {
          const res = await fetch(API_ENDPOINTS.TRANSACTIONS.DETAIL(id), {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          if (res.ok) {
            const result = await res.json();
            if (result.status) {
              successCount++;
              return id;
            }
          }
          failCount++;
          return null;
        } catch (err) {
          failCount++;
          return null;
        }
      });

      const deletedIds = await Promise.all(deletePromises);
      const successfulDeletes = deletedIds.filter(id => id !== null);

      setTransactions(prev => prev.filter(t => !successfulDeletes.includes(t.id)));
      setSelectedIds([]);

      if (failCount === 0) {
        setMessage({ type: 'success', text: `Successfully deleted ${successCount} ledgers.` });
      } else {
        setMessage({ type: 'error', text: `Deleted ${successCount} ledgers. Failed to delete ${failCount} ledgers.` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Batch delete operations failed' });
    } finally {
      setLoading(false);
    }
  };

  const fetchTrusts = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.TRUSTS.BASE}?per_page=20`, { headers: getAuthHeaders() });
      const data = await res.json();
      const items = data.items || [];
      setTrusts(items);
      sessionStorage.setItem(TRUST_KEY, JSON.stringify(items));
      return items;
    } catch (err) {
      console.error("Fetch trusts failed:", err);
      return [];
    }
  };

  const fetchStreets = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.STREETS.BASE}?per_page=20`, { headers: getAuthHeaders() });
      const data = await res.json();
      const items = (data.items || []).map(s => s.name);
      setStreets(items);
      sessionStorage.setItem(STREET_KEY, JSON.stringify(items));
      return items;
    } catch (err) {
      console.error("Fetch streets failed:", err);
      return [];
    }
  };

  useEffect(() => {
    const init = async () => {
      const cols = calculateItemsPerRow();
      setItemsPerRow(cols);

      // Parallel fetch metadata
      const fetchers = [];
      if (categories.length === 0) fetchers.push(fetchCategories());
      if (trusts.length === 0) fetchers.push(fetchTrusts());
      if (streets.length === 0) fetchers.push(fetchStreets());
      
      if (fetchers.length > 0) await Promise.all(fetchers);
      
      if (!hasLoadedOnce && transactions.length === 0) {
        await fetchTransactions(1, true, cols * 3);
        setHasLoadedOnce(true);
      }
    };
    init();

    // Resize listener to adjust "Load More" logic if screen size changes
    const handleResize = () => {
      setItemsPerRow(calculateItemsPerRow());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const calculateItemsPerRow = () => {
    const width = window.innerWidth;
    if (width >= 1100) return 3;
    if (width >= 768) return 2;
    return 1;
  };


  // Update global filters when local filters change (so they persist when coming back)
  useEffect(() => {
    setLastFilters(filters);
  }, [filters]);

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    const cols = calculateItemsPerRow();
    setPage(1);
    fetchTransactions(1, true, cols * 3);
  };

  const handleReload = () => {
    const cols = calculateItemsPerRow();
    setPage(1);
    fetchTransactions(1, true, cols * 3);
  };




  const fetchCategories = async () => {
    try {
      // Fetch all categories for display/lookup
      const res = await fetch(`${API_ENDPOINTS.CATEGORIES.BASE}?per_page=500`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.items || []);
      }
    } catch (err) { console.error(err); }
  };

  const fetchTransactions = async (pageNum = 1, reset = false, perPageOverride = null, filterOverride = null) => {
    setLoading(true);
    if (reset) {
      setSelectedIds([]);
    }
    try {
      const activeFilters = filterOverride || filters;
      const { donor_id, hijri_year, trust_id, street, from_date, to_date, gender } = activeFilters;
      
      const perPage = perPageOverride || 9;
      let url = `${API_ENDPOINTS.TRANSACTIONS.BASE}?page=${pageNum}&per_page=${perPage}`;
      
      if (donor_id) url += `&donor_id=${donor_id}`;
      if (hijri_year) url += `&hijri_year=${hijri_year}`;
      if (trust_id) url += `&trust_id=${trust_id}`;
      if (street) url += `&street=${encodeURIComponent(street)}`;
      if (from_date) url += `&from_date=${from_date}`;
      if (to_date) url += `&to_date=${to_date}`;
      if (gender) url += `&gender=${gender}`;
      
      const res = await fetch(url, { headers: getAuthHeaders() });


      const result = await res.json();
      
      if (result.status) {
        if (reset) {
          setTransactions(result.data);
        } else {
          setTransactions(prev => [...prev, ...result.data]);
        }
        setHasMore(pageNum < result.pagination.total_pages);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateBillHTML = (t) => {
    const donor = t.expand?.donor_id || {};
    const trust = {
      name: t.trust_name || 'Organization Name',
      address: t.trust_address || '',
      mobile: t.trust_mobile || ''
    };

    
    const itemsHTML = (t.items || []).map(item => {
      const cat = categories.find(c => c.id === item.category_id);
      const catName = cat ? cat.name : (item.category_name || 'Unknown Category');
      return `
        <tr>
          <td contenteditable="true" style="padding: 10px; border: 1px solid #000; text-align: left;">${catName}</td>
          <td contenteditable="true" style="padding: 10px; border: 1px solid #000; text-align: center;">${item.date}</td>
          <td contenteditable="true" style="padding: 10px; border: 1px solid #000; text-align: right; font-weight: bold;">₹${item.amount.toFixed(2)}</td>
        </tr>
      `;
    }).join('');


    return `
      <div class="bill-page" style="font-family: Arial, sans-serif; padding: 40px; color: #000; max-width: 800px; margin: 20px auto; background: white; border: 2px solid #000; min-height: 1000px; box-sizing: border-box; display: flex; flex-direction: column;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 contenteditable="true" style="margin: 0; font-size: 32px; text-transform: uppercase; letter-spacing: 2px;">${trust.name}</h1>
          <p contenteditable="true" style="margin: 8px 0; font-size: 16px;">${trust.address} | Tel: ${trust.mobile}</p>
          <div style="display: inline-block; border: 2px solid #000; padding: 5px 20px; margin-top: 10px; font-weight: bold; font-size: 20px;">DONATION RECEIPT</div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div style="width: 55%; border: 1.5px solid #000; padding: 15px; border-radius: 4px;">
            <p style="margin: 0 0 10px; font-size: 13px; font-weight: bold; text-decoration: underline; text-transform: uppercase;">Donor Particulars:</p>
            <div style="font-size: 16px; line-height: 1.6;">
              <p contenteditable="true" style="margin: 5px 0;"><strong>Name:</strong> ${t.donor_name}</p>
              <p contenteditable="true" style="margin: 5px 0;"><strong>Address:</strong> ${donor.door_no ? donor.door_no + ', ' : ''}${donor.street || 'N/A'}</p>
              <p contenteditable="true" style="margin: 5px 0;"><strong>Mobile:</strong> ${donor.mobile || 'N/A'}</p>
            </div>
          </div>
          <div style="width: 40%; border: 1.5px solid #000; padding: 15px; border-radius: 4px; text-align: right;">
            <p style="margin: 5px 0; font-size: 15px;"><strong>Receipt No:</strong> <span style="font-family: monospace; font-size: 16px;">${t.id.toUpperCase()}</span></p>
            <p style="margin: 5px 0; font-size: 15px;"><strong>Issue Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p style="margin: 5px 0; font-size: 15px;"><strong>Hijri Year:</strong> ${t.hijri_year} AH</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 2px solid #000;">
          <thead>
            <tr style="background: #f2f2f2; border-bottom: 2px solid #000;">
              <th style="padding: 12px; border-right: 1px solid #000; text-align: left; text-transform: uppercase; font-size: 14px;">Description of Donation</th>
              <th style="padding: 12px; border-right: 1px solid #000; text-align: center; text-transform: uppercase; font-size: 14px;">Date</th>
              <th style="padding: 12px; text-align: right; text-transform: uppercase; font-size: 14px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
          <tfoot style="border-top: 2px solid #000;">
            <tr>
              <td colspan="2" style="padding: 15px; border-right: 1px solid #000; text-align: right; font-weight: bold; font-size: 16px;">GRAND TOTAL:</td>
              <td style="padding: 15px; text-align: right; font-weight: bold; font-size: 22px; background: #fafafa;">₹${t.total_amount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top: auto; padding-top: 40px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div style="font-size: 13px; color: #333; width: 60%; font-style: italic;">
            <p style="margin: 0;">* This is a computer generated official receipt of Community Welfare Trust.</p>
            <p style="margin: 4px 0;">* Thank you for your contribution towards the welfare of the community.</p>
          </div>
          <div style="text-align: center; width: 220px;">
            <p style="margin-bottom: 60px; font-size: 15px; font-weight: bold;">For ${trust.name}</p>

            <div style="border-top: 1px solid #000; width: 100%;"></div>
            <p style="margin: 8px 0; font-weight: bold; text-transform: uppercase;">Authorized Signatory</p>
          </div>
        </div>
      </div>
    `;
  };

  const handlePrintCard = async (t) => {

    setLoading(true);
    try {
      const donorId = t.donor_id;
      const res = await fetch(API_ENDPOINTS.DONORS.DETAIL(donorId), { headers: getAuthHeaders() });
      const donorResult = await res.json();

      
      let finalDonorData = t.expand?.donor_id || {};
      if (donorResult.status) {
        finalDonorData = donorResult.data;
      }

      const html = generateBillHTML({ ...t, expand: { ...t.expand, donor_id: finalDonorData } });
      
      const printWindow = window.open('', '_blank', 'width=900,height=950');
      printWindow.document.write(`
        <html>
          <head>
            <title>Receipt - ${t.donor_name}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
              body { margin: 0; padding: 0; background: #525659; display: flex; justify-content: center; padding-top: 20px; }
              .bill-page { 
                width: 210mm; 
                min-height: 297mm; 
                padding: 20mm; 
                margin: 10mm auto; 
                background: white; 
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
                box-sizing: border-box;
              }
              @media print {
                body { background: white; padding: 0; }
                .bill-page { margin: 0; box-shadow: none; border: none; }
              }
            </style>
          </head>
          <body>
            <div id="bill-content">${html}</div>
            <script>
              window.onload = () => {
                const element = document.getElementById('bill-content');
                const opt = {
                  margin: 0,
                  filename: 'Receipt_${t.donor_name.replace(/\s+/g, '_')}_${t.id}.pdf',
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2, useCORS: true },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                
                // New logic: Show preview and provide a download button, or auto-download
                html2pdf().set(opt).from(element).save().then(() => {
                  // Optional: close window after download
                  // window.close();
                });
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error("Print/PDF failed:", err);
    } finally {
      setLoading(false);
    }
  };



  const handlePrintAll = async () => {
    if (transactions.length === 0) return;
    setLoading(true);
    try {
      // Fetch fresh donor details for all transactions in parallel
      const enrichedTransactions = await Promise.all(transactions.map(async (t) => {
        try {
          const res = await fetch(API_ENDPOINTS.DONORS.DETAIL(t.donor_id), { headers: getAuthHeaders() });
          const donorResult = await res.json();
          if (donorResult.status) {
            return { ...t, expand: { ...t.expand, donor_id: donorResult.data } };
          }
        } catch (e) {
          console.warn("Failed to fetch donor for bulk print:", t.donor_id);
        }
        return t;
      }));

      const allHTML = enrichedTransactions.map(t => generateBillHTML(t)).join('');
      
      const printWindow = window.open('', '_blank', 'width=900,height=950');
      printWindow.document.write(`
        <html>
          <head>
            <title>Bulk Receipts Export</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
              body { margin: 0; padding: 0; background: #525659; display: flex; flex-direction: column; align-items: center; padding-top: 20px; }
              .bill-page { 
                width: 210mm; 
                min-height: 297mm; 
                padding: 20mm; 
                margin: 10mm auto; 
                background: white; 
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
                box-sizing: border-box;
                page-break-after: always;
              }
              @media print {
                body { background: white; padding: 0; }
                .bill-page { margin: 0; box-shadow: none; border: none; }
              }
            </style>
          </head>
          <body>
            <div id="bulk-content">${allHTML}</div>
            <script>
              window.onload = () => {
                const element = document.getElementById('bulk-content');
                const opt = {
                  margin: 0,
                  filename: 'Bulk_Receipts_${new Date().toISOString().split('T')[0]}.pdf',
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 1.5, useCORS: true },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                html2pdf().set(opt).from(element).save();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error("Bulk PDF failed:", err);
    } finally {
      setLoading(false);
    }
  };



  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    // Fetch 3 rows based on current itemsPerRow
    fetchTransactions(nextPage, false, 9);
  };



  const handleDeleteClick = (id) => {
    setConfirmState({
      isOpen: true,
      title: "Delete Annual Ledger",
      message: "Are you sure you want to delete this entire annual ledger? This action cannot be undone.",
      confirmText: "Delete",
      onConfirm: () => performDelete(id)
    });
  };

  const performDelete = async (id) => {
    try {
      const res = await fetch(API_ENDPOINTS.TRANSACTIONS.DETAIL(id), { 
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const result = await res.json();
      if (result.status) {
        setTransactions(transactions.filter(t => t.id !== id));
        setMessage({ type: 'success', text: result.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Delete failed' });
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const t = editModal.transaction;
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.TRANSACTIONS.DETAIL(t.id), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          items: t.items.map(item => {
            const cat = categories.find(c => c.id === item.category_id);
            return {
              ...item,
              category_name: cat ? cat.name : (item.category_name || '')
            };
          }),
          total_amount: t.items.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0),
          hijri_year: t.hijri_year,
          payment_date: t.payment_date,
          notes: t.notes,
          trust_id: t.trust_id
        })
      });


      const result = await res.json();
      if (result.status) {
        setEditModal({ show: false, transaction: null });
        const cols = calculateItemsPerRow();
        fetchTransactions(1, true, cols * 3); // Reset to first page and clear old state
        setMessage({ type: 'success', text: result.msg });
      }

    } catch (err) {
      setMessage({ type: 'error', text: 'Update failed' });
    } finally {
      setLoading(false);
    }
  };

  const updateEditItem = (index, field, value) => {
    const updated = { ...editModal.transaction };
    updated.items[index][field] = value;
    setEditModal({ ...editModal, transaction: updated });
  };

  const addEditItem = () => {
    const updated = { ...editModal.transaction };
    updated.items.push({ category_id: '', amount: 0, date: new Date().toISOString().split('T')[0] });
    setEditModal({ ...editModal, transaction: updated });
  };

  const removeEditItem = (index) => {
    const updated = { ...editModal.transaction };
    updated.items = updated.items.filter((_, i) => i !== index);
    setEditModal({ ...editModal, transaction: updated });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Annual Ledgers</h1>
          <p className={styles.subtitle}>View and manage yearly donation history</p>
        </div>
        <div className={styles.actions}>
          {selectedIds.length > 0 && (
            <button 
              type="button" 
              className={styles.deleteSelectedBtn} 
              onClick={handleBatchDeleteClick} 
              disabled={loading}
              title="Delete selected entries"
            >
              <Trash2 size={18} /> Delete Selected ({selectedIds.length})
            </button>
          )}
          <button className={styles.secondaryBtn} onClick={handleReload} disabled={loading}>
            <RefreshCcw size={18} className={loading ? styles.spin : ''} /> Reload Data
          </button>
          <button type="button" className={styles.printAllBtn} onClick={handlePrintAll} disabled={loading}>
             <Printer size={18} /> Print All Page
          </button>
        </div>
      </header>


      <div className={styles.filterContainer}>
        <form onSubmit={handleSearch} className={styles.filterBar}>
          <div className={styles.donorSearchWrapper}>
             <DonorSearch 
               value={filters.donor_id}
               onChange={(val) => {
                 const updated = {...filters, donor_id: val};
                 setFilters(updated);
                 const cols = calculateItemsPerRow();
                 setPage(1);
                 fetchTransactions(1, true, cols * 3, updated);
               }}
               placeholder="Search Donor Name..."
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

            <button type="submit" className={styles.searchBtn} disabled={loading}>
              <Search size={16} />
              <span>Search</span>
            </button>

            <button 
              type="button" 
              className={styles.resetBtn} 
              onClick={() => {
                const cleared = { donor_id: '', hijri_year: '', trust_id: '', street: '', from_date: '', to_date: '', gender: '' };
                setFilters(cleared);
                setShowFilters(false);
                const cols = calculateItemsPerRow();
                setPage(1);
                fetchTransactions(1, true, cols * 3, cleared);
              }}
            >
              Reset
            </button>
          </div>
        </form>

        {showFilters && (
          <div className={styles.filterDropdownPanel}>
            <div className={styles.dropdownGrid}>
              <div className={styles.gridField}>
                <label>Hijri Year</label>
                <input 
                  type="text"
                  placeholder="e.g. 1447"
                  value={filters.hijri_year}
                  onChange={(e) => setFilters({...filters, hijri_year: e.target.value})}
                />
              </div>

              <div className={styles.gridField}>
                <label>Organization (Trust)</label>
                <TrustSelect 
                  value={filters.trust_id}
                  onChange={(val) => setFilters({...filters, trust_id: val})}
                  placeholder="Select Trust"
                />
              </div>

              <div className={styles.gridField}>
                <label>Street</label>
                <StreetSelect 
                  value={filters.street}
                  onChange={(val) => setFilters({...filters, street: val})}
                  placeholder="Select Street"
                />
              </div>

              <div className={styles.gridField}>
                <label>From Date</label>
                <input 
                  type="date"
                  value={filters.from_date}
                  onChange={(e) => setFilters({...filters, from_date: e.target.value})}
                />
              </div>

              <div className={styles.gridField}>
                <label>To Date</label>
                <input 
                  type="date"
                  value={filters.to_date}
                  onChange={(e) => setFilters({...filters, to_date: e.target.value})}
                />
              </div>

              <div className={styles.gridField}>
                <label>Gender</label>
                <select 
                  value={filters.gender || ''}
                  onChange={(e) => setFilters({...filters, gender: e.target.value})}
                >
                  <option value="">All Genders</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
            </div>

            <div className={styles.dropdownActions}>
              <button 
                type="button" 
                className={styles.applyBtn}
                onClick={() => {
                  setShowFilters(false);
                  const cols = calculateItemsPerRow();
                  setPage(1);
                  fetchTransactions(1, true, cols * 3);
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
              {filters.hijri_year && (
                <span className={styles.filterTag}>
                  Year: {filters.hijri_year}
                  <button type="button" onClick={() => clearFilter('hijri_year')}>×</button>
                </span>
              )}
              {filters.trust_id && (
                <span className={styles.filterTag}>
                  Org: {trusts.find(t => t.id === filters.trust_id)?.name || 'Selected Org'}
                  <button type="button" onClick={() => clearFilter('trust_id')}>×</button>
                </span>
              )}
              {filters.street && (
                <span className={styles.filterTag}>
                  Street: {filters.street}
                  <button type="button" onClick={() => clearFilter('street')}>×</button>
                </span>
              )}
              {filters.from_date && (
                <span className={styles.filterTag}>
                  From: {filters.from_date}
                  <button type="button" onClick={() => clearFilter('from_date')}>×</button>
                </span>
              )}
              {filters.to_date && (
                <span className={styles.filterTag}>
                  To: {filters.to_date}
                  <button type="button" onClick={() => clearFilter('to_date')}>×</button>
                </span>
              )}
              {filters.gender && (
                <span className={styles.filterTag}>
                  Gender: {filters.gender === 'M' ? 'Male' : 'Female'}
                  <button type="button" onClick={() => clearFilter('gender')}>×</button>
                </span>
              )}
              <button 
                type="button" 
                className={styles.clearAllTagsBtn}
                onClick={() => {
                  const cleared = { ...filters, hijri_year: '', trust_id: '', street: '', from_date: '', to_date: '', gender: '' };
                  setFilters(cleared);
                  const cols = calculateItemsPerRow();
                  setPage(1);
                  fetchTransactions(1, true, cols * 3, cleared);
                }}
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>


      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
          <X size={16} onClick={() => setMessage({ type: '', text: '' })} style={{cursor: 'pointer'}}/>
        </div>
      )}

      <div className={styles.gridContainer}>
        {loading && (
          <div className={styles.loadingOverlay}>
             <Clock className={styles.spin} size={40} />
             <span style={{color: 'white', marginTop: '10px', fontSize: '14px'}}>Updating Ledger...</span>
          </div>
        )}

        <div className={styles.tableContainer}>
          {transactions.length > 0 ? (
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      className={styles.checkbox}
                      checked={transactions.length > 0 && selectedIds.length === transactions.length} 
                      onChange={handleSelectAll} 
                    />
                  </th>
                  <th>Donor Name</th>
                  <th>Trust Organization</th>
                  <th>Hijri Year</th>
                  <th>Payment Date</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr 
                    key={t.id} 
                    className={styles.tableRow}
                    onClick={() => setSelectedTransaction(t)}
                  >
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        className={styles.checkbox}
                        checked={selectedIds.includes(t.id)} 
                        onChange={(e) => handleSelectOne(t.id, e.target.checked)} 
                      />
                    </td>
                    <td>
                      <span className={styles.donorName}>{t.donor_name}</span>
                    </td>
                    <td>
                      <span className={styles.trustName}>{t.trust_name || 'No Trust'}</span>
                    </td>
                    <td>
                      <span className={styles.yearTag}>{t.hijri_year} AH</span>
                    </td>
                    <td>
                      <span className={styles.dateVal}>{t.payment_date}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--text-main)' }}>
                      ₹{t.total_amount.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.rowActions}>
                        <button className={styles.rowActionBtn} onClick={() => handlePrintCard(t)} title="Print Receipt">
                          <Printer size={16} />
                        </button>
                        <button className={styles.rowActionBtn} onClick={() => setEditModal({ show: true, transaction: JSON.parse(JSON.stringify(t)) })} title="Edit">
                          <Edit3 size={16} />
                        </button>
                        <button className={`${styles.rowActionBtn} ${styles.deleteBtn}`} onClick={() => handleDeleteClick(t.id)} title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !loading && (
            <div className={styles.emptyState}>No transactions found for these filters.</div>
          )}
        </div>

      </div>



      {hasMore && (
        <div className={styles.loadMoreWrapper}>
          <button className={styles.loadMoreBtn} onClick={loadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}


      {/* Edit Modal */}
      {editModal.show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Edit Annual Ledger ({editModal.transaction.hijri_year} AH)</h2>
              <button onClick={() => setEditModal({ show: false, transaction: null })}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdate} className={styles.modalForm}>
                <div className={styles.modalBody}>
                  <div className={styles.editMetaSection}>
                    <div className={styles.trustGroup}>
                      <label>Trust</label>
                      <TrustSelect 
                        value={editModal.transaction.trust_id || ''}
                        onChange={(val) => setEditModal({ ...editModal, transaction: { ...editModal.transaction, trust_id: val } })}
                        placeholder="No Trust"
                      />
                    </div>
                    <div className={styles.yearGroup}>
                      <label>Hijri Year</label>
                      <input 
                        type="text"
                        value={editModal.transaction.hijri_year || ''}
                        onChange={(e) => setEditModal({ ...editModal, transaction: { ...editModal.transaction, hijri_year: e.target.value } })}
                        className={styles.modalInput}
                      />
                    </div>
                  </div>

                  <div className={styles.itemsEditList}>
                    {editModal.transaction.items.map((item, idx) => (
                      <div key={idx} className={styles.editRow}>
                        <select 
                          value={item.category_id}
                          onChange={(e) => updateEditItem(idx, 'category_id', e.target.value)}
                        >
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input 
                          type="number" 
                          value={item.amount}
                          onChange={(e) => updateEditItem(idx, 'amount', e.target.value)}
                        />
                        <input 
                          type="date" 
                          value={item.date}
                          onChange={(e) => updateEditItem(idx, 'date', e.target.value)}
                        />
                        <button type="button" onClick={() => removeEditItem(idx)} className={styles.removeBtn}>
                            <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={addEditItem} className={styles.addBtn}>
                      <Plus size={16} /> Add Entry
                    </button>
                  </div>
                  
                  <div className={styles.notesEdit}>
                    <label>Admin Notes</label>
                    <input 
                      type="text"
                      placeholder="Add a brief note..."
                      className={styles.modalInput}
                      value={editModal.transaction.notes || ''}
                      onChange={(e) => setEditModal({ ...editModal, transaction: { ...editModal.transaction, notes: e.target.value } })}
                    />
                  </div>

                </div>

                <div className={styles.modalFooter}>
                  <button type="button" onClick={() => setEditModal({ show: false, transaction: null })}>Cancel</button>
                  <button type="submit" className={styles.saveBtn} disabled={loading}>
                    <Save size={18} /> {loading ? 'Saving...' : 'Update Ledger'}
                  </button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Details Viewer Modal */}
      {selectedTransaction && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: '550px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <FileText size={22} className={styles.modalIcon} />
                <h2>Ledger Details</h2>
              </div>
              <button onClick={() => setSelectedTransaction(null)} className={styles.closeBtn} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.viewerContent}>
              <div className={styles.viewerHeaderBlock}>
                <div className={styles.viewerDonorInfo}>
                  <label>Donor</label>
                  <h3>{selectedTransaction.donor_name}</h3>
                </div>
                <div className={styles.viewerTotalBlock}>
                  <label>Total Collected</label>
                  <div className={styles.viewerTotalAmount}>₹{selectedTransaction.total_amount.toFixed(2)}</div>
                </div>
              </div>

              <div className={styles.viewerMetaGrid}>
                <div className={styles.viewerMetaItem}>
                  <label>Trust Organization</label>
                  <span>{selectedTransaction.trust_name || 'No Trust'}</span>
                </div>
                <div className={styles.viewerMetaItem}>
                  <label>Hijri Year</label>
                  <span>{selectedTransaction.hijri_year} AH</span>
                </div>
                <div className={styles.viewerMetaItem}>
                  <label>Payment Date</label>
                  <span>{selectedTransaction.payment_date}</span>
                </div>
              </div>

              {selectedTransaction.notes && (
                <div className={styles.viewerNotes}>
                  <label>Notes</label>
                  <p>{selectedTransaction.notes}</p>
                </div>
              )}

              <div className={styles.viewerItemsSection}>
                <label>Ledger Items</label>
                <div className={styles.viewerTableWrapper}>
                  <table className={styles.viewerTable}>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedTransaction.items || []).map((item, idx) => {
                        const cat = categories.find(c => c.id === item.category_id);
                        const displayName = cat ? cat.name : (item.category_name || (categories.length > 0 ? 'Unknown Category' : 'Loading...'));
                        return (
                          <tr key={idx}>
                            <td>{displayName}</td>
                            <td>{item.date}</td>
                            <td style={{ textAlign: 'right', fontWeight: '600' }}>₹{item.amount.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter} style={{ padding: '1.25rem 2rem', borderTop: '1px solid var(--border)' }}>
              <button 
                type="button" 
                className={styles.viewerActionBtn} 
                onClick={() => {
                  handlePrintCard(selectedTransaction);
                }}
              >
                <Printer size={16} /> Print Receipt
              </button>
              <button 
                type="button" 
                className={styles.viewerActionBtn} 
                onClick={() => {
                  setEditModal({ show: true, transaction: JSON.parse(JSON.stringify(selectedTransaction)) });
                  setSelectedTransaction(null);
                }}
              >
                <Edit3 size={16} /> Edit
              </button>
              <button 
                type="button" 
                className={`${styles.viewerActionBtn} ${styles.viewerDeleteBtn}`} 
                onClick={() => {
                  handleDeleteClick(selectedTransaction.id);
                  setSelectedTransaction(null);
                }}
              >
                <Trash2 size={16} /> Delete
              </button>
              <button 
                type="button" 
                className={styles.cancelBtn} 
                onClick={() => setSelectedTransaction(null)}
                style={{ marginLeft: 'auto' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      <ConfirmModal 
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        type="danger"
      />
    </div>
  );
};

export default History;

