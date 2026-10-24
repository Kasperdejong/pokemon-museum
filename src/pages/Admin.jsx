import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export default function Admin() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('pokemon'); // 'pokemon' or 'fanart'
  const [pendingPokemon, setPendingPokemon] = useState([]);
  const [pendingFanart, setPendingFanart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inspectArtwork, setInspectArtwork] = useState(null);
  const [streamerMode, setStreamerMode] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchAllPending();
      else setLoading(false);
    });
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert('Login failed: ' + error.message);
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      fetchAllPending();
    }
  }

  async function fetchAllPending() {
    setLoading(true);
    try {
      const { data: pokeData } = await supabase
        .from('submissions')
        .select('*')
        .eq('is_approved', false)
        .order('created_at', { ascending: false });

      setPendingPokemon(pokeData || []);

      const { data: fanartData } = await supabase
        .from('fanart_submissions')
        .select('*')
        .eq('is_approved', false)
        .order('created_at', { ascending: false });

      setPendingFanart(fanartData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const isPokemonTab = activeTab === 'pokemon';
  const currentList = isPokemonTab ? pendingPokemon : pendingFanart;
  const currentTable = isPokemonTab ? 'submissions' : 'fanart_submissions';

  async function approve(item, isFeatured = false) {
    try {
      const { error } = await supabase
        .from(currentTable)
        .update({ is_approved: true, is_featured: isFeatured })
        .eq('id', item.id);

      if (error) throw error;

      if (isPokemonTab) {
        setPendingPokemon((prev) => prev.filter((d) => d.id !== item.id));
      } else {
        setPendingFanart((prev) => prev.filter((d) => d.id !== item.id));
      }

      if (inspectArtwork?.id === item.id) setInspectArtwork(null);
    } catch (err) {
      alert('Approval failed: ' + err.message);
    }
  }

  async function reject(item, bypassConfirm = false) {
    if (!bypassConfirm) {
      const title = item.pokemon_name || item.title;
      const confirmed = window.confirm(`Reject and delete "${title}" by "${item.artist_name}"?`);
      if (!confirmed) return;
    }

    try {
      const urlParts = item.image_url.split('/');
      const fileName = urlParts[urlParts.length - 1];

      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      }

      const { error } = await supabase.from(currentTable).delete().eq('id', item.id);
      if (error) throw error;

      if (isPokemonTab) {
        setPendingPokemon((prev) => prev.filter((d) => d.id !== item.id));
      } else {
        setPendingFanart((prev) => prev.filter((d) => d.id !== item.id));
      }

      if (inspectArtwork?.id === item.id) setInspectArtwork(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  const handleKeyDown = useCallback((e) => {
    if (!inspectArtwork) return;
    if (e.key === 'a' || e.key === 'A') {
      approve(inspectArtwork, false);
    } else if (e.key === 'f' || e.key === 'F') {
      approve(inspectArtwork, true);
    } else if (e.key === 'x' || e.key === 'X') {
      reject(inspectArtwork, true);
    } else if (e.key === 'Escape') {
      setInspectArtwork(null);
    }
  }, [inspectArtwork, isPokemonTab]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={{
      flex: 1,
      minHeight: 'calc(100dvh - 54px)',
      width: '100%',
      backgroundImage: 'linear-gradient(rgba(18, 18, 18, 0.88), rgba(18, 18, 18, 0.88)), url(/pokeballs.jpg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px auto',
      padding: '30px 20px 60px',
      boxSizing: 'border-box',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {!session ? (
          <div style={{
            maxWidth: '420px',
            margin: '60px auto',
            background: 'rgba(255, 255, 255, 0.96)',
            borderRadius: '12px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.3)',
            color: '#111'
          }}>
            <h2 style={{ marginTop: 0, color: '#000', fontSize: '22px' }}>Admin Login</h2>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input 
                type="email" 
                placeholder="Admin Email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc' }}
              />
              <input 
                type="password" 
                placeholder="Admin Password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc' }}
              />
              <button 
                type="submit" 
                style={{ background: '#ff9800', color: '#000', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Log In to Admin
              </button>
            </form>
          </div>
        ) : (
          <>
            <header style={{
              background: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(8px)',
              padding: '18px 24px',
              borderRadius: '12px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', color: '#000', fontWeight: 'bold' }}>
                  Moderation Queue
                </h1>
                <p style={{ margin: '4px 0 0 0', color: '#444', fontSize: '14px' }}>
                  Hotkeys in enlarged viewer: <strong>[A]</strong> Approve &bull; <strong style={{ color: '#d97706' }}>[F] ★ Star Featured</strong> &bull; <strong>[X]</strong> Reject
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: streamerMode ? '#fee2e2' : '#f3f4f6',
                  color: streamerMode ? '#991b1b' : '#374151',
                  border: `1.5px solid ${streamerMode ? '#f87171' : '#d1d5db'}`,
                  padding: '8px 14px',
                  borderRadius: '20px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={streamerMode}
                    onChange={(e) => setStreamerMode(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Streamer Safe Mode (Blur Art)
                </label>
              </div>
            </header>

            {/* Queue Switcher Tabs */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <button
                onClick={() => setActiveTab('pokemon')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'pokemon' ? '#ff9800' : '#ffffff',
                  color: activeTab === 'pokemon' ? '#000' : '#444',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                Pokémon Drawings ({pendingPokemon.length})
              </button>
              <button
                onClick={() => setActiveTab('fanart')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'fanart' ? '#ff9800' : '#ffffff',
                  color: activeTab === 'fanart' ? '#000' : '#444',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                Fanart Submissions ({pendingFanart.length})
              </button>
            </div>

            {loading ? (
              <p style={{ color: '#fff', textAlign: 'center', padding: '40px', fontSize: '18px' }}>Loading queue...</p>
            ) : currentList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255, 255, 255, 0.96)', borderRadius: '12px', color: '#111' }}>
                <h2 style={{ margin: '0 0 8px 0', color: '#000' }}>Queue is clear!</h2>
                <p style={{ color: '#444' }}>No items waiting for review in this category.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                {currentList.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid #ccc',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <div 
                      onClick={() => setInspectArtwork(item)}
                      title="Click to inspect full-size image"
                      style={{
                        height: '240px',
                        background: '#f2f4f7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px',
                        cursor: 'zoom-in',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <img 
                        src={item.image_url} 
                        alt="" 
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                          filter: streamerMode ? 'blur(22px)' : 'none',
                          transition: 'filter 0.2s ease'
                        }} 
                      />
                      {streamerMode && (
                        <div style={{
                          position: 'absolute',
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          pointerEvents: 'none'
                        }}>
                          Click to Reveal
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase', fontWeight: 'bold' }}>
                          {isPokemonTab ? 'Pokémon' : 'Title'}
                        </span>
                        <div style={{ fontSize: '17px', fontWeight: 'bold', color: '#000' }}>
                          {item.pokemon_name || item.title}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase', fontWeight: 'bold' }}>Artist</span>
                        <div style={{ fontSize: '14px', color: '#222', fontWeight: '600' }}>{item.artist_name}</div>
                      </div>

                      {item.description && (
                        <div>
                          <span style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase', fontWeight: 'bold' }}>Description</span>
                          <div style={{ fontSize: '13px', color: '#444' }}>{item.description}</div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px' }}>
                        <button
                          onClick={() => approve(item, false)}
                          style={{ flex: 1, background: '#22c55e', color: '#000', border: 'none', padding: '9px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
                        >
                          Approve
                        </button>

                        {/* Yellow Star Action Button */}
                        <button
                          onClick={() => approve(item, true)}
                          title="Approve & Feature with Yellow Star!"
                          style={{
                            background: '#18181b',
                            color: '#eab308',
                            border: '1.5px solid #eab308',
                            padding: '9px 13px',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontSize: '17px',
                            lineHeight: 1,
                            boxShadow: '0 0 10px rgba(234, 179, 8, 0.35)'
                          }}
                        >
                          ★
                        </button>

                        <button
                          onClick={() => reject(item, false)}
                          style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '9px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Lightbox Modal */}
            {inspectArtwork && (
              <div 
                onClick={() => setInspectArtwork(null)} 
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.92)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  padding: '20px'
                }}
              >
                <div 
                  onClick={(e) => e.stopPropagation()} 
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    maxWidth: '90vw',
                    maxHeight: '92vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{ maxHeight: '72vh', background: '#0a0a0a', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
                    <img 
                      src={inspectArtwork.image_url} 
                      alt="" 
                      style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }} 
                    />
                  </div>

                  <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h2 style={{ margin: 0, color: '#000', fontSize: '18px' }}>
                        {inspectArtwork.pokemon_name || inspectArtwork.title}
                      </h2>
                      <p style={{ margin: '2px 0 0 0', color: '#444', fontSize: '13px' }}>
                        Artist: <strong>{inspectArtwork.artist_name}</strong>
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button
                        onClick={() => approve(inspectArtwork, false)}
                        style={{ background: '#22c55e', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Approve [A]
                      </button>

                      {/* Prominent Yellow Star in Lightbox */}
                      <button
                        onClick={() => approve(inspectArtwork, true)}
                        style={{
                          background: '#18181b',
                          color: '#eab308',
                          border: '1.5px solid #eab308',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 0 10px rgba(234, 179, 8, 0.4)'
                        }}
                      >
                        <span style={{ fontSize: '18px', lineHeight: 1 }}>★</span> Star [F]
                      </button>

                      <button
                        onClick={() => reject(inspectArtwork, true)}
                        style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Reject [X]
                      </button>

                      <button
                        onClick={() => setInspectArtwork(null)}
                        style={{ background: '#eee', color: '#111', border: '1px solid #ccc', padding: '8px 14px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Close [Esc]
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}