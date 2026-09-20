import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

const COOLDOWN_KEY = 'poke_museum_last_submit';
const HANDLES_KEY = 'poke_my_claimed_handles';

export default function MySubmissions() {
  const [savedHandles, setSavedHandles] = useState([]);
  const [activeArtist, setActiveArtist] = useState('');
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [viewMode, setViewMode] = useState('showcase');
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 1. Load handles used on this device
    const handles = JSON.parse(localStorage.getItem(HANDLES_KEY) || '[]');
    setSavedHandles(handles);

    const active = localStorage.getItem('poke_active_artist') || handles[0] || '';
    setActiveArtist(active);

    // 2. Load cached submissions from device memory
    const local = JSON.parse(localStorage.getItem('poke_my_submissions') || '[]');
    setAllSubmissions(local);

    // 3. 🧹 Check live status and PURGE deleted/rejected items!
    if (local.length > 0) {
      const ids = local.map((item) => item.id);

      supabase
        .rpc('check_submissions_status', { p_ids: ids })
        .then(({ data, error }) => {
          if (data) {
            const existingMap = new Map(data.map((r) => [r.id, r.is_approved]));

            // Only keep items that ACTUALLY still exist in the database!
            const stillExisting = local.filter((item) => existingMap.has(item.id));

            // If any drawings were deleted by the admin, scrub them from localStorage immediately!
            if (stillExisting.length !== local.length) {
              localStorage.setItem('poke_my_submissions', JSON.stringify(stillExisting));
              setAllSubmissions(stillExisting);
            }

            const map = {};
            data.forEach((row) => {
              map[row.id] = row.is_approved ? 'approved' : 'pending';
            });
            setStatusMap(map);
          }
        });
    }
  }, []);

  function handleSwitchArtist(newArtist) {
    setActiveArtist(newArtist);
    localStorage.setItem('poke_active_artist', newArtist);
  }

  // Filter so handles never mix!
  const filteredList = allSubmissions.filter((item) => {
    if (!activeArtist) return true;
    return item.artist_name.toLowerCase() === activeArtist.toLowerCase();
  });

  async function handleRetract(item, e) {
    if (e) e.stopPropagation();

    const confirmDelete = window.confirm(
      `Retract "${item.pokemon_name}"?\n\nThis will remove your submission from review and immediately reset your cooldown timer so you can submit again!`
    );
    if (!confirmDelete) return;

    try {
      const { data: fileName, error: dbError } = await supabase.rpc('delete_my_submission', {
        target_id: item.id,
        token: item.delete_token
      });

      if (dbError) throw dbError;

      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      } else {
        const urlParts = item.image_url.split('/');
        const fallbackName = urlParts[urlParts.length - 1];
        if (fallbackName) await supabase.storage.from('drawings').remove([fallbackName]);
      }

      const updated = allSubmissions.filter((d) => d.id !== item.id);
      localStorage.setItem('poke_my_submissions', JSON.stringify(updated));
      setAllSubmissions(updated);

      if (selectedArtwork?.id === item.id) setSelectedArtwork(null);
      localStorage.removeItem(COOLDOWN_KEY);

      alert('Submission retracted! Cooldown reset. You can submit again now.');
    } catch (err) {
      console.error(err);
      alert('Could not retract: ' + err.message);
    }
  }

  function copyMyMuseumLink() {
    if (!activeArtist) return;
    const url = `${window.location.origin}/artist/${encodeURIComponent(activeArtist)}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
        
        {/* Header Banner */}
        <header style={{
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          padding: '20px 24px',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
          marginBottom: '20px',
          color: '#111',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '24px', color: '#000', fontWeight: 'bold' }}>
                {activeArtist ? `${activeArtist}'s Museum 🎨` : 'My Submissions'}
              </h1>

              {/* 🔄 Instant Dropdown Switcher */}
              {savedHandles.length > 1 && (
                <select
                  value={activeArtist}
                  onChange={(e) => handleSwitchArtist(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1.5px solid #000',
                    background: '#fff',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                  }}
                >
                  {savedHandles.map((h) => (
                    <option key={h} value={h}>👤 {h}</option>
                  ))}
                </select>
              )}
            </div>

            <p style={{ margin: '6px 0 0 0', color: '#333', fontSize: '14px' }}>
              {activeArtist 
                ? `Showing drawings created on this device under "${activeArtist}".` 
                : 'Manage and view submissions made from this browser.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {activeArtist && (
              <button
                onClick={copyMyMuseumLink}
                style={{
                  background: copied ? '#2e7d32' : '#f0f0f0',
                  color: copied ? '#fff' : '#111',
                  border: '1.5px solid #000',
                  padding: '9px 15px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.15)'
                }}
              >
                {copied ? '✓ Link Copied!' : '🔗 Share My Museum'}
              </button>
            )}

            <Link to="/submit">
              <button style={{
                background: '#ff9800',
                color: '#000',
                border: '1.5px solid #000',
                padding: '9px 16px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 3px 6px rgba(0,0,0,0.2)'
              }}>
                Submit New Art 🎨
              </button>
            </Link>
          </div>
        </header>

        {/* View Switcher: Showcase vs. Manage */}
        {filteredList.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '22px',
            background: 'rgba(255, 255, 255, 0.96)',
            padding: '10px 18px',
            borderRadius: '10px',
            color: '#111',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setViewMode('showcase')}
                style={{
                  background: viewMode === 'showcase' ? '#ff9800' : '#eee',
                  color: viewMode === 'showcase' ? '#000' : '#333',
                  border: viewMode === 'showcase' ? '1.5px solid #000' : '1px solid #ccc',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  boxShadow: viewMode === 'showcase' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
                }}
              >
                🏛️ Museum Showcase
              </button>
              <button
                onClick={() => setViewMode('manage')}
                style={{
                  background: viewMode === 'manage' ? '#ff9800' : '#eee',
                  color: viewMode === 'manage' ? '#000' : '#333',
                  border: viewMode === 'manage' ? '1.5px solid #000' : '1px solid #ccc',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  boxShadow: viewMode === 'manage' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
                }}
              >
                ⚙️ Manage drawings
              </button>
            </div>

            <span style={{ fontSize: '13px', color: '#333', fontWeight: 'bold' }}>
              {filteredList.length} {filteredList.length === 1 ? 'drawing' : 'drawings'}
            </span>
          </div>
        )}

        {/* Empty State */}
        {filteredList.length === 0 ? (
          <div style={{
            padding: '50px 20px',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.96)',
            borderRadius: '12px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            color: '#111'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#000', fontSize: '20px' }}>
              {activeArtist ? `No drawings found for "${activeArtist}" yet!` : "You haven't submitted any drawings yet!"}
            </h3>
            <p style={{ color: '#444', marginBottom: '20px' }}>
              Draw your favorite Pokémon and start your personal museum gallery.
            </p>
            <Link to="/submit">
              <button style={{
                padding: '12px 24px',
                cursor: 'pointer',
                background: '#ff9800',
                color: '#000',
                border: '1.5px solid #000',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: '0 3px 6px rgba(0,0,0,0.2)'
              }}>
                Submit a Drawing 🎨
              </button>
            </Link>
          </div>
        ) : viewMode === 'showcase' ? (
          /* 🏛️ VIEW 1: Museum Showcase Grid */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '24px'
          }}>
            {filteredList.map((item) => {
              const status = statusMap[item.id] || (item.is_approved ? 'approved' : 'pending');

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedArtwork(item)}
                  title="Click to zoom in"
                  style={{
                    border: '1px solid #ccc',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    background: '#ffffff',
                    color: '#111',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    cursor: 'zoom-in',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
                  }}
                >
                  <div style={{ 
                    height: '240px', 
                    background: '#f2f4f7', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: '10px' 
                  }}>
                    <img
                      src={item.image_url}
                      alt={item.pokemon_name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>

                  <div style={{ 
                    padding: '14px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    gap: '8px' 
                  }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#000', fontWeight: 'bold' }}>
                        {item.pokemon_name}
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#444' }}>
                        By: <strong>{item.artist_name}</strong>
                      </p>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 'bold',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      background: status === 'approved' ? '#e8f5e9' : '#fff3e0',
                      color: status === 'approved' ? '#1b5e20' : '#bf360c',
                      border: `1px solid ${status === 'approved' ? '#c8e6c9' : '#ffe0b2'}`,
                      whiteSpace: 'nowrap'
                    }}>
                      {status === 'approved' ? '✅ Live' : '⏳ Pending'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ⚙️ VIEW 2: Manage & Retract List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredList.map((item) => {
              const status = statusMap[item.id] || (item.is_approved ? 'approved' : 'pending');

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: '18px',
                    border: '1px solid #ccc',
                    borderRadius: '12px',
                    padding: '16px',
                    alignItems: 'center',
                    background: '#ffffff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    color: '#111',
                    flexWrap: 'wrap'
                  }}
                >
                  <img
                    src={item.image_url}
                    alt={item.pokemon_name}
                    style={{
                      width: '88px',
                      height: '88px',
                      objectFit: 'contain',
                      background: '#f2f4f7',
                      borderRadius: '8px',
                      padding: '4px',
                      border: '1px solid #e0e0e0'
                    }}
                  />

                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#000', fontWeight: 'bold' }}>
                      {item.pokemon_name}
                    </h3>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#333' }}>
                      Artist: <strong>{item.artist_name}</strong>
                    </p>

                    {status === 'approved' ? (
                      <span style={{
                        fontSize: '12px',
                        background: '#e8f5e9',
                        color: '#1b5e20',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontWeight: 'bold',
                        display: 'inline-block',
                        border: '1px solid #c8e6c9'
                      }}>
                        ✅ Live in Museum
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '12px',
                        background: '#fff3e0',
                        color: '#bf360c',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontWeight: 'bold',
                        display: 'inline-block',
                        border: '1px solid #ffe0b2'
                      }}>
                        ⏳ Pending Admin Review
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => handleRetract(item, e)}
                    style={{
                      background: '#ffebee',
                      color: '#b71c1c',
                      border: '1.5px solid #ef4444',
                      padding: '10px 18px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      marginLeft: 'auto',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    Delete drawing
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 🔍 Fullscreen Lightbox Zoom Modal */}
        {selectedArtwork && (
          <div 
            onClick={() => setSelectedArtwork(null)} 
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              backgroundColor: 'rgba(0, 0, 0, 0.88)', 
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
                color: '#111', 
                borderRadius: '12px', 
                maxWidth: '90vw', 
                maxHeight: '90vh', 
                overflow: 'hidden', 
                display: 'flex', 
                flexDirection: 'column', 
                boxShadow: '0 12px 35px rgba(0,0,0,0.6)' 
              }}
            >
              <div style={{ maxHeight: '75vh', background: '#0a0a0a', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
                <img 
                  src={selectedArtwork.image_url} 
                  alt={selectedArtwork.pokemon_name} 
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} 
                />
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#000', fontWeight: 'bold' }}>{selectedArtwork.pokemon_name}</h2>
                  <p style={{ margin: '4px 0 0 0', color: '#444', fontSize: '14px' }}>
                    Drawn by: <strong>{selectedArtwork.artist_name}</strong>
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedArtwork(null)} 
                  style={{ 
                    padding: '8px 16px', 
                    cursor: 'pointer', 
                    borderRadius: '6px', 
                    border: '1.5px solid #ccc', 
                    background: '#f5f5f5', 
                    color: '#111', 
                    fontWeight: 'bold' 
                  }}
                >
                  Close ✕
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}