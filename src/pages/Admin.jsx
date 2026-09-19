import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Admin() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inspectArtwork, setInspectArtwork] = useState(null); // Click to zoom full-size

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchPending();
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
      fetchPending();
    }
  }

  async function fetchPending() {
    setLoading(true);
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    if (error) console.error(error);
    else setPendingList(data || []);
    setLoading(false);
  }

  async function approve(item) {
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ is_approved: true })
        .eq('id', item.id);

      if (error) throw error;
      setPendingList((prev) => prev.filter((d) => d.id !== item.id));
      if (inspectArtwork?.id === item.id) setInspectArtwork(null);
    } catch (err) {
      alert('Approval failed: ' + err.message);
    }
  }

  async function reject(item) {
    const confirmed = window.confirm(
      `Reject and permanently delete "${item.pokemon_name}" by "${item.artist_name}"?`
    );
    if (!confirmed) return;

    try {
      const urlParts = item.image_url.split('/');
      const fileName = urlParts[urlParts.length - 1];

      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      }

      const { error } = await supabase.from('submissions').delete().eq('id', item.id);
      if (error) throw error;

      setPendingList((prev) => prev.filter((d) => d.id !== item.id));
      if (inspectArtwork?.id === item.id) setInspectArtwork(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

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

        {/* 1. Login Screen (if not logged in) */}
        {!session ? (
          <div style={{
            maxWidth: '420px',
            margin: '60px auto',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            borderRadius: '12px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.3)',
            color: '#111'
          }}>
            <h2 style={{ marginTop: 0, color: '#000', fontSize: '22px' }}>Admin Login 🛡️</h2>
            <p style={{ color: '#444', fontSize: '14px', marginBottom: '20px' }}>Log in to access the community review queue.</p>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input 
                type="email" 
                placeholder="Admin Email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}
              />
              <input 
                type="password" 
                placeholder="Admin Password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}
              />
              <button 
                type="submit" 
                style={{ 
                  background: '#ff9800', 
                  color: '#000', 
                  border: 'none', 
                  padding: '12px', 
                  borderRadius: '6px', 
                  fontWeight: 'bold', 
                  fontSize: '15px', 
                  cursor: 'pointer' 
                }}
              >
                Log In to Admin
              </button>
            </form>
          </div>
        ) : (
          /* 2. Moderation Dashboard */
          <>
            {/* Header Banner */}
            <header style={{
              background: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(8px)',
              padding: '18px 24px',
              borderRadius: '12px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
              marginBottom: '24px',
              color: '#111',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', color: '#000', fontWeight: 'bold' }}>
                  Moderation Queue 🛡️
                </h1>
                <p style={{ margin: '4px 0 0 0', color: '#333', fontSize: '14px' }}>
                  Review artwork, check for copycats, and inspect Pokémon names.
                </p>
              </div>

              <div style={{
                background: pendingList.length > 0 ? '#fff3e0' : '#e8f5e9',
                color: pendingList.length > 0 ? '#bf360c' : '#1b5e20',
                border: `1px solid ${pendingList.length > 0 ? '#ffe0b2' : '#c8e6c9'}`,
                padding: '8px 16px',
                borderRadius: '20px',
                fontWeight: 'bold',
                fontSize: '14px'
              }}>
                {pendingList.length} Pending {pendingList.length === 1 ? 'Drawing' : 'Drawings'}
              </div>
            </header>

            {loading ? (
              <p style={{ color: '#fff', textAlign: 'center', padding: '40px', fontSize: '18px' }}>Loading queue...</p>
            ) : pendingList.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: 'rgba(255, 255, 255, 0.96)',
                borderRadius: '12px',
                color: '#111'
              }}>
                <h2 style={{ margin: '0 0 8px 0', color: '#000' }}>Queue is all clear!</h2>
                <p style={{ color: '#444' }}>No drawings are currently waiting for your review.</p>
              </div>
            ) : (
              /* Review Cards Grid */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                {pendingList.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid #ccc',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                      display: 'flex',
                      flexDirection: 'column',
                      color: '#111'
                    }}
                  >
                    {/* Big Clickable Image Preview */}
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
                        position: 'relative'
                      }}
                    >
                      <img 
                        src={item.image_url} 
                        alt={item.pokemon_name} 
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                      />
                      <span style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        background: 'rgba(0,0,0,0.7)',
                        color: '#fff',
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px'
                      }}>
                        🔍 Enlarge
                      </span>
                    </div>

                    {/* Metadata & Actions */}
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase', fontWeight: 'bold' }}>Pokémon Name</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000' }}>{item.pokemon_name}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase', fontWeight: 'bold' }}>Artist Handle</div>
                        <div style={{ fontSize: '15px', color: '#222', fontWeight: '600' }}>{item.artist_name}</div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '10px' }}>
                        <button
                          onClick={() => approve(item)}
                          style={{
                            flex: 1,
                            background: '#22c55e',
                            color: '#000',
                            border: 'none',
                            padding: '10px',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          Approve ✅
                        </button>
                        <button
                          onClick={() => reject(item)}
                          style={{
                            flex: 1,
                            background: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            padding: '10px',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          Reject ❌
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inspection Lightbox Modal */}
            {inspectArtwork && (
              <div 
                onClick={() => setInspectArtwork(null)} 
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
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
                    flexDirection: 'column',
                    boxShadow: '0 12px 35px rgba(0,0,0,0.6)'
                  }}
                >
                  <div style={{ maxHeight: '72vh', background: '#0a0a0a', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
                    <img 
                      src={inspectArtwork.image_url} 
                      alt="" 
                      style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }} 
                    />
                  </div>

                  <div style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', color: '#111', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      <h2 style={{ margin: 0, color: '#000', fontSize: '20px' }}>{inspectArtwork.pokemon_name}</h2>
                      <p style={{ margin: '4px 0 0 0', color: '#444', fontSize: '14px' }}>Artist: <strong>{inspectArtwork.artist_name}</strong></p>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        onClick={() => approve(inspectArtwork)}
                        style={{ background: '#22c55e', color: '#000', border: 'none', padding: '9px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Approve ✅
                      </button>
                      <button
                        onClick={() => reject(inspectArtwork)}
                        style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Reject ❌
                      </button>
                      <button
                        onClick={() => setInspectArtwork(null)}
                        style={{ background: '#eee', color: '#111', border: '1px solid #ccc', padding: '9px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        Close
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