import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Gallery from './pages/Gallery';
import Submit from './pages/Submit';
import Admin from './pages/Admin';
import MySubmissions from './pages/MySubmissions';
import { supabase } from './supabaseClient';

function NavigationBar({ session, setSession }) {
  const navigate = useNavigate();
  const [artCount, setArtCount] = useState(null);

  useEffect(() => {
    // Fetch live global count of approved artwork
    supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', true)
      .then(({ count }) => {
        if (count !== null) setArtCount(count);
      });
  }, []);

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
        <Link to="/kavhan" style={{ color: '#ff9800', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px' }}>
          Kavhan's Drawings
        </Link>
        <Link to="/submit" style={{ color: '#ddd', textDecoration: 'none', fontSize: '15px' }}>
          Submit Art
        </Link>
        <Link to="/my-submissions" style={{ color: '#ffcb05', textDecoration: 'none', fontWeight: 'bold', fontSize: '15px' }}>
          My Submissions
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        {artCount !== null && (
          <span style={{
            background: 'rgba(255, 255, 255, 0.12)',
            color: '#ffcb05',
            padding: '5px 12px',
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: 'bold',
            border: '1px solid rgba(255, 203, 5, 0.3)'
          }}>
            🎨 {artCount} {artCount === 1 ? 'Total Drawing' : 'Total Drawings'}
          </span>
        )}

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
              Admin Dashboard
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
            <Route path="/" element={<Gallery key="museum" />} />
            <Route path="/kavhan" element={<Gallery key="kavhan" instructorMode={true} />} />
            <Route path="/artist/:artistParam" element={<Gallery key="artist" />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/my-submissions" element={<MySubmissions />} />
          </Routes>
        </main>

        <div style={{
          position: 'fixed',
          bottom: '8px',
          left: '12px',
          fontSize: '11px',
          color: '#888',
          opacity: 0.6,
          zIndex: 90,
          pointerEvents: 'none',
          userSelect: 'none',
          textShadow: '0 0 3px rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.3)'
        }}>
          Pokémon Community Museum &copy; {new Date().getFullYear()}
        </div>
      </div>
    </Router>
  );
}