import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

export default function Gallery() {
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false); // <-- Tracks admin session

  useEffect(() => {
    // 1. Check if user is logged in as Admin
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

  // 🗑️ Delete function with double confirmation
  async function handleDelete(item, e) {
    if (e) e.stopPropagation(); // Prevents opening the zoom modal when clicking delete

    const confirmed = window.confirm(
      `⚠️ PERMANENT DELETE\n\nAre you sure you want to remove "${item.pokemon_name}" drawn by "${item.artist_name}"?\n\nThis will remove it from the museum and delete the image file completely.`
    );

    if (!confirmed) return;

    try {
      // 1. Extract file name from the URL
      const urlParts = item.image_url.split('/');
      const fileName = urlParts[urlParts.length - 1];

      // 2. Delete file from Supabase Storage
      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      }

      // 3. Delete row from the database table
      const { error } = await supabase.from('submissions').delete().eq('id', item.id);
      if (error) throw error;

      // 4. Instantly remove from the gallery grid
      setDrawings((prev) => prev.filter((d) => d.id !== item.id));

      // Close the modal if the deleted item was currently open
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
    <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0 }}>Pokémon Community Museum</h1>
          <p style={{ margin: '5px 0 0 0', color: '#666' }}>
            Drawings submitted by the community {isAdmin && <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>(Admin Mode Active 👑)</span>}
          </p>
        </div>
        <Link to="/submit">
          <button style={{ padding: '10px 18px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            Submit Artwork 🎨
          </button>
        </Link>
      </header>

      {loading ? (
        <p>Loading museum...</p>
      ) : drawings.length === 0 ? (
        <p>No drawings in the gallery yet. Be the first to submit!</p>
      ) : (
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
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
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
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '18px' }}>{item.pokemon_name}</h3>
                  <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>By: <strong>{item.artist_name}</strong></p>
                </div>

                {/* Admin Quick-Delete Button on the Card */}
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
                <h2 style={{ margin: 0 }}>{selectedArtwork.pokemon_name}</h2>
                <p style={{ margin: '4px 0 0 0', color: '#666' }}>Drawn by: <strong>{selectedArtwork.artist_name}</strong></p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {/* Admin Delete button inside modal */}
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
  );
}