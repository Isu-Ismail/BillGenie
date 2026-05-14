import React, { createContext, useContext, useState } from 'react';

const HistoryContext = createContext();

export const HistoryProvider = ({ children }) => {
    const [transactions, setTransactions] = useState([]);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [categories, setCategories] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [lastFilters, setLastFilters] = useState({ donor_id: '', hijri_year: '', all_user_tx: false });

    return (
        <HistoryContext.Provider value={{ 
            transactions, setTransactions, 
            hasLoadedOnce, setHasLoadedOnce,
            categories, setCategories,
            pagination, setPagination,
            lastFilters, setLastFilters
        }}>
            {children}
        </HistoryContext.Provider>
    );
};

export const useHistory = () => useContext(HistoryContext);
