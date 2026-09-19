import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Link, useParams, useSearchParams } from 'react-router-dom';

export default function Gallery({ instructorMode = false }) {
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const { artistParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pokemonSearch, setPokemonSearch] = useState('');
  const [artistSearch, setArtistSearch] = useState(artistParam || searchParams.get('artist') || '');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    const urlArtist = searchParams.get('artist');
    if (urlArtist) setArtistSearch(urlArtist);
  }, [searchParams]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsAdmin(true);
    });

    fetchDrawings();
  }, [instructorMode]);

  async function fetchDrawings() {
    setLoading(true);

    try {
      let query = supabase
        .from('submissions')
        .select('*')
        .eq('is_approved', true);

      if (instructorMode) {
        query = query.eq('artist_name', 'Kavhan');
      }

      const { data, error } = await query;

      if (error) console.error('Error loading gallery:', error);
      else setDrawings(data || []);
    } catch (err) {
      console.error('Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredDrawings = useMemo(() => {
    return drawings
      .filter((item) => {
        const matchesPokemon = item.pokemon_name
          .toLowerCase()
          .includes(pokemonSearch.toLowerCase().trim());
        const matchesArtist = item.artist_name
          .toLowerCase()
          .includes(artistSearch.toLowerCase().trim());
        return matchesPokemon && matchesArtist;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
        if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sortBy === 'pokemon_az') return a.pokemon_name.localeCompare(b.pokemon_name);
        if (sortBy === 'artist_az') return a.artist_name.localeCompare(b.artist_name);
        return 0;
      });
  }, [drawings, pokemonSearch, artistSearch, sortBy]);

  function clearAllFilters() {
    setPokemonSearch('');
    setArtistSearch('');
    setSearchParams({});
  }

  async function handleDelete(item, e) {
    if (e) e.stopPropagation();

    const confirmed = window.confirm(
      `⚠️ PERMANENT DELETE\n\nAre you sure you want to remove "${item.pokemon_name}" drawn by "${item.artist_name}"?`
    );
    if (!confirmed) return;

    try {
      const urlParts = item.image_url.split('/');
      const fileName = urlParts[urlParts.length - 1];

      if (fileName) {
        await supabase.storage.from('drawings').remove([fileName]);
      }

      await supabase.from('submissions').delete().eq('id', item.id);
      setDrawings((prev) => prev.filter((d) => d.id !== item.id));

      if (selectedArtwork?.id === item.id) setSelectedArtwork(null);
      alert(`"${item.pokemon_name}" removed.`);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  const hasActiveFilters = pokemonSearch.trim() !== '' || artistSearch.trim() !== '';

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
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px', 
          flexWrap: 'wrap', 
          gap: '15px',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          padding: '16px 22px',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
          color: '#111'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#000', fontWeight: 'bold' }}>
              {instructorMode ? "Kavhan's Masterclasses & Drawings 🎨" : "Pokémon Community Museum"}
            </h1>
            <p style={{ margin: '4px 0 0 0', color: '#333', fontSize: '14px', fontWeight: '500' }}>
              {instructorMode ? "Official instructor artwork and lesson pieces" : "Drawings submitted by the community"}
            </p>
          </div>
          <Link to="/submit">
            {/* 🟠 Orange button with black border and box shadow */}
            <button style={{ 
              padding: '10px 18px', 
              background: '#ff9800', 
              color: '#000', 
              border: '1.5px solid #000', 
              borderRadius: '6px', 
              fontWeight: 'bold', 
              cursor: 'pointer', 
              fontSize: '14px',
              boxShadow: '0 3px 6px rgba(0,0,0,0.2)'
            }}>
              Submit Artwork 🎨
            </button>
          </Link>
        </header>

        {/* Search Bar */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          padding: '14px 18px',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
          color: '#111'
        }}>
          <input 
            type="text"
            placeholder="🔍 Search Pokémon..."
            value={pokemonSearch}
            onChange={(e) => setPokemonSearch(e.target.value)}
            style={{ 
              padding: '9px 14px', 
              flex: '1', 
              minWidth: '160px', 
              borderRadius: '6px', 
              border: '1.5px solid #ccc',
              fontSize: '14px',
              color: '#000',
              background: '#fff'
            }}
          />

          {!instructorMode && (
            <input 
              type="text"
              placeholder="🎨 Search Artist..."
              value={artistSearch}
              onChange={(e) => {
                setArtistSearch(e.target.value);
                if (!e.target.value) setSearchParams({});
              }}
              style={{ 
                padding: '9px 14px', 
                flex: '1', 
                minWidth: '160px', 
                borderRadius: '6px', 
                border: '1.5px solid #ccc',
                fontSize: '14px',
                color: '#000',
                background: '#fff'
              }}
            />
          )}

          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={{ 
              padding: '9px 14px', 
              borderRadius: '6px', 
              border: '1.5px solid #ccc', 
              cursor: 'pointer',
              background: '#fff',
              fontSize: '14px',
              color: '#000',
              fontWeight: '500'
            }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="pokemon_az">Pokémon (A–Z)</option>
            {!instructorMode && <option value="artist_az">Artist (A–Z)</option>}
          </select>

          {hasActiveFilters && (
            <button 
              onClick={clearAllFilters}
              style={{ 
                background: '#ffebee', 
                border: '1.5px solid #ffcdd2', 
                color: '#b71c1c', 
                padding: '9px 14px', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontWeight: 'bold',
                fontSize: '13px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              ✕ Reset
            </button>
          )}

          <span style={{ fontSize: '13px', color: '#222', marginLeft: 'auto', fontWeight: 'bold' }}>
            {filteredDrawings.length} {filteredDrawings.length === 1 ? 'drawing' : 'drawings'}
          </span>
        </div>

        {/* Gallery Grid */}
        {loading ? (
          <p style={{ color: '#fff', textAlign: 'center', padding: '40px', fontSize: '18px' }}>Loading drawings...</p>
        ) : filteredDrawings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', background: 'rgba(255,255,255,0.95)', borderRadius: '12px', color: '#111' }}>
            <h3 style={{ color: '#000', fontSize: '20px' }}>No matching drawings found!</h3>
            <p style={{ color: '#444' }}>Try searching for another Pokémon or artist name.</p>
            {hasActiveFilters && (
              <button 
                onClick={clearAllFilters}
                style={{ 
                  padding: '9px 18px', 
                  cursor: 'pointer', 
                  borderRadius: '6px', 
                  border: '1.5px solid #000', 
                  marginTop: '10px', 
                  background: '#ff9800', 
                  color: '#000', 
                  fontWeight: 'bold',
                  boxShadow: '0 3px 6px rgba(0,0,0,0.2)'
                }}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
            {filteredDrawings.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setSelectedArtwork(item)}
                style={{ 
                  border: '1px solid #ccc', 
                  borderRadius: '10px', 
                  overflow: 'hidden', 
                  background: '#ffffff',
                  color: '#111',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  cursor: 'pointer',
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
                <div style={{ height: '240px', background: '#f2f4f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                  <img src={item.image_url} alt={item.pokemon_name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>

                <div style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#000', fontWeight: 'bold' }}>{item.pokemon_name}</h3>
                    <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>
                      By:{' '}
                      {/* 🔵 Restored clean link blue */}
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          setArtistSearch(item.artist_name);
                          setSearchParams({ artist: item.artist_name });
                        }}
                        style={{ color: '#0070f3', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold' }}
                        title={`Filter by artist ${item.artist_name}`}
                      >
                        {item.artist_name}
                      </span>
                    </p>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={(e) => handleDelete(item, e)}
                      style={{ background: '#ffebee', color: '#b71c1c', border: '1.5px solid #ef4444', borderRadius: '4px', padding: '5px 8px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
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
          <div onClick={() => setSelectedArtwork(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', color: '#111', borderRadius: '10px', maxWidth: '90vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <div style={{ maxHeight: '75vh', background: '#111', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <img src={selectedArtwork.image_url} alt={selectedArtwork.pokemon_name} style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#000', fontWeight: 'bold' }}>{selectedArtwork.pokemon_name}</h2>
                  <p style={{ margin: '4px 0 0 0', color: '#333', fontSize: '15px' }}>
                    Drawn by:{' '}
                    {/* 🔵 Restored clean link blue */}
                    <span 
                      onClick={() => {
                        setArtistSearch(selectedArtwork.artist_name);
                        setSearchParams({ artist: selectedArtwork.artist_name });
                        setSelectedArtwork(null);
                      }}
                      style={{ color: '#0070f3', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      {selectedArtwork.artist_name}
                    </span>
                  </p>
                </div>
                <button onClick={() => setSelectedArtwork(null)} style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', border: '1.5px solid #ccc', background: '#f5f5f5', color: '#111', fontWeight: 'bold' }}>
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