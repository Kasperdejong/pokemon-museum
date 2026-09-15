import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

export default function Gallery() {
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAdmin(true);
      }
    });

    fetchDrawings();
  }, []);

  async function fetchDrawings() {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('is_approved', true)
      .order('created_at', { ascending: false });

    if (error) console.error('Error loading gallery:', error);
    else setDrawings(data || []);
    
    setLoading(false);
  }

  async function handleDelete(item, e) {
    if (e) e.stopPropagation();

    const confirmed = window.confirm(
      `⚠️ PERMANENT DELETE\n\nAre you sure you want to remove "${item.pokemon_name}" drawn by "${item.artist_name}"?\n\nThis will remove it from the museum and delete the image file completely.`
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

      setDrawings((prev) => prev.filter((d) => d.id !== item.id));

      if (selectedArtwork?.id === item.id) {
        setSelectedArtwork(null);
      }

      alert(`"${item.pokemon_name}" has been removed from the museum.`);
    } catch (err) {
      console.error('Failed to delete artwork:', err);
      alert('Delete failed: ' + err.message);
    }
  }

  return (
    /* 🔴 Outer Wrapper: Seamless Repeating Pokéballs Background */
  <div style={{
      flex: 1,
      minHeight: 'calc(100dvh - 54px)',
      width: '100%',
      // 🕶️ Dark overlay tint on top of the repeating Pokéballs:
      backgroundImage: 'linear-gradient(rgba(18, 18, 18, 0.88), rgba(18, 18, 18, 0.88)), url(/pokeballs.jpg)',
      backgroundRepeat: 'repeat',
      backgroundSize: '240px auto',
      padding: '30px 20px 60px',
      boxSizing: 'border-box',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* Frosted Header Banner for Crisp Readability */}
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '28px', 
          flexWrap: 'wrap', 
          gap: '15px',
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(8px)',
          padding: '16px 22px',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.08)'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#1a1a1a' }}>Pokémon Community Museum</h1>
            <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
              Drawings submitted by the community {isAdmin && <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>(Admin Mode Active 👑)</span>}
            </p>
          </div>
          <Link to="/submit">
            <button style={{ padding: '10px 18px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>
              Submit Artwork 🎨
            </button>
          </Link>
        </header>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.9)', borderRadius: '10px', color: '#333' }}>
            <p>Loading museum...</p>
          </div>
        ) : drawings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', background: 'rgba(255,255,255,0.92)', borderRadius: '12px', color: '#333' }}>
            <h2>No drawings in the gallery yet!</h2>
            <p>Be the very first viewer to hang your art in the museum.</p>
            <Link to="/submit">
              <button style={{ padding: '10px 20px', cursor: 'pointer', marginTop: '10px' }}>Submit Art</button>
            </Link>
          </div>
        ) : (
          /* Responsive Art Grid */
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', 
            gap: '24px' 
          }}>
            {drawings.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setSelectedArtwork(item)}
                style={{ 
                  border: '1px solid #e0e0e0', 
                  borderRadius: '10px', 
                  overflow: 'hidden', 
                  background: '#fff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.14)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                }}
              >
                {/* Museum Matte Frame */}
                <div style={{ 
                  height: '240px', 
                  background: '#f6f7f9', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: '10px' 
                }}>
                  <img 
                    src={item.image_url} 
                    alt={item.pokemon_name} 
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '100%', 
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                    }} 
                  />
                </div>

                <div style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#1a1a1a' }}>{item.pokemon_name}</h3>
                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>By: <strong>{item.artist_name}</strong></p>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={(e) => handleDelete(item, e)}
                      title="Delete artwork from site"
                      style={{
                        background: '#ffebee',
                        color: '#c62828',
                        border: '1px solid #ffcdd2',
                        borderRadius: '4px',
                        padding: '5px 8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Delete 🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fullscreen Lightbox Modal */}
        {selectedArtwork && (
          <div 
            onClick={() => setSelectedArtwork(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
                borderRadius: '10px', 
                maxWidth: '90vw', 
                maxHeight: '90vh', 
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
              }}
            >
              <div style={{ maxHeight: '75vh', background: '#111', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <img 
                  src={selectedArtwork.image_url} 
                  alt={selectedArtwork.pokemon_name} 
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} 
                />
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#111' }}>{selectedArtwork.pokemon_name}</h2>
                  <p style={{ margin: '4px 0 0 0', color: '#666' }}>Drawn by: <strong>{selectedArtwork.artist_name}</strong></p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {isAdmin && (
                    <button 
                      onClick={() => handleDelete(selectedArtwork)}
                      style={{
                        background: '#c62828',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Delete Artwork 🗑️
                    </button>
                  )}

                  <button 
                    onClick={() => setSelectedArtwork(null)}
                    style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    Close ✕
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}