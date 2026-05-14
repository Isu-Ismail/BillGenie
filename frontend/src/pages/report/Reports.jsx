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
  Shield
} from 'lucide-react';

import ExcelJS from 'exceljs';
import styles from './Reports.module.css';
import { API_ENDPOINTS } from '../../api';

const Reports = () => {
  const [reportData, setReportData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [trusts, setTrusts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Filter states
  // Filter states
  const [selectedTrust, setSelectedTrust] = useState(sessionStorage.getItem('reports_selected_trust') || '');
  const [selectedYear, setSelectedYear] = useState(sessionStorage.getItem('reports_selected_year') || '');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    sessionStorage.setItem('reports_selected_trust', selectedTrust);
    sessionStorage.setItem('reports_selected_year', selectedYear);
  }, [selectedTrust, selectedYear]);


  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [selectedTrust, selectedYear]);

  const fetchInitialData = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.TRUSTS.BASE);
      if (res.ok) {
        const data = await res.json();
        setTrusts(data);
        if (!selectedTrust && data.length > 0) {
          setSelectedTrust(data[0].id);
        }
      }
    } catch (error) {
      console.error("Error fetching trusts:", error);
    }
  };


  const fetchReport = async () => {
    if (!selectedTrust) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.REPORTS.BASE}?trust_id=${selectedTrust}&hijri_year=${selectedYear}`);

      if (res.ok) {
        const result = await res.json();
        setReportData(result.data);
        setCategories(result.categories);
        setSummary(result.summary);
      }
    } catch (error) {
      console.error("Error fetching report:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = reportData.filter(row => 
    row.donor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.door_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.street.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToExcel = async () => {
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
    link.download = `Donation_Report_${selectedYear}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };


  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Donation Reports</h1>
          <div className={styles.filterGroup}>
            <div className={styles.selectWrapper}>
              <Shield size={16} />
              <select value={selectedTrust} onChange={(e) => setSelectedTrust(e.target.value)}>
                {trusts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={14} className={styles.chevron} />
            </div>
            <div className={styles.inputWrapper}>
              <Calendar size={16} />
              <input 
                type="text" 
                placeholder="Year" 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.exportBtn} onClick={exportToExcel} disabled={loading || reportData.length === 0}>
            <FileSpreadsheet size={18} /> Export
          </button>
        </div>
      </header>

      {summary && (
        <section className={styles.summaryBar}>
          <div className={styles.grandTotalInfo}>
            <span className={styles.totalLabel}>Total Donation Collected</span>
            <span className={styles.totalValue}>₹{summary.grand_total.toLocaleString()}</span>
          </div>
          <div className={styles.categorySplitArea}>
            <div className={styles.splitHeader}>Category Breakdown</div>
            <div className={styles.categoryRow}>
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
    </div>
  );
};

export default Reports;