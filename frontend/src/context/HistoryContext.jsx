import React, { createContext, useContext, useState } from 'react';

const HistoryContext = createContext();

export const HistoryProvider = ({ children }) => {
    const [transactions, setTransactions] = useState(() => {
        const saved = sessionStorage.getItem('history_cached_transactions');
        return saved ? JSON.parse(saved) : [];
    });
    const [hasLoadedOnce, setHasLoadedOnce] = useState(() => {
        return sessionStorage.getItem('history_has_loaded_once') === 'true';
    });
    const userJson = localStorage.getItem('user');
    const userId = userJson ? JSON.parse(userJson)?.id : 'default';
    const CAT_KEY = `global_cached_categories_${userId}`;

    const [categories, setCategories] = useState(() => {
        const saved = sessionStorage.getItem(CAT_KEY);
        return saved ? JSON.parse(saved) : [];
    });
    const [pagination, setPagination] = useState(null);
    const [lastFilters, setLastFilters] = useState(() => {
        const saved = sessionStorage.getItem('history_last_filters');
        return saved ? JSON.parse(saved) : { donor_id: '', hijri_year: '', all_user_tx: false, trust_id: '', year_only: false, street: '', gender: '' };
    });

    const setTransactionsPersistent = (txs) => {
        setTransactions(txs);
        sessionStorage.setItem('history_cached_transactions', JSON.stringify(txs));
    };

    const setCategoriesPersistent = (cats) => {
        setCategories(cats);
        sessionStorage.setItem(CAT_KEY, JSON.stringify(cats));
    };

    const setHasLoadedOncePersistent = (val) => {
        setHasLoadedOnce(val);
        sessionStorage.setItem('history_has_loaded_once', val ? 'true' : 'false');
    };

    const setLastFiltersPersistent = (filters) => {
        setLastFilters(filters);
        sessionStorage.setItem('history_last_filters', JSON.stringify(filters));
    };

    return (
        <HistoryContext.Provider value={{ 
            transactions, setTransactions: setTransactionsPersistent, 
            hasLoadedOnce, setHasLoadedOnce: setHasLoadedOncePersistent,
            categories, setCategories: setCategoriesPersistent,
            pagination, setPagination,
            lastFilters, setLastFilters: setLastFiltersPersistent
        }}>
            {children}
        </HistoryContext.Provider>
    );
};

export const useHistory = () => useContext(HistoryContext);
