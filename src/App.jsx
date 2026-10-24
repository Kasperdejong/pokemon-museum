import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Gallery from './pages/Gallery';
import Fanart from './pages/Fanart';
import Submit from './pages/Submit';
import Admin from './pages/Admin';
import MySubmissions from './pages/MySubmissions';
import { supabase } from './supabaseClient';

function NavigationBar({ session, setSession }) {
  const navigate = useNavigate();
  const [artCount, setArtCount] = useState(null);

  useEffect(() => {
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
      paddingTop: '8px',
      paddingBottom: '6px', /* Reduced bottom padding */
      paddingLeft: '20px',
      paddingRight: '20px',
      background: '#222',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      rowGap: '8px',
      columnGap: '16px',
      boxShadow: '0 3px 10px rgba(0,0,0,0.2)'
    }}>
      {/* Left side links */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img 
            src="/favicon.ico" 
            alt="Favicon" 
            style={{ width: '30px', height: '30px', objectFit: 'contain' }} 
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
          Pokémon Museum
        </Link>

        <Link to="/kavhan" style={{ color: '#ff9800', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <img 
            src="/kavhan.png" 
            alt="Kavhan" 
            style={{ width: '30px', height: '30px', objectFit: 'contain' }} 
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
          Kavhan's Drawings
        </Link>

        <Link to="/submit" style={{ color: '#ddd', textDecoration: 'none', fontSize: '14px' }}>
          Submit Art
        </Link>

        <Link to="/my-submissions" style={{ color: '#ffcb05', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }}>
          My Submissions
        </Link>
      </div>

      {/* Right side: Fanart with Aegislash -> Scolipede -> Counter -> Admin */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link 
          to="/fanart" 
          style={{ 
            color: '#e0e7ff', 
            textDecoration: 'none', 
            fontWeight: 'bold', 
            fontSize: '14px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '7px'
          }}
        >
          <img 
            src="/Aegislash_sword.png" 
            alt="Fanart" 
            style={{ width: '32px', height: '32px', objectFit: 'contain' }} 
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
          Fanart
        </Link>

        {artCount !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <img 
              src="/Scolipede.png" 
              alt="Scolipede" 
              style={{ width: '32px', height: '32px', objectFit: 'contain' }} 
              onError={(e) => { e.currentTarget.style.display = 'none'; }} 
            />
            <span style={{
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#ffcb05',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 'bold',
              border: '1.5px solid rgba(255, 203, 5, 0.35)',
              whiteSpace: 'nowrap'
            }}>
              {artCount} Total {artCount === 1 ? 'Drawing' : 'Drawings'}
            </span>
          </div>
        )}

        {session && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link 
              to="/admin" 
              style={{
                background: '#2e7d32',
                color: '#fff',
                textDecoration: 'none',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}
            >
              Admin Dashboard
            </Link>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: '1px solid #777',
                color: '#eee',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Log Out
            </button>
          </div>
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
            <Route path="/fanart" element={<Fanart />} />
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