import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';
import '../styles/admin-dashboard.css';

export default function AdminDashboardPage() {
    const [stats, setStats] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [logsLoading, setLogsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('users'); // 'users', 'approvals', or 'explorer'
    const [explorerPrompt, setExplorerPrompt] = useState('');
    const [explorerResults, setExplorerResults] = useState(null);
    const [explorerLoading, setExplorerLoading] = useState(false);
    const [explorerSchema, setExplorerSchema] = useState({ forms: [], fields: [] });
    const [selectedExplorerForms, setSelectedExplorerForms] = useState([]);
    const [error, setError] = useState('');
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [userForms, setUserForms] = useState([]);
    const [userFormsLoading, setUserFormsLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [profileModal, setProfileModal] = useState({ open: false, userId: null, username: '', originalUsername: '', newPassword: '' });
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', password: '' });
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const [allUsers, setAllUsers] = useState([]);
    const [delegations, setDelegations] = useState({ outgoing: [], incoming: [], allActive: [] });
    const [showDelegationModal, setShowDelegationModal] = useState(false);
    const [newDelegation, setNewDelegation] = useState({ grantorId: '', granteeId: '', duration: '1', durationUnit: 'hours', expiresAt: '' });
    const [delegationLoading, setDelegationLoading] = useState(false);

    useEffect(() => {
        fetchStats();
        fetchLogs();
    }, []);

    useEffect(() => {
        if (activeTab === 'explorer') {
            fetchExplorerSchema();
        }
    }, [activeTab]);

    useEffect(() => {
        if (showDelegationModal || activeTab === 'delegations') fetchDelegationData();
    }, [showDelegationModal, activeTab]);

    const fetchDelegationData = async () => {
        try {
            setDelegationLoading(true);
            const [usersRes, delRes] = await Promise.all([
                api.get('/permissions/users'),
                api.get('/permissions/delegations')
            ]);
            // Add self back to the users list for admin delegation
            const users = [...(usersRes.data.users || []), { id: user.id, username: user.username }].sort((a,b) => a.username.localeCompare(b.username));
            setAllUsers(users);
            setDelegations(delRes.data);
        } catch (err) {
            console.error('Failed to fetch delegation data:', err);
        } finally {
            setDelegationLoading(false);
        }
    };

    const handleCreateDelegation = async (e) => {
        e.preventDefault();
        if (!newDelegation.grantorId || !newDelegation.granteeId) return;

        const payload = {
            grantorId: newDelegation.grantorId,
            granteeId: newDelegation.granteeId,
        };

        if (newDelegation.durationUnit === 'date') {
            payload.expiresAt = newDelegation.expiresAt;
        } else {
            payload.duration = newDelegation.duration;
            payload.durationUnit = newDelegation.durationUnit;
        }

        try {
            setDelegationLoading(true);
            await api.post('/permissions/delegate', payload);
            setNewDelegation({ grantorId: '', granteeId: '', duration: '1', durationUnit: 'hours', expiresAt: '' });
            fetchDelegationData();
        } catch (err) {
            alert(err.response?.data?.error || 'Delegation failed');
        } finally {
            setDelegationLoading(false);
        }
    };

    const handleRevokeDelegation = async (id) => {
        try {
            await api.delete(`/permissions/delegate/${id}`);
            fetchDelegationData();
        } catch (err) {
            alert('Failed to revoke delegation');
        }
    };

    const fetchStats = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await api.get('/forms/admin/stats');
            setStats(res.data.stats);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
            setError(err.response?.data?.error || 'Failed to load statistics');
        } finally {
            setLoading(false);
        }
    };

    const fetchExplorerSchema = async () => {
        try {
            setExplorerLoading(true);
            const res = await api.get('/explorer/schema');
            setExplorerSchema(res.data);
            setSelectedExplorerForms(res.data.forms.map(f => f.id));
        } catch (err) {
            console.error('Failed to fetch schema:', err);
        } finally {
            setExplorerLoading(false);
        }
    };

    const toggleFormSelection = (formId) => {
        setSelectedExplorerForms(prev => 
            prev.includes(formId) ? prev.filter(id => id !== formId) : [...prev, formId]
        );
    };

    const fetchLogs = async () => {
        try {
            setLogsLoading(true);
            const res = await api.get('/permissions/logs');
            setLogs(res.data.logs);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        } finally {
            setLogsLoading(false);
        }
    };

    const handleDeleteUser = async (userId, username) => {
        if (!confirm(`Are you sure you want to delete user "${username}"? This will delete ALL their forms and submissions. This action CANNOT be undone.`)) return;
        
        try {
            setActionLoading(true);
            await api.delete(`/admin/users/${userId}`);
            fetchStats();
            alert(`User ${username} deleted successfully.`);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete user');
        } finally {
            setActionLoading(false);
        }
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        
        const updates = {};
        if (profileModal.username !== profileModal.originalUsername) {
            if (!profileModal.username.trim() || profileModal.username.length < 3) {
                alert('Username must be at least 3 characters');
                return;
            }
            updates.username = profileModal.username.trim();
        }
        
        if (profileModal.newPassword) {
            if (profileModal.newPassword.length < 6) {
                alert('Password must be at least 6 characters');
                return;
            }
            updates.password = profileModal.newPassword;
        }

        if (Object.keys(updates).length === 0) {
            setProfileModal({ open: false, userId: null, username: '', originalUsername: '', newPassword: '' });
            return;
        }

        try {
            setActionLoading(true);
            const res = await api.put(`/admin/users/${profileModal.userId}/profile`, updates);
            setProfileModal({ open: false, userId: null, username: '', originalUsername: '', newPassword: '' });
            alert(res.data.message);
            fetchStats();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update profile');
        } finally {
            setActionLoading(false);
        }
    };

    const handleChangeRole = async (userId, currentRole, username) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        if (!confirm(`Change role of "${username}" to ${newRole.toUpperCase()}?`)) return;

        try {
            setActionLoading(true);
            await api.put(`/admin/users/${userId}/role`, { role: newRole });
            fetchStats();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update role');
        } finally {
            setActionLoading(false);
        }
    };

    const viewUserForms = async (userId) => {
        try {
            setUserFormsLoading(true);
            setError('');
            const res = await api.get(`/forms/admin/user/${userId}`);
            setUserForms(res.data.forms);
            setSelectedUserId(userId);
        } catch (err) {
            console.error('Failed to fetch user forms:', err);
            setError(err.response?.data?.error || 'Failed to load user forms');
            setSelectedUserId(null);
        } finally {
            setUserFormsLoading(false);
        }
    };

    const closeUserFormsModal = () => {
        setSelectedUserId(null);
        setUserForms([]);
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUser.username || newUser.password.length < 6) {
            alert('Username and password (min. 6 chars) are required');
            return;
        }

        try {
            setActionLoading(true);
            await api.post('/auth/register', newUser);
            setShowCreateUserModal(false);
            setNewUser({ username: '', password: '' });
            fetchStats();
            alert(`User ${newUser.username} created successfully.`);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create user');
        } finally {
            setActionLoading(false);
        }
    };

    const handleExplorerQuery = async (e) => {
        e.preventDefault();
        if (!explorerPrompt.trim()) return;

        try {
            setExplorerLoading(true);
            setError('');
            const res = await api.post('/explorer/query', { 
                prompt: explorerPrompt,
                selectedForms: explorerSchema.forms.filter(f => selectedExplorerForms.includes(f.id))
            });
            setExplorerResults(res.data);
        } catch (err) {
            console.error('Explorer error:', err);
            setError(err.response?.data?.error || 'Failed to execute AI query');
        } finally {
            setExplorerLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>Loading admin dashboard...</p>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="page-container">
                <div className="glass-card error-card">
                    <h2>⚠️ Error</h2>
                    <p>{error || 'Failed to load admin dashboard'}</p>
                    <button className="btn btn-primary" onClick={fetchStats}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const selectedUser = stats.users?.find(u => u.id === selectedUserId);

    return (
        <div className="admin-dashboard-page">
            <header className="dashboard-header">
                <div className="header-left">
                    <h1>👁️ Agra Sandhani Admin</h1>
                    <span className="user-badge">Admin: {user?.username}</span>
                </div>
                <div className="header-right">
                    <button className="btn btn-primary" onClick={() => setShowCreateUserModal(true)}>
                        + Create User
                    </button>
                    <button className="btn btn-secondary" onClick={() => navigate('/')} title="Back to Dashboard">
                        ← Dashboard
                    </button>
                    <button
                        className="theme-toggle-btn"
                        onClick={toggleTheme}
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    <button className="btn btn-ghost" onClick={logout}>
                        Logout
                    </button>
                </div>
            </header>

            {error && (
                <div className="alert alert-error">
                    <span>{error}</span>
                    <button className="alert-close" onClick={() => setError('')}>✕</button>
                </div>
            )}

            <nav className="dashboard-tabs">
                <button 
                    className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    👥 User Activity
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
                    onClick={() => setActiveTab('approvals')}
                >
                    ⚖️ Approval History
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'explorer' ? 'active' : ''}`}
                    onClick={() => setActiveTab('explorer')}
                >
                    🔍 AI Data Explorer
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'delegations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('delegations')}
                >
                    🔑 Global Access Control
                </button>
            </nav>

            {activeTab === 'delegations' && (
                <div className="tab-content animate-fade-in">
                    <section className="delegations-section">
                        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2>🔑 Global User Delegations</h2>
                            <p className="text-muted">Manage system-wide data access grants between users.</p>
                        </div>

                        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                            <h3>Grant New System-Wide Access</h3>
                            <form onSubmit={handleCreateDelegation} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '1rem', alignItems: 'end', marginTop: '1rem' }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label>Owner (Grantor)</label>
                                    <select 
                                        className="form-input" 
                                        value={newDelegation.grantorId} 
                                        onChange={e => setNewDelegation({ ...newDelegation, grantorId: e.target.value })}
                                        required
                                    >
                                        <option value="">Select owner...</option>
                                        {allUsers.map(u => (
                                            <option key={u.id} value={u.id}>{u.username}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label>Recipient (Grantee)</label>
                                    <select 
                                        className="form-input" 
                                        value={newDelegation.granteeId} 
                                        onChange={e => setNewDelegation({ ...newDelegation, granteeId: e.target.value })}
                                        required
                                    >
                                        <option value="">Select recipient...</option>
                                        {allUsers.map(u => (
                                            <option key={u.id} value={u.id}>{u.username}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label>Duration Unit</label>
                                    <select 
                                        className="form-input" 
                                        value={newDelegation.durationUnit} 
                                        onChange={e => setNewDelegation({ ...newDelegation, durationUnit: e.target.value })}
                                        required
                                    >
                                        <option value="hours">Hours</option>
                                        <option value="days">Days</option>
                                        <option value="date">Until Specific Date</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label>{newDelegation.durationUnit === 'date' ? 'Select Date' : 'Value'}</label>
                                    {newDelegation.durationUnit === 'date' ? (
                                        <input 
                                            type="datetime-local" 
                                            className="form-input" 
                                            value={newDelegation.expiresAt}
                                            onChange={e => setNewDelegation({ ...newDelegation, expiresAt: e.target.value })}
                                            required
                                        />
                                    ) : (
                                        <input 
                                            type="number" 
                                            className="form-input" 
                                            min="1" 
                                            value={newDelegation.duration}
                                            onChange={e => setNewDelegation({ ...newDelegation, duration: e.target.value })}
                                            required
                                        />
                                    )}
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={delegationLoading}>
                                    Grant Global Access
                                </button>
                            </form>
                        </div>

                        <div className="table-container glass-card scrollable-table-wrapper">
                            <h3>Active System Delegations</h3>
                            {delegations.allActive.length === 0 ? (
                                <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>No active global delegations in the system.</p>
                            ) : (
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Owner</th>
                                            <th>Recipient</th>
                                            <th>Granted On</th>
                                            <th>Expires At</th>
                                            <th>Status</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {delegations.allActive.map(d => {
                                            const isExpired = new Date(d.expires_at) < new Date();
                                            return (
                                                <tr key={d.id}>
                                                    <td>{d.grantor_username}</td>
                                                    <td>{d.grantee_username}</td>
                                                    <td>{new Date(d.created_at).toLocaleString()}</td>
                                                    <td>{new Date(d.expires_at).toLocaleString()}</td>
                                                    <td>
                                                        <span className={`badge ${isExpired ? 'badge-danger' : 'badge-success'}`}>
                                                            {isExpired ? 'Expired' : 'Active'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button className="btn btn-sm btn-danger" onClick={() => handleRevokeDelegation(d.id)}>Revoke</button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'explorer' && (
                <div className="tab-content animate-fade-in">
                    <section className="explorer-section">
                        <div className="explorer-header-info">
                            <h2>🧠 Universal AI Data Explorer</h2>
                            <p className="text-muted">Query your entire database using natural language. The AI translates your prompt into specialized EAV-SQL.</p>
                        </div>
                        
                        <div className="glass-card explorer-input-card">
                            <form onSubmit={handleExplorerQuery} className="explorer-form">
                                <input 
                                    type="text" 
                                    className="form-input explorer-input"
                                    placeholder="e.g., 'Find all students from Punjab with CGPA > 9'"
                                    value={explorerPrompt}
                                    onChange={(e) => setExplorerPrompt(e.target.value)}
                                    disabled={explorerLoading}
                                />
                                <button type="submit" className="btn btn-primary explorer-submit" disabled={explorerLoading || !explorerPrompt.trim()}>
                                    {explorerLoading ? <div className="spinner-sm"></div> : 'Ask AI'}
                                </button>
                            </form>
                        </div>

                        {explorerResults && (
                            <div className="explorer-results-area animate-fade-in">
                                <div className="sql-preview glass-card">
                                    <div className="sql-header">
                                        <span>📜 Generated SQL</span>
                                        <button className="btn-copy" onClick={() => navigator.clipboard.writeText(explorerResults.sql)}>Copy</button>
                                    </div>
                                    <code>{explorerResults.sql}</code>
                                </div>

                                <div className="results-table-container glass-card scrollable-table-wrapper">
                                    <div className="results-meta">
                                        Found {explorerResults.rowCount} matching entries
                                    </div>
                                    {explorerResults.rows.length > 0 ? (() => {
                                        // 1. Identify all dynamic keys from the 'Data' column
                                        const dataKeys = new Set();
                                        explorerResults.rows.forEach(row => {
                                            if (row.Data && typeof row.Data === 'object') {
                                                Object.keys(row.Data).forEach(k => dataKeys.add(k));
                                            }
                                        });
                                        const dynamicHeaders = Array.from(dataKeys).sort();
                                        const fixedHeaders = Object.keys(explorerResults.rows[0]).filter(k => k !== 'Data');
                                        const allHeaders = [...fixedHeaders, ...dynamicHeaders];

                                        return (
                                            <table className="admin-table">
                                                <thead>
                                                    <tr>{allHeaders.map(h => <th key={h}>{h}</th>)}</tr>
                                                </thead>
                                                <tbody>
                                                    {explorerResults.rows.map((row, i) => (
                                                        <tr key={i}>
                                                            {fixedHeaders.map(h => <td key={h}>{row[h]?.toString() || '-'}</td>)}
                                                            {dynamicHeaders.map(h => {
                                                                let val = row.Data ? row.Data[h] : '-';
                                                                if (typeof val === 'string') val = val.replace(/ \|\|\| /g, ', ');
                                                                return <td key={h}>{val || '-'}</td>;
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        );
                                    })() : (
                                        <div className="empty-results">No data matches this query.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="tab-content animate-fade-in">
                    <section className="stats-section">
                        <h2>Global Statistics</h2>
                        <div className="stats-grid">
                            <div className="stat-card glass-card">
                                <div className="stat-icon">👥</div>
                                <div className="stat-content">
                                    <div className="stat-number">{stats.total_users}</div>
                                    <div className="stat-label">Total Users</div>
                                </div>
                            </div>
                            <div className="stat-card glass-card">
                                <div className="stat-icon">📋</div>
                                <div className="stat-content">
                                    <div className="stat-number">{stats.total_forms}</div>
                                    <div className="stat-label">Total Forms</div>
                                </div>
                            </div>
                            <div className="stat-card glass-card">
                                <div className="stat-icon">📝</div>
                                <div className="stat-content">
                                    <div className="stat-number">{stats.total_submissions}</div>
                                    <div className="stat-label">Total Submissions</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="users-section">
                        <h2>User Activity Details</h2>
                        <div className="table-container glass-card scrollable-table-wrapper">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>Role</th>
                                        <th>Joined</th>
                                        <th>Forms</th>
                                        <th>Submissions</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.users.map(userItem => (
                                        <tr key={userItem.id} className={userItem.role === 'admin' ? 'admin-row' : ''}>
                                            <td className="user-name">
                                                {userItem.role === 'admin' ? '👑 ' : '👤 '}
                                                {userItem.username}
                                            </td>
                                            <td>
                                                <span className={`badge badge-${userItem.role}`}>
                                                    {userItem.role}
                                                </span>
                                            </td>
                                            <td>{new Date(userItem.created_at).toLocaleDateString()}</td>
                                            <td className="text-center">{userItem.form_count}</td>
                                            <td className="text-center">{userItem.submission_count}</td>
                                            <td>
                                                <div className="admin-actions">
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => viewUserForms(userItem.id)}
                                                        disabled={actionLoading}
                                                        title="View Forms"
                                                    >📂</button>
                                                    <button
                                                        className="btn btn-sm btn-accent"
                                                        onClick={() => setProfileModal({ 
                                                            open: true, 
                                                            userId: userItem.id, 
                                                            username: userItem.username, 
                                                            originalUsername: userItem.username,
                                                            newPassword: '' 
                                                        })}
                                                        disabled={actionLoading}
                                                        title="Edit Profile"
                                                    >👤</button>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handleChangeRole(userItem.id, userItem.role, userItem.username)}
                                                        disabled={actionLoading || userItem.id === user?.id}
                                                        title="Toggle Role"
                                                    >{userItem.role === 'admin' ? '👤' : '👑'}</button>
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleDeleteUser(userItem.id, userItem.username)}
                                                        disabled={actionLoading || userItem.id === user?.id}
                                                        title="Delete User"
                                                    >🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'approvals' && (
                <div className="tab-content animate-fade-in">
                    <section className="logs-section">
                        <h2>Approval & Activity Tracking</h2>
                        <div className="table-container glass-card scrollable-table-wrapper">
                            {logsLoading ? (
                                <div className="spinner-container"><div className="spinner"></div></div>
                            ) : logs.length === 0 ? (
                                <div className="empty-logs">No activity recorded yet.</div>
                            ) : (
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Form Name</th>
                                            <th>Requester</th>
                                            <th>Action</th>
                                            <th>Performed By</th>
                                            <th>Timestamp</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map(log => (
                                            <tr key={log.id}>
                                                <td>{log.form_name}</td>
                                                <td>{log.requester}</td>
                                                <td>
                                                    <span className={`badge badge-action-${log.action}`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td>{log.performer || 'System'}</td>
                                                <td>{new Date(log.timestamp).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {selectedUserId && (
                <div className="modal-overlay" onClick={closeUserFormsModal}>
                    <div className="modal glass-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Forms by {selectedUser?.username}</h2>
                            <button className="btn-close" onClick={closeUserFormsModal}>✕</button>
                        </div>
                        <div className="modal-content">
                            {userFormsLoading ? <div className="spinner"></div> : (
                                <div className="forms-list">
                                    {userForms.map(form => (
                                        <div key={form.id} className="form-item glass-card">
                                            <div className="form-item-header">
                                                <h4>{form.name}</h4>
                                                {form.is_locked && <span className="badge badge-locked">🔒</span>}
                                            </div>
                                            <div className="form-item-meta">
                                                <span>v{form.version_number}</span>
                                                <span>{form.submission_count} submissions</span>
                                            </div>
                                            <button className="btn btn-sm btn-secondary" onClick={() => { navigate(`/forms/${form.id}/submissions`); closeUserFormsModal(); }}>View</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {profileModal.open && (
                <div className="modal-overlay" onClick={() => setProfileModal({ ...profileModal, open: false })}>
                    <div className="modal glass-card" onClick={e => e.stopPropagation()}>
                        <h2>Edit Profile: {profileModal.originalUsername}</h2>
                        <form onSubmit={handleProfileUpdate}>
                            <div className="form-group">
                                <label>Username</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={profileModal.username}
                                    onChange={(e) => setProfileModal({ ...profileModal, username: e.target.value })}
                                    placeholder="Enter username"
                                    required
                                    minLength={3}
                                />
                            </div>
                            <div className="form-group">
                                <label>New Password (Optional)</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={profileModal.newPassword}
                                    onChange={(e) => setProfileModal({ ...profileModal, newPassword: e.target.value })}
                                    placeholder="Leave blank to keep current"
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setProfileModal({ ...profileModal, open: false })}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={actionLoading}>Update Profile</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateUserModal && (
                <div className="modal-overlay" onClick={() => setShowCreateUserModal(false)}>
                    <div className="modal glass-card" onClick={e => e.stopPropagation()}>
                        <h2>Create New User</h2>
                        <form onSubmit={handleCreateUser}>
                            <div className="form-group">
                                <label>Username</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newUser.username}
                                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                                    placeholder="Enter username"
                                    autoFocus
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Password</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={newUser.password}
                                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                    placeholder="Min. 6 characters"
                                    required
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateUserModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={actionLoading}>Create User</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
