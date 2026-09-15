import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Gallery from './pages/Gallery';
import Submit from './pages/Submit';
import Admin from './pages/Admin';
import MySubmissions from './pages/MySubmissions';
import { supabase } from './supabaseClient';

function NavigationBar({ session, setSession }) {
  const navigate = useNavigate();

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
        {session && (
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
                fontWeight: 'bold'
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
        )}
      </div>
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState(null);

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
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <NavigationBar session={session} setSession={setSession} />

        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Gallery />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/my-submissions" element={<MySubmissions />} />
          </Routes>
        </main>

        {/* 📍 Floating Global Copyright: Sticks to bottom-left on ALL pages without any footer block */}
        <div style={{
          position: 'fixed',
          bottom: '8px',
          left: '12px',
          fontSize: '11px',
          color: '#888',
          opacity: 0.6,
          zIndex: 90,
          pointerEvents: 'none', // Lets viewers click things behind it
          userSelect: 'none',
          textShadow: '0 0 3px rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.3)' // Legible on both light and dark backgrounds
        }}>
          Pokémon Community Museum &copy; {new Date().getFullYear()}
        </div>
      </div>
    </Router>
  );
}