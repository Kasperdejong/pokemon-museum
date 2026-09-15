import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Gallery from './pages/Gallery';
import Submit from './pages/Submit';
import Admin from './pages/Admin';
import MySubmissions from './pages/MySubmissions';
import { supabase } from './supabaseClient';

// Inner component so we can use hooks like useNavigate
function NavigationBar({ session, setSession }) {
  const navigate = useNavigate();

  // ⌨️ Secret shortcut: Ctrl+Shift+A (or Cmd+Shift+A on Mac) jumps to Admin
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        navigate('/admin');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    navigate('/');
  }

  return (
    <nav style={{
      padding: '14px 24px',
      background: '#222',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
    }}>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 'bold', fontSize: '18px' }}>
          Pokémon Museum
        </Link>
        <Link to="/submit" style={{ color: '#ddd', textDecoration: 'none', fontSize: '15px' }}>
          Submit Art
        </Link>
        <Link to="/my-submissions" style={{ color: '#ffcb05', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px' }}>
          My Submissions
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        {/* 👑 Show Admin badge in the navbar ONLY when you are logged in */}
        {session ? (
          <>
            <Link 
              to="/admin" 
              style={{
                background: '#2e7d32',
                color: '#fff',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              👑 Admin Dashboard
            </Link>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: '1px solid #666',
                color: '#ccc',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Log Out
            </button>
          </>
        ) : null}
      </div>
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState(null);

  // Listen to Supabase auth changes across the entire app
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fcfcfc' }}>
        {/* Top Navbar */}
        <NavigationBar session={session} setSession={setSession} />

        {/* Page Content */}
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Gallery />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/my-submissions" element={<MySubmissions />} />
          </Routes>
        </main>

        {/* Subtle Footer with Discreet Admin Access */}
        <footer style={{
          padding: '24px 20px',
          background: '#f4f4f4',
          borderTop: '1px solid #e0e0e0',
          textAlign: 'center',
          fontSize: '13px',
          color: '#888',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>Pokémon Community Museum &copy; {new Date().getFullYear()}</div>

          <div>
            {session ? (
              <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>Logged in as Admin</span>
            ) : (
              /* Discreet link so you don't have to type the URL */
              <Link to="/admin" style={{ color: '#aaa', textDecoration: 'none', fontSize: '12px' }}>
                Admin Access 🔒
              </Link>
            )}
          </div>
        </footer>
      </div>
    </Router>
  );
}