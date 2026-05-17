import { useState, useEffect } from 'react';
import api from '../api/client';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            api.get('/auth/me')
                .then(res => {
                    setUser(res.data.user);
                })
                .catch(() => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    setToken(null);
                    setUser(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = async (username, password) => {
        const res = await api.post('/auth/login', { username, password });
        const { user: u, token: t } = res.data;
        localStorage.setItem('token', t);
        localStorage.setItem('user', JSON.stringify(u));
        setToken(t);
        setUser(u);
        return u;
    };

    const register = async (username, password) => {
        const res = await api.post('/auth/register', { username, password });
        const { user: u, token: t } = res.data;
        localStorage.setItem('token', t);
        localStorage.setItem('user', JSON.stringify(u));
        setToken(t);
        setUser(u);
        return u;
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch {
            // console.error('Logout error:', err);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setToken(null);
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
